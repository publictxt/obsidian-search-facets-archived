// Page records in a MiniSearch index, plus the facet totals and per-search
// counts the site gets from Pagefind (`pagefind.filters()` and `res.filters`).

import MiniSearch from "minisearch";
import { parseTime, type PageItem } from "./derive.ts";

export interface SearchState {
  q: string;
  type: string;
  tags: string[];
}

export interface Counts {
  type: Record<string, number>;
  tag: Record<string, number>;
}

export interface SearchHit {
  item: PageItem;
  /** Index terms that matched, for the excerpt. Empty for filter-only searches. */
  terms: string[];
}

export interface SearchResults {
  hits: SearchHit[];
  /** Facet counts over the whole result set, before "Show more" truncation. */
  counts: Counts;
  hasQuery: boolean;
}

/** The site's `sortedKeys`: count descending, then name. */
export function sortedKeys(obj: Record<string, number> | undefined): string[] {
  const o = obj ?? {};
  return Object.keys(o).sort((a, b) => o[b]! - o[a]! || a.localeCompare(b));
}

function countFacets(items: Iterable<PageItem>): Counts {
  const counts: Counts = { type: {}, tag: {} };
  for (const it of items) {
    if (it.type) counts.type[it.type] = (counts.type[it.type] ?? 0) + 1;
    for (const t of it.tags) counts.tag[t] = (counts.tag[t] ?? 0) + 1;
  }
  return counts;
}

export function emptySearchState(): SearchState {
  return { q: "", type: "", tags: [] };
}

/** Fuzzy matching below this many characters is too loose: one edit on a four-letter term matches half the vocabulary. */
const FUZZY_MIN_LENGTH = 5;

export class PageIndex {
  private mini: MiniSearch<PageItem>;
  private pages = new Map<string, PageItem>();
  /** `updated` as a number per path, parsed once at put() rather than n·log n times per filter-only sort. */
  private updatedMs = new Map<string, number>();
  /** Facet totals across the whole index — what `pagefind.filters()` returns. */
  totals: Counts = { type: {}, tag: {} };
  /** Chip order: `sortedKeys` of the totals, computed once per index change rather than per render. */
  sortedTotals: { type: string[]; tag: string[] } = { type: [], tag: [] };

  constructor() {
    this.mini = new MiniSearch<PageItem>({
      idField: "path",
      fields: ["title", "body"],
      storeFields: [],
      searchOptions: {
        boost: { title: 3 },
        prefix: true,
        fuzzy: (term) => (term.length >= FUZZY_MIN_LENGTH ? 0.2 : false),
        combineWith: "AND",
      },
    });
  }

  get size(): number {
    return this.pages.size;
  }

  has(path: string): boolean {
    return this.pages.has(path);
  }

  get(path: string): PageItem | undefined {
    return this.pages.get(path);
  }

  all(): PageItem[] {
    return [...this.pages.values()];
  }

  /**
   * Add or replace a page. The body goes into the search index only; the
   * record kept for results has it emptied, so memory does not scale with the
   * vault's text (excerpts re-read the note). Totals are not recomputed; call
   * `recomputeTotals()` after a batch.
   */
  put(item: PageItem): void {
    if (this.pages.has(item.path)) this.mini.replace(item);
    else this.mini.add(item);
    this.pages.set(item.path, { ...item, body: "" });
    this.updatedMs.set(item.path, parseTime(item.updated));
  }

  remove(path: string): boolean {
    if (!this.pages.has(path)) return false;
    this.mini.discard(path);
    this.pages.delete(path);
    this.updatedMs.delete(path);
    return true;
  }

  clear(): void {
    this.mini.removeAll();
    this.pages.clear();
    this.updatedMs.clear();
    this.totals = { type: {}, tag: {} };
    this.sortedTotals = { type: [], tag: [] };
  }

  recomputeTotals(): void {
    this.totals = countFacets(this.pages.values());
    this.sortedTotals = { type: sortedKeys(this.totals.type), tag: sortedKeys(this.totals.tag) };
  }

  search(state: SearchState): SearchResults {
    const hasQuery = state.q.trim().length > 0;
    const tags = state.tags;
    const matches = (it: PageItem) =>
      (!state.type || it.type === state.type) && tags.every((t) => it.tags.includes(t));

    let hits: SearchHit[];
    if (hasQuery) {
      hits = this.mini
        .search(state.q, {
          filter: (r) => {
            const it = this.pages.get(r.id as string);
            return !!it && matches(it);
          },
        })
        .flatMap((r) => {
          const item = this.pages.get(r.id as string);
          return item ? [{ item, terms: r.terms }] : [];
        });
    } else {
      // Filter-only: every matching page, most recently updated first.
      const ms = (it: PageItem) => this.updatedMs.get(it.path) ?? Number.NEGATIVE_INFINITY;
      hits = this.all()
        .filter(matches)
        .sort((a, b) => ms(b) - ms(a) || a.title.localeCompare(b.title))
        .map((item) => ({ item, terms: [] }));
    }
    return { hits, counts: countFacets(hits.map((h) => h.item)), hasQuery };
  }
}
