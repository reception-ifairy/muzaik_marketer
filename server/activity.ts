import type { ActivityKind, ActivityStep } from '../src/types';

const MAX_STEPS = 80;
const MAX_THINK = 4000;
const MAX_DETAIL = 1500;
const THROTTLE_MS = 250;

/**
 * Builds the "what the AI is doing" timeline. Every new or changed step is emitted whole
 * (same id = update), so clients just replace by id. Thinking deltas are merged into one step
 * until the next action and emitted at most every 250 ms.
 */
export class Activity {
  readonly steps: ActivityStep[] = [];
  private nextId = 1;
  private timer: NodeJS.Timeout | null = null;
  private dirty: ActivityStep | null = null;

  constructor(private emit: (step: ActivityStep) => void) {}

  private push(kind: ActivityKind, label: string, detail = ''): ActivityStep | null {
    this.flush();
    if (this.steps.length >= MAX_STEPS) return null;
    const step: ActivityStep = { id: this.nextId++, kind, label: label.slice(0, 300), detail: detail.slice(0, MAX_DETAIL) };
    this.steps.push(step);
    this.emit({ ...step });
    return step;
  }

  private set(step: ActivityStep | undefined, detail: string) {
    if (!step) return;
    step.detail = detail.slice(0, MAX_DETAIL);
    this.emit({ ...step });
  }

  private last(kind: ActivityKind): ActivityStep | undefined {
    for (let i = this.steps.length - 1; i >= 0; i--) if (this.steps[i].kind === kind) return this.steps[i];
    return undefined;
  }

  think(delta: string) {
    if (!delta) return;
    const last = this.steps[this.steps.length - 1];
    if (last?.kind !== 'think') {
      this.push('think', 'Myślenie', delta);
      return;
    }
    if (last.detail.length < MAX_THINK) last.detail = (last.detail + delta).slice(0, MAX_THINK);
    this.dirty = last;
    if (!this.timer) this.timer = setTimeout(() => this.flush(), THROTTLE_MS);
  }

  search(query: string) {
    this.push('search', query);
  }

  /** Attaches result titles to the latest search that has none yet. */
  searchResults(titles: string[]) {
    const step = [...this.steps].reverse().find((s) => s.kind === 'search' && !s.detail);
    if (step && titles.length) this.set(step, titles.slice(0, 6).map((t) => `• ${t}`).join('\n'));
  }

  fetch(url: string) {
    this.push('fetch', url);
  }

  fetched(url: string, title: string | null) {
    const step = [...this.steps].reverse().find((s) => s.kind === 'fetch' && s.label === url);
    if (step && title) this.set(step, title);
  }

  google(query: string) {
    this.push('google', query);
  }

  googleResult(text: string) {
    this.set(this.last('google'), text);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.dirty) this.emit({ ...this.dirty });
    this.dirty = null;
  }
}
