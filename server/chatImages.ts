import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const MAX_BYTES = 6 * 1024 * 1024;
const ID = /^[0-9a-f-]{36}$/;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export interface StoredImage {
  id: string;
  type: string;
  data: Buffer;
}

/** The real type from the file's first bytes; anything else (including SVG) is refused. */
function sniff(data: Buffer): string | null {
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data.length > 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

/** Photos attached to chat messages ("find something like this"), kept next to the app. */
export class ChatImages {
  private dir: string;

  constructor(appDir: string) {
    this.dir = path.join(appDir, 'data', 'uploads');
  }

  save(data: Buffer): StoredImage {
    if (data.length > MAX_BYTES) throw new Error('too large');
    const type = sniff(data);
    if (!type) throw new Error('not an image');
    const id = crypto.randomUUID();
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(path.join(this.dir, `${id}.${EXT[type]}`), data, { mode: 0o600 });
    return { id, type, data };
  }

  load(id: string): StoredImage | null {
    if (!ID.test(id)) return null;
    for (const [type, ext] of Object.entries(EXT)) {
      const file = path.join(this.dir, `${id}.${ext}`);
      if (fs.existsSync(file)) return { id, type, data: fs.readFileSync(file) };
    }
    return null;
  }
}
