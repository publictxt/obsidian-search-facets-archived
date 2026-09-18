# PublicTxt Search for Obsidian — v1 Spec

An Obsidian plugin reproducing PublicTxt-Hugo's search page (`txt-hugo/layouts/search.html` + `assets/js/search.js` + `assets/js/cards.js`) as a workspace view. Intent in `intent.md`; the site it mirrors in `txt-hugo/SPEC.md`. Paths written `txt-hugo/…` are in the site repo: https://github.com/publictxt/txt-hugo

## Architecture principle

**Same data model, same rules, same UI — different engine.**

The site's search is Pagefind over rendered HTML, with `type` and `tag` filters emitted by templates and `created`/`updated` as Pagefind metadata. The plugin has no build step and no rendered HTML, so it builds the same page records directly from Obsidian's `Vault` + `MetadataCache` and runs full-text search in-process. Everything the user sees — facets, counts, status line, cards — is specified by the site and copied here; only the index behind it differs.

The plugin **never writes to the vault**.

## Scope (v1)

- One view type, `publictxt-search`, opened as a tab in the main area (also allowed in a side pane; the layout collapses)
- Full-text search **plus** faceted filtering, with or without a search term
- Facets: `type` (single-select) and `tag` (multi-select, AND), with counts within the current result set
- Results as page cards, 20 at a time, "Show more"
- View state (query, type, tags) persisted with the workspace layout
- Commands to open the view and to seed it from the current note / tag under cursor
- Live index updates on note create/modify/rename/delete
- Settings: excluded folders, inline-tag inclusion, where results open

Out of scope for v1: sort control and paging (the site's `list.js` component), wikilink handling, Git-derived dates, backlinks, any aggregation. See *Deferred*.

## Page record

The unit of everything is the item shape of the site's `index.json`, which `cards.js` renders:

```ts
interface PageItem {
  path: string;        // vault path — plugin-only, used to open the note
  url: string;         // = path; kept so cards.js ports unchanged
  title: string;
  type: string;        // "wiki" | "blog" | … | "page" for root-level notes
  section: string;     // top-level folder, "" at root (informational)
  tags: string[];      // lowercased, no leading "#", deduped, order of first appearance
  created: string;     // RFC 3339
  updated: string;     // RFC 3339, never earlier than created
  summary: string;     // first ~30 words of body text, front matter and H1 stripped
  bookmarks: string[]; // URLs from `bookmark:` / `bookmarks:` front matter
  body: string;        // plugin-only: text fed to the search index, not rendered
}
```

### Derivation rules

Mirrors `txt-hugo/SPEC.md` → *Front matter contract*. Every field is optional in the file; the plugin fills gaps in the same order the sync step does.

| Field | Rule |
|---|---|
| `title` | front matter `title`; else the first level-1 heading (`cache.headings`); else the file basename |
| `type` | front matter `type`; else the top-level folder name; else `page` (Hugo's default for root-level content) |
| `section` | top-level folder name, `""` at root |
| `tags` | front matter `tags` (string or list) ∪ inline tags from `cache.tags` when *Include inline hashtags* is on; strip `#`, lowercase, dedupe. Also accepts the legacy `tag:` key |
| `created` | front matter `created` (alias `date`); else a `YYYYMMDD` / `YYYY-MM-DD` anywhere in the filename, or a `…/YYYY/MM/DD/` path; else `stat.ctime` |
| `updated` | front matter `updated` (alias `lastmod`); else `stat.mtime`; clamped to ≥ `created` |
| `summary` | body with front matter and the derived-title H1 removed, whitespace collapsed, first 30 words |
| `bookmarks` | front matter `bookmark` / `bookmarks`, string or list, URLs only |
| `body` | full body text for indexing: front matter removed; fenced code retained (Pagefind indexes it too) |

Divergences from the sync step, by design (see `intent.md` → *Design tensions*):

- **Tag syntax** follows Obsidian's cache, so `#a/b` is the tag `a/b` (the site sees `a`), and non-ASCII tags count. The site rule (`hashtags.py`) is not reimplemented.
- **No Git rung** in the date ladders; the ladder is front matter → path → file times. `created_source` is not exposed.
- **Title H1 removal** affects only `summary`/`body`, never the file.

### Which files are pages

All `.md` files in the vault except:

- anything under an excluded folder (setting; default `.obsidian`, `.trash`, `.git`, `media`)
- files named `README*`, `LICENSE*`, `CONTRIBUTING*`, `CNAME`, `.gitignore`, `*.gitkeep` — the sync step's skip list
- `index.md` / `home.md` / `_index.md` **are** pages (the site indexes section index bodies too); their `title` follows the same rule, their `type` is their own folder's section

Non-Markdown files are ignored.

## Search engine

**MiniSearch** (in-process, ~10 KB, no build step). Chosen over FlexSearch/Lunr for: prefix + fuzzy matching (closest to Pagefind's defaults), field boosting, matched-term reporting per result for excerpts, and `add`/`remove`/`replace` for incremental updates. Obsidian's internal search is not a public API and is not used.

- Fields indexed: `title` (boost 3), `body`. `tags` and `type` are stored, not indexed — they are filters, not search text, exactly as on the site.
- Query: `prefix: true`, `fuzzy: 0.2`, `combineWith: "AND"` (all terms must match, as Pagefind does).
- Filter-only search (empty query): all pages, filtered, ordered by `updated` descending — the site's one meaning of "recent". (Pagefind's own order for a `null` query is index order; that is not reproducible and not meaningful, so this is a deliberate choice.)
- With a query: MiniSearch relevance, no secondary sort.
- Filters are applied as a MiniSearch `filter` predicate: `type` equality (when set) and `tags ⊇ selected` (AND).

### Excerpt

Pagefind returns roughly 30 words around the first match, matched terms wrapped in `<mark>`. Reproduce: locate the first matched term in `body` (MiniSearch reports matched terms per result), take ~15 words either side, wrap every matched term in `<mark>`, escape everything else. With no query, `summary` is shown instead — the same fallback `cards.js` already has.

### Facet counts

`pagefind.filters()` gives totals; each `search()` returns counts within its result set, and the site renders **every** known chip, zeroes dimmed. Reproduce exactly:

- `allFilters`: totals for every `type` and every `tag` across the index, recomputed on index change
- per search: count `type` and `tag` over the filtered result set (before "Show more" truncation)
- chips ordered by count descending, then name — order is taken from the *totals* so chips do not jump around as counts change (this is what `sortedKeys(allFilters.*)` does on the site)

### Index lifecycle

- Build on `workspace.onLayoutReady` after `metadataCache` reports resolved, from `vault.getMarkdownFiles()` + `vault.cachedRead`
- Incremental: `metadataCache.on("changed")` → replace record; `vault.on("delete")` → remove; `vault.on("rename")` → remove + add; each debounced 300 ms and followed by a re-run of the open view's current search
- A vault of a few thousand notes should index in well under a second; larger vaults are not a v1 target

## View

`ItemView`, type `publictxt-search`, icon `search`, display text "PublicTxt Search". One instance is reused; opening the command focuses it.

### Layout (from `layouts/search.html`)

```txt
+ .search-form -----------------------------------------------+
| [ Search pages...                            ] [ Clear all ] |
+--------------------------------------------------------------+
+ .search-filters (220px) -+ + .search-results ----------------+
| TYPE                     | | 12 pages - "brain" . wiki . #mind|  <- #search-status
| (wiki 8)(blog 3)(notes 1)| | + .page-card ------------------+ |
|                          | | | Title                  [WIKI] | |
| TAGS - all selected      | | | 3 Jan 2024 . updated 9 Feb    | |
|   must match             | | | ^ example.org/thing           | |
| (#mind 12)(#brain 9)...  | | | ...excerpt with <mark>...     | |
| zero-count chips dimmed  | | | (#mind)(#brain)(#philosophy)  | |
|                          | | +-------------------------------+ |
|                          | | [ Show more ]                    |
+--------------------------+ +----------------------------------+
```

- Two-column grid, `220px minmax(0,1fr)`, collapsing to one column when the **view's** width is under 900 px (ResizeObserver on the content element — the window's width is irrelevant inside a pane)
- Header intro line ("Full-text search and tag browsing. Pick any combination of tags…") is kept; the site's "index not built" notice has no equivalent and is dropped

### Behaviour (from `search.js`)

| Site | Plugin |
|---|---|
| Input debounced 200 ms → `run()` | same |
| Type chip: click toggles; only one active | same |
| Tag chip: click toggles; several AND together | same |
| Hint "— all selected must match" when > 1 tag selected | same |
| "Clear all" resets query, type, tags; focuses the input | same |
| Status: `N page(s) — "q" · type · #tag · #tag` | same |
| 20 results, then "Show more" appends 20 | same |
| Card tag chips are filter buttons, active ones highlighted | same |
| Card title link → navigate | opens the note in the active leaf; Ctrl/Cmd-click in a new tab; setting can flip the default |
| Hover on a title | triggers Obsidian's `hover-link` so Page Preview works |
| Input focused on load when no query | same |
| `?q=&type=&tag=` in the URL, `popstate` re-runs | `getState()/setState()` on the view: `{ q, type, tags[] }`, restored with the workspace |

### Card

Port `cards.js` to TypeScript unchanged in structure: `escapeHTML`, `formatDate` ("2 Jan 2006"), `dateHTML` (show *updated* only when > 1 day after *created*), `bookmarkLabel` ("↗ " + host/path, scheme/`www.`/trailing slash dropped), `card(item, { activeTags, onTag, summaryHTML })`. Only `tagURL` and the link branch of `tagChip` are dead in the plugin: every tag chip is a button because `onTag` is always given. Up to 6 tag chips per card, as on the site.

Bookmark chips open the URL externally (`window.open`, `rel=noopener`).

### Styling

Same class names as the site (`search-form`, `search-layout`, `search-filters`, `filter-group`, `chip`, `chip-type`, `chip-link`, `filter-chip`, `active`, `empty`, `count`, `page-card`, `page-card-head`, `page-card-title`, `page-card-summary`, `result-list`, `btn-ghost`, `muted`), scoped under `.publictxt-search` to stay out of other plugins' way. Rules copied from `assets/css/main.css` with the site's palette variables replaced by Obsidian's:

| Site variable | Obsidian variable |
|---|---|
| `--bg-raised` | `--background-secondary` |
| `--bg-inset` | `--background-primary-alt` |
| `--border` | `--background-modifier-border` |
| `--text` / `--text-muted` | `--text-normal` / `--text-muted` |
| `--accent` | `--text-accent` for text, `--interactive-accent` for borders |
| `--accent-soft` | `--interactive-accent` at reduced alpha (`color-mix`) |
| `--chip-bg` / `--chip-type-bg` | `--tag-background` / `--background-modifier-hover` |
| `--radius` | `--radius-m` |
| `<mark>` | `--text-highlight-bg` |

Shape, spacing, chip radius (999px), uppercase type chip, dimmed zero-count chips (opacity 0.45) and the `<mark>` treatment are kept.

## Commands

| Command | Effect |
|---|---|
| **Open PublicTxt search** | opens/focuses the view (also a ribbon icon) |
| **Search for tag under cursor** | editor command; when the cursor is on a `#tag` or inside a front matter `tags` entry, opens the view with that tag selected — the vault-side equivalent of a tag page's "combine with other tags" link |
| **Search pages like this one** | opens the view with the current note's type and tags selected |
| **Clear search** | same as the button; useful with a hotkey |

## Settings

| Setting | Default | Notes |
|---|---|---|
| Excluded folders | `.obsidian, .trash, .git, media` | one per line; prefix match on path |
| Include inline `#hashtags` as tags | on | off = front matter `tags` only |
| Open results in | current tab | current tab / new tab / split |
| Results per batch | 20 | the site's `PAGE` constant |

No setting for section order or tag-cloud limits: the search page sorts facets by count, not by `params.sectionOrder`.

## Project layout

Obsidian sample-plugin scaffold: TypeScript, esbuild, `manifest.json` id `publictxt-search`, `minAppVersion` 1.4.

```txt
<plugin repo>/
  manifest.json
  package.json          deps: obsidian, minisearch; dev: esbuild, typescript
  src/
    main.ts             plugin: commands, ribbon, settings, view registration
    index.ts            page records + MiniSearch index + lifecycle
    derive.ts           title/type/tags/dates/summary rules (the sync-step port)
    view.ts             SearchView (ItemView): layout, state, run/showMore
    cards.ts            port of txt-hugo/assets/js/cards.js
    settings.ts
  styles.css            port of the search + chip + card rules from txt-hugo/assets/css/main.css
  docs/intent.md  docs/spec.md
```

The plugin lives in its own repo (community plugins need `manifest.json` at the root and their own releases). The rules it copies are specified in txt-hugo; drift is caught by the parity checks below, run against `txt-hugo/example/txt` as the development vault.

## Parity checks

Open `txt-hugo/example/txt` as a vault (drop `.obsidian/` if a fresh config is wanted) and build the site from it. These rows are spot checks, not a gate: the plugin aims for the same sort of functionality as `/search/`, and a row that lists different pages is recorded in `parity.md` and fixed only if the plugin is wrong on its own terms (decision of 2026-09-18, see `plan.md` → *Approach*).

| Query | type | tags | Note |
|---|---|---|---|
| *(empty)* | — | — | every page, count equals the site's total; plugin order is `updated` desc |
| *(empty)* | `wiki` | — | |
| *(empty)* | — | one tag with several pages | |
| *(empty)* | — | two tags that intersect | AND, not OR |
| *(empty)* | `blog` | a tag that appears only in `wiki` | zero results, chips dimmed, status `0 pages — blog · #tag` |
| a word in one title | — | — | title boost puts that page first |
| a word appearing only in fenced code | — | — | found on both |
| a word in a bookmark page's body | `bookmarks` | — | card shows the ↗ chip |
| a word in a root-level page (`Projects.md`) | `page` | — | root pages carry type `page` on both |

Known non-parity, to be confirmed as such and not "fixed":

- pages whose only date rung is Git show different `created`/`updated`
- nested or non-ASCII inline tags differ per the tag-syntax divergence above

## Deferred to v2+

- Sort menu and paging from `list.js` (recently updated, newest, oldest, title A→Z / Z→A) — the second half of the site's browse UI
- A shared `cards` package consumed by both the site and the plugin instead of a hand-kept port
- Git-derived dates via `simple-git` / `child_process` on desktop, gated behind a setting
- `obsidian://publictxt-search?q=&tag=` URI handler, so a site tag page could link back into the vault
- Multi-vault / aggregate sources once PublicTxt's aggregation exists
