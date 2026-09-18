import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { bookmarkLabel, dateHTML, escapeHTML, formatDate } from "../src/cards.ts";

describe("cards helpers", () => {
  test("escapeHTML", () => {
    assert.equal(escapeHTML(`<a href="x">Tom & Jerry's</a>`), "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;");
    assert.equal(escapeHTML(null), "");
    assert.equal(escapeHTML(undefined), "");
    assert.equal(escapeHTML(7), "7");
  });

  test("formatDate renders '2 Jan 2006' and empty for junk", () => {
    assert.equal(formatDate("2024-01-02T12:00:00Z"), "2 Jan 2024");
    assert.equal(formatDate("2026-12-25T12:00:00+02:00"), "25 Dec 2026");
    assert.equal(formatDate("last tuesday"), "");
    assert.equal(formatDate(""), "");
  });

  test("dateHTML shows updated only when more than a day after created", () => {
    assert.equal(dateHTML({ created: "", updated: "" }), "");
    const same = dateHTML({ created: "2024-01-02T12:00:00Z", updated: "2024-01-03T11:00:00Z" });
    assert.equal(same, `<time class="muted" datetime="2024-01-02T12:00:00Z">2 Jan 2024</time>`);
    const later = dateHTML({ created: "2024-01-02T12:00:00Z", updated: "2024-02-09T12:00:00Z" });
    assert.equal(
      later,
      `<time class="muted" datetime="2024-01-02T12:00:00Z">2 Jan 2024</time> <span class="muted">· updated <time datetime="2024-02-09T12:00:00Z">9 Feb 2024</time></span>`,
    );
  });

  test("bookmarkLabel drops scheme, www. and a trailing slash", () => {
    assert.equal(bookmarkLabel("https://www.example.org/thing/"), "↗ example.org/thing");
    assert.equal(bookmarkLabel("http://example.org"), "↗ example.org");
    assert.equal(bookmarkLabel("https://obsidian.md"), "↗ obsidian.md");
  });
});
