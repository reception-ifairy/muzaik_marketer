// Audio engine ported from reception-ifairy/parallax-studio (src/audio/bass.ts, analyze.ts, decode.ts), 2026-11-08.
// The bass curve is muzaik.channel's on-air Parallax reaction (Web Audio AnalyserNode) computed offline and
// deterministically; the tempo/drop analysis fills gaps when a track card has no BPM or refrain. Keep the numbers in
// sync with Parallax Studio — the same file must move the same way in the studio, on air and here.
import { execFile } from 'child_process';
import FFT from 'fft.js';

export const SAMPLE_RATE = 44100;

/** Mono Float32 44.1 kHz from any audio file, optionally only [start, start + seconds). */
export function decodeMono(file: string, start = 0, seconds?: number): Promise<Float32Array> {
  const args = ['-hide_banner', '-nostdin', '-v', 'error'];
  if (start > 0) args.push('-ss', start.toFixed(3));
  args.push('-i', file);
  if (seconds) args.push('-t', seconds.toFixed(3));
  args.push('-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-');
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { encoding: 'buffer', maxBuffer: 1024 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(new Error(`ffmpeg nie zdekodował audio: ${err.message.split('\n')[0]}`));
      // Copy into an aligned buffer: a pooled Buffer may start at an offset not divisible by 4.
      const buf = new ArrayBuffer(stdout.length - (stdout.length % 4));
      new Uint8Array(buf).set(stdout.subarray(0, buf.byteLength));
      resolve(new Float32Array(buf));
    });
  });
}

export const FFT_SIZE = 4096;
const MIN_DB = -90;
const MAX_DB = -12;
const SMOOTHING = 0.35;
const BAND_LO = 30;
const BAND_HI = 150;
const KICK_MIN_RISE = 0.11;

export interface BassFrame { bass: number; kick: number; level: number }

export interface BassCurve {
  fps: number;
  frames: number;
  /** Trójki [bass, kick, level] dla każdej klatki. */
  data: Float32Array;
}

export function frameAt(curve: BassCurve, i: number): BassFrame {
  const j = Math.max(0, Math.min(curve.frames - 1, i)) * 3;
  return { bass: curve.data[j], kick: curve.data[j + 1], level: curve.data[j + 2] };
}

const hann = (() => {
  const w = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  return w;
})();

/** Stan analizatora jak w Web Audio: wygładzanie robione na amplitudach, potem dB → bajty. */
class Analyser {
  private fft = new FFT(FFT_SIZE);
  private input = new Array<number>(FFT_SIZE).fill(0);
  private out = this.fft.createComplexArray() as number[];
  private smooth: Float32Array;
  readonly bytes: Uint8Array;
  constructor(private readonly kLo: number, private readonly kHi: number) {
    this.smooth = new Float32Array(kHi + 1);
    this.bytes = new Uint8Array(kHi + 1);
  }
  /** Liczymy tylko kosze pasma basu — reszta widma nie wpływa na wynik. */
  analyse(samples: Float32Array, center: number): void {
    // Przy brzegach pliku okno wsuwamy do środka zamiast dopełniać zerami — dopełnienie sztucznie
    // obniżało poziom pierwszych klatek i dawało fałszywy „wzrost” na starcie.
    const start = Math.max(0, Math.min(samples.length - FFT_SIZE, center - FFT_SIZE / 2));
    for (let i = 0; i < FFT_SIZE; i++) {
      const s = start + i;
      this.input[i] = s >= 0 && s < samples.length ? samples[s] * hann[i] : 0;
    }
    this.fft.realTransform(this.out, this.input);
    for (let k = this.kLo; k <= this.kHi; k++) {
      const re = this.out[2 * k], im = this.out[2 * k + 1];
      const mag = Math.sqrt(re * re + im * im) / FFT_SIZE; // normalizacja 1/N jak w Web Audio
      this.smooth[k] = SMOOTHING * this.smooth[k] + (1 - SMOOTHING) * mag;
      const db = this.smooth[k] > 0 ? 20 * Math.log10(this.smooth[k]) : -Infinity;
      const b = Math.floor((255 / (MAX_DB - MIN_DB)) * (db - MIN_DB));
      this.bytes[k] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
  }
}

/** bandLevel z MuzaIK: (średnia + szczyt) / 2 w paśmie, przeskalowane floor..ceiling → 0..1. */
export function bandLevel(bytes: ArrayLike<number>, kLo: number, kHi: number, floor = 0, ceiling = 255): number {
  let sum = 0, peak = 0;
  for (let k = kLo; k <= kHi; k++) { sum += bytes[k]; if (bytes[k] > peak) peak = bytes[k]; }
  const v = (sum / (kHi - kLo + 1) + peak) / 2;
  return Math.max(0, Math.min(1, (v - floor) / (ceiling - floor)));
}

/**
 * Logika czysto czasowa (AGC → obwiednia → detektor stopy), oddzielona od FFT,
 * żeby dało się ją testować na sztucznych poziomach.
 */
export class BassFollower {
  private peak = -1;
  private floor = -1;
  private bass = 0;
  private kick = 0;
  private avg = -1;
  private lastKickT = -Infinity;
  private recent: number[] = [];

  step(level: number, t: number, dt: number): BassFrame {
    // AGC: masterowany bas stoi przy stałej skali ~0,9–1,0, więc bez normalizacji obraz „stałby” na maksimum.
    if (this.peak < 0) { this.peak = level; this.floor = level; }
    this.peak = level >= this.peak ? level : level + (this.peak - level) * Math.exp(-dt / 6.0);
    this.floor = level <= this.floor ? level : level + (this.floor - level) * Math.exp(-dt / 3.0);
    const range = Math.max(0.06, this.peak - this.floor);
    const agc = Math.max(0, Math.min(1, (level - this.floor) / range));
    // Cichy fragment wycisza efekt, nawet jeśli AGC rozciągnie szum do pełnego zakresu.
    const raw = agc * Math.min(1, level * 1.6);

    const tau = raw > this.bass ? 0.025 : 0.28;
    this.bass += (raw - this.bass) * (1 - Math.exp(-dt / tau));

    // Jedyne odstępstwo od MuzaIK: AGC rozciąga nawet drgania szumu do pełnego 0–1, więc sam szum
    // dawał „kicki”. Drgania szumu w domenie dB nie przekraczają ~0,09 (≈7 dB) w 100 ms niezależnie
    // od jego głośności, a stopa podnosi pasmo basu o ≥0,15. Bramka 0,11 (≈8 dB; zmierzone na 10 min szumu) rozdziela je bez
    // zmiany zachowania na muzyce. Obwiednia `bass` pozostaje dokładnie jak w produkcji.
    const rise = this.recent.length ? level - Math.min(...this.recent) : 0;
    this.recent.push(level);
    if (this.recent.length > Math.max(1, Math.round(0.1 / dt))) this.recent.shift();

    if (this.avg < 0) this.avg = raw;
    if (raw >= 0.35 && raw > this.avg * 1.35 && rise >= KICK_MIN_RISE && t - this.lastKickT >= 0.12) {
      this.kick = 1;
      this.lastKickT = t;
    } else {
      this.kick *= Math.exp(-dt / 0.14);
    }
    this.avg += (raw - this.avg) * (1 - Math.exp(-dt / 0.9));
    return { bass: this.bass, kick: this.kick, level };
  }
}

export function computeBassCurve(samples: Float32Array, fps = 30, sampleRate = SAMPLE_RATE): BassCurve {
  const binHz = sampleRate / FFT_SIZE;
  const kLo = Math.max(1, Math.floor(BAND_LO / binHz));
  const kHi = Math.ceil(BAND_HI / binHz);
  const frames = Math.max(1, Math.ceil((samples.length / sampleRate) * fps));
  const data = new Float32Array(frames * 3);
  const an = new Analyser(kLo, kHi);
  const fol = new BassFollower();
  const dt = 1 / fps;
  for (let i = 0; i < frames; i++) {
    const t = i / fps;
    an.analyse(samples, Math.round(t * sampleRate));
    const f = fol.step(bandLevel(an.bytes, kLo, kHi), t, dt);
    data[i * 3] = f.bass;
    data[i * 3 + 1] = f.kick;
    data[i * 3 + 2] = f.level;
  }
  return { fps, frames, data };
}

export function serializeCurve(c: BassCurve): Buffer {
  return Buffer.from(c.data.buffer, c.data.byteOffset, c.data.byteLength);
}

export function deserializeCurve(buf: Buffer, fps = 30): BassCurve {
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  const data = new Float32Array(ab);
  return { fps, frames: data.length / 3, data };
}

/** Dryf Lissajous — ten sam co w scenie MuzaIK; okres 50 s, więc ruch nie zapętla się widocznie. */
export function lissajous(t: number): { x: number; y: number } {
  return { x: Math.sin((2 * Math.PI * t) / 50), y: 0.6 * Math.sin((2 * Math.PI * 0.73 * t) / 50 + 1.1) };
}

// ---- Tempo and energy (from analyze.ts) ----

const toDb = (x: number) => 10 * Math.log10(Math.max(x, 1e-12));

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i];
}

/** Cechy widmowe + obwiednia onsetów z jednego przejścia STFT (1024 / hop 512). */
function spectral(samples: Float32Array) {
  const N = 1024, HOP = 512;
  const fft = new FFT(N);
  const out = fft.createComplexArray();
  const inp = new Array<number>(N).fill(0);
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1))));
  const binHz = SAMPLE_RATE / N;
  const bLo = Math.floor(30 / binHz), bHi = Math.ceil(150 / binHz);
  let prev = new Float32Array(N / 2 + 1);
  let cur = new Float32Array(N / 2 + 1);
  const flux: number[] = [];
  let totalE = 0, bassE = 0, centroidW = 0, centroidSum = 0;
  for (let pos = 0; pos + N <= samples.length; pos += HOP) {
    for (let i = 0; i < N; i++) inp[i] = samples[pos + i] * win[i];
    fft.realTransform(out, inp);
    let e = 0, f = 0, c = 0;
    for (let k = 1; k <= N / 2; k++) {
      const m2 = out[2 * k] ** 2 + out[2 * k + 1] ** 2;
      cur[k] = Math.log1p(Math.sqrt(m2) * 10);
      const d = cur[k] - prev[k];
      if (d > 0) f += d;
      e += m2;
      c += m2 * k * binHz;
      if (k >= bLo && k <= bHi) bassE += m2;
    }
    totalE += e;
    if (e > 1e-9) { centroidSum += c; centroidW += e; }
    flux.push(f);
    [prev, cur] = [cur, prev];
  }
  return { flux, fluxRate: SAMPLE_RATE / HOP, bassShare: totalE > 0 ? bassE / totalE : 0, centroidHz: centroidW > 0 ? centroidSum / centroidW : 0 };
}

/** BPM z autokorelacji obwiedni onsetów w zakresie 70–180, z lekkim preferowaniem okolic 120 (mniej błędów oktawowych). */
export function estimateBpm(flux: number[], rate: number): { bpm: number | null; confidence: number } {
  if (flux.length < rate * 4) return { bpm: null, confidence: 0 };
  // Odejmujemy lokalną średnią, żeby autokorelacja mierzyła rytm, a nie zmiany głośności.
  const w = Math.round(rate * 0.5);
  const env = new Float32Array(flux.length);
  let acc = 0;
  for (let i = 0; i < flux.length; i++) {
    acc += flux[i];
    if (i >= w) acc -= flux[i - w];
    env[i] = Math.max(0, flux[i] - acc / Math.min(i + 1, w));
  }
  const minLag = Math.floor((60 / 180) * rate), maxLag = Math.ceil((60 / 70) * rate);
  let zero = 0;
  for (let i = 0; i < env.length; i++) zero += env[i] * env[i];
  if (zero <= 0) return { bpm: null, confidence: 0 };
  let best = -Infinity, bestLag = 0, sumScores = 0, n = 0;
  const scores: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < env.length; i++) s += env[i] * env[i + lag];
    s /= env.length - lag;
    const bpm = (60 * rate) / lag;
    const weight = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    const score = s * weight;
    scores[lag] = score;
    sumScores += score; n++;
    if (score > best) { best = score; bestLag = lag; }
  }
  // Interpolacja paraboliczna wokół szczytu — dokładność lepsza niż jeden hop.
  const a = scores[bestLag - 1] ?? best, c = scores[bestLag + 1] ?? best;
  const denom = a - 2 * best + c;
  const shift = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom)) : 0;
  const bpm = (60 * rate) / (bestLag + shift);
  const confidence = Math.max(0, Math.min(1, (best / (sumScores / n) - 1) / 3));
  return { bpm: Math.round(bpm * 10) / 10, confidence: Math.round(confidence * 100) / 100 };
}

function rmsDbBlocks(samples: Float32Array, blockSec: number): number[] {
  const n = Math.round(SAMPLE_RATE * blockSec);
  const out: number[] = [];
  for (let s = 0; s < samples.length; s += n) {
    const e = Math.min(samples.length, s + n);
    let sum = 0;
    for (let i = s; i < e; i++) sum += samples[i] * samples[i];
    out.push(toDb(sum / Math.max(1, e - s)));
  }
  return out;
}


export interface TrackAnalysis {
  version: number;
  duration: number;
  bpm: number | null;
  bpmConfidence: number;
  /** Starts (s) of 10-second windows where energy jumps ≥ 3 dB above the previous one and the median. */
  drops: number[];
  perSecondDb: number[];
}

export const ANALYSIS_VERSION = 1;

export function analyzeSamples(samples: Float32Array): TrackAnalysis {
  const duration = samples.length / SAMPLE_RATE;
  const sp = spectral(samples);
  const { bpm, confidence } = estimateBpm(sp.flux, sp.fluxRate);
  const tens = rmsDbBlocks(samples, 10);
  const median = [...tens].sort((a, b) => a - b)[Math.floor(tens.length / 2)] ?? 0;
  const drops = tens.map((db, i) => (i > 0 && db - tens[i - 1] >= 3 && db >= median ? i * 10 : -1)).filter((x) => x >= 0);
  return {
    version: ANALYSIS_VERSION,
    duration: Math.round(duration * 1000) / 1000,
    bpm,
    bpmConfidence: confidence,
    drops,
    perSecondDb: rmsDbBlocks(samples, 1).map((x) => Math.round(x * 10) / 10),
  };
}

/** Początek najbardziej energetycznego okna danej długości (dla --preview). */
export function loudestWindow(f: Pick<TrackAnalysis, 'perSecondDb'>, seconds: number): number {
  const s = f.perSecondDb;
  const len = Math.min(seconds, s.length);
  if (s.length <= len) return 0;
  let sum = 0;
  for (let i = 0; i < len; i++) sum += 10 ** (s[i] / 10);
  let best = sum, bestI = 0;
  for (let i = len; i < s.length; i++) {
    sum += 10 ** (s[i] / 10) - 10 ** (s[i - len] / 10);
    if (sum > best) { best = sum; bestI = i - len + 1; }
  }
  return bestI;
}
