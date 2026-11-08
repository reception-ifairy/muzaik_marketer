import { z } from 'zod';

// Zod schemas shared by the server (validation + structured outputs) and the client (types only).
// The example feature ("Badanie" = web research) returns this shape; replace or add schemas per project.
// Structured outputs reject min/max/length constraints, so keep schemas to types, enums and descriptions.

export const FactSchema = z.object({
  label: z.string().describe('Czego dotyczy fakt, np. "Cena", "Data premiery", "Wymagania"'),
  value: z.string().describe('Sam fakt, krótko'),
  sourceUrl: z.string().nullable().describe('Dokładny adres strony, z której pochodzi fakt; null jeśli brak'),
});

export const ResearchResultSchema = z.object({
  title: z.string().describe('Krótki tytuł tematu'),
  summary: z.string().describe('Zwięzła odpowiedź po polsku: najpierw wniosek, potem uzasadnienie'),
  keyPoints: z.array(z.string()).describe('3–6 najważniejszych punktów'),
  facts: z.array(FactSchema).describe('Konkretne, sprawdzone fakty z podanym źródłem'),
  confidence: z.enum(['high', 'medium', 'low']).describe('Jak pewna jest odpowiedź na podstawie znalezionych źródeł'),
  openQuestions: z.array(z.string()).describe('Czego nie udało się ustalić albo co warto sprawdzić samodzielnie'),
});

export type Fact = z.infer<typeof FactSchema>;
export type ResearchResultCore = z.infer<typeof ResearchResultSchema>;
