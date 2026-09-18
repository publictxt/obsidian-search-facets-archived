# PublicTxt Search for Obsidian — v1 Plan

How `spec.md` gets built. Intent in `intent.md`; the site it mirrors in `txt-hugo/SPEC.md`.
The site repo is checked out at `C:\Users\micro\Projects\publictxt\txt-hugo` (a sibling of this
repo's parent); its `example/txt` folder is the development vault.

## Approach

Thin vertical slices, each one usable in Obsidian before the next starts. Every slice ends with
the plugin rebuilt, copied into the example vault, and tried by hand. Nothing is layered
end-to-end first; the search box, one facet and one card exist by the end of slice 2.

**Parity is a guide, not a gate.** The goal is the same sort of functionality as the site's
search page: text box, type facet, tag facet with counts, cards, filter-only browsing. The
derivation rules are borrowed from the sync step because they are sensible defaults, not because
the two must agree page for page. `parity.md` holds the site's page list and facet totals as a
reference for spot checks; a difference is noted, not necessarily fixed.

Two rules carried over from the site repo's working style:

- Flag design tensions and gaps as they surface; do not implement around them silently.
- Confirm before non-trivial departures from `spec.md`. The spec is the contract; this plan is
  the order of work.

## Prerequisites (slice 0)

Not on this machine yet, so they come first:

- **Node.js LTS.** Neither `node` nor `npm` is on PATH. Install Node 22 LTS (nvm-windows or the
  MSI). Hugo 0.166 and Git are already installed.
- **A built copy of the site** to compare against. Run `scripts/build.ps1` in txt-hugo on
  `example/txt`; `public/pagefind/` already exists from an earlier build, but rebuild so the
  parity rows compare like with like.
- **The example vault opened in Obsidian** once, so `.obsidian/plugins/` exists. Its `app.json`
  only sets link format; leave it.

Deliverable: `npm --version` and a fresh `public/search/` in txt-hugo.

**Done 2026-09-18.** Node 24.19 LTS installed with `winget install OpenJS.NodeJS.LTS --scope user`
(portable zip under `%LOCALAPPDATA%\Microsoft\WinGet\Packages`, on the user PATH; shells opened
before the install need a PATH refresh). Site rebuilt with `scripts/build.ps1`: Hugo 126 pages,
Pagefind 29 pages, 2 filters. `example/txt/.obsidian/plugins/` created. The site's indexed page
list and facet totals are recorded in `parity.md` for reference.

## Slice 1 — Scaffold and an empty view

Goal: the plugin loads, a ribbon icon opens an empty "PublicTxt Search" tab, and a deploy script
copies a build into the example vault.

- `manifest.json` (`id: publictxt-search`, `minAppVersion: 1.4.0`, `isDesktopOnly: false`),
  `package.json` with `obsidian`, `minisearch`, `esbuild`, `typescript`, `tslib`.
- Build scripts modelled on the sibling plugin at `C:\Users\micro\Projects\obsidian-tag-facets`
  (esbuild bundle, `--format=cjs --platform=node --external:obsidian`, `dev` with watch and
  inline source map, `build` minified). Its `tsconfig.json` and `.gitignore` are a good start;
  its `deploy.sh` becomes `deploy.ps1` here since the primary shell is PowerShell, taking a vault
  path and copying `main.js`, `manifest.json`, `styles.css`.
- `src/main.ts`: plugin class, `registerView`, ribbon icon, the "Open PublicTxt search" command
  that reuses one leaf (`workspace.getLeavesOfType` first, `getLeaf("tab")` otherwise, then
  `revealLeaf`).
- `src/view.ts`: `ItemView` with `getViewType`, `getDisplayText`, `getIcon`, an empty
  `.publictxt-search` container.
- `git init` and a first commit. The repo is not a Git repository today.

Check: enable the plugin in the example vault, click the ribbon icon, see the empty tab.

## Slice 2 — Page records, index and a plain search box

Goal: type a word, see a plain list of matching titles. No facets, no cards yet.

- `src/derive.ts`: the sync-step port. Pure functions over `(TFile, CachedMetadata, text,
  settings)` returning a `PageItem`, so they unit-test without Obsidian:
  - `deriveTitle` — front matter `title`, else the first H1 from `cache.headings`, else basename.
    The sync step is stricter (H1 only when almost nothing precedes it); the spec's simpler rule is
    fine here.
  - `deriveType`, `deriveSection` — top-level folder, `page` at root.
  - `deriveTags` — front matter `tags` / legacy `tag`, string or list, plus `cache.tags` when the
    setting is on; strip `#`, lowercase, dedupe in first-appearance order. Front matter tags in
    the cache come through `cache.frontmatter.tags`; `getAllTags` is not used because it merges
    both sources and hides which is which.
  - `deriveDates` — port of `dates.py` minus the Git rung: `created`/`date` front matter, else
    `date_from_path` (the two filename regexes with digit guards, then the `/YYYY/MM/DD/` path
    regex, both validated as real dates), else `stat.ctime`; `updated`/`lastmod`, else
    `stat.mtime`, clamped to ≥ `created`. Emit RFC 3339 with local offset, seconds precision,
    as `_iso()` does.
  - `deriveSummary` and `deriveBody` — strip front matter and the derived-title H1, collapse
    whitespace, first 30 words for summary; full body for the index.
  - `deriveBookmarks` — `bookmark` / `bookmarks`, string or list, keep only `http(s)` URLs.
  - `isPage` — `.md`, not under an excluded folder, not in the skip list (`README*`,
    `LICENSE*`, `CONTRIBUTING*`, `CNAME`, `.gitignore`, `*.gitkeep`).
- `src/index.ts`: `PageIndex` class owning `Map<path, PageItem>` and a MiniSearch instance
  (`fields: ["title", "body"]`, `storeFields` for everything the card needs, `boost: {title: 3}`,
  `prefix: true`, `fuzzy: 0.2`, `combineWith: "AND"`). `build()` on `onLayoutReady` after
  `metadataCache.resolved`; `search(state)` returning `PageItem[]` in the spec's order
  (relevance with a query, `updated` desc without one); `filterPredicate` for type and tags.
- Settings loaded with defaults but no settings tab yet (excluded folders, inline tags, open-in,
  batch size).
- View: an `input[type=search]` debounced 200 ms and a `<ul>` of title links that open the note.

Check: a word from a title lists that page first; a word that only appears in fenced code is
found.

Tests for `derive.ts` start here (see *Testing*), because the date and tag rules are the fiddly
part.

## Slice 3 — Cards

Goal: results look like the site's.

- `src/cards.ts`: port `txt-hugo/assets/js/cards.js` function for function (`escapeHTML`,
  `formatDate`, `dateHTML`, `bookmarkLabel`, `card`). Drop `tagURL` and the `<a>` branch of
  `tagChip`; `onTag` is always supplied. `card` builds a `<li>` via `innerHTML` exactly as the
  site does, then the view attaches behaviour: title click opens the note (`workspace.openLinkText`
  with the open-in setting, Ctrl/Cmd-click forcing a new tab), title hover triggers
  `hover-link`, bookmark chips `window.open` with `noopener`.
- `styles.css`: copy the rule blocks from `txt-hugo/assets/css/main.css` at lines 170–200
  (`.chip`, `.chip-type`, `.chip-link`, `.chip-row`), 284–310 (`.page-card*`), 446–530
  (`.search-form` through the 900 px media query) and `.muted`, prefixed with
  `.publictxt-search` and with the site's variables swapped per the spec's table. The
  `@media (max-width: 900px)` rule becomes a `.is-narrow` class toggled by a ResizeObserver on
  the view's content element.
- Excerpt: `src/excerpt.ts` taking `body` and the result's matched terms from MiniSearch, finding
  the first match, taking about 15 words each side, wrapping matches in `<mark>` and escaping
  the rest. Without a query, the card falls back to `summary` on its own.

Check: the bookmark page's card shows the ↗ chip; a card looks like the site's for the same page.

## Slice 4 — Facets, counts, status line, Show more

Goal: the full `search.js` behaviour.

- `PageIndex.totals()` recomputed on every index change: counts of every `type` and `tag`.
  Chip order is `sortedKeys(totals)` (count desc, then name) and never changes with the result set.
- `search()` also returns per-result-set counts for `type` and `tag`, computed over the whole
  filtered list before truncation.
- View: `renderFilters` builds every known chip with the current count, `.active` and `.empty`
  classes, `aria-pressed`; type is single-select toggle, tags toggle into a `Set` (AND). The
  "— all selected must match" hint appears with more than one tag selected. Status text
  `N page(s) — “q” · type · #tag`. "Clear all" resets and focuses. "Show more" appends the next
  batch of `resultsPerBatch`.
- Card tag chips call the same `toggleTag`.

Check: empty query lists everything; `wiki` alone, one tag, two intersecting tags
(`publictxt` + `commons`), and an impossible combination (`blog` + `#brain`) showing
`0 pages — blog · #brain` with every chip dimmed.

## Slice 5 — Live index, view state, settings tab, commands

Goal: everything else in the spec's *Scope*.

- Incremental updates: `metadataCache.on("changed")` → replace, `vault.on("delete")` → remove,
  `vault.on("rename")` → remove old path + add new. Each debounced 300 ms per path, then totals
  recomputed and the open view's current search re-run. Excluded folders are checked on the
  way in, so a note moved into `media/` disappears.
- `getState`/`setState` on the view for `{ q, type, tags }` so the workspace layout restores the
  search. `setState` re-runs the search once the index is built; if it is not built yet, the state
  is held and applied after `build()`.
- Settings tab: excluded folders (textarea, one per line, prefix match on path), include inline
  hashtags (toggle; changing it rebuilds the index), open results in (dropdown), results per
  batch (number). Changing excluded folders rebuilds too.
- Commands: "Search for tag under cursor" (editor command, checkCallback: cursor on `#tag` via
  `cache.tags` positions, or inside a front matter `tags` entry via `cache.frontmatterPosition`
  plus a line parse), "Search pages like this one" (current file's derived type and tags), "Clear
  search". Each opens or focuses the view, then calls `setState`.

Check: edit a tag in a note and watch the chip counts change without reloading; close and reopen
Obsidian with a search active and see it restored.

## Slice 6 — Sanity pass and release

- Open the plugin and the site's `/search/` side by side on the example vault and run through
  the spec's parity table once. Note differences in `docs/parity.md` → *Results*; fix only what
  is a bug in the plugin's own terms (wrong count, missing page, broken chip), not what is merely
  a different answer from the site.
- Timing on the example vault and on a larger real vault if one is to hand: index build, first
  render, keystroke to results. The targets are the intent's "under a second" and "instant".
- `README.md` for the plugin: what it is, install from release, settings, the divergences from
  the site in one short table.
- Tag `0.1.0`, GitHub release with `main.js`, `manifest.json`, `styles.css`. Community plugin
  submission is a later step, not part of v1.

## Testing

- `derive.ts`, `excerpt.ts` and the pure parts of `cards.ts` (`formatDate`, `dateHTML`,
  `bookmarkLabel`) get unit tests under `tests/` run with `vitest` (or `node --test` to avoid a
  dependency; decide in slice 2). Fixtures are copies of the example vault's trickier files:
  a dated filename, a `/YYYY/MM/DD/` path, a legacy `tag:` key, a bookmark list, an H1 with a
  line before it.
- Everything touching `Vault`, `MetadataCache` or the DOM is checked by hand in the example vault
  per slice. No Obsidian test harness is worth setting up for a plugin this size.
- Acceptance is the intent's "someone who knows the site's search page needs no explanation of
  the plugin's", checked by using it. The parity table is a source of spot checks, not a gate.

## Open questions and tensions to raise as they come up

Resolved by the "same functionality, not identical results" decision (2026-09-18): the title
rule follows the spec's simpler "first H1"; index-named files are pages as the spec says, even
though the site skips the root `index.md` and section indexes with an empty body (so the plugin
lists 31 pages for the example vault where the site lists 29); section index dates are not
pushed forward from descendants; the summary is the spec's first 30 words without checking it
against Hugo's.

Still open:

1. **`stat.ctime` on Windows** is creation time, but Obsidian's `FileStats.ctime` on other
   platforms may be inode change time. Accept; it only affects pages with no other date rung.
2. **MiniSearch fuzzy on short queries**: `fuzzy: 0.2` with `prefix: true` can be loose on two-
   or three-letter terms. Tune by feel in slice 4, for example by disabling fuzzy below 4
   characters.
3. **Mobile**: nothing here is desktop-only, but the ResizeObserver collapse and hover previews are
   untested on mobile. Keep `isDesktopOnly: false` unless something breaks.

## Not in this plan

Everything under `spec.md` → *Deferred to v2+*: sort and paging from `list.js`, a shared cards
package, Git dates, the `obsidian://` URI handler, aggregation.
