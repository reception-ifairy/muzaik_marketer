import type { TrackCard } from './muzaik';
import type { MaterialKind, MusicCut } from './material';

// Music-first editing, pure (shared by server and tests): the cut of the track and the bar grid the shots sit on.
// Nothing here guesses a BPM: without one in the card the grid is 2-second units and the project says so.

export const MIN_BPM = 60;
export const MAX_BPM = 200;
const NO_GRID_UNIT = 2;

export function barSeconds(bpm: number | null): number | null {
  if (bpm == null || !Number.isFinite(bpm) || bpm < MIN_BPM || bpm > MAX_BPM) return null;
  return 240 / bpm; // 4/4: four beats per bar
}

/** Where loudness rises most (s from the track start), from muzaik's 32-point curve; null without a curve. */
export function biggestRise(curve: number[], durationSec: number): number | null {
  if (curve.length < 4 || durationSec <= 0) return null;
  let best = -Infinity;
  let at = -1;
  for (let i = 2; i < curve.length; i++) {
    const rise = curve[i] - curve[i - 2];
    if (rise > best) { best = rise; at = i; }
  }
  return at < 0 || best <= 0.05 ? null : (at / curve.length) * durationSec;
}

/** Share of the video before the drop: trailers and Shorts build up first, promos get to the point sooner. */
const LEAD_SHARE: Record<MaterialKind, number> = { zwiastun: 0.4, short: 0.3, premiera: 0.3, radio: 0.25, szkola: 0.25, magazyn: 0.25, 'utwor-dnia': 0.25 };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** What the file analysis (Parallax Studio engine) found, used only where the card is silent. */
export interface AudioHint { bpm: number | null; bpmConfidence: number; drops: number[] }

/** Tempo from the analysis is trusted from this autocorrelation confidence up (Parallax Studio marks < 0.2 as "unclear"). */
export const MIN_BPM_CONFIDENCE = 0.2;

export function chooseCut(card: Pick<TrackCard, 'bpm' | 'chorusStart' | 'excerptStart' | 'curve' | 'durationSec' | 'silenceStart' | 'silenceEnd'>, targetSec: number, kind: MaterialKind, hint?: AudioHint | null): MusicCut | null {
  const lo = Math.max(0, card.silenceStart || 0);
  const hi = Math.max(lo, card.durationSec - Math.max(0, card.silenceEnd || 0));
  if (hi - lo < 4) return null;

  const hintBpm = card.bpm == null && hint?.bpm != null && hint.bpmConfidence >= MIN_BPM_CONFIDENCE ? hint.bpm : null;
  const bpm = card.bpm ?? hintBpm;
  const bar = barSeconds(bpm);
  const unit = bar ?? NO_GRID_UNIT;
  let bars = Math.max(2, Math.round(targetSec / unit));
  if (bars * unit > hi - lo) bars = Math.floor((hi - lo) / unit);
  if (bars < 2) return null;
  const length = bars * unit;

  let anchor: number;
  let why: string;
  if (card.chorusStart != null && card.chorusStart > lo && card.chorusStart < hi) {
    anchor = card.chorusStart;
    why = `Refren wchodzi w ${fmt(anchor)} — film buduje napięcie i trafia w refren.`;
  } else if (hint?.drops.some((d) => d >= 15 && d > lo && d < hi)) {
    anchor = hint.drops.find((d) => d >= 15 && d > lo && d < hi)!;
    why = `Karta nie ma wejścia refrenu — kulminacja na pierwszym dropie z analizy pliku (${fmt(anchor)}).`;
  } else {
    const rise = biggestRise(card.curve, card.durationSec);
    if (rise != null && rise > lo && rise < hi) {
      anchor = rise;
      why = `Karta nie ma wejścia refrenu — kulminacja w miejscu największego wzrostu głośności (${fmt(anchor)}).`;
    } else {
      anchor = Math.min(Math.max(card.excerptStart || lo, lo), hi);
      why = `Brak refrenu i krzywej głośności — fragment od momentu wskazanego w karcie (${fmt(anchor)}).`;
    }
  }

  const leadBars = Math.round(bars * LEAD_SHARE[kind]);
  let start = anchor - leadBars * unit;
  if (start < lo) start = lo + ((anchor - lo) % unit); // keep the anchor on a bar line
  if (start + length > hi) start = hi - length;
  if (start < lo) start = lo;
  const dropAt = anchor - start >= 0 && anchor - start <= length ? round2(anchor - start) : null;
  if (!bar) why += ` Karta nie ma tempa (BPM), a analiza pliku go nie ustaliła, więc ujęcia mają po ${NO_GRID_UNIT} s, a nie pełne takty.`;
  else why += ` Tempo ${bpm} BPM${hintBpm ? ` (z analizy pliku, pewność ${Math.round(hint!.bpmConfidence * 100)}%)` : ''} → takt ${round2(bar)} s, ${bars} taktów.`;

  return { start: round2(start), end: round2(start + length), bars, barSec: round2(unit), dropAt, grid: Boolean(bar), why };
}

/** Bars of the closing card: at least 2.5 s, always whole bars. */
export function endCardBars(barSec: number): number {
  return Math.max(1, Math.ceil(2.5 / barSec - 1e-6));
}

/**
 * Makes the model's bar counts add up to exactly `total` (integers ≥ 1): longer than total → trims the longest shots,
 * then drops shots from the end; shorter → lengthens shots from the end, one bar at a time. Returns the new counts
 * (same order; a dropped shot is gone) and whether anything changed.
 */
export function fitBars(bars: number[], total: number): { bars: number[]; changed: boolean } {
  let out = bars.map((b) => Math.max(1, Math.round(Number.isFinite(b) ? b : 1)));
  const original = JSON.stringify(bars);
  if (total <= 0) return { bars: [], changed: bars.length > 0 };
  while (out.length > total) out = out.slice(0, -1);
  let sum = out.reduce((a, b) => a + b, 0);
  while (sum > total) {
    const i = out.indexOf(Math.max(...out));
    out[i] -= 1;
    sum -= 1;
  }
  if (!out.length) out = [total];
  sum = out.reduce((a, b) => a + b, 0);
  let k = 0;
  while (sum < total) {
    out[out.length - 1 - (k % out.length)] += 1;
    sum += 1;
    k++;
  }
  return { bars: out, changed: JSON.stringify(out) !== original };
}

export function fmt(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
}
