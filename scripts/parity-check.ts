// Derive every page of a vault folder outside Obsidian and print what the
// plugin would show: page count, per-page type and tags, facet totals and the
// spot-check rows from docs/spec.md → "Parity checks". Front matter, headings
// and inline tags come from the test helper's approximation of Obsidian's
// metadata cache, so this checks the derivation rules, not the cache itself.
//
//   node scripts/parity-check.ts <vault-dir> [--no-inline] [--quiet]

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { derivePage, isPage, type FileInfo } from "../src/derive.ts";
import { PageIndex, sortedKeys } from "../src/index.ts";
import { DEFAULT_SETTINGS } from "../src/settings.ts";
import { fakeCache } from "../tests/helpers/fake-cache.ts";

const args = process.argv.slice(2);
const root = args.find((a) => !a.startsWith("--"));
if (!root) {
  console.error("usage: node scripts/parity-check.ts <vault-dir> [--no-inline] [--quiet]");
  process.exit(2);
}
const includeInlineTags = !args.includes("--no-inline");
const quiet = args.includes("--quiet");

function* walk(dir: string, rel = ""): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) yield* walk(join(dir, entry.name), relPath);
    else yield relPath;
  }
}

const index = new PageIndex();
for (const path of walk(root)) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  const st = statSync(join(root, path));
  const file: FileInfo = {
    path,
    name,
    basename: dot > 0 ? name.slice(0, dot) : name,
    extension: dot > 0 ? name.slice(dot + 1) : "",
    stat: { ctime: st.birthtimeMs || st.mtimeMs, mtime: st.mtimeMs },
  };
  if (!isPage(file, DEFAULT_SETTINGS.excludedFolders)) continue;
  const text = readFileSync(join(root, path), "utf8");
  index.put(derivePage(file, fakeCache(text), text, { includeInlineTags }));
}
index.recomputeTotals();

const fmt = (counts: Record<string, number>) => sortedKeys(counts).map((k) => `${k} ${counts[k]}`).join(" · ");
const paths = (hits: { item: { path: string } }[]) => hits.map((h) => h.item.path);

console.log(`Pages: ${index.size}`);
if (!quiet) {
  for (const p of index.all().sort((a, b) => a.path.localeCompare(b.path))) {
    console.log(`  ${p.path}  [${p.type}]  ${p.tags.join(", ")}  ${p.created.slice(0, 10)}${p.bookmarks.length ? "  ↗" : ""}`);
  }
}
console.log(`\nType: ${fmt(index.totals.type)}`);
console.log(`Tags: ${fmt(index.totals.tag)}`);

const rows: [string, { q: string; type: string; tags: string[] }][] = [
  ["empty", { q: "", type: "", tags: [] }],
  ["type wiki", { q: "", type: "wiki", tags: [] }],
  ["#publictxt + #commons", { q: "", type: "", tags: ["publictxt", "commons"] }],
  ["#brain + #sci", { q: "", type: "", tags: ["brain", "sci"] }],
  ["blog + #brain", { q: "", type: "blog", tags: ["brain"] }],
  ["q=wiki", { q: "wiki", type: "", tags: [] }],
  ["q=echo (fenced code)", { q: "echo", type: "", tags: [] }],
  ["q=publictext type bookmarks", { q: "publictext", type: "bookmarks", tags: [] }],
  ["q=contract type page", { q: "contract", type: "page", tags: [] }],
];
console.log("\nSpot checks:");
for (const [label, state] of rows) {
  const r = index.search(state);
  console.log(`  ${label}: ${r.hits.length}${quiet ? "" : "  " + paths(r.hits).join(", ")}`);
}
