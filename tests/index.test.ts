import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { PageItem } from "../src/derive.ts";
import { PageIndex, sortedKeys } from "../src/index.ts";

function item(path: string, o: Partial<PageItem> = {}): PageItem {
  return {
    path,
    url: path,
    title: o.title ?? path,
    type: o.type ?? (path.includes("/") ? path.slice(0, path.indexOf("/")) : "page"),
    section: "",
    tags: o.tags ?? [],
    created: o.created ?? "2024-01-01T00:00:00+00:00",
    updated: o.updated ?? o.created ?? "2024-01-01T00:00:00+00:00",
    summary: o.summary ?? "",
    bookmarks: [],
    body: o.body ?? "",
    ...o,
  };
}

function build(): PageIndex {
  const ix = new PageIndex();
  ix.put(item("wiki/brain.md", { title: "Brain", body: "Grey matter.", tags: ["brain", "sci"], updated: "2024-03-01T00:00:00Z" }));
  ix.put(item("wiki/mind.md", { title: "Mind", body: "The brain thinks about the brain.", tags: ["sci", "mind"], updated: "2024-02-01T00:00:00Z" }));
  ix.put(item("blog/post.md", { title: "A post", body: "echo hello from code", tags: ["blog", "sci"], updated: "2024-04-01T00:00:00Z" }));
  ix.put(item("Projects.md", { title: "Projects", body: "Public software.", updated: "not a date" }));
  ix.recomputeTotals();
  return ix;
}

describe("PageIndex", () => {
  test("totals count every type and tag; sortedKeys orders by count then name", () => {
    const ix = build();
    assert.deepEqual(ix.totals.type, { wiki: 2, blog: 1, page: 1 });
    assert.deepEqual(ix.totals.tag, { brain: 1, sci: 3, mind: 1, blog: 1 });
    assert.deepEqual(sortedKeys(ix.totals.tag), ["sci", "blog", "brain", "mind"]);
    assert.deepEqual(ix.sortedTotals, { type: ["wiki", "blog", "page"], tag: ["sci", "blog", "brain", "mind"] });
    assert.deepEqual(sortedKeys(undefined), []);
    ix.clear();
    assert.deepEqual(ix.sortedTotals, { type: [], tag: [] });
  });

  test("filter-only search lists everything, most recently updated first, unparseable last", () => {
    const r = build().search({ q: "", type: "", tags: [] });
    assert.equal(r.hasQuery, false);
    assert.deepEqual(r.hits.map((h) => h.item.path), ["blog/post.md", "wiki/brain.md", "wiki/mind.md", "Projects.md"]);
    assert.deepEqual(r.counts, build().totals);
  });

  test("type is an equality filter; tags AND together", () => {
    const ix = build();
    assert.deepEqual(ix.search({ q: "", type: "wiki", tags: [] }).hits.map((h) => h.item.path), ["wiki/brain.md", "wiki/mind.md"]);
    assert.deepEqual(ix.search({ q: "", type: "", tags: ["sci", "brain"] }).hits.map((h) => h.item.path), ["wiki/brain.md"]);
    const none = ix.search({ q: "", type: "blog", tags: ["brain"] });
    assert.equal(none.hits.length, 0);
    assert.deepEqual(none.counts, { type: {}, tag: {} });
  });

  test("counts are over the filtered result set", () => {
    const r = build().search({ q: "", type: "wiki", tags: [] });
    assert.deepEqual(r.counts.type, { wiki: 2 });
    assert.deepEqual(r.counts.tag, { brain: 1, sci: 2, mind: 1 });
  });

  test("a query ranks the title match first and reports matched terms", () => {
    const r = build().search({ q: "brain", type: "", tags: [] });
    assert.equal(r.hasQuery, true);
    assert.deepEqual(r.hits.map((h) => h.item.path), ["wiki/brain.md", "wiki/mind.md"]);
    assert.deepEqual(r.hits[0]!.terms, ["brain"]);
  });

  test("a word only in fenced code is found; filters apply to query results too", () => {
    const ix = build();
    assert.deepEqual(ix.search({ q: "echo", type: "", tags: [] }).hits.map((h) => h.item.path), ["blog/post.md"]);
    assert.deepEqual(ix.search({ q: "brain", type: "", tags: ["mind"] }).hits.map((h) => h.item.path), ["wiki/mind.md"]);
  });

  test("all terms must match; prefix matches; fuzzy only from five letters", () => {
    const ix = build();
    assert.equal(ix.search({ q: "brain thinks", type: "", tags: [] }).hits.length, 1);
    assert.equal(ix.search({ q: "brain hello", type: "", tags: [] }).hits.length, 0);
    assert.equal(ix.search({ q: "bra", type: "", tags: [] }).hits.length, 2);
    assert.equal(ix.search({ q: "brein", type: "", tags: [] }).hits.length, 2); // five letters, one edit away
    assert.equal(ix.search({ q: "brin", type: "", tags: [] }).hits.length, 0); // four letters: no fuzzy, not a prefix
    assert.equal(ix.search({ q: "min", type: "", tags: [] }).hits.length, 1); // prefix of "mind"
    assert.equal(ix.search({ q: "mnd", type: "", tags: [] }).hits.length, 0);
  });

  test("filter-only order follows updated, including after a replace", () => {
    const ix = build();
    ix.put(item("Projects.md", { title: "Projects", updated: "2030-01-01T00:00:00Z" }));
    assert.equal(ix.search({ q: "", type: "", tags: [] }).hits[0]!.item.path, "Projects.md");
  });

  test("put replaces, remove discards, clear empties", () => {
    const ix = build();
    ix.put(item("wiki/brain.md", { title: "Renamed", body: "nothing here", tags: ["x"] }));
    ix.recomputeTotals();
    assert.equal(ix.size, 4);
    assert.equal(ix.search({ q: "grey", type: "", tags: [] }).hits.length, 0);
    assert.equal(ix.search({ q: "renamed", type: "", tags: [] }).hits.length, 1);
    assert.equal(ix.totals.tag.brain, undefined);
    assert.equal(ix.remove("wiki/brain.md"), true);
    assert.equal(ix.remove("wiki/brain.md"), false);
    assert.equal(ix.has("wiki/brain.md"), false);
    assert.equal(ix.search({ q: "renamed", type: "", tags: [] }).hits.length, 0);
    ix.clear();
    assert.equal(ix.size, 0);
    assert.deepEqual(ix.totals, { type: {}, tag: {} });
  });
});
