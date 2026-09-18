# Site reference for spot checks

What the site's `/search/` knows about `example/txt`, for comparing against the plugin by eye.
Not an acceptance test: the plugin aims for the same sort of functionality, and a different
answer is noted here, not necessarily fixed (see `plan.md` → *Approach*). Taken from a build
of `txt-hugo` (Hugo 0.166, Pagefind 1.5.2, built 2026-09-18); types and tags are read from the
`data-pagefind-filter` attributes in `public/`. Regenerate after any change to the example
vault or the site templates.

## Site total: 29 pages; the plugin will list 31

The vault has 32 Markdown files. `README.md` is on the sync step's skip list. Two more are absent
from the site's index but count as pages under the spec's rule, a known and accepted difference:

| Vault file | Why the site does not index it |
|---|---|
| `index.md` (root) | rendered by the home template, which has no Pagefind body |
| `blog/index.md` | only an H1; section indexes are wrapped in `{{ with .Content }}` and an empty body emits none |

## Pages the site indexes

| Vault path | Site URL | type | tags |
|---|---|---|---|
| `blog/2023/12/17/20231217.md` | `blog/2023/12/17/20231217/` | blog | personal, journal, blog |
| `blog/2023/12/17/another-post.md` | `blog/2023/12/17/another-post/` | blog | journal |
| `blog/2024/20240424-changing-work-situation.md` | `blog/2024/20240424-changing-work-situation/` | blog | personal |
| `blog/2024/20241013-multiverse-testability.md` | `blog/2024/20241013-multiverse-testability/` | blog | cosmology, sci, writing |
| `blog/2024/home.md` | `blog/2024/` | blog | |
| `blog/20260509-CuratedCommons-Open-Aggregation-for-the-Open-Web.md` | `blog/20260509-curatedcommons-open-aggregation-for-the-open-web/` | blog | commons, publictxt, writing |
| `blog/20260915-a-post-with-full-front-matter.md` | `blog/20260915-a-post-with-full-front-matter/` | blog | announcement, publictxt, hugo |
| `bookmarks/sites/publictext.net/publictext.net.md` | `bookmarks/sites/publictext.net/publictext.net/` | bookmarks | publictext, website, sample |
| `notes/Info politics/The WhatsApp Mess . 20240816.md` | `notes/info-politics/the-whatsapp-mess-.-20240816/` | notes | info-politics, social-software |
| `notes/sample.md` | `notes/sample/` | notes | |
| `online-things.md` | `online-things/` | page | |
| `posts/20260426-come-on-lets-be-alive.md` | `posts/20260426-come-on-lets-be-alive/` | posts | |
| `posts/index.md` | `posts/` | posts | |
| `Projects.md` | `projects/` | page | |
| `wiki/bliki.md` | `wiki/bliki/` | wiki | wiki, blog |
| `wiki/Computer-Science/CopyLeft.md` | `wiki/computer-science/copyleft/` | wiki | free-software, licensing |
| `wiki/Computer-Science/Free-Software.md` | `wiki/computer-science/free-software/` | wiki | free-software, info-politics |
| `wiki/Computer-Science/index.md` | `wiki/computer-science/` | wiki | |
| `wiki/index.md` | `wiki/` | wiki | |
| `wiki/Projects/PublicTxt/CuratedCommons.md` | `wiki/projects/publictxt/curatedcommons/` | wiki | publictxt, commons, curation |
| `wiki/Projects/PublicTxt/Obsidian.md.md` | `wiki/projects/publictxt/obsidian.md/` | wiki | tools, closed_source, publictxt, tool |
| `wiki/Projects/PublicTxt/Other Software.md` | `wiki/projects/publictxt/other-software/` | wiki | publictxt |
| `wiki/Projects/PublicTxt/PublicTxt.md` | `wiki/projects/publictxt/publictxt/` | wiki | publictxt, commons |
| `wiki/Science/brain/Consciousness.md` | `wiki/science/brain/consciousness/` | wiki | brain, sci, bio |
| `wiki/Science/brain/Neuroscience.md` | `wiki/science/brain/neuroscience/` | wiki | brain, sci |
| `wiki/Science/Cosmology.md` | `wiki/science/cosmology/` | wiki | cosmology, sci |
| `wiki/Science/index.md` | `wiki/science/` | wiki | |
| `wiki/Science/Kurzgesagt.md` | `wiki/science/kurzgesagt/` | wiki | channel, sci, video |
| `wiki/Software/Personal-Wiki-software.md` | `wiki/software/personal-wiki-software/` | wiki | software, wiki, pkm, km |

## Facet totals (the `allFilters` the site's chips are ordered by)

Type: wiki 15 · blog 7 · notes 2 · page 2 · posts 2 · bookmarks 1

Tags: publictxt 6 · sci 5 · commons 3 · blog 2 · brain 2 · cosmology 2 · free-software 2 ·
info-politics 2 · journal 2 · personal 2 · wiki 2 · writing 2 · then one each of announcement,
bio, channel, closed_source, curation, hugo, km, licensing, pkm, publictext, sample,
social-software, software, tool, tools, video, website.

Chip order is count descending, then name, so `tools` sorts after `tool`.

## Useful rows for the spec's parity table

- Two tags that intersect: `publictxt` + `commons` → 3 pages (CuratedCommons, PublicTxt, the
  Curated Commons blog post). `brain` + `sci` → 2.
- A tag appearing only in `wiki`: `brain`. So type `blog` + `#brain` must give `0 pages — blog · #brain`.
- Bookmark page: `bookmarks/sites/publictext.net/publictext.net.md`.
- Root-level page with type `page`: `Projects.md`, `online-things.md`.
- Nested tag divergence candidate: none in the example vault yet; add one if that row is to be exercised.

## Results

Filled in during slice 6. One row per line of the spec's table: same, or the difference and
whether it was a plugin bug or an accepted divergence.
