import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barSeconds, chooseCut, endCardBars, fitBars, biggestRise } from '../src/beat';
import { finalizeDraft, cleanCopy, endCardText, type PlanContext } from '../server/materialPlan';
import { cardFromRow, sceneFromRow } from '../server/muzaikData';
import { audioKind } from '../server/audio';
import { getFlowModel, flowClipFor } from '../src/flow';
import type { MaterialDraft, MaterialRequest } from '../src/material';
import type { ParallaxScene } from '../src/muzaik';

// Pure logic of the studio: the bar grid, the code checks after the model, the channel copy rules, the DB row mapping.
// Fixtures are synthetic (no real track data).

const track = { bpm: 120, chorusStart: 40, excerptStart: 30, curve: [], durationSec: 200, silenceStart: 0.5, silenceEnd: 1 };

test('bar length from BPM, no grid outside 60–200', () => {
  assert.equal(barSeconds(120), 2);
  assert.equal(barSeconds(null), null);
  assert.equal(barSeconds(300), null);
});

test('cut: whole bars, refrain at the planned share, inside the track', () => {
  const cut = chooseCut(track, 30, 'zwiastun')!;
  assert.equal(cut.bars, 15);
  assert.equal(cut.barSec, 2);
  assert.equal(cut.end - cut.start, 30);
  assert.equal(cut.dropAt, 12); // round(15 * 0.4) = 6 bars before the refrain
  assert.ok(cut.grid);
});

test('cut: refrain too early → starts at the track start, refrain stays on a bar line', () => {
  const cut = chooseCut({ ...track, chorusStart: 5 }, 30, 'zwiastun')!;
  assert.ok(cut.start >= 0.5);
  assert.equal(Math.abs(((cut.dropAt! / cut.barSec) % 1)) < 1e-9 || Math.abs((cut.dropAt! / cut.barSec) % 1 - 1) < 1e-9, true);
});

test('cut: refrain too late → cut ends before the trailing silence', () => {
  const cut = chooseCut({ ...track, chorusStart: 195 }, 30, 'short')!;
  assert.ok(cut.end <= 199 + 1e-9);
});

test('cut: no BPM → 2-second units and the reason says so', () => {
  const cut = chooseCut({ ...track, bpm: null }, 20, 'short')!;
  assert.equal(cut.grid, false);
  assert.match(cut.why, /nie ma tempa/);
});

test('cut: loudest rise used when there is no refrain', () => {
  const curve = Array.from({ length: 32 }, (_, i) => (i < 16 ? 0.2 : 0.9));
  assert.equal(biggestRise(curve, 320), 160); // loud from point 16 of 32
  const cut = chooseCut({ ...track, chorusStart: null, curve, durationSec: 320 }, 20, 'short')!;
  assert.match(cut.why, /wzrostu głośności/);
});

test('fitBars: always sums to the total, never below 1', () => {
  for (const [bars, total] of [[[2, 3, 9], 6], [[1, 1], 7], [[5], 1], [[0, -2, 3.6], 9], [[1, 1, 1, 1, 1, 1], 4]] as [number[], number][]) {
    const out = fitBars(bars, total).bars;
    assert.equal(out.reduce((a, b) => a + b, 0), total, `${bars} → ${total}`);
    assert.ok(out.every((b) => b >= 1 && Number.isInteger(b)));
  }
});

test('end card is at least 2.5 s', () => {
  assert.equal(endCardBars(2), 2);
  assert.equal(endCardBars(1.6), 2);
  assert.equal(endCardBars(3), 1);
});

const scene: ParallaxScene = { id: 'scena-1', title: 'Neon', accent: '#22d3ee', intensity: 50, layers: [{ url: '/media/a.webp', depth: 0.3, description: '', prompt: '' }], thumbnail: '', hero: '', place: '', light: '', timeOfDay: '', style: '', moods: [], palette: [], onAir: true };
const req = (over: Partial<MaterialRequest> = {}): MaterialRequest => ({
  kind: 'zwiastun', seconds: 30, format: '16:9', alsoOther: true, trackId: 1, sceneIds: ['scena-1'], premiereId: null, articleSlug: null,
  topic: '', notes: '', flowModel: 'veo-3.1-fast', freeOnly: false, ...over,
});
const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  request: req(), cut: chooseCut(track, 30, 'zwiastun'), track: null, scenes: [scene], premiere: null, article: null, siteUrl: 'https://muzaik.channel', ...over,
});
const draft = (shots: Partial<MaterialDraft['shots'][number]>[]): MaterialDraft => ({
  concept: 'k', hook: 'h', styleAnchor: 'Neon night, 1980s film grain.',
  shots: shots.map((s) => ({ bars: 2, role: 'build', visual: 'flow', prompt: 'A neon road at night', mode: 'text', reference: null, sceneId: null, cardText: null, note: 'n', ...s })),
  copy: { title: 'Nocna jazda', description: 'Zapraszam.', tags: ['synthwave'], hashtags: ['synthwave'] },
});

test('finalize: shots fill the cut exactly, the last one is the code-written end card', () => {
  const out = finalizeDraft(draft([{ bars: 4 }, { bars: 4, visual: 'parallax', sceneId: 'scena-1' }, { bars: 20 }, { bars: 2, visual: 'plansza', role: 'outro', cardText: 'Koniec' }]), ctx());
  const total = out.shots.reduce((a, s) => a + s.seconds, 0);
  assert.equal(total, 30);
  const last = out.shots[out.shots.length - 1];
  assert.ok(last.fixed);
  assert.match(last.cardText!, /muzaik\.channel/);
  assert.ok(out.fixes.some((f) => f.includes('Plansza końcowa modelu')));
});

test('finalize: a Flow shot longer than the longest clip is split; every clip length exists in the model', () => {
  const out = finalizeDraft(draft([{ bars: 13 }]), ctx());
  const model = getFlowModel('veo-3.1-fast');
  for (const s of out.shots.filter((x) => x.visual === 'flow')) {
    assert.ok(s.seconds <= 8 + 1e-9);
    assert.ok(model.seconds.includes(s.flowSeconds!));
    assert.equal(s.flowSeconds, flowClipFor(model, s.seconds, s.mode));
    assert.ok(s.flowPrompt.includes('No on-screen text'));
    assert.ok(s.flowPrompt.includes('Neon night'));
  }
  assert.ok(out.fixes.some((f) => f.includes('podzielone')));
});

test('finalize: free-only turns Flow shots into the scene; unknown scene and missing cover are fixed', () => {
  const free = finalizeDraft(draft([{ bars: 6 }, { bars: 7, visual: 'parallax', sceneId: 'nie-ma' }, { bars: 7, visual: 'okladka' }]), ctx({ request: req({ freeOnly: true }) }));
  assert.ok(free.shots.every((s) => s.visual !== 'flow' && s.visual !== 'okladka'));
  assert.ok(free.shots.filter((s) => s.visual === 'parallax').every((s) => s.sceneId === 'scena-1'));
});

test('finalize: image modes without an image fall back to text; Ingredients only where the model has them', () => {
  const out = finalizeDraft(draft([{ bars: 4, mode: 'frames', reference: null }, { bars: 4, mode: 'ingredients', reference: 'warstwa 1' }]), ctx({ request: req({ flowModel: 'veo-3.1-quality' }) }));
  assert.equal(out.shots[0].mode, 'text');
  assert.notEqual(out.shots[1].mode, 'ingredients');
});

test('copy: legacy names, e-mails, foreign links, bare MuzaIK in the title, hashtags and footer', () => {
  const fixes: string[] = [];
  const c = cleanCopy({ title: 'MuzaIK – Nocna jazda (DarkaIK)', description: 'Stworzyłam to z Istrella. Pisz: a@b.pl https://evil.example/x https://muzaik.channel/radio #tag', tags: ['MuzaIK', 'synthwave', 'synthwave'], hashtags: ['synthwave', '#MuzaIK', 'retro', 'a', 'b', 'c'] }, ctx({ request: req({ format: '9:16' }) }), fixes);
  assert.doesNotMatch(c.title + c.description, /DarkaIK|Istrella/i);
  assert.ok(c.title.startsWith('Nocna jazda'));
  assert.doesNotMatch(c.description, /a@b\.pl|evil\.example/);
  assert.match(c.description, /https:\/\/muzaik\.channel\/radio/);
  assert.match(c.description, /🌐 https:\/\/muzaik\.channel/);
  assert.deepEqual(c.tags, ['synthwave']);
  assert.equal(c.hashtags[0], '#MuzaIK');
  assert.equal(c.hashtags[1], '#shorts');
  assert.ok(c.hashtags.length <= 5);
});

test('end card text per kind', () => {
  assert.match(endCardText(ctx({ request: req({ kind: 'radio' }) })), /24\/7/);
  assert.match(endCardText(ctx({ request: req({ kind: 'premiera' }), premiere: { id: 1, slug: 's', title: 'Tytuł', date: '2026-11-14', description: '', story: '', cover: '', color: '', hyperfollowUrl: '', appleUrl: '', youtubeId: '', visible: true } })), /14 listopada 2026/);
});

test('muzaik.db rows: card fields, legacy names replaced, scene layers with prompts', () => {
  const card = cardFromRow({ media_id: 7, status: 'zaakceptowana', dane_json: JSON.stringify({ tytul: 'Test od DarkaIK', cover: false, bpm: 124, refrenStart: 48.5, nastroj: ['nocny'], pomiar: { ciszaPoczatek: 0.2, krzywa: [0.1, 0.5] }, muzyka: { camelot: '8A', energia: 7 }, youtube: { videoId: 'abcdefghijk', tytul: 'x', wyswietlenia: 10, publiczny: true } }) })!;
  assert.equal(card.title, 'Test od MuzaIK');
  assert.equal(card.bpm, 124);
  assert.equal(card.chorusStart, 48.5);
  assert.equal(card.camelot, '8A');
  assert.equal(card.youtube?.public, true);
  assert.equal(cardFromRow({ media_id: 1, status: 'x', dane_json: '{bad' }), null);
  const sc = sceneFromRow({ id: 'a', tytul: 'Scena', akcent: '#fff', intensywnosc: 70, warstwy_json: JSON.stringify([{ url: '/media/x.webp', depth: 1 }]), miniatura: '/m.webp', info_json: JSON.stringify({ opis: { nastroj: ['mrok'], paleta: ['#112233', 'zly'] }, warstwy: [{ opis: 'droga', prompt: 'a road' }] }) }, 'a')!;
  assert.equal(sc.layers[0].prompt, 'a road');
  assert.deepEqual(sc.palette, ['#112233']);
  assert.equal(sc.onAir, true);
});

test('audio magic bytes', () => {
  assert.equal(audioKind(Buffer.from('ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000')), 'mp3');
  assert.equal(audioKind(Buffer.from('RIFF\u0000\u0000\u0000\u0000WAVEfmt ')), 'wav');
  assert.equal(audioKind(Buffer.from('<html><body>nope</body></html>')), null);
});
