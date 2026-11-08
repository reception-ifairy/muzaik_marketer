import { imagePrice, type ImageAspect, type ImageModelDef } from '../../src/imageModels';
import { ResearchError } from '../errors';
import { baseUrl, failIfNotOk } from './http';

// Text-to-image adapters for the catalogue in src/imageModels.ts, ported from Kuźnia inspiracji's providers
// (app/Providers/AI/*ImageProvider.php). One picture per call. Every call here is PAID: callers must show the
// cost (imagePrice) and get the owner's go-ahead first. Tests point the base URLs at a local mock.

export interface ImageJob {
  model: ImageModelDef;
  apiKey: string;
  prompt: string;
  aspect: ImageAspect;
  /** Size tier for tier-priced models (Gemini): '1K' | '2K' | '4K'. Defaults to the model's default tier. */
  tier?: string;
  signal?: AbortSignal;
}

export interface GeneratedImage {
  data: Buffer;
  mime: string;
  costUsd: number;
}

const TIMEOUT_MS = 120_000;
const RATIO: Record<ImageAspect, [number, number]> = { '1:1': [1, 1], '2:3': [2, 3], '16:9': [16, 9] };

export async function generateImage(job: ImageJob): Promise<GeneratedImage> {
  const signal = job.signal ? AbortSignal.any([job.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);
  const tier = job.model.sizing.kind === 'tier' ? (job.tier && job.model.sizing.tiers.includes(job.tier) ? job.tier : job.model.sizing.defaultTier) : undefined;
  const costUsd = imagePrice(job.model, tier);
  const run = { openai: openaiImage, google: googleImage, replicate: replicateImage, stability: stabilityImage }[job.model.provider];
  const { data, mime } = await run({ ...job, tier, signal });
  if (!data.length) throw new ResearchError('Dostawca nie zwrócił obrazu.', 502);
  return { data, mime, costUsd };
}

type Run = (job: ImageJob & { signal: AbortSignal; tier?: string }) => Promise<{ data: Buffer; mime: string }>;

/** OpenAI Images API. gpt-image-2 takes fixed sizes; 2.5 models take any size in the shape up to longEdge. */
const openaiImage: Run = async ({ model, apiKey, prompt, aspect, signal }) => {
  if (model.sizing.kind !== 'openai' && model.sizing.kind !== 'openai-custom') throw new Error('Not an OpenAI model.');
  const [w, h] = RATIO[aspect];
  let size: string;
  if (model.sizing.kind === 'openai-custom') {
    const long = model.sizing.longEdge;
    const scale = long / Math.max(w, h);
    const r16 = (n: number) => Math.max(16, Math.round((n * scale) / 16) * 16);
    size = `${r16(w)}x${r16(h)}`;
  } else {
    size = w === h ? '1024x1024' : w > h ? '1536x1024' : '1024x1536';
  }
  const res = await fetch(`${baseUrl.openai()}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model.model, prompt, n: 1, size, quality: model.sizing.quality }),
    signal,
  });
  await failIfNotOk('openai', res);
  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new ResearchError('OpenAI nie zwrócił obrazu (mógł zostać zablokowany przez filtry).', 422);
  return { data: Buffer.from(b64, 'base64'), mime: 'image/png' };
};

/** Gemini image models through generateContent on v1beta (the one version that serves every image model). */
const googleImage: Run = async ({ model, apiKey, prompt, aspect, tier, signal }) => {
  const res = await fetch(`${baseUrl.google()}/v1beta/models/${model.model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect, imageSize: tier ?? '1K' } },
    }),
    signal,
  });
  await failIfNotOk('google', res);
  const json = (await res.json()) as {
    promptFeedback?: { blockReason?: string };
    candidates?: { finishReason?: string; content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
  };
  if (json.promptFeedback?.blockReason || json.candidates?.[0]?.finishReason === 'SAFETY') {
    throw new ResearchError('Gemini zablokował ten opis (filtry bezpieczeństwa). Zmień opis i spróbuj ponownie.', 422);
  }
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new ResearchError('Gemini nie zwrócił obrazu.', 502);
  return { data: Buffer.from(part.inlineData.data, 'base64'), mime: part.inlineData.mimeType || 'image/png' };
};

/** Replicate predictions: wait up to 60 s in the request, then poll the prediction until it finishes. */
const replicateImage: Run = async ({ model, apiKey, prompt, aspect, signal }) => {
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  const input: Record<string, unknown> = { prompt, aspect_ratio: aspect, ...(model.extra ?? {}) };
  // FLUX 1.1 Pro Ultra only returns jpg or png; the others are asked for webp (smaller, same look).
  if (model.model.endsWith('flux-1.1-pro-ultra')) input.output_format = 'png';
  else {
    input.output_format = 'webp';
    input.output_quality = 90;
  }
  if (model.model.endsWith('flux-schnell')) input.go_fast = true;

  let res = await fetch(`${baseUrl.replicate()}/v1/models/${model.model}/predictions`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'wait=60' },
    body: JSON.stringify({ input }),
    signal,
  });
  await failIfNotOk('replicate', res);
  let prediction = (await res.json()) as { status?: string; output?: unknown; error?: string; urls?: { get?: string } };
  while (prediction.status === 'starting' || prediction.status === 'processing') {
    if (!prediction.urls?.get) break;
    await new Promise((r) => setTimeout(r, 1500));
    res = await fetch(prediction.urls.get, { headers, signal });
    await failIfNotOk('replicate', res);
    prediction = await res.json();
  }
  if (prediction.status !== 'succeeded') {
    throw new ResearchError(`Replicate nie zrobił obrazu: ${prediction.error || prediction.status || 'nieznany błąd'}.`, 502);
  }
  const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) throw new ResearchError('Replicate nie zwrócił adresu obrazu.', 502);
  const file = await fetch(url, { signal });
  await failIfNotOk('replicate', file);
  return { data: Buffer.from(await file.arrayBuffer()), mime: file.headers.get('content-type') || 'image/webp' };
};

const STABILITY_ENDPOINT: Record<string, { path: string; model?: string }> = {
  'stable-image-core': { path: '/v2beta/stable-image/generate/core' },
  'stable-image-ultra': { path: '/v2beta/stable-image/generate/ultra' },
  'sd3.5-large': { path: '/v2beta/stable-image/generate/sd3', model: 'sd3.5-large' },
  'sd3.5-large-turbo': { path: '/v2beta/stable-image/generate/sd3', model: 'sd3.5-large-turbo' },
  'sd3.5-flash': { path: '/v2beta/stable-image/generate/sd3', model: 'sd3.5-flash' },
};

/** Stability v2beta: multipart form in, JSON with a base64 image out. */
const stabilityImage: Run = async ({ model, apiKey, prompt, aspect, signal }) => {
  const endpoint = STABILITY_ENDPOINT[model.model];
  if (!endpoint) throw new Error(`Unknown Stability model ${model.model}.`);
  const form = new FormData();
  form.set('prompt', prompt);
  form.set('aspect_ratio', aspect);
  form.set('output_format', 'png');
  if (endpoint.model) form.set('model', endpoint.model);
  const res = await fetch(`${baseUrl.stability()}${endpoint.path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    body: form,
    signal,
  });
  await failIfNotOk('stability', res);
  const json = (await res.json()) as { image?: string; finish_reason?: string };
  if (json.finish_reason === 'CONTENT_FILTERED') throw new ResearchError('Stability zablokował ten obraz (filtr treści). Zmień opis.', 422);
  if (!json.image) throw new ResearchError('Stability nie zwrócił obrazu.', 502);
  return { data: Buffer.from(json.image, 'base64'), mime: 'image/png' };
};
