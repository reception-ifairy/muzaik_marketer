// Builds a SYNTHETIC muzaik.channel for local tests: a SQLite file with the tables the bridge reads, scene layer
// images, and a track file in a fake podcast cache. Names are obviously fake ("Utwór testowy …"); never real data.
// Usage: node test/e2e/mock-muzaik.mjs <dir>  → prints the env variables to start the app with.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';

const dir = path.resolve(process.argv[2] || 'mock-muzaik');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(path.join(dir, 'public/media/admin/parallax/scena-test'), { recursive: true });
fs.mkdirSync(path.join(dir, 'podcast/utwory'), { recursive: true });

const db = new DatabaseSync(path.join(dir, 'muzaik.db'));
db.exec(`
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE podcast_karty (media_id INTEGER PRIMARY KEY, dane_json TEXT NOT NULL, status TEXT NOT NULL, na_podklad INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
  CREATE TABLE parallax_sceny (id TEXT PRIMARY KEY, tytul TEXT NOT NULL, akcent TEXT NOT NULL, intensywnosc INTEGER NOT NULL, warstwy_json TEXT NOT NULL, miniatura TEXT NOT NULL, zrodlo TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, info_json TEXT NOT NULL DEFAULT '{}');
  CREATE TABLE premiery (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, hyperfollow_url TEXT, tytul TEXT, opis TEXT, historia TEXT, data_premiery TEXT, okladka TEXT, kolor TEXT, apple_url TEXT, youtube_id TEXT, widoczna INTEGER);
  CREATE TABLE artykuly (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, tytul TEXT, dzial TEXT, streszczenie TEXT, status TEXT, opublikowano TEXT);
`);
const card = (id, tytul, extra) => db.prepare('INSERT INTO podcast_karty VALUES (?, ?, ?, 0, ?)').run(id, JSON.stringify({ tytul, brzmienie: 'Syntetyczny opis brzmienia do testów.', instrumenty: ['syntezator'], tempo: 'średnie', nastroj: ['nocny'], wokal: 'brak', oCzym: 'test', fragmentStart: 20, dlugoscSek: 60, ...extra }), 'zaakceptowana', Date.now());
card(101, 'Utwór testowy A', { bpm: 120, refrenStart: 24, pomiar: { ciszaPoczatek: 0, ciszaKoniec: 0, krzywa: [] }, muzyka: { gatunek: 'Synthwave', energia: 7, styl: 'test synthwave' } });
card(102, 'Utwór testowy B (cover)', { cover: true, bpm: 100 });
card(103, 'Utwór testowy C bez tempa', { bpm: null, refrenStart: null });
const layers = [{ url: '/media/admin/parallax/scena-test/tlo.png', depth: 0.3 }, { url: '/media/admin/parallax/scena-test/przod.png', depth: 1 }];
db.prepare('INSERT INTO parallax_sceny VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('scena-test', 'Scena testowa', '#22d3ee', 60, JSON.stringify(layers), '/media/admin/parallax/scena-test/mini.png', 'test', Date.now(),
  JSON.stringify({ opis: { miejsce: 'testowe miasto nocą', nastroj: ['mrok'], paleta: ['#22d3ee', '#a855f7'] }, warstwy: [{ opis: 'niebo', prompt: 'synthetic night sky' }, { opis: 'droga', prompt: 'synthetic road' }] }));
db.prepare("INSERT INTO settings VALUES ('live_obs_parallax_layers', ?)").run(JSON.stringify(layers));
db.prepare("INSERT INTO settings VALUES ('api_youtube_channel_id', 'UCtesttesttesttesttest00')").run();
db.prepare('INSERT INTO premiery (slug, hyperfollow_url, tytul, opis, historia, data_premiery, okladka, kolor, apple_url, youtube_id, widoczna) VALUES (?,?,?,?,?,?,?,?,?,?,1)')
  .run('test', 'https://distrokid.com/hyperfollow/test/test', 'Premiera testowa', 'opis', '', '2099-01-01', '/media/admin/parallax/scena-test/mini.png', '#a855f7', '', '');
db.prepare("INSERT INTO artykuly (slug, tytul, dzial, streszczenie, status, opublikowano) VALUES ('artykul-testowy', 'Artykuł testowy', 'gatunki-i-brzmienie', 'streszczenie', 'opublikowany', '2026-11-01')").run();
db.close();

const pub = path.join(dir, 'public/media/admin/parallax/scena-test');
const svg = (w, h, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`);
await sharp(svg(1920, 1080, '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0420"/><stop offset="1" stop-color="#5b21b6"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><circle cx="960" cy="640" r="260" fill="#ec4899"/>')).png().toFile(path.join(pub, 'tlo.png'));
await sharp(svg(1920, 1080, '<polygon points="0,1080 860,640 1060,640 1920,1080" fill="#111827"/><polygon points="940,640 980,640 1060,1080 860,1080" fill="#22d3ee" opacity="0.7"/>')).png().toFile(path.join(pub, 'przod.png'));
await sharp(await sharp(path.join(pub, 'tlo.png')).composite([{ input: path.join(pub, 'przod.png') }]).png().toBuffer()).resize(480, 270).png().toFile(path.join(pub, 'mini.png'));
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=110:duration=60', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=60', '-filter_complex', '[1]volume=0.2[b];[0][b]amix=inputs=2,volume=2', '-ac', '2', path.join(dir, 'podcast/utwory/101.mp3')]);

console.log(`MUZAIK_DB_PATH=${dir}/muzaik.db MUZAIK_PUBLIC_DIR=${dir}/public MUZAIK_PODCAST_DIR=${dir}/podcast`);
