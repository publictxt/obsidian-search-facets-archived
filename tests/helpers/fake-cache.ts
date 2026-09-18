// A stand-in for Obsidian's MetadataCache for tests and the parity script:
// front matter (a YAML subset), ATX headings and inline #tags with positions,
// close enough to what `metadataCache.getFileCache()` returns for these notes.

import type { CachedMetadata, FrontMatterCache, HeadingCache, Pos, TagCache } from "obsidian";
import type { FileInfo } from "../../src/derive.ts";

function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

function scalar(s: string): unknown {
  const t = s.trim();
  if (t === "") return null;
  if (t.startsWith("[") && t.endsWith("]")) {
    const inner = t.slice(1, -1).trim();
    return inner ? inner.split(",").map(unquote) : [];
  }
  if (/^-?\d+$/.test(t)) return Number(t);
  if (t === "true") return true;
  if (t === "false") return false;
  return unquote(t);
}

/** Parse the YAML subset the example vault uses: scalars, inline lists, block lists. */
export function parseFrontMatter(block: string): FrontMatterCache {
  const fm: FrontMatterCache = {};
  const lines = block.split("\n");
  let listKey: string | null = null;
  for (const line of lines) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      (fm[listKey] as unknown[]).push(unquote(item[1]!));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, value] = kv as unknown as [string, string, string];
    if (value.trim() === "") {
      fm[key] = [];
      listKey = key;
    } else {
      fm[key] = scalar(value);
      listKey = null;
    }
  }
  return fm;
}

function pos(text: string, start: number, end: number): Pos {
  const loc = (offset: number) => {
    const before = text.slice(0, offset);
    const line = (before.match(/\n/g) ?? []).length;
    const col = offset - (before.lastIndexOf("\n") + 1);
    return { line, col, offset };
  };
  return { start: loc(start), end: loc(end) };
}

// Obsidian's tag rule: `#` then letters, digits, `_`, `-`, `/`, with at least one non-digit.
const TAG_RE = /(?<![\w#/&])#((?=[\p{L}\p{N}_\-/]*[\p{L}_\-/])[\p{L}\p{N}_\-/]+)/gu;

export function fakeCache(text: string): CachedMetadata {
  const cache: CachedMetadata = {};
  const t = text.replace(/\r\n?/g, "\n");
  let bodyStart = 0;
  const fm = /^---[ \t]*\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/.exec(t);
  if (fm) {
    cache.frontmatter = parseFrontMatter(fm[1] ?? "");
    cache.frontmatterPosition = pos(t, 0, fm[0].trimEnd().length);
    bodyStart = fm[0].length;
  }

  const headings: HeadingCache[] = [];
  const tags: TagCache[] = [];
  let inFence = false;
  let offset = bodyStart;
  for (const line of t.slice(bodyStart).split("\n")) {
    const end = offset + line.length;
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    else if (!inFence) {
      const h = /^ {0,3}(#{1,6})[ \t]+(.*?)\s*#*\s*$/.exec(line);
      if (h) headings.push({ heading: h[2]!, level: h[1]!.length, position: pos(t, offset, end) });
      else {
        const noCode = line.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));
        for (const m of noCode.matchAll(TAG_RE)) {
          const s = offset + m.index;
          tags.push({ tag: "#" + m[1]!, position: pos(t, s, s + m[0].length) });
        }
      }
    }
    offset = end + 1;
  }
  if (headings.length) cache.headings = headings;
  if (tags.length) cache.tags = tags;
  return cache;
}

/** A FileInfo for a vault-relative path with fixed stats. */
export function fileInfo(path: string, stat = { ctime: 0, mtime: 0 }): FileInfo {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return {
    path,
    name,
    basename: dot > 0 ? name.slice(0, dot) : name,
    extension: dot > 0 ? name.slice(dot + 1) : "",
    stat,
  };
}
