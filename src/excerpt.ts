// Pagefind-style excerpt: the words around the first matched term, with every
// matched term flagged so the card can wrap it in <mark>. Plain text in, plain
// segments out — nothing here is markup.

/** Words either side of the first match; about 30 words in all, as Pagefind shows. */
export const CONTEXT_WORDS = 15;

export interface Segment {
  text: string;
  /** True for a matched term, rendered as <mark>. */
  mark: boolean;
}

const RUN_RE = /[\p{L}\p{N}]+/gu;

function hasTerm(word: string, terms: Set<string>): boolean {
  for (const m of word.matchAll(RUN_RE)) if (terms.has(m[0].toLowerCase())) return true;
  return false;
}

/** Append text to the segment list, merging into a previous plain segment. */
function push(out: Segment[], text: string, mark: boolean): void {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && !last.mark && !mark) last.text += text;
  else out.push({ text, mark });
}

function pushWord(out: Segment[], word: string, terms: Set<string>): void {
  let last = 0;
  for (const m of word.matchAll(RUN_RE)) {
    push(out, word.slice(last, m.index), false);
    push(out, m[0], terms.has(m[0].toLowerCase()));
    last = m.index + m[0].length;
  }
  push(out, word.slice(last), false);
}

/**
 * Excerpt of `body` around the first occurrence of any of `terms` (the index
 * terms MiniSearch reports as matched). Empty when nothing in the body
 * matches, so the card can fall back to the summary.
 */
export function excerpt(body: string, terms: readonly string[], context = CONTEXT_WORDS): Segment[] {
  const words = body.split(/\s+/).filter(Boolean);
  const set = new Set(terms.map((t) => t.toLowerCase()));
  if (!words.length || !set.size) return [];
  const first = words.findIndex((w) => hasTerm(w, set));
  if (first === -1) return [];
  const start = Math.max(0, first - context);
  const end = Math.min(words.length, first + context + 1);
  const out: Segment[] = [];
  if (start > 0) push(out, "… ", false);
  words.slice(start, end).forEach((w, i) => {
    if (i) push(out, " ", false);
    pushWord(out, w, set);
  });
  if (end < words.length) push(out, " …", false);
  return out;
}
