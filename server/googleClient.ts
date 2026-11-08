import { GoogleGenAI } from '@google/genai';

/** Gemini client; GEMINI_BASE_URL points it at a local mock in tests (like ANTHROPIC_BASE_URL / OPENAI_BASE_URL). */
export function googleClient(apiKey: string): GoogleGenAI {
  const baseUrl = process.env.GEMINI_BASE_URL?.trim();
  return new GoogleGenAI({ apiKey, ...(baseUrl ? { httpOptions: { baseUrl } } : {}) });
}
