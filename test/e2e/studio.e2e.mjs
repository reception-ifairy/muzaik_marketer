// Browser walk-through of the studio on synthetic data (run mock-muzaik.mjs + mock-claude.mjs and the app first).
// Usage: node test/e2e/studio.e2e.mjs <baseUrl> <login> <password> <outDir>
// Checks: no page scroll / no horizontal overflow at 1480×800, brief → design → clip upload → render → video, phone 390×844.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
// Playwright is preinstalled globally in cloud sessions (require works from any directory), not a project dependency.
const { chromium } = createRequire(import.meta.url)('playwright');

const [base, login, password, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const clip = path.join(out, 'clip.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=4', '-pix_fmt', 'yuv420p', clip]);

const fail = (m) => { console.error('FAIL', m); process.exitCode = 1; };
const noScroll = async (page, label) => {
  const m = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  if (m.sh > m.ch + 1 || m.sw > m.cw + 1) fail(`${label}: page overflows ${JSON.stringify(m)}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1480, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(base);
await page.getByLabel('Login', { exact: true }).fill(login);
await page.getByLabel('Hasło', { exact: true }).fill(password);
await page.keyboard.press('Enter');
await page.getByText('Twoje materiały').waitFor();
errors.length = 0; // the 401 of /api/auth/me before login is expected
await page.screenshot({ path: path.join(out, '1-centrum.png') });
await noScroll(page, 'centrum');

await page.getByRole('button', { name: /^Zwiastun kanału 16:9/ }).click();
await page.getByLabel('Utwór').selectOption('101');
await page.getByText(/plik z pamięci podcastów|plik utworu jest w aplikacji/).waitFor();
await page.screenshot({ path: path.join(out, '2-brief.png') });
await noScroll(page, 'brief');

await page.getByRole('button', { name: /Zaprojektuj/ }).click();
await page.getByText('Opis na YouTube').waitFor({ timeout: 60000 });
await page.screenshot({ path: path.join(out, '3-projekt.png') });
await noScroll(page, 'projekt');

const input = page.locator('input[type=file][accept^="video"]').first();
await input.setInputFiles(clip);
await page.getByText(/klipy Flow: 1\/2/).waitFor({ timeout: 30000 });
await page.getByRole('button', { name: /Zmontuj podgląd/ }).click();
await page.locator('video').first().waitFor({ timeout: 240000 });
await page.screenshot({ path: path.join(out, '4-montaz.png') });
await noScroll(page, 'montaż');

await page.locator('[aria-label^="Ujęcie 1,"]').click();
await page.getByText('Prompt do Flow (angielski)').waitFor();
await page.screenshot({ path: path.join(out, '5-ujecie.png') });
await page.keyboard.press('Escape');

for (const [w, h] of [[1280, 720], [1480, 924]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(300);
  await noScroll(page, `projekt ${w}×${h}`);
}
await page.screenshot({ path: path.join(out, '5b-projekt-1480x924.png') });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
const sw = await page.evaluate(() => document.documentElement.scrollWidth);
if (sw > 391) fail(`phone: horizontal overflow ${sw}`);
await page.screenshot({ path: path.join(out, '6-telefon.png'), fullPage: true });
await page.getByRole('button', { name: /Nowy materiał/ }).click();
await page.waitForTimeout(300);
if ((await page.evaluate(() => document.documentElement.scrollWidth)) > 391) fail('phone brief: horizontal overflow');
await page.screenshot({ path: path.join(out, '7-telefon-brief.png') });
await page.setViewportSize({ width: 1280, height: 720 });
await page.waitForTimeout(300);
await noScroll(page, 'brief 1280×720');
await page.screenshot({ path: path.join(out, '8-brief-1280x720.png') });

if (errors.length) fail(`console errors: ${errors.join(' | ')}`);
await browser.close();
console.log(process.exitCode ? 'E2E: problems above' : 'E2E: OK');
