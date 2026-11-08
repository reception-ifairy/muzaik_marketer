import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import sharp from 'sharp';
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import type { BrandKit, ParallaxScene } from '../src/muzaik';
import { computeBassCurve, decodeMono, type BassCurve } from './engine/audio';
import { renderParallaxShot } from './engine/parallax';
import { VIDEO_SIZE, type MaterialProject, type RenderFile, type Shot, type VideoFormat } from '../src/material';

// The edit: every shot becomes an exact-length silent segment (Flow clip, Parallax scene drawn frame by frame with the
// Parallax Studio engine and the real bass curve — server/engine/, cover or text card),
// the segments are joined and the music cut is laid under them (fades, −14 LUFS for YouTube). Each format is rendered
// natively (cards and scenes are laid out for 16:9 or 9:16; a Flow clip of the other shape gets a blurred fill), so the
// 9:16 version is not a crop of the 16:9 one. Text is drawn here (Audiowide/Rajdhani, OFL) — never by a video model.

const FPS = 30;
const FONT_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'fonts');
let fontsReady = false;
function fonts() {
  if (fontsReady) return;
  GlobalFonts.registerFromPath(path.join(FONT_DIR, 'audiowide-400.ttf'), 'Audiowide');
  GlobalFonts.registerFromPath(path.join(FONT_DIR, 'rajdhani-600.ttf'), 'Rajdhani');
  fontsReady = true;
}

export class RenderError extends Error {}

function run(cmd: string, args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile('nice', ['-n', '10', cmd, ...args], { maxBuffer: 32 * 1024 * 1024, signal }, (err, stdout, stderr) => {
      if (err) {
        const tail = String(stderr || err.message).trim().split('\n').slice(-6).join('\n');
        reject(new RenderError(`${cmd} nie zadziałał: ${tail}`));
      } else resolve(String(stdout));
    });
    child.stdin?.end();
  });
}

export async function probeDuration(file: string): Promise<{ seconds: number; width: number; height: number } | null> {
  try {
    const out = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file]);
    const j = JSON.parse(out) as { streams?: { width?: number; height?: number }[]; format?: { duration?: string } };
    const s = j.streams?.[0];
    const seconds = Number(j.format?.duration);
    if (!s?.width || !s?.height || !Number.isFinite(seconds)) return null;
    return { seconds, width: s.width, height: s.height };
  } catch {
    return null;
  }
}

const frames = (sec: number) => Math.max(1, Math.round(sec * FPS));
const encode = (n: number) => ['-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', '-frames:v', String(n)];

// ---- Cards ----------------------------------------------------------------------------------------------------

function fitFont(ctx: SKRSContext2D, text: string, family: string, maxWidth: number, start: number): number {
  let size = start;
  while (size > 12) {
    ctx.font = `${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 4;
  }
  return size;
}

function wrap(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** A text card PNG at twice the video size (room for the slow zoom). Exported for tests. */
export function drawCard(format: VideoFormat, brand: BrandKit, title: string, subtitle: string, muted = false): Buffer {
  fonts();
  const { width, height } = VIDEO_SIZE[format];
  const W = width * 2;
  const H = height * 2;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = brand.colors.bg;
  ctx.fillRect(0, 0, W, H);
  if (!muted) {
    for (const [x, y, r, c] of [[0.2, 0.25, 0.7, brand.colors.cyan], [0.85, 0.8, 0.8, brand.colors.purple]] as const) {
      const g = ctx.createRadialGradient(W * x, H * y, 0, W * x, H * y, Math.max(W, H) * r);
      g.addColorStop(0, `${c}55`);
      g.addColorStop(1, `${c}00`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }
  const maxW = W * 0.82;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const base = format === '16:9' ? H * 0.13 : W * 0.12;
  // Shrink until the title fits in at most 3 lines, each within the safe width (no word is ever dropped).
  let size = base;
  let lines: string[] = [];
  for (; size > 24; size -= 6) {
    ctx.font = `${size}px Audiowide`;
    lines = wrap(ctx, title, maxW);
    if (lines.length <= 3 && lines.every((l) => ctx.measureText(l).width <= maxW)) break;
  }
  ctx.font = `${size}px Audiowide`;
  const grad = ctx.createLinearGradient(W * 0.1, 0, W * 0.9, 0);
  grad.addColorStop(0, muted ? '#64748b' : brand.colors.cyan);
  grad.addColorStop(0.55, muted ? '#94a3b8' : brand.colors.purple);
  grad.addColorStop(1, muted ? '#64748b' : brand.colors.pink);
  ctx.fillStyle = grad;
  const lineH = size * 1.15;
  const top = H / 2 - ((lines.length - 1) * lineH) / 2 - (subtitle ? size * 0.35 : 0);
  if (!muted) { ctx.shadowColor = `${brand.colors.cyan}aa`; ctx.shadowBlur = size * 0.35; }
  lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * lineH));
  ctx.shadowBlur = 0;
  if (subtitle) {
    const sub = fitFont(ctx, subtitle, 'Rajdhani', maxW, size * 0.42);
    ctx.font = `${sub}px Rajdhani`;
    ctx.fillStyle = muted ? '#94a3b8' : '#e2e8f0';
    ctx.fillText(subtitle, W / 2, top + (lines.length - 1) * lineH + size * 1.05);
  }
  return canvas.toBuffer('image/png');
}

/** Lower-third text over a shot (transparent PNG, video size). Exported for tests. */
export function drawOverlay(format: VideoFormat, brand: BrandKit, text: string): Buffer {
  fonts();
  const { width: W, height: H } = VIDEO_SIZE[format];
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const band = ctx.createLinearGradient(0, H * 0.62, 0, H);
  band.addColorStop(0, 'rgba(0,0,0,0)');
  band.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = band;
  ctx.fillRect(0, H * 0.62, W, H * 0.38);
  const maxW = W * 0.84;
  let size = format === '16:9' ? H * 0.085 : W * 0.085;
  let lines: string[] = [];
  for (; size > 18; size -= 4) {
    ctx.font = `${size}px Audiowide`;
    lines = wrap(ctx, text, maxW);
    if (lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= maxW)) break;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const grad = ctx.createLinearGradient(W * 0.15, 0, W * 0.85, 0);
  grad.addColorStop(0, brand.colors.cyan);
  grad.addColorStop(1, '#ffffff');
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = size * 0.25;
  const base = format === '16:9' ? H * 0.82 : H * 0.78;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, base - (lines.length - 1 - i) * size * 1.15));
  return canvas.toBuffer('image/png');
}

/** YouTube thumbnail 1280×720 JPEG (≤ 2 MB): the base picture, a darker band and a short title drawn in the channel font. */
export async function drawThumbnail(baseFile: string, brand: BrandKit, text: string): Promise<Buffer> {
  fonts();
  const W = 1280;
  const H = 720;
  const base = await sharp(baseFile).resize(W, H, { fit: 'cover' }).png().toBuffer();
  const img = await loadImage(base);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);
  const shade = ctx.createLinearGradient(0, 0, W * 0.75, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.7)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  const maxW = W * 0.6;
  let size = 150;
  let lines: string[] = [];
  for (; size > 40; size -= 6) {
    ctx.font = `${size}px Audiowide`;
    lines = wrap(ctx, text.toUpperCase(), maxW);
    if (lines.length <= 3 && lines.every((l) => ctx.measureText(l).width <= maxW)) break;
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const grad = ctx.createLinearGradient(60, 0, 60 + maxW, 0);
  grad.addColorStop(0, brand.colors.cyan);
  grad.addColorStop(1, '#ffffff');
  const top = H / 2 - ((lines.length - 1) * size * 1.08) / 2;
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.12;
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  lines.forEach((l, i) => ctx.strokeText(l, 60, top + i * size * 1.08));
  ctx.fillStyle = grad;
  ctx.shadowColor = `${brand.colors.cyan}99`;
  ctx.shadowBlur = size * 0.3;
  lines.forEach((l, i) => ctx.fillText(l, 60, top + i * size * 1.08));
  const png = canvas.toBuffer('image/png');
  for (const quality of [90, 82, 74, 66]) {
    const jpg = await sharp(png).jpeg({ quality, mozjpeg: true }).toBuffer();
    if (jpg.length <= 2 * 1024 * 1024) return jpg;
  }
  return sharp(png).jpeg({ quality: 55 }).toBuffer();
}

/** Base picture of a scene for a thumbnail: its layers composed back to front. */
export async function composeScene(layerFiles: string[], out: string): Promise<string> {
  const W = 1920;
  const H = 1080;
  const parts = await Promise.all(layerFiles.map((f) => sharp(f).resize(W, H, { fit: 'cover' }).png().toBuffer()));
  const [first, ...rest] = parts;
  await sharp(first).composite(rest.map((input) => ({ input }))).png().toFile(out);
  return out;
}

export async function frameAt(video: string, seconds: number, out: string): Promise<string> {
  await run('ffmpeg', ['-y', '-v', 'error', '-ss', seconds.toFixed(2), '-i', video, '-frames:v', '1', out]);
  return out;
}

async function addOverlay(seg: string, png: string, out: string, sec: number, signal?: AbortSignal) {
  await run('ffmpeg', ['-y', '-v', 'error', '-i', seg, '-loop', '1', '-framerate', String(FPS), '-i', png,
    '-filter_complex', `[1:v]format=rgba,fade=t=in:st=0.15:d=0.35:alpha=1,fade=t=out:st=${Math.max(0.5, sec - 0.35).toFixed(2)}:d=0.3:alpha=1[o];[0:v][o]overlay=0:0:shortest=1[v]`,
    '-map', '[v]', ...encode(frames(sec)), out], signal);
}

export { coverStill };

// ---- Segments -------------------------------------------------------------------------------------------------

async function stillSegment(png: string, out: string, sec: number, format: VideoFormat, signal?: AbortSignal) {
  const { width, height } = VIDEO_SIZE[format];
  const n = frames(sec);
  const z = `min(1+${(0.06 / n).toFixed(6)}*on,1.06)`;
  await run('ffmpeg', ['-y', '-v', 'error', '-loop', '1', '-framerate', String(FPS), '-i', png,
    '-vf', `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${FPS},setsar=1`,
    ...encode(n), out], signal);
}

async function clipSegment(clip: string, out: string, sec: number, format: VideoFormat, signal?: AbortSignal) {
  const { width, height } = VIDEO_SIZE[format];
  const info = await probeDuration(clip);
  const n = frames(sec);
  const sameShape = info ? Math.abs(info.width / info.height - width / height) < 0.15 : true;
  const filter = sameShape
    ? `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${FPS},setsar=1,tpad=stop_mode=clone:stop_duration=60[v]`
    : `[0:v]fps=${FPS},split[a][b];[a]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=30:2,eq=brightness=-0.12[bg];` +
      `[b]scale=${width}:${height}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,tpad=stop_mode=clone:stop_duration=60[v]`;
  await run('ffmpeg', ['-y', '-v', 'error', '-i', clip, '-filter_complex', filter, '-map', '[v]', ...encode(n), out], signal);
}

async function coverStill(cover: string, format: VideoFormat, out: string) {
  const { width, height } = VIDEO_SIZE[format];
  const W = width * 2;
  const H = height * 2;
  const side = Math.round(Math.min(W, H) * 0.72);
  const bg = await sharp(cover).resize(W, H, { fit: 'cover' }).blur(60).modulate({ brightness: 0.55 }).toBuffer();
  const fg = await sharp(cover).resize(side, side, { fit: 'cover' }).toBuffer();
  await sharp(bg).composite([{ input: fg, gravity: 'center' }]).png().toFile(out);
}

// ---- Whole edit ----------------------------------------------------------------------------------------------

export interface RenderInputs {
  project: MaterialProject;
  brand: BrandKit;
  dir: string;
  trackFile: string | null;
  scenes: Map<string, ParallaxScene>;
  /** Local files for scene layer URLs and the cover. */
  image: (url: string) => Promise<string>;
  coverUrl: string | null;
  clipFile: (shot: Shot) => string | null;
  onStep: (step: string) => void;
  signal?: AbortSignal;
  /** DJ MuzaIK voice-over WAV per shot id (already synthesised), mixed over the music with ducking. */
  voiceFiles?: Map<string, string>;
}

export async function renderProject(inp: RenderInputs): Promise<{ files: RenderFile[]; warnings: string[] }> {
  const { project, brand, dir } = inp;
  const formats: VideoFormat[] = [project.request.format];
  if (project.request.alsoOther) formats.push(project.request.format === '16:9' ? '9:16' : '16:9');
  const tmp = path.join(dir, 'tmp');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const warnings: string[] = [];
  const files: RenderFile[] = [];
  const total = project.shots.reduce((a, s) => a + s.seconds, 0);
  // Bass curve of the music cut (Parallax Studio engine): Parallax shots kick with the real kick drum, frame-exact.
  let curve: BassCurve | null = null;
  if (inp.trackFile && project.cut && project.shots.some((sh) => sh.visual === 'parallax')) {
    inp.onStep('Krzywa basu fragmentu (silnik Parallax Studio)…');
    curve = computeBassCurve(await decodeMono(inp.trackFile, project.cut.start, total), FPS);
  }

  for (const format of formats) {
    const tag = format.replace(':', 'x');
    const segs: string[] = [];
    for (const [i, shot] of project.shots.entries()) {
      inp.onStep(`${format}: ujęcie ${i + 1} z ${project.shots.length}`);
      const out = path.join(tmp, `seg-${tag}-${String(i).padStart(2, '0')}.mp4`);
      const card = async (title: string, sub: string, muted = false) => {
        const png = path.join(tmp, `card-${tag}-${i}.png`);
        fs.writeFileSync(png, drawCard(format, brand, title, sub, muted));
        await stillSegment(png, out, shot.seconds, format, inp.signal);
      };
      if (shot.visual === 'flow') {
        const clip = inp.clipFile(shot);
        if (clip) await clipSegment(clip, out, shot.seconds, format, inp.signal);
        else {
          warnings.push(`Ujęcie ${i + 1}: brak klipu z Flow — w podglądzie jest szara plansza.`);
          await card(`Ujęcie ${i + 1}`, 'brak klipu z Flow', true);
        }
      } else if (shot.visual === 'parallax') {
        const scene = shot.sceneId ? inp.scenes.get(shot.sceneId) : undefined;
        if (!scene || !scene.layers.length) {
          warnings.push(`Ujęcie ${i + 1}: nie ma sceny Parallax — zamiast niej plansza.`);
          await card(`Ujęcie ${i + 1}`, 'brak sceny', true);
        } else {
          const layers = [];
          for (const l of [...scene.layers].sort((a, b) => a.depth - b.depth)) layers.push({ file: await inp.image(l.url), depth: l.depth });
          const { width, height } = VIDEO_SIZE[format];
          await renderParallaxShot({
            layers, accent: /^#[0-9a-f]{6}$/i.test(scene.accent) ? scene.accent : brand.colors.cyan, intensity: scene.intensity || 60,
            W: width, H: height, startFrame: Math.round(shot.at * FPS), frames: frames(shot.seconds), fps: FPS, curve, out, signal: inp.signal,
          });
        }
      } else if (shot.visual === 'okladka') {
        if (!inp.coverUrl) {
          warnings.push(`Ujęcie ${i + 1}: premiera nie ma okładki — zamiast niej plansza.`);
          await card(shot.cardText || 'MuzaIK', '', false);
        } else {
          const png = path.join(tmp, `cover-${tag}.png`);
          if (!fs.existsSync(png)) await coverStill(await inp.image(inp.coverUrl), format, png);
          await stillSegment(png, out, shot.seconds, format, inp.signal);
        }
      } else {
        const [title, ...rest] = (shot.cardText || 'MuzaIK').split('\n');
        await card(title, rest.join(' '));
      }
      if (shot.overlayText && shot.visual !== 'plansza') {
        const png = path.join(tmp, `ov-${tag}-${i}.png`);
        fs.writeFileSync(png, drawOverlay(format, brand, shot.overlayText));
        const withText = out.replace(/\.mp4$/, '-t.mp4');
        await addOverlay(out, png, withText, shot.seconds, inp.signal);
        fs.renameSync(withText, out);
      }
      segs.push(out);
    }

    inp.onStep(`${format}: łączę ujęcia`);
    const list = path.join(tmp, `list-${tag}.txt`);
    fs.writeFileSync(list, segs.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));
    const video = path.join(tmp, `video-${tag}.mp4`);
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video], inp.signal);

    const name = `${slug(project.copy.title || project.request.kind)}-${tag}.mp4`;
    const final = path.join(dir, name);
    if (inp.trackFile && project.cut) {
      const vo = project.shots.filter((sh) => inp.voiceFiles?.has(sh.id));
      inp.onStep(`${format}: muzyka${vo.length ? ' i lektor' : ''} (−14 LUFS)`);
      const fadeOut = Math.max(0, total - 1.5).toFixed(2);
      const music = `[1:a]aresample=48000,afade=t=in:st=0:d=0.05,afade=t=out:st=${fadeOut}:d=1.5`;
      const args = ['-y', '-v', 'error', '-i', video, '-ss', String(project.cut.start), '-t', total.toFixed(3), '-i', inp.trackFile];
      let graph: string;
      if (vo.length) {
        vo.forEach((sh) => args.push('-i', inp.voiceFiles!.get(sh.id)!));
        const delayed = vo.map((sh, k) => { const ms = Math.round((sh.at + 0.2) * 1000); return `[${k + 2}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms},volume=1.4[v${k}]`; });
        const voBus = vo.length > 1 ? `${vo.map((_, k) => `[v${k}]`).join('')}amix=inputs=${vo.length}:normalize=0,apad[vo]` : '[v0]apad[vo]';
        graph = [`${music}[m]`, ...delayed, voBus, '[vo]asplit=2[vk][vm]', '[m][vk]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=450[md]',
          '[md][vm]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11,apad[a]'].join(';');
      } else {
        graph = `${music},loudnorm=I=-14:TP=-1.5:LRA=11,apad[a]`;
      }
      args.push('-filter_complex', graph, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-t', total.toFixed(3), '-movflags', '+faststart', final);
      await run('ffmpeg', args, inp.signal);
    } else {
      if (!warnings.some((w) => w.startsWith('Bez muzyki'))) warnings.push('Bez muzyki — film nie ma przypisanego utworu.');
      fs.copyFileSync(video, final);
    }
    const info = await probeDuration(final);
    files.push({ format, name, seconds: info ? Math.round(info.seconds * 10) / 10 : total, bytes: fs.statSync(final).size });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return { files, warnings };
}

export function slug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'material';
}
