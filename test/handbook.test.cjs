'use strict';
/**
 * Handbook i dokumentacja (2026-11-06, wzór: muzaik test/handbook/spis.test.cjs): spis ↔ pliki, tytuły, slugi, linki
 * wewnętrzne, sekrety, tabele. ŹRÓDŁA: documentation/spis.json, documentation/{handbook,docs}/*.md.
 * Uruchomienie: npm run test:handbook
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'documentation');
const spis = JSON.parse(fs.readFileSync(path.join(DIR, 'spis.json'), 'utf8'));
const docsSlug = (file) => file.replace(/\.md$/i, '').replace(/^\d+-/, '').toLowerCase();
const VIEWS = ['#pulpit', '#studio', '#rozmowa', '#badanie', '#styl', '#handbook'];

const pages = spis.handbook.flatMap((c) => c.strony);
const files = [
  ...pages.map((s) => ({ set: 'handbook', file: `${s.slug}.md`, slug: s.slug, title: s.tytul })),
  ...spis.docs.map((d) => ({ set: 'docs', file: d.plik, slug: docsSlug(d.plik), title: d.tytul })),
].map((x) => ({ ...x, md: fs.readFileSync(path.join(DIR, x.set, x.file), 'utf8') }));

test('spis i pliki zgadzają się w obie strony; tytuły jak # w plikach', () => {
  for (const set of ['handbook', 'docs']) {
    const onDisk = fs.readdirSync(path.join(DIR, set)).filter((f) => f.endsWith('.md')).sort();
    const inIndex = files.filter((f) => f.set === set).map((f) => f.file).sort();
    assert.deepStrictEqual(onDisk, inIndex, `${set}: pliki bez wpisu w spis.json albo wpisy bez pliku`);
  }
  for (const f of files) {
    const h1 = /^#\s+(.+)$/m.exec(f.md)?.[1]?.trim();
    assert.strictEqual(h1, f.title, `${f.set}/${f.file}: tytuł w spis.json ≠ # w pliku`);
  }
});

test('slugi unikalne i bez polskich znaków; opis ≤ 120 znaków; widok strony istnieje', () => {
  for (const set of ['handbook', 'docs']) {
    const slugs = files.filter((f) => f.set === set).map((f) => f.slug);
    assert.strictEqual(new Set(slugs).size, slugs.length, `${set}: powtórzony slug`);
    for (const s of slugs) assert.match(s, /^[a-z0-9-]+$/, `${set}: slug ${s}`);
  }
  for (const x of [...pages, ...spis.docs]) assert.ok(x.opis.length <= 120, `${x.tytul}: opis ma ${x.opis.length} znaków`);
  for (const p of pages) assert.ok(p.panel === null || VIEWS.includes(p.panel), `${p.slug}: nieznany widok ${p.panel}`);
});

test('linki #handbook/…, #docs/… i do widoków prowadzą do istniejących stron', () => {
  const known = { handbook: new Set(pages.map((p) => p.slug)), docs: new Set(spis.docs.map((d) => docsSlug(d.plik))) };
  const bad = [];
  for (const f of files) {
    for (const m of f.md.matchAll(/\]\((#[^)\s]*)\)/g)) {
      const link = m[1];
      const sub = /^#(handbook|docs)\/([a-z0-9-]+)$/.exec(link);
      if (sub) {
        if (!known[sub[1]].has(sub[2])) bad.push(`${f.set}/${f.file} → ${link}`);
      } else if (!VIEWS.includes(link)) bad.push(`${f.set}/${f.file} → ${link} (nieznany adres)`);
    }
    for (const m of f.md.matchAll(/\]\((\/(?:admin|handbook|docs)\/[^)]*)\)/g)) bad.push(`${f.set}/${f.file} → ${m[1]} (adres w stylu muzaika — użyj #handbook/… albo #docs/…)`);
  }
  assert.deepStrictEqual(bad, []);
});

test('bez haseł, kluczy, tokenów, adresów e-mail i numerów telefonów', () => {
  const PATTERNS = [
    /AIza[0-9A-Za-z_-]{20,}/,
    /sk-(ant-)?[A-Za-z0-9_-]{16,}/,
    /gh[pousr]_[A-Za-z0-9]{20,}/,
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/,
    /\+44\s?\d{4}\s?\d{6}/,
    /(OWNER_PASSWORD|SESSION_SECRET|SETTINGS_SECRET|PIN_GATEWAY_KEY)\s*=\s*\S+/,
  ];
  for (const f of files) for (const p of PATTERNS) assert.ok(!p.test(f.md), `${f.set}/${f.file}: ${p}`);
});

test('tabele GFM: każdy wiersz ma tyle komórek, co nagłówek', () => {
  const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').replace(/`[^`]*`/g, 'code').split(/(?<!\\)\|/).length;
  const bad = [];
  for (const f of files) {
    let inCode = false;
    let width = null;
    f.md.split('\n').forEach((line, i) => {
      if (/^\s*```/.test(line)) inCode = !inCode;
      if (inCode) return;
      if (/^\s*\|/.test(line)) {
        const n = cells(line);
        if (width === null) width = n;
        else if (n !== width) bad.push(`${f.set}/${f.file}:${i + 1} ma ${n} komórek zamiast ${width}`);
      } else width = null;
    });
  }
  assert.deepStrictEqual(bad, []);
});
