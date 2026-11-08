import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barSeconds, chooseCut, endCardBars, fitBars, biggestRise } from '../src/beat';
import { finalizeDraft, cleanCopy, endCardText, type PlanContext } from '../server/materialPlan';
import { cardFromRow, sceneFromRow } from '../server/muzaikData';
import { audioKind } from '../server/audio';
import { getFlowModel, flowClipFor } from '../src/flow';
import type { MaterialDraft, MaterialRequest } from '../src/material';
import type { ParallaxScene } from '../src/muzaik';
import { PLACEHOLDER_PROFILE, normalizeProfile, getPreset } from '../src/profile';
import { selfCheck, voiceoverMaxChars, AI_TOOL_NAMES } from '../server/materialPlan';

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
  topic: '', notes: '', flowModel: 'veo-3.1-fast', freeOnly: false, preset: null, voiceover: false, ...over,
});
const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  request: req(), cut: chooseCut(track, 30, 'zwiastun'), track: null, scenes: [scene], premiere: null, article: null, siteUrl: 'https://muzaik.channel', profile: PLACEHOLDER_PROFILE, preset: null, ...over,
});
const draft = (shots: Partial<MaterialDraft['shots'][number]>[]): MaterialDraft => ({
  concept: 'k', hook: 'h', styleAnchor: 'Neon night, 1980s film grain.',
  shots: shots.map((s) => ({ bars: 2, role: 'build', visual: 'flow', prompt: 'A neon road at night', mode: 'text', reference: null, sceneId: null, cardText: null, camera: 'wide, slow push-in', light: 'sodium street light', transition: 'cięcie na takt', overlayText: null, voiceover: null, note: 'n', ...s })),
  thumbnail: { prompt: 'A neon road at night', overlayOptions: ['Nocna jazda', 'Gemini mówi', 'Za długi napis na miniaturę'] },
  copy: { title: 'Nocna jazda', description: 'Zapraszam.', tags: ['synthwave'], hashtags: ['synthwave'], pinnedComment: 'Która scena najlepsza?' },
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

test('profile: placeholder by default, partial import keeps valid fields, conflicts never taken over', () => {
  assert.equal(PLACEHOLDER_PROFILE.placeholder, true);
  assert.doesNotMatch(JSON.stringify(PLACEHOLDER_PROFILE), /Beti|DarkaIK|istrella/i);
  const p = normalizeProfile({ slogan: 'Nowe hasło', purpleMaxPercent: 'dużo', placeholder: false });
  assert.equal(p.slogan, 'Nowe hasło');
  assert.equal(p.purpleMaxPercent, PLACEHOLDER_PROFILE.purpleMaxPercent);
  assert.equal(p.placeholder, false);
  assert.ok(getPreset('nostalgia_nowy_wymiar'));
});

test('finalize: camera/light in the Flow prompt, purple rule, voice-over fits the shot, AI names removed', () => {
  const out = finalizeDraft(draft([{ bars: 2, voiceover: 'To jest bardzo długa kwestia lektora, która na pewno nie zmieści się w czterech sekundach ujęcia, więc program ją skróci. Drugie zdanie.' }, { bars: 4, overlayText: 'Zrobione w Suno' }]), ctx({ request: req({ voiceover: true }) }));
  const first = out.shots[0];
  assert.match(first.flowPrompt, /Camera: wide, slow push-in/);
  assert.match(first.flowPrompt, /Purple and magenta only as a small accent/);
  assert.ok(!first.voiceover || first.voiceover.length <= voiceoverMaxChars(first.seconds) + 1);
  assert.equal(out.shots[1].overlayText, null);
  assert.deepEqual(out.thumbnail.overlayOptions, ['Nocna jazda', 'Za długi napis']);
  assert.match(out.thumbnail.prompt, /No on-screen text/);
});

test('voice-over off → no lines even if the model wrote them', () => {
  const out = finalizeDraft(draft([{ bars: 4, voiceover: 'Hej, tu DJ MuzaIK.' }]), ctx());
  assert.ok(out.shots.every((s) => s.voiceover === null));
});

test('self-check: clean project passes errors; AI tool name and foreign link are caught', () => {
  const c = ctx();
  const fin = finalizeDraft(draft([{ bars: 13 }]), c);
  const project = { shots: fin.shots, copy: fin.copy, thumbnail: fin.thumbnail, cut: c.cut, request: c.request };
  const ok = selfCheck(project, c);
  assert.ok(ok.filter((x) => x.level === 'error').every((x) => x.ok), JSON.stringify(ok.filter((x) => !x.ok)));
  const bad = selfCheck({ ...project, copy: { ...project.copy, title: 'Nowy hit z Gemini', description: project.copy.description + ' https://evil.example' } }, c);
  assert.equal(bad.find((x) => x.id === 'ai')!.ok, false);
  assert.equal(bad.find((x) => x.id === 'links')!.ok, false);
  assert.ok(AI_TOOL_NAMES.test('Veo'));
});

test('copy: profile links allowed and listed in the footer; shop link only when allowed', () => {
  const fixes: string[] = [];
  const withShop = { ...PLACEHOLDER_PROFILE, descriptionLinks: ['website', 'radio', 'shop'] };
  const c = cleanCopy({ title: 'T', description: 'Zobacz https://store.vizai.art/x', tags: [], hashtags: [], pinnedComment: 'Pisz w komentarzu https://x.y' }, ctx({ profile: withShop }), fixes);
  assert.match(c.description, /store\.vizai\.art\/x/);
  assert.match(c.description, /Radio MuzaIK 24\/7: https:\/\/muzaik\.channel\/radio/);
  assert.doesNotMatch(c.pinnedComment, /https?:/);
  const c2 = cleanCopy({ title: 'T', description: 'Zobacz https://store.vizai.art/x', tags: [], hashtags: [] }, ctx(), []);
  assert.doesNotMatch(c2.description, /store\.vizai\.art/);
});

test('self-check: "24/7" is not a date, a made-up date is flagged', () => {
  const c = ctx();
  const fin = finalizeDraft(draft([{ bars: 13 }]), c);
  const base = { shots: fin.shots, copy: fin.copy, thumbnail: fin.thumbnail, cut: c.cut, request: c.request };
  assert.equal(selfCheck({ ...base, copy: { ...base.copy, description: 'Radio 24/7' } }, c).find((x) => x.id === 'dates')!.ok, true);
  assert.equal(selfCheck({ ...base, copy: { ...base.copy, description: 'Premiera 12 grudnia 2026' } }, c).find((x) => x.id === 'dates')!.ok, false);
});
