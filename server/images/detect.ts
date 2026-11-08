import { IMAGE_MODELS } from '../../src/imageModels';
import type { ModelInfo } from '../../src/aiSettings';
import { baseUrl, failIfNotOk } from './http';

// Image-model detection for providers without a usable model list. OpenAI and Google image models come from
// their normal model lists (see providers.ts). All calls here are free metadata reads.

const TIMEOUT_MS = 20_000;
const MAX_NEW = 12;

const signal = () => AbortSignal.timeout(TIMEOUT_MS);

/**
 * Replicate: the account call proves the token; each catalogue model is looked up by name (a model that was
 * removed or renamed answers 404); the public "text-to-image" collection lists other models worth knowing about.
 */
export async function detectReplicate(apiKey: string): Promise<ModelInfo[]> {
  const headers = { Authorization: `Bearer ${apiKey}` };
  await failIfNotOk('replicate', await fetch(`${baseUrl.replicate()}/v1/account`, { headers, signal: signal() }));

  const found: ModelInfo[] = [];
  const catalog = IMAGE_MODELS.filter((m) => m.provider === 'replicate');
  await Promise.all(
    catalog.map(async (m) => {
      const res = await fetch(`${baseUrl.replicate()}/v1/models/${m.model}`, { headers, signal: signal() }).catch(() => null);
      if (res?.ok) found.push({ id: m.model, label: m.label, kind: 'image' });
    }),
  );

  // Best effort: a missing or changed collection never fails the key test.
  try {
    const res = await fetch(`${baseUrl.replicate()}/v1/collections/text-to-image`, { headers, signal: signal() });
    if (res.ok) {
      const data = (await res.json()) as { models?: { owner?: string; name?: string }[] };
      const known = new Set(catalog.map((m) => m.model));
      for (const m of (data.models ?? []).slice(0, 60)) {
        const id = m.owner && m.name ? `${m.owner}/${m.name}` : null;
        if (!id || known.has(id) || found.some((f) => f.id === id)) continue;
        found.push({ id, label: id, kind: 'image' });
        if (found.length - catalog.length >= MAX_NEW) break;
      }
    }
  } catch {
    // ignore
  }
  return found;
}

/**
 * Stability: the account call proves the key and the balance shows the credits left. Its v2beta image models are
 * fixed endpoints with no listing, so a working key reaches every catalogue model.
 */
export async function detectStability(apiKey: string): Promise<{ models: ModelInfo[]; credits: number | null }> {
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' };
  await failIfNotOk('stability', await fetch(`${baseUrl.stability()}/v1/user/account`, { headers, signal: signal() }));
  let credits: number | null = null;
  try {
    const res = await fetch(`${baseUrl.stability()}/v1/user/balance`, { headers, signal: signal() });
    if (res.ok) credits = Number(((await res.json()) as { credits?: number }).credits ?? NaN);
    if (!Number.isFinite(credits)) credits = null;
  } catch {
    // balance is a nice-to-have
  }
  const models = IMAGE_MODELS.filter((m) => m.provider === 'stability').map((m): ModelInfo => ({ id: m.model, label: m.label, kind: 'image' }));
  return { models, credits };
}
