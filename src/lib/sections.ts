import { Home, Telescope, Settings, LogOut, MessagesSquare, Palette, Clapperboard, BookOpen, type LucideIcon } from 'lucide-react';

// The app's views. Adding a view: add its id to ViewId, an entry to SECTIONS (label, subtitle, lucide
// icon, colour tone), and a <ViewSlot> in App.tsx. The rail, the phone bar and the headers pick it up.

export type ViewId = 'pulpit' | 'studio' | 'rozmowa' | 'badanie' | 'styl' | 'handbook';

// Full class names (not built dynamically) so Tailwind can see them.
export interface Tone {
  text: string;
  soft: string;
  border: string;
  solid: string;
}

export const TONES = {
  cyan: { text: 'text-cyan-400', soft: 'bg-cyan-400/15', border: 'border-cyan-400/40', solid: 'bg-cyan-400' },
  sky: { text: 'text-sky-400', soft: 'bg-sky-400/15', border: 'border-sky-400/40', solid: 'bg-sky-400' },
  amber: { text: 'text-amber-400', soft: 'bg-amber-400/15', border: 'border-amber-400/40', solid: 'bg-amber-400' },
  emerald: { text: 'text-emerald-400', soft: 'bg-emerald-400/15', border: 'border-emerald-400/40', solid: 'bg-emerald-400' },
  pink: { text: 'text-pink-400', soft: 'bg-pink-400/15', border: 'border-pink-400/40', solid: 'bg-pink-400' },
  violet: { text: 'text-violet-400', soft: 'bg-violet-400/15', border: 'border-violet-400/40', solid: 'bg-violet-400' },
  rose: { text: 'text-rose-400', soft: 'bg-rose-400/15', border: 'border-rose-400/40', solid: 'bg-rose-400' },
  indigo: { text: 'text-indigo-400', soft: 'bg-indigo-400/15', border: 'border-indigo-400/40', solid: 'bg-indigo-400' },
  orange: { text: 'text-orange-400', soft: 'bg-orange-400/15', border: 'border-orange-400/40', solid: 'bg-orange-400' },
} satisfies Record<string, Tone>;

export interface SectionDef {
  id: ViewId;
  label: string;
  subtitle: string;
  icon: LucideIcon;
  tone: Tone;
}

export const SECTIONS: SectionDef[] = [
  { id: 'pulpit', label: 'Centrum', subtitle: 'Dane kanału MuzaIK i Twoje materiały', icon: Home, tone: TONES.cyan },
  { id: 'studio', label: 'Studio', subtitle: 'Zwiastun i materiały wideo: muzyka prowadzi montaż, DJ MuzaIK rozpisuje ujęcia', icon: Clapperboard, tone: TONES.pink },
  { id: 'rozmowa', label: 'Rozmowa', subtitle: 'Zapytaj DJ MuzaIK — sam wyszuka i sprawdzi', icon: MessagesSquare, tone: TONES.indigo },
  { id: 'badanie', label: 'Badanie', subtitle: 'DJ MuzaIK przeszuka sieć i poda uporządkowany wynik ze źródłami', icon: Telescope, tone: TONES.sky },
  { id: 'styl', label: 'Styl', subtitle: 'Obrazy i klatki startowe — opcje w oknie z miniaturkami (płatne, po potwierdzeniu ceny)', icon: Palette, tone: TONES.violet },
  { id: 'handbook', label: 'Handbook', subtitle: 'Podręcznik i dokumentacja techniczna — prosto z repozytorium', icon: BookOpen, tone: TONES.emerald },
];

export const VIEW_IDS = SECTIONS.map((s) => s.id);

export const SETTINGS_ITEM = { label: 'Ustawienia', icon: Settings as LucideIcon, tone: TONES.amber };
export const LOGOUT_ITEM = { label: 'Wyloguj', icon: LogOut as LucideIcon, tone: TONES.rose };

export function getSection(id: ViewId): SectionDef {
  return SECTIONS.find((s) => s.id === id)!;
}
