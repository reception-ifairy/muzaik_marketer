import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ApiError as GoogleApiError } from '@google/genai';
import { PROVIDER_INFO, type KeyProvider as Provider } from '../src/aiSettings';
import { ProviderHttpError } from './images/http';
import { SecretsUnavailableError } from './secrets';

export class ResearchError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
  }
}

function statusOf(err: unknown): number | undefined {
  if (err instanceof ProviderHttpError) return err.status;
  if (err instanceof Anthropic.APIError || err instanceof OpenAI.APIError) return err.status ?? undefined;
  if (err instanceof GoogleApiError) return err.status;
  return undefined;
}

function isAbort(err: unknown): boolean {
  return (
    err instanceof Anthropic.APIUserAbortError ||
    err instanceof OpenAI.APIUserAbortError ||
    (err instanceof Error && err.name === 'AbortError')
  );
}

/** Short Polish explanation of a provider failure, for key tests and search errors. */
export function describeProviderError(provider: Provider, err: unknown): string {
  const name = `${PROVIDER_INFO[provider].company} (${PROVIDER_INFO[provider].label})`;
  const status = statusOf(err);
  if (status === 401 || (status === 400 && provider === 'google' && /API key/i.test(String((err as Error)?.message)))) {
    return `Nieprawidłowy klucz ${name}. Sprawdź, czy został skopiowany w całości.`;
  }
  if (status === 403) return `Klucz ${name} nie ma dostępu do tego modelu lub funkcji (np. wyszukiwania w sieci). Sprawdź uprawnienia projektu.`;
  if (status === 404) return `Wybrany model nie jest dostępny dla tego klucza ${name}. Wybierz inny model w Ustawieniach.`;
  if (status === 402) return `Na koncie ${name} skończyły się środki. Doładuj konto u dostawcy.`;
  if (status === 429) return `Przekroczono limit zapytań lub środków na koncie ${name}. Odczekaj chwilę albo sprawdź rozliczenia.`;
  if (status && status >= 500) return `Usługa ${name} ma chwilowe problemy (błąd ${status}). Spróbuj ponownie za chwilę.`;
  if (err instanceof Anthropic.APIConnectionError || err instanceof OpenAI.APIConnectionError || (err instanceof TypeError && /fetch failed/i.test(err.message))) {
    return `Brak połączenia z ${name}. Sprawdź internet na serwerze.`;
  }
  const detail = err instanceof Error ? err.message : String(err);
  return `Błąd ${name}: ${detail.slice(0, 300)}`;
}

/**
 * Maps any failure to an HTTP status + Polish message. Provider auth failures become 400 —
 * 401 is reserved for "owner session expired", which logs the client out.
 */
export function toHttpError(err: unknown, provider?: Provider): { status: number; message: string } {
  if (err instanceof ResearchError) return { status: err.status, message: err.message };
  if (err instanceof SecretsUnavailableError) return { status: 503, message: err.message };
  if (isAbort(err)) return { status: 499, message: 'Wyszukiwanie przerwane.' };
  const status = statusOf(err);
  if (provider && status !== undefined) {
    const mapped = status === 401 ? 400 : status;
    return { status: mapped, message: describeProviderError(provider, err) };
  }
  return { status: 500, message: err instanceof Error ? err.message : 'Nieznany błąd serwera.' };
}
