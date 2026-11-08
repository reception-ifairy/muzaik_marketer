import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBassCurve, frameAt, analyzeSamples, SAMPLE_RATE, type BassCurve } from '../server/engine/audio';
import { placeLayer, layerRect, motionConstants } from '../server/engine/parallax';
import { chooseCut } from '../src/beat';

// Engine ported from Parallax Studio: the same synthetic checks as its test/bass.test.ts and motion.test.ts, plus how
// the marketer uses the analysis. Deterministic signals only.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff) * 2 - 1;
}

function noise(seconds: number, amp: number, seed = 1): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let i = 0; i < out.length; i++) out[i] = r() * amp;
  return out;
}

/** 55 Hz kick pulsing at 120 BPM over noise (Parallax Studio's test signal). */
function kickTrack(seconds: number, firstBeat = 0.25): Float32Array {
  const out = noise(seconds, 0.03, 7);
  for (let b = firstBeat; b < seconds; b += 0.5) {
    const s0 = Math.round(b * SAMPLE_RATE);
    const len = Math.round(0.18 * SAMPLE_RATE);
    for (let i = 0; i < len && s0 + i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      out[s0 + i] += 0.8 * Math.exp(-t / 0.06) * Math.sin(2 * Math.PI * 55 * t);
    }
  }
  return out;
}

const kicks = (c: BassCurve) => Array.from({ length: c.frames }, (_, i) => i).filter((i) => frameAt(c, i).kick === 1);

test('bass curve: a kick every 0.5 s (± 1 frame) at 120 BPM', () => {
  const steady = kicks(computeBassCurve(kickTrack(12), 30)).filter((f) => f >= 60);
  assert.ok(steady.length >= 19, `only ${steady.length} kicks`);
  for (let i = 1; i < steady.length; i++) assert.ok(Math.abs(steady[i] - steady[i - 1] - 15) <= 1);
});

test('bass curve: noise alone gives no kicks', () => {
  for (const [amp, seed] of [[0.02, 1], [0.3, 3], [0.7, 11]] as const) assert.deepEqual(kicks(computeBassCurve(noise(20, amp, seed), 30)), []);
});

test('analysis: tempo of the kick track ≈ 120 BPM; a jump in energy is a drop', () => {
  const quiet = noise(30, 0.01, 5);
  const loud = kickTrack(30);
  const both = new Float32Array(quiet.length + loud.length);
  both.set(quiet, 0);
  both.set(loud, quiet.length);
  const a = analyzeSamples(both);
  assert.ok(a.bpm != null && Math.abs(a.bpm - 120) <= 2, `bpm ${a.bpm}`);
  assert.ok(a.drops.includes(30), `drops ${a.drops}`);
});

test('motion: at maximum drift, zoom and kick no layer edge enters the frame (16:9 and 9:16)', () => {
  for (const [W, H] of [[1920, 1080], [1080, 1920]]) {
    for (const intensity of [30, 60, 100]) {
      const p = { W, H, intensity };
      for (const depth of [0.3, 0.65, 1, 1.35]) {
        for (const dx of [-1, 1]) for (const dy of [-0.6, 0.6]) {
          const r = layerRect(p, placeLayer(p, { w: 2304, h: 1296 }, depth, { bass: 1, kick: 1, dx, dy }));
          assert.ok(r.left <= 0 && r.top <= 0 && r.right >= W && r.bottom >= H, `${W}x${H} i${intensity} d${depth}`);
        }
      }
    }
  }
  assert.equal(motionConstants(60).shift, 46);
});

test('cut: the analysis fills BPM and the drop only where the card is silent', () => {
  const card = { bpm: null, chorusStart: null, excerptStart: 0, curve: [], durationSec: 200, silenceStart: 0, silenceEnd: 0 };
  const cut = chooseCut(card, 30, 'zwiastun', { bpm: 128, bpmConfidence: 0.6, drops: [5, 60] })!;
  assert.equal(cut.grid, true);
  assert.match(cut.why, /z analizy pliku/);
  assert.match(cut.why, /dropie/);
  assert.ok(Math.abs(cut.start + (cut.dropAt ?? 0) - 60) < 1e-6);
  const unsure = chooseCut(card, 30, 'zwiastun', { bpm: 128, bpmConfidence: 0.1, drops: [] })!;
  assert.equal(unsure.grid, false);
  const own = chooseCut({ ...card, bpm: 100, chorusStart: 50 }, 30, 'zwiastun', { bpm: 128, bpmConfidence: 0.9, drops: [80] })!;
  assert.match(own.why, /100 BPM/);
  assert.match(own.why, /Refren wchodzi/);
});
