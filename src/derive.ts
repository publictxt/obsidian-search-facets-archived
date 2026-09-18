// The sync-step port: how a vault file becomes the page record the cards render
// and the index searches. Pure functions over the file's path, stats, cached
// metadata and text, so they run (and are tested) without Obsidian.
//
// Rules follow docs/spec.md → "Page record"; the site's own versions live in
// txt-hugo/scripts/sync_content.py and dates.py.

import type { CachedMetadata, FrontMatterCache } from "obsidian";

/** The item shape of the site's index.json, plus `path` and `body` for the plugin. */
export interface PageItem {
  path: string;
  url: string;
  title: string;
  type: string;
  section: string;
  tags: string[];
  created: string;
  updated: string;
  summary: string;
  bookmarks: string[];
  body: string;
}

/** The parts of a TFile the rules read. */
export interface FileInfo {
  path: string;
  name: string;
  basename: string;
  extension: string;
  stat: { ctime: number; mtime: number };
}

export interface DeriveOptions {
  includeInlineTags: boolean;
}

export const SUMMARY_WORDS = 30;

// ---- which files are pages -----------------------------------------------

// The sync step's skip list: repo housekeeping files are never pages.
const SKIP_NAME_RE = /^(?:README|LICENSE|CONTRIBUTING|CNAME(?:\.|$)|\.gitignore(?:\.|$))|\.gitkeep$/;

/** Trim an excluded-folder setting to a clean vault-relative folder path. */
export function normalizeFolder(raw: string): string {
  return raw
    .trim()
    .replace(/\\/g, "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/^\/+|\/+$/g, "");
}

/** True when `path` is, or is inside, one of the excluded folders. */
export function isExcluded(path: string, excludedFolders: string[]): boolean {
  for (const raw of excludedFolders) {
    const folder = normalizeFolder(raw);
    if (!folder) continue;
    if (path === folder || path.startsWith(folder + "/")) return true;
  }
  return false;
}

/** Whether a file counts as a page: Markdown, not housekeeping, not excluded. */
export function isPage(
  file: Pick<FileInfo, "path" | "name" | "extension">,
  excludedFolders: string[],
): boolean {
  if (file.extension.toLowerCase() !== "md") return false;
  if (SKIP_NAME_RE.test(file.name)) return false;
  return !isExcluded(file.path, excludedFolders);
}

// ---- text helpers ---------------------------------------------------------

const FRONT_MATTER_RE = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

/** Split a note into its raw front matter block (without fences) and the body. */
export function splitFrontMatter(text: string): { frontMatter: string | null; body: string } {
  const m = FRONT_MATTER_RE.exec(text);
  if (!m) return { frontMatter: null, body: text };
  return { frontMatter: m[1] ?? "", body: text.slice(m[0].length) };
}

/** Remove the first ATX level-1 heading line. */
export function removeFirstH1(body: string): string {
  return body.replace(/^[ \t]{0,3}#[ \t]+[^\n]*\r?\n?/m, "");
}

/**
 * Markdown to plain text: fence lines, link syntax, emphasis and structural
 * markers dropped; the words kept. Fenced code content stays, as Pagefind
 * indexes it too.
 */
export function plainText(md: string): string {
  let s = md.replace(/\r\n?/g, "\n");
  // Fenced code: keep the content, drop the fence lines.
  s = s.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^[ \t]*\1[ \t]*$/gm, "$2");
  s = s.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*$/gm, "");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<[A-Za-z/][^>\n]*>/g, " "); // HTML tags and autolinks
  s = s.replace(/!?\[\[([^\]]*?)\]\]/g, (_, t: string) => t.split("|").pop() ?? ""); // wikilinks, embeds
  s = s.replace(/!\[([^\]]*)\]\([^)\n]*\)/g, "$1"); // images
  s = s.replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, "$1"); // links
  s = s.replace(/\[([^\]\n]*)\]\[[^\]\n]*\]/g, "$1"); // reference links
  s = s.replace(/`([^`\n]*)`/g, "$1"); // inline code
  s = s.replace(/^[ \t]*#{1,6}[ \t]+/gm, ""); // heading markers
  s = s.replace(/^[ \t]*>[ \t]?/gm, ""); // blockquotes
  s = s.replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, ""); // list items, tasks
  s = s.replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,}|={3,})[ \t]*$/gm, ""); // rules, setext underlines
  s = s.replace(/^[ \t]*\|?(?:[ \t]*:?-{2,}:?[ \t]*\|)+[ \t]*:?-*:?[ \t]*\|?[ \t]*$/gm, ""); // table separators
  s = s.replace(/\*{1,3}|~~|(?<!\w)_{1,3}(?=\w)|(?<=\w)_{1,3}(?!\w)/g, ""); // emphasis
  s = s.replace(/\|/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** The first `n` words of a plain-text string. */
export function firstWords(text: string, n = SUMMARY_WORDS): string {
  return text.split(" ").filter(Boolean).slice(0, n).join(" ");
}

// ---- front matter values ----------------------------------------------------

function fmString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** A front matter value as a list of strings: `a, b` / `a b` strings and lists both accepted. */
function fmList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.flatMap((x) => (typeof x === "string" || typeof x === "number" ? [String(x)] : []));
  }
  if (typeof v === "string") return v.split(/[,\s]+/);
  if (typeof v === "number") return [String(v)];
  return [];
}

// ---- title, type, section, tags, bookmarks ----------------------------------

export function deriveTitle(
  fm: FrontMatterCache | null | undefined,
  cache: CachedMetadata | null | undefined,
  basename: string,
): { title: string; fromH1: boolean } {
  const explicit = fmString(fm?.title);
  if (explicit) return { title: explicit, fromH1: false };
  const h1 = cache?.headings?.find((h) => h.level === 1);
  if (h1 && h1.heading.trim()) return { title: h1.heading.trim(), fromH1: true };
  return { title: basename, fromH1: false };
}

export function topFolder(path: string): string {
  const i = path.indexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function deriveSection(path: string): string {
  return topFolder(path);
}

export function deriveType(fm: FrontMatterCache | null | undefined, path: string): string {
  return fmString(fm?.type) ?? (topFolder(path) || "page");
}

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, "").toLowerCase();
}

/**
 * Front matter `tags` / legacy `tag`, then inline `#hashtags` when asked for;
 * deduped in first-appearance order.
 */
export function deriveTags(
  fm: FrontMatterCache | null | undefined,
  cache: CachedMetadata | null | undefined,
  includeInlineTags: boolean,
): string[] {
  const raw = [...fmList(fm?.tags), ...fmList(fm?.tag)];
  if (includeInlineTags) for (const t of cache?.tags ?? []) raw.push(t.tag);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const t = normalizeTag(r);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

const URL_RE = /^https?:\/\/\S+$/i;

export function deriveBookmarks(fm: FrontMatterCache | null | undefined): string[] {
  const raw = [...fmList(fm?.bookmark), ...fmList(fm?.bookmarks)];
  const out: string[] = [];
  for (const r of raw) {
    const u = r.trim();
    if (URL_RE.test(u) && !out.includes(u)) out.push(u);
  }
  return out;
}

// ---- dates (port of dates.py minus the Git rung) ----------------------------

// A date in a file name: `20241013-title`, `title . 20240816`, `2024-10-13-title`.
// The digit guards stop longer runs of digits (IDs, ISBNs) from matching.
const NAME_DATE_RES = [/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/, /(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/];
// A date in the path: `blog/2023/12/17/post.md`.
const PATH_DATE_RE = /(?:^|\/)(\d{4})\/(\d{2})\/(\d{2})\//;

function validDate(y: string, m: string, d: string): string | null {
  const yy = Number(y);
  const mm = Number(m);
  const dd = Number(d);
  const dt = new Date(yy, mm - 1, dd);
  if (dt.getFullYear() !== yy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return null; // e.g. 20240000
  return `${y}-${m}-${d}`;
}

/** `YYYY-MM-DD` from the file's name or the folders above it, else null. */
export function dateFromPath(path: string): string | null {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  for (const re of NAME_DATE_RES) {
    const m = re.exec(stem);
    if (m) {
      const iso = validDate(m[1]!, m[2]!, m[3]!);
      if (iso) return iso;
    }
  }
  const m = PATH_DATE_RE.exec(path);
  return m ? validDate(m[1]!, m[2]!, m[3]!) : null;
}

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, "0");

/** RFC 3339 with the local offset at seconds precision, as dates.py's `_iso()` emits. */
export function toLocalISO(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.trunc(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
  );
}

/** Local midnight of a `YYYY-MM-DD` date, RFC 3339. */
export function dateOnlyToISO(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return toLocalISO(new Date(y, m - 1, d));
}

/**
 * An authored date value as the string cards and sorting will read. A date-only
 * value means local midnight (as the site's `sort_key` treats it); anything
 * else is passed through untouched, parseable or not — an odd `created:` is
 * the author's to fix, not the plugin's to hide.
 */
export function normalizeDate(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : toLocalISO(v);
  const s = fmString(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-") as [string, string, string];
    return validDate(y, m, d) ? dateOnlyToISO(s) : s;
  }
  return s;
}

/** Sort key for any date string; unparseable values sort last. */
export function parseTime(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

export function deriveDates(
  fm: FrontMatterCache | null | undefined,
  path: string,
  stat: { ctime: number; mtime: number },
): { created: string; updated: string } {
  let created = normalizeDate(fm?.created) ?? normalizeDate(fm?.date);
  if (!created) {
    const fromPath = dateFromPath(path);
    created = fromPath ? dateOnlyToISO(fromPath) : toLocalISO(new Date(stat.ctime));
  }
  let updated =
    normalizeDate(fm?.updated) ?? normalizeDate(fm?.lastmod) ?? toLocalISO(new Date(stat.mtime));
  const c = Date.parse(created);
  const u = Date.parse(updated);
  if (!Number.isNaN(c) && !Number.isNaN(u) && u < c) updated = created; // never earlier than created
  return { created, updated };
}

// ---- the whole record ---------------------------------------------------------

export function derivePage(
  file: FileInfo,
  cache: CachedMetadata | null | undefined,
  text: string,
  opts: DeriveOptions,
): PageItem {
  const fm = cache?.frontmatter;
  const { title, fromH1 } = deriveTitle(fm, cache, file.basename);
  let { body } = splitFrontMatter(text);
  if (fromH1) body = removeFirstH1(body);
  const plain = plainText(body);
  const { created, updated } = deriveDates(fm, file.path, file.stat);
  return {
    path: file.path,
    url: file.path,
    title,
    type: deriveType(fm, file.path),
    section: deriveSection(file.path),
    tags: deriveTags(fm, cache, opts.includeInlineTags),
    created,
    updated,
    summary: firstWords(plain),
    bookmarks: deriveBookmarks(fm),
    body: plain,
  };
}
