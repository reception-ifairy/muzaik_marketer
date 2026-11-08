import { googleClient } from './googleClient';
import { z } from 'zod';
import { ResearchError } from './errors';
import { jsonSchemaFor } from './research';
import type { VoiceQuery } from '../src/aiSettings';
import { APP } from '../src/config';

const MAX_TTS_CHARS = 6000;
const PCM_RATE = 24_000;

// Delivery is described in the prompt; the TTS model speaks only the text after the colon.
const VOICE_STYLE = 'Przeczytaj po polsku spokojnym, ciepłym, dojrzałym męskim głosem, wyraźnie i w umiarkowanym tempie:';

/** Gemini TTS -> WAV bytes. Newer models return WAV; older ones return raw 16-bit PCM, which we wrap. */
export async function synthesizeSpeech(apiKey: string, model: string, voiceName: string, text: string, signal?: AbortSignal): Promise<Buffer> {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) throw new ResearchError('Brak tekstu do przeczytania.', 400);
  if (clean.length > MAX_TTS_CHARS) throw new ResearchError('Tekst jest za długi do przeczytania naraz.', 400);

  const ai = googleClient(apiKey);
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: `${VOICE_STYLE}\n\n${clean}` }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      abortSignal: signal,
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new ResearchError('Gemini nie zwrócił nagrania głosu. Spróbuj ponownie.', 502);
  const audio = Buffer.from(part.inlineData.data, 'base64');
  const mime = part.inlineData.mimeType ?? '';
  if (/wav/i.test(mime) || audio.subarray(0, 4).toString('ascii') === 'RIFF') return audio;
  const rate = Number(/rate=(\d+)/.exec(mime)?.[1]) || PCM_RATE;
  return wavFromPcm16(audio, rate);
}

function wavFromPcm16(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const VoiceQuerySchema = z.object({
  transcript: z.string().describe('Dosłowny zapis tego, co zostało powiedziane, po polsku'),
  query: z.string().describe('Sedno prośby jednym zdaniem, gotowe do wpisania w pole wyszukiwania lub czatu; pusty tekst, jeśli nie ma prośby'),
});

/** Gemini listens to a recorded voice message (WAV) and returns the transcript plus the search it describes. */
export async function understandVoiceMessage(apiKey: string, model: string, wav: Buffer, signal?: AbortSignal): Promise<VoiceQuery> {
  const ai = googleClient(apiKey);
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              `To nagranie głosowe od użytkownika aplikacji ${APP.name}. ` +
              'Zapisz dokładnie, co zostało powiedziane (nazwy własne, marki i modele w ich zwykłej pisowni), ' +
              'a w polu query podaj sedno prośby jednym zdaniem. Niczego nie dopowiadaj ponad to, co padło w nagraniu.',
          },
          { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } },
        ],
      },
    ],
    config: { responseMimeType: 'application/json', responseJsonSchema: jsonSchemaFor(VoiceQuerySchema), abortSignal: signal },
  });

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(response.text ?? '');
  } catch {
    // handled below
  }
  const result = VoiceQuerySchema.safeParse(parsed);
  if (!result.success) throw new ResearchError('Nie udało się zrozumieć nagrania. Spróbuj powiedzieć to jeszcze raz.', 422);
  return result.data as VoiceQuery;
}
