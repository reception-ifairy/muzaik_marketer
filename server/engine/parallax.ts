import fs from 'fs';
import { spawn } from 'child_process';
import { createCanvas, loadImage, type Canvas, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { lissajous, frameAt as curveFrame, type BassCurve } from './audio';

// Parallax renderer ported from reception-ifairy/parallax-studio (src/render/motion.ts + frame.ts), 2026-11-08,
// reduced to what a marketing shot needs: layers by depth, Lissajous drift, zoom and "kick" from the real bass curve,
// accent glow and vignette — the same formulas as the scene on air in muzaik.channel. Studio plugins, camera presets,
// hero measurement and the cover text zone were left out. Frames are drawn offline and piped to ffmpeg as raw RGBA,
// so picture and music are in sync by construction.

export interface MotionParams { W: number; H: number; intensity: number; sensitivity?: number }

export function motionConstants(intensity: number, sensitivity = 1) {
  const strength = intensity / 60;
  return { strength, shift: 46 * strength, zoom: 0.07 * strength * sensitivity, punch: 0.035 * strength * sensitivity };
}

export interface LayerPlacement { drawW: number; drawH: number; offX: number; offY: number; scale: number; bleed: number }

export function placeLayer(p: MotionParams, img: { w: number; h: number }, depth: number, state: { bass: number; kick: number; dx: number; dy: number }): LayerPlacement {
  const { shift, zoom, punch } = motionConstants(p.intensity, p.sensitivity ?? 1);
  // The margin grows with depth: closer layers move more, so the edge never enters the frame.
  const bleed = Math.ceil(shift * depth + 60);
  const boxW = p.W + 2 * bleed;
  const boxH = p.H + 2 * bleed;
  const cover = Math.max(boxW / img.w, boxH / img.h);
  return {
    drawW: img.w * cover,
    drawH: img.h * cover,
    offX: state.dx * shift * depth,
    offY: state.dy * shift * depth,
    // bass and kick are ≥ 0, so the scale never drops below 1 — a layer only grows towards the camera.
    scale: 1 + Math.max(0, state.bass) * zoom * depth + Math.max(0, state.kick) * punch * depth,
    bleed,
  };
}

/** Layer rectangle in frame coordinates — the test checks its edge never enters the frame. */
export function layerRect(p: MotionParams, pl: LayerPlacement) {
  const cx = p.W / 2;
  const cy = p.H / 2;
  return {
    left: cx + pl.scale * (pl.offX - pl.drawW / 2),
    right: cx + pl.scale * (pl.offX + pl.drawW / 2),
    top: cy + pl.scale * (pl.offY - pl.drawH / 2),
    bottom: cy + pl.scale * (pl.offY + pl.drawH / 2),
  };
}

export function glowOpacity(bass: number, kick: number, sensitivity = 1): number {
  return Math.max(0, Math.min(1, (bass * 0.5 + kick * 0.25) * sensitivity));
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(/^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '22d3ee', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class FrameRenderer {
  readonly canvas: Canvas;
  private ctx: SKRSContext2D;
  private images: { img: Image; depth: number }[] = [];
  private vignette!: Canvas;
  private glow!: Canvas;

  private constructor(private readonly p: MotionParams, private readonly accent: string) {
    this.canvas = createCanvas(p.W, p.H);
    this.ctx = this.canvas.getContext('2d');
  }

  static async create(layers: { file: string; depth: number }[], accent: string, p: MotionParams): Promise<FrameRenderer> {
    const r = new FrameRenderer(p, accent);
    for (const l of layers) r.images.push({ img: await loadImage(fs.readFileSync(l.file)), depth: l.depth });
    r.images.sort((a, b) => a.depth - b.depth);
    r.vignette = r.buildVignette();
    r.glow = r.buildGlow();
    return r;
  }

  private buildVignette(): Canvas {
    const { W, H } = this.p;
    const c = createCanvas(W, H);
    const g = c.getContext('2d');
    g.translate(W / 2, H / 2);
    g.scale((W / 2) * Math.SQRT2, (H / 2) * Math.SQRT2);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = grad;
    g.fillRect(-1, -1, 2, 2);
    return c;
  }

  private buildGlow(): Canvas {
    const { W, H } = this.p;
    const c = createCanvas(W, H);
    const g = c.getContext('2d');
    const cx = W * 0.5;
    const cy = H * 0.55;
    const R = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
    const [r, gg, b] = hexRgb(this.accent);
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, `rgba(${r},${gg},${b},${0x40 / 255})`);
    grad.addColorStop(0.6, `rgba(${r},${gg},${b},0)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    return c;
  }

  /** One frame: layers back to front → glow (from the bass) → vignette. No blend modes (costly, not needed). */
  draw(t: number, bass: number, kick: number): void {
    const { W, H } = this.p;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const { x: dx, y: dy } = lissajous(t);
    for (const { img, depth } of this.images) {
      const pl = placeLayer(this.p, { w: img.width, h: img.height }, depth, { bass, kick, dx, dy });
      ctx.setTransform(pl.scale, 0, 0, pl.scale, W / 2 + pl.scale * pl.offX, H / 2 + pl.scale * pl.offY);
      ctx.drawImage(img, -pl.drawW / 2, -pl.drawH / 2, pl.drawW, pl.drawH);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const go = glowOpacity(bass, kick, this.p.sensitivity ?? 1);
    if (go > 0.001) {
      ctx.globalAlpha = go;
      ctx.drawImage(this.glow, 0, 0);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(this.vignette, 0, 0);
  }

  rgba(): Uint8ClampedArray {
    return this.ctx.getImageData(0, 0, this.p.W, this.p.H).data;
  }
}

/**
 * Renders a Parallax shot to a silent H.264 segment: frames `startFrame … startFrame + n` of the video, drift from the
 * video time, bass/kick from the curve of the music cut (null = drift only, e.g. a material without a track).
 */
export async function renderParallaxShot(opts: {
  layers: { file: string; depth: number }[];
  accent: string;
  intensity: number;
  W: number;
  H: number;
  startFrame: number;
  frames: number;
  fps: number;
  curve: BassCurve | null;
  out: string;
  signal?: AbortSignal;
}): Promise<void> {
  const r = await FrameRenderer.create(opts.layers, opts.accent, { W: opts.W, H: opts.H, intensity: opts.intensity });
  const ff = spawn('nice', ['-n', '10', 'ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${opts.W}x${opts.H}`, '-r', String(opts.fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', '-frames:v', String(opts.frames), opts.out], { signal: opts.signal });
  let stderr = '';
  ff.stderr.on('data', (d) => { stderr += String(d); });
  const done = new Promise<void>((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg (Parallax) zakończył się kodem ${code}: ${stderr.trim().split('\n').slice(-3).join(' ')}`))));
  });
  for (let i = 0; i < opts.frames; i++) {
    const k = opts.startFrame + i;
    const f = opts.curve ? curveFrame(opts.curve, k) : { bass: 0, kick: 0 };
    r.draw(k / opts.fps, f.bass, f.kick);
    const buf = Buffer.from(r.rgba().buffer);
    if (!ff.stdin.write(buf)) await new Promise((res) => ff.stdin.once('drain', res));
  }
  ff.stdin.end();
  await done;
}
