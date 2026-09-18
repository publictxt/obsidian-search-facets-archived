// The tag under the editor cursor, for the "Search for tag under cursor"
// command: an inline `#tag` from the metadata cache, or an entry of a front
// matter `tags:` (or legacy `tag:`) key, inline `[a, b]` or as a block list.

import type { CachedMetadata } from "obsidian";
import { normalizeTag } from "./derive.ts";

export interface CursorInfo {
  line: number;
  ch: number;
  offset: number;
}

const KEY_RE = /^\s*tags?:\s*(.*?)\s*$/;
const ITEM_RE = /^\s*-\s+(.*?)\s*$/;

/** Split `a, "b c", d` into items with their column ranges. */
function splitItems(value: string, base: number): { text: string; start: number; end: number }[] {
  const items: { text: string; start: number; end: number }[] = [];
  const re = /"[^"]*"|'[^']*'|[^,\s\[\]]+/g;
  for (const m of value.matchAll(re)) {
    const text = m[0].replace(/^["']|["']$/g, "");
    if (text) items.push({ text, start: base + m.index, end: base + m.index + m[0].length });
  }
  return items;
}

function pick(items: { text: string; start: number; end: number }[], ch: number): string | null {
  const hit = items.find((i) => i.start <= ch && ch <= i.end) ?? items[0];
  return hit ? normalizeTag(hit.text) || null : null;
}

/**
 * The tag at `cursor`, or null. `getLine` reads a line of the note so the
 * front matter can be parsed around the cursor without reading the whole file.
 */
export function tagAtCursor(
  cache: CachedMetadata | null | undefined,
  cursor: CursorInfo,
  getLine: (line: number) => string,
): string | null {
  for (const t of cache?.tags ?? []) {
    const { start, end } = t.position;
    if (start.offset <= cursor.offset && cursor.offset <= end.offset) return normalizeTag(t.tag) || null;
  }

  const fm = cache?.frontmatterPosition;
  if (!fm || cursor.line < fm.start.line || cursor.line > fm.end.line) return null;

  const line = getLine(cursor.line);
  const key = KEY_RE.exec(line);
  if (key) {
    const value = key[1] ?? "";
    if (!value) return null; // the key of a block list: the cursor is not on an entry
    return pick(splitItems(value, line.indexOf(value)), cursor.ch);
  }

  const item = ITEM_RE.exec(line);
  if (!item) return null;
  // A block-list entry: walk up past sibling entries to the key that owns them.
  for (let n = cursor.line - 1; n > fm.start.line; n--) {
    const above = getLine(n);
    if (ITEM_RE.test(above)) continue;
    const owner = KEY_RE.exec(above);
    return owner && !owner[1] ? normalizeTag(item[1] ?? "") || null : null;
  }
  return null;
}
