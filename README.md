# PublicTxt Search for Obsidian

The search page of a [PublicTxt-Hugo](https://github.com/publictxt/txt-hugo) site, inside the vault
it is published from: one text box, a **Type** facet, a **Tags** facet with live counts, and page
cards. Pick any combination of tags, with or without a search term, and see every page that
matches all of them. The same model the site uses (sections as types, front matter tags plus
inline `#hashtags` as one tag set) is what you browse while writing.

Nothing here needs PublicTxt conventions. In a plain vault it is faceted search where type is the
top-level folder and tags are Obsidian's tags. The plugin never writes to the vault.

## Install

From a release: create `.obsidian/plugins/publictxt-search/` in your vault and copy `main.js`,
`manifest.json` and `styles.css` into it, then enable **PublicTxt Search** under *Settings →
Community plugins*. Requires Obsidian 1.4 or later; desktop and mobile.

## Use

Click the search ribbon icon or run **Open PublicTxt search**. The view opens as a tab:

- Type in the box to search titles and body text. All words must match; prefixes and small typos
  do. Matched words are highlighted in each card's excerpt.
- Click a **type** chip to keep only that type; click it again to release it.
- Click **tag** chips to narrow to pages carrying all of them. Counts show how many pages in the
  current result set carry each tag; chips with none are dimmed but stay in place.
- Leave the box empty to browse by filters alone, most recently updated first.
- A card's title opens the note (Ctrl/Cmd-click for a new tab; hover for Page Preview). Its tag
  chips are the same filters. A ↗ chip opens a page's bookmark URL in the browser.
- **Clear all** resets everything. **Show more** appends the next batch of cards.

The search is saved with the workspace layout, so it is there again after a restart.

### Commands

| Command | What it does |
|---|---|
| Open PublicTxt search | Opens or focuses the view |
| Search for tag under cursor | With the cursor on a `#tag` or a front matter `tags` entry, opens the view with that tag selected |
| Search pages like this one | Opens the view with the current note's type and tags selected |
| Clear search | Same as the button; handy on a hotkey |

### Settings

| Setting | Default | Notes |
|---|---|---|
| Excluded folders | `.obsidian`, `.trash`, `.git`, `media` | One per line. Notes inside are not pages. |
| Include inline #hashtags as tags | on | Off means front matter `tags` only |
| Open results in | Current tab | Current tab, new tab or split. Ctrl/Cmd-click always opens a new tab. |
| Results per batch | 20 | Cards shown before "Show more" |

## How pages are derived

Every Markdown note is a page except those in excluded folders and repo housekeeping files
(`README*`, `LICENSE*`, `CONTRIBUTING*`, `CNAME`). Each page gets the fields the site's cards
show, filled in the same order the site's sync step uses:

| Field | Rule |
|---|---|
| title | front matter `title`, else the first `# H1`, else the file name |
| type | front matter `type`, else the top-level folder, else `page` for root notes |
| tags | front matter `tags` (or legacy `tag`) plus inline `#hashtags`; lowercased, deduped |
| created | front matter `created` (or `date`), else a `YYYYMMDD` / `YYYY-MM-DD` in the file name or a `/YYYY/MM/DD/` path, else the file's creation time |
| updated | front matter `updated` (or `lastmod`), else the file's modification time; never before `created` |
| summary | the first 30 words of the body, front matter and title heading removed |
| bookmarks | front matter `bookmark` / `bookmarks`, URLs only |

### Where the plugin differs from the site

The aim is the same functionality as the site's search page, not identical results. Known
differences, all by design:

| Site | Plugin |
|---|---|
| Inline tags follow the sync step's rule: ASCII, stopping at `/` | Inline tags follow Obsidian's cache, so `#a/b` is the tag `a/b` and non-ASCII tags count |
| Undated pages take their dates from Git history | No Git rung: front matter, then the file name or path, then file times |
| The root `index.md` and section indexes with an empty body are not indexed | Every index page is a page, so counts can be a little higher |
| Filter-only results come in Pagefind's index order | Most recently updated first |
| Summaries come from Hugo's rendered text | The first 30 words of the note's plain text |

## Development

```sh
npm install
npm run dev        # rebuild main.js on change, with an inline source map
npm run build      # minified main.js
npm run check      # tsc
npm test           # unit tests for the derivation, index, cards, excerpt and cursor-tag rules
.\deploy.ps1 [-Vault <path>]   # build and copy into a vault's plugin folder (PowerShell)
node scripts/parity-check.ts <vault-dir>   # derive a vault folder outside Obsidian and print facet totals
```

Design notes live in `docs/`: `intent.md` (why), `spec.md` (what) and `plan.md` (how it was built).
