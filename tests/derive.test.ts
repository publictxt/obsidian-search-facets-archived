import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fakeCache, fileInfo } from "./helpers/fake-cache.ts";
import {
  dateFromPath,
  dateOnlyToISO,
  deriveDates,
  derivePage,
  deriveTags,
  firstWords,
  isPage,
  normalizeDate,
  plainText,
  removeFirstH1,
  splitFrontMatter,
  toLocalISO,
} from "../src/derive.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const T0 = Date.UTC(2020, 0, 1, 12);
const T1 = Date.UTC(2021, 5, 1, 12);

function derive(path: string, text: string, includeInlineTags = true, stat = { ctime: T0, mtime: T1 }) {
  return derivePage(fileInfo(path, stat), fakeCache(text), text, { includeInlineTags });
}

const DEFAULT_EXCLUDED = [".obsidian", ".trash", ".git", "media"];

describe("isPage", () => {
  const page = (path: string, excluded = DEFAULT_EXCLUDED) => isPage(fileInfo(path), excluded);
  test("Markdown files in ordinary folders are pages, including index files", () => {
    assert.equal(page("wiki/index.md"), true);
    assert.equal(page("Projects.md"), true);
    assert.equal(page("blog/2024/home.md"), true);
  });
  test("non-Markdown files are not", () => {
    assert.equal(page("notes/a.txt"), false);
    assert.equal(page("media/pic.png"), false);
  });
  test("the sync step's housekeeping files are skipped", () => {
    for (const p of ["README.md", "wiki/README-notes.md", "LICENSE.md", "CONTRIBUTING.md", "CNAME.md"]) {
      assert.equal(page(p), false, p);
    }
  });
  test("excluded folders match on folder boundaries", () => {
    assert.equal(page("media/x.md"), false);
    assert.equal(page(".obsidian/plugins/x.md"), false);
    assert.equal(page("media-notes/x.md"), true);
    assert.equal(page("wiki/x.md", ["wiki/"]), false);
    assert.equal(page("wiki/x.md", [" ./wiki "]), false);
    assert.equal(page("wiki/x.md", [""]), true);
  });
});

describe("title", () => {
  test("front matter title wins and the H1 stays in the body", () => {
    const p = derive("blog/20260915-a-post-with-full-front-matter.md", fixture("20260915-a-post-with-full-front-matter.md"));
    assert.equal(p.title, "A post with full front matter");
    assert.ok(p.summary.startsWith("This H1 must NOT become the title"), p.summary);
  });
  test("an H1 with a line before it is the title and is removed from the summary", () => {
    const p = derive("wiki/Science/Cosmology.md", fixture("Cosmology.md"));
    assert.equal(p.title, "Cosmology");
    assert.ok(p.summary.startsWith("Wiki home -> Science home"), p.summary);
    assert.ok(!p.body.includes("# Cosmology"));
  });
  test("basename when there is neither", () => {
    const p = derive("notes/Info politics/The WhatsApp Mess . 20240816.md", fixture("The WhatsApp Mess . 20240816.md"));
    assert.equal(p.title, "The WhatsApp Mess . 20240816");
  });
});

describe("type and section", () => {
  test("top-level folder, `page` at the root", () => {
    const wiki = derive("wiki/Science/Cosmology.md", fixture("Cosmology.md"));
    assert.equal(wiki.type, "wiki");
    assert.equal(wiki.section, "wiki");
    const root = derive("Projects.md", "Public software and contract work.");
    assert.equal(root.type, "page");
    assert.equal(root.section, "");
  });
  test("front matter type overrides the folder", () => {
    const p = derive("wiki/x.md", "---\ntype: essay\n---\nBody.");
    assert.equal(p.type, "essay");
    assert.equal(p.section, "wiki");
  });
});

describe("tags", () => {
  test("inline hashtags, not those in code", () => {
    const p = derive("wiki/Computer-Science/Free-Software.md", fixture("Free-Software.md"));
    assert.deepEqual(p.tags, ["free-software", "info-politics"]);
  });
  test("inline hashtags off means front matter only", () => {
    const p = derive("wiki/Computer-Science/Free-Software.md", fixture("Free-Software.md"), false);
    assert.deepEqual(p.tags, []);
    const q = derive("blog/x.md", fixture("20260915-a-post-with-full-front-matter.md"), false);
    assert.deepEqual(q.tags, ["announcement", "publictxt"]);
  });
  test("front matter first, then inline, in first-appearance order", () => {
    const p = derive("blog/x.md", fixture("20260915-a-post-with-full-front-matter.md"));
    assert.deepEqual(p.tags, ["announcement", "publictxt", "hugo"]);
  });
  test("`#42` and `C#` are not tags", () => {
    const p = derive("wiki/Science/Cosmology.md", fixture("Cosmology.md"));
    assert.deepEqual(p.tags, ["cosmology", "sci"]);
  });
  test("legacy `tag:` key, lowercased", () => {
    const p = derive("notes/x.md", fixture("legacy-tag.md"));
    assert.deepEqual(p.tags, ["legacy", "key", "inline"]);
  });
  test("string values split on commas and spaces; `#` stripped; deduped", () => {
    assert.deepEqual(deriveTags({ tags: "a, B #c" }, { tags: [{ tag: "#c", position: null as never }] }, true), ["a", "b", "c"]);
    assert.deepEqual(deriveTags({ tags: ["#Foo", 7] }, null, true), ["foo", "7"]);
    assert.deepEqual(deriveTags({ tags: null }, undefined, true), []);
  });
});

describe("dates", () => {
  test("dateFromPath: filename forms, then the /YYYY/MM/DD/ path", () => {
    assert.equal(dateFromPath("blog/2024/20241013-multiverse-testability.md"), "2024-10-13");
    assert.equal(dateFromPath("notes/Info politics/The WhatsApp Mess . 20240816.md"), "2024-08-16");
    assert.equal(dateFromPath("a/2024-10-13-title.md"), "2024-10-13");
    assert.equal(dateFromPath("blog/2023/12/17/another-post.md"), "2023-12-17");
    assert.equal(dateFromPath("wiki/Obsidian.md.md"), null);
  });
  test("dateFromPath: digit guards and real-date validation", () => {
    assert.equal(dateFromPath("Room 20240000.md"), null);
    assert.equal(dateFromPath("isbn 9780131103627.md"), null);
    assert.equal(dateFromPath("blog/2023/2023-Week50.md"), null);
    assert.equal(dateFromPath("blog/2023/13/40/x.md"), null);
  });
  test("front matter created/updated pass through; date-only means local midnight", () => {
    const fm = { created: "2026-09-15T14:30:00+02:00", updated: "2026-09-16T09:00:00+02:00" };
    assert.deepEqual(deriveDates(fm, "blog/x.md", { ctime: T0, mtime: T1 }), {
      created: "2026-09-15T14:30:00+02:00",
      updated: "2026-09-16T09:00:00+02:00",
    });
    assert.equal(normalizeDate("2024-01-03"), dateOnlyToISO("2024-01-03"));
    assert.equal(new Date(dateOnlyToISO("2024-01-03")).getDate(), 3);
    assert.equal(normalizeDate("2024-13-03"), "2024-13-03");
    assert.equal(normalizeDate("last tuesday"), "last tuesday");
    assert.equal(normalizeDate(""), null);
  });
  test("legacy date/lastmod aliases", () => {
    const d = deriveDates({ date: "2024-01-03", lastmod: "2024-02-04" }, "x.md", { ctime: T0, mtime: T1 });
    assert.equal(d.created, dateOnlyToISO("2024-01-03"));
    assert.equal(d.updated, dateOnlyToISO("2024-02-04"));
  });
  test("path rung, then file times", () => {
    const T2 = Date.UTC(2024, 0, 1, 12);
    const p = derive("blog/2023/12/17/another-post.md", fixture("another-post.md"), true, { ctime: T0, mtime: T2 });
    assert.equal(p.created, dateOnlyToISO("2023-12-17"));
    assert.equal(p.updated, toLocalISO(new Date(T2)));
    const q = derive("wiki/x.md", "No dates anywhere.");
    assert.equal(q.created, toLocalISO(new Date(T0)));
    assert.equal(q.updated, toLocalISO(new Date(T1)));
  });
  test("updated is never earlier than created", () => {
    const p = derive("blog/2026/01/01/x.md", "Body.", true, { ctime: T0, mtime: T1 });
    assert.equal(p.created, dateOnlyToISO("2026-01-01"));
    assert.equal(p.updated, p.created);
  });
  test("toLocalISO has seconds precision and an offset", () => {
    assert.match(toLocalISO(new Date(T0)), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });
});

describe("summary and body", () => {
  test("at most 30 words, whitespace collapsed, markdown stripped", () => {
    const words = Array.from({ length: 40 }, (_, i) => `w${i}`).join("\n\n  ");
    const p = derive("x.md", `**bold** and [a link](http://x) then ${words}`);
    assert.equal(p.summary.split(" ").length, 30);
    assert.ok(p.summary.startsWith("bold and a link then w0 w1"), p.summary);
  });
  test("fenced code content is kept for the index, fence lines are not", () => {
    const p = derive("wiki/Computer-Science/Free-Software.md", fixture("Free-Software.md"));
    assert.ok(p.body.includes('echo "#not-a-tag"'), p.body);
    assert.ok(!p.body.includes("```"));
    assert.ok(!p.body.includes("sh a hashtag"));
  });
  test("plainText handles wikilinks, embeds, headings, lists, quotes, tables", () => {
    const md = "## Head\n> quote\n- [ ] task [[Note|alias]] ![[img.png]]\n1. one\n\n| a | b |\n|---|---|\n| c | d |\n<b>html</b> ~~gone~~ snake_case";
    assert.equal(plainText(md), "Head quote task alias img.png one a b c d html gone snake_case");
  });
  test("firstWords and removeFirstH1", () => {
    assert.equal(firstWords("a b c d", 2), "a b");
    assert.equal(removeFirstH1("intro\n# Title\nbody\n# Second"), "intro\nbody\n# Second");
    assert.equal(removeFirstH1("#tag not a heading\n"), "#tag not a heading\n");
  });
});

describe("bookmarks", () => {
  test("bookmark: string", () => {
    const p = derive("wiki/Projects/PublicTxt/Obsidian.md.md", fixture("Obsidian.md.md"));
    assert.deepEqual(p.bookmarks, ["https://obsidian.md"]);
    assert.equal(p.title, "Obsidian.md");
    assert.deepEqual(p.tags, ["tools", "closed_source", "publictxt", "tool"]);
  });
  test("bookmarks: list, URLs only", () => {
    const p = derive("notes/x.md", fixture("legacy-tag.md"));
    assert.deepEqual(p.bookmarks, ["https://example.org/a/", "https://example.org/b"]);
  });
});

describe("splitFrontMatter", () => {
  test("with, without, empty and CRLF front matter", () => {
    assert.deepEqual(splitFrontMatter("---\na: 1\n---\nbody"), { frontMatter: "a: 1", body: "body" });
    assert.deepEqual(splitFrontMatter("body"), { frontMatter: null, body: "body" });
    assert.deepEqual(splitFrontMatter("---\n---\nbody"), { frontMatter: "", body: "body" });
    assert.deepEqual(splitFrontMatter("---\r\na: 1\r\n---\r\nbody"), { frontMatter: "a: 1", body: "body" });
    assert.deepEqual(splitFrontMatter("--- not front matter\n"), { frontMatter: null, body: "--- not front matter\n" });
  });
  test("url mirrors path", () => {
    const p = derive("wiki/x.md", "Body.");
    assert.equal(p.url, "wiki/x.md");
    assert.equal(p.path, "wiki/x.md");
  });
});
