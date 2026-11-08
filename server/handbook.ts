import fs from 'fs';
import path from 'path';
import express from 'express';

// Handbook and technical docs in the app (2026-11-06, copied from muzaik's /admin/handbook + /admin/docs): the content
// lives in documentation/ (spis.json + handbook/*.md + docs/*.md) and is read from disk on every request, so fixing a
// page needs no build or restart. Two sets, two readers: handbook = the owner (plain Polish, steps), docs = whoever
// maintains the code. `npm run test:handbook` keeps the index, files and links consistent.

export type HandbookSet = 'handbook' | 'docs';

interface SpisJson {
  stanNa: string;
  handbook: { czesc: string; strony: { slug: string; tytul: string; opis: string; panel?: string | null }[] }[];
  docs: { plik: string; tytul: string; opis: string }[];
}

export interface HandbookEntry {
  set: HandbookSet;
  slug: string;
  title: string;
  description: string;
  /** Handbook part („Na start”…) or „Dokumentacja techniczna”. */
  part: string;
  /** App view the page is about (`#studio`), handbook only. */
  view: string | null;
  file: string;
}

export interface HandbookIndex {
  updated: string;
  handbook: HandbookEntry[];
  docs: HandbookEntry[];
}

export interface HandbookPage extends HandbookEntry {
  markdown: string;
  prev: Pick<HandbookEntry, 'set' | 'slug' | 'title'> | null;
  next: Pick<HandbookEntry, 'set' | 'slug' | 'title'> | null;
}

/** `05-kampanie.md` → `kampanie`, `CHANGELOG.md` → `changelog`. */
export const docsSlug = (file: string) => file.replace(/\.md$/i, '').replace(/^\d+-/, '').toLowerCase();

export class Handbook {
  private dir: string;
  constructor(appDir: string) {
    this.dir = path.join(appDir, 'documentation');
  }

  index(): HandbookIndex {
    const spis = JSON.parse(fs.readFileSync(path.join(this.dir, 'spis.json'), 'utf8')) as SpisJson;
    return {
      updated: spis.stanNa,
      handbook: spis.handbook.flatMap((c) =>
        c.strony.map((s) => ({ set: 'handbook' as const, slug: s.slug, title: s.tytul, description: s.opis, part: c.czesc, view: s.panel ?? null, file: `${s.slug}.md` })),
      ),
      docs: spis.docs.map((d) => ({ set: 'docs' as const, slug: docsSlug(d.plik), title: d.tytul, description: d.opis, part: 'Dokumentacja techniczna', view: null, file: d.plik })),
    };
  }

  private read(set: HandbookSet, file: string): string | null {
    // Names come from spis.json, but never leave the folder anyway.
    try {
      return fs.readFileSync(path.join(this.dir, set, path.basename(file)), 'utf8');
    } catch {
      return null;
    }
  }

  page(set: HandbookSet, slug: string): HandbookPage | null {
    const list = this.index()[set];
    const i = list.findIndex((e) => e.slug === slug);
    if (i < 0) return null;
    const md = this.read(set, list[i].file);
    if (md === null) return null;
    const pick = (e: HandbookEntry | undefined) => (e ? { set: e.set, slug: e.slug, title: e.title } : null);
    return { ...list[i], markdown: md.replace(/^﻿?#\s+[^\n]*\n+/, ''), prev: pick(list[i - 1]), next: pick(list[i + 1]) };
  }

  /** Plain full-text search over both sets: title and description first, then body matches with a snippet. */
  search(query: string): { entry: HandbookEntry; snippet: string }[] {
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1).slice(0, 6);
    if (!words.length) return [];
    const index = this.index();
    const out: { entry: HandbookEntry; snippet: string; score: number }[] = [];
    for (const entry of [...index.handbook, ...index.docs]) {
      const body = this.read(entry.set, entry.file) ?? '';
      const head = `${entry.title} ${entry.description}`.toLowerCase();
      const low = body.toLowerCase();
      if (!words.every((w) => head.includes(w) || low.includes(w))) continue;
      const at = low.indexOf(words[0]);
      const snippet = at < 0 ? entry.description : body.slice(Math.max(0, at - 60), at + 120).replace(/\s+/g, ' ').replace(/[#*>`|]/g, '').trim();
      out.push({ entry, snippet, score: words.filter((w) => head.includes(w)).length * 10 + (entry.set === 'handbook' ? 1 : 0) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 20).map(({ entry, snippet }) => ({ entry, snippet }));
  }
}

export function createHandbookRouter(handbook: Handbook): express.Router {
  const router = express.Router();
  router.get('/', (_req, res) => {
    try {
      res.json(handbook.index());
    } catch {
      res.status(500).json({ error: 'Nie udało się wczytać spisu handbooka (documentation/spis.json).' });
    }
  });
  router.get('/search', (req, res) => {
    res.json(handbook.search(String(req.query.q ?? '').slice(0, 120)));
  });
  router.get('/:set/:slug', (req, res) => {
    const set = req.params.set === 'docs' ? 'docs' : req.params.set === 'handbook' ? 'handbook' : null;
    const page = set && /^[a-z0-9-]{1,80}$/.test(req.params.slug) ? handbook.page(set, req.params.slug) : null;
    if (!page) return res.status(404).json({ error: 'Nie ma takiej strony.' });
    res.json(page);
  });
  return router;
}
