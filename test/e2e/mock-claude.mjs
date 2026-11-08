// Minimal Anthropic API mock for the studio (plus Gemini TTS for the voice-over, same port): model list + one structured answer (a material draft) for messages.parse.
// It returns a deliberately imperfect draft (too many bars, Ingredients without an image, a legacy name, a foreign link,
// the model's own end card) so the code checks (finalizeDraft / cleanCopy) have something to fix.
import http from 'http';
const PORT = Number(process.argv[2] || 4599);
const draft = {
  concept: 'Nocna jazda przez neonowe miasto — od ciszy przed świtem do eksplozji świateł na refrenie.',
  hook: 'Zbliżenie na świecącą linię drogi, która zapala się w rytm stopy.',
  styleAnchor: '1980s retro-futuristic night, neon cyan and magenta, light fog, VHS grain.',
  shots: [
    { bars: 2, role: 'hook', visual: 'flow', prompt: 'Extreme close-up of a glowing neon road line igniting', mode: 'text', reference: null, sceneId: null, cardText: null, camera: 'extreme close-up, slow dolly-in, 50mm macro', light: 'teal neon edge light, wet asphalt', transition: 'cięcie na pierwszą miarę', overlayText: 'Nostalgia w nowym wymiarze', voiceover: null, note: 'Hak: światło zapala się na stopie.' },
    { bars: 3, role: 'build', visual: 'parallax', prompt: '', mode: 'text', reference: null, sceneId: 'scena-testowa-zla', cardText: null, camera: '', light: '', transition: 'przenikanie', overlayText: null, voiceover: 'Hej, tu DJ MuzaIK. Jedziemy przez noc.', note: 'Spokojne narastanie na scenie kanału.' },
    { bars: 2, role: 'story', visual: 'plansza', prompt: '', mode: 'text', reference: null, sceneId: null, cardText: 'Muzyka z DarkaIK nocy', camera: '', light: '', transition: '', overlayText: null, voiceover: null, note: 'Krótki napis.' },
    { bars: 9, role: 'drop', visual: 'flow', prompt: 'A chrome car speeds through a neon city as the lights explode', mode: 'ingredients', reference: null, sceneId: null, cardText: null, camera: 'wide tracking shot, 24mm', light: 'amber flares, red neon', transition: 'cięcie na drop', overlayText: 'Zrobione w Suno', voiceover: null, note: 'Refren: wybuch świateł.' },
    { bars: 2, role: 'outro', visual: 'plansza', prompt: '', mode: 'text', reference: null, sceneId: null, cardText: 'Subskrybuj', camera: '', light: '', transition: '', overlayText: null, voiceover: null, note: 'Koniec.' },
  ],
  thumbnail: { prompt: 'A lone chrome car on a neon night road, teal and amber', overlayOptions: ['Nocna jazda', 'Gemini zrobił', 'Neon w deszczu'] },
  copy: { title: 'MuzaIK – Nocna jazda', description: 'Stworzyłam ten zwiastun dla Was. Więcej: https://example.com/x', tags: ['synthwave', 'MuzaIK', 'retro', 'veo'], hashtags: ['synthwave', 'retrowave'], pinnedComment: 'Która scena trafiła do Was najbardziej? https://example.com' },
};
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c)).on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && req.url.startsWith('/v1/models')) return res.end(JSON.stringify({ data: [{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', type: 'model', created_at: '2026-01-01T00:00:00Z' }], has_more: false, first_id: 'claude-opus-5-5', last_id: 'claude-opus-5-5' }));
    // Gemini (TTS for the DJ voice-over): 1.5 s of a 300 Hz tone as raw 16-bit PCM at 24 kHz.
    if (req.method === 'POST' && req.url.includes(':generateContent')) {
      const n = 24000 * 1.5;
      const pcm = Buffer.alloc(n * 2);
      for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 300 * i) / 24000) * 9000), i * 2);
      return res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm.toString('base64') } }] } }] }));
    }
    if (req.method === 'GET' && req.url.includes('/models')) return res.end(JSON.stringify({ models: [{ name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] }] }));
    if (req.method === 'POST' && req.url.startsWith('/v1/messages')) {
      const j = JSON.parse(body || '{}');
      return res.end(JSON.stringify({ id: 'msg_mock', type: 'message', role: 'assistant', model: j.model, content: [{ type: 'text', text: JSON.stringify(draft) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }));
    }
    res.statusCode = 404;
    res.end('{}');
  });
}).listen(PORT, '127.0.0.1', () => console.log(`mock claude on ${PORT}`));
