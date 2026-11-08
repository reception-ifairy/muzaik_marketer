// Base URLs for the image providers, overridable for tests (like ANTHROPIC_BASE_URL / OPENAI_BASE_URL / GEMINI_BASE_URL).

const trim = (url: string) => url.replace(/\/+$/, '');

export const baseUrl = {
  openai: () => trim(process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1'),
  google: () => trim(process.env.GEMINI_BASE_URL?.trim() || 'https://generativelanguage.googleapis.com'),
  replicate: () => trim(process.env.REPLICATE_BASE_URL?.trim() || 'https://api.replicate.com'),
  stability: () => trim(process.env.STABILITY_BASE_URL?.trim() || 'https://api.stability.ai'),
};

/** An HTTP failure from an image provider, carrying the status so errors.ts can explain it in Polish. */
export class ProviderHttpError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function failIfNotOk(provider: string, res: Response): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => '');
  let detail = body.slice(0, 300);
  try {
    const json = JSON.parse(body) as { error?: { message?: string } | string; detail?: string; message?: string; errors?: string[] };
    detail = (typeof json.error === 'string' ? json.error : json.error?.message) || json.detail || json.message || json.errors?.join(' ') || detail;
  } catch {
    // keep the raw text
  }
  throw new ProviderHttpError(provider, res.status, detail || `HTTP ${res.status}`);
}
