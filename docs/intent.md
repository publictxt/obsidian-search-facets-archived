# PublicTxt Search for Obsidian — Intent

An Obsidian plugin that reproduces the **search page** of [PublicTxt-Hugo](https://github.com/publictxt/txt-hugo) (`/search/`) inside the vault: one text box, a Type facet, a Tags facet with live counts, and a list of page cards — with or without a search term. See `spec.md` for the v1 spec and `txt-hugo/SPEC.md` for the site it mirrors. Paths written `txt-hugo/…` are in the site repo: 

## Why

The Hugo site is the *reading* interface for a PublicTxt repository; Obsidian is the *writing* interface for the same files. Today the two offer different ways to find things:

- The site: full-text **plus** faceted browsing by tag combination (AND) and type, filter counts that reflect the current result set, and filter-only searches ("show me everything tagged `#brain` and `#philosophy`"). Results are cards: title, type, dates, excerpt, tags.
- Obsidian: a query language (`tag:#a tag:#b path:wiki`) with no facets, no counts, no notion of *type*, and results as file paths with context lines.

An author who has learnt the site's model of their repo — sections as types, front matter + inline hashtags as one tag set, tag intersections as the main browse path — currently loses it the moment they open Obsidian. The plugin puts the same model, and the same UI, in the editor.

Three things follow from that:

1. **Same answer in both places.** A search that finds 12 pages on the site should find the same 12 pages in the vault. The plugin derives title, type, tags and dates by the same rules as the sync step (`scripts/sync_content.py`, `hashtags.py`, `dates.py`), so it doubles as a preview of what the published site will list — before pushing.
2. **Tag combinations become a first-class way to browse the vault**, not a query-syntax trick. Click chips, watch counts narrow, open a page. This is the interaction the site was built around and the one Obsidian's search does worst.
3. **A step toward PublicTxt's aggregate view.** The PublicTxt v1 goal is "pull selected pages from other people's repos into a local aggregate view I can browse and search". When that aggregate lives in (or beside) an Obsidian vault, this plugin *is* the browse-and-search part. v1 does not aggregate anything; it searches whatever the vault holds.

## Who it is for

- Authors of a PublicTxt (or plain Obsidian) repository that is published with PublicTxt-Hugo, working in Obsidian day to day.
- Secondarily, any Obsidian user who wants faceted tag/folder search with cards. Nothing in the plugin requires PublicTxt conventions; without them it degrades to "type = top-level folder, tags = Obsidian's tags".

## What success looks like

- Open the example repo (`txt-hugo/example/txt`) as a vault. The query and filter combinations listed in `spec.md` → *Parity checks* behave the same way as on the built site: same facets, same kind of results. Page-for-page identical results are a nice-to-have, not the bar (see `plan.md` → *Approach*).
- A search view opens in under a second on a vault of a few thousand notes; typing, toggling chips and "Show more" feel instant; edits to a note are reflected without reloading the plugin.
- Someone who knows the site's search page needs no explanation of the plugin's.

## What it is not

- **Not a replacement for Obsidian's core search.** No query syntax, no regex, no match-in-file navigation. Core search stays the tool for "where in this file is the word".
- **Not a browse-list clone.** The site's section/tag pages (sort menu, paging, `?sort=&page=`) are a second component (`list.js`); v1 reproduces only `search.js`. Sort is a v2 candidate.
- **Not a sync, Git or aggregation tool.** It never writes to the vault. No `[[wikilink]]` handling, no front matter rewriting, no hashtag linkifying — the sync step keeps those jobs.
- **Not a pixel copy.** Structure, behaviour and hierarchy are reproduced; colours come from the active Obsidian theme, so it fits light themes the site does not have.

## Design tensions to keep in view

- **Two implementations of one rule set.** The site derives metadata in Python at build time; the plugin derives it in TypeScript at load time. They will drift unless the rules are written down once (they are: `txt-hugo/SPEC.md` → *Front matter contract*, *The date ladders*, and `hashtags.py`'s docstring) and the parity checks are run against the example repo. The card renderer (`txt-hugo/assets/js/cards.js`) is plain DOM and can be ported almost verbatim; a shared package is a v2 refactor, not a v1 requirement.
- **Tags: Obsidian's rule vs. the sync step's rule.** Obsidian recognises nested (`#a/b`) and non-ASCII tags; the sync step recognises `#` + ASCII letter + `[A-Za-z0-9_-]*`, stopping at `/`. The plugin uses Obsidian's metadata cache (the author's own view of their tags) and lowercases; divergent tags are the author's cue that the site will read them differently. Noted, not hidden.
- **Dates without Git.** The site's `created`/`updated` ladders include a Git rung the plugin cannot climb without shelling out. v1 stops at file times, so an undated wiki page may show a different date in the vault than on the site. Front matter or a date in the filename fixes it on both sides — which is the behaviour the site already nudges authors toward.
- **No URL.** The site keeps the search in `?q=&tag=&type=` so views are linkable. The plugin keeps it in the view's workspace state and exposes commands that seed a search (from the tag under the cursor, from the current note's tags), which is the vault-side equivalent of a tag page's "combine with other tags" link.
