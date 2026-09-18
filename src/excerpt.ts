// Pagefind-style excerpt: the words around the first matched term, every
// matched term wrapped in <mark>, everything else escaped.

import { escapeHTML } from "./cards.ts";

/** Words either side of the first match; about 30 words in all, as Pagefind shows. */
export const CONTEXT_WORDS = 15;

const RUN_RE = /[\p{L}\p{N}]+/gu;

function markWord(word: string, terms: Set<string>): string {
  let out = "";
  let last = 0;
  for (const m of word.matchAll(RUN_RE)) {
    out += escapeHTML(word.slice(last, m.index));
    const run = m[0];
    out += terms.has(run.toLowerCase()) ? `<mark>${escapeHTML(run)}</mark>` : escapeHTML(run);
    last = m.index + run.length;
  }
  return out + escapeHTML(word.slice(last));
}

function hasTerm(word: string, terms: Set<string>): boolean {
  for (const m of word.matchAll(RUN_RE)) if (terms.has(m[0].toLowerCase())) return true;
  return false;
}

/**
 * HTML excerpt of `body` around the first occurrence of any of `terms` (the
 * index terms MiniSearch reports as matched). Empty when nothing in the body
 * matches, so the card can fall back to the summary.
 */
export function excerpt(body: string, terms: readonly string[], context = CONTEXT_WORDS): string {
  const words = body.split(/\s+/).filter(Boolean);
  const set = new Set(terms.map((t) => t.toLowerCase()));
  if (!words.length || !set.size) return "";
  const first = words.findIndex((w) => hasTerm(w, set));
  if (first === -1) return "";
  const start = Math.max(0, first - context);
  const end = Math.min(words.length, first + context + 1);
  const html = words.slice(start, end).map((w) => markWord(w, set)).join(" ");
  return (start > 0 ? "… " : "") + html + (end < words.length ? " …" : "");
}
