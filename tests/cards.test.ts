import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { bookmarkLabel, formatDate, showUpdated } from "../src/cards.ts";

describe("cards helpers", () => {
  test("formatDate renders '2 Jan 2006' and empty for junk", () => {
    assert.equal(formatDate("2024-01-02T12:00:00Z"), "2 Jan 2024");
    assert.equal(formatDate("2026-12-25T12:00:00+02:00"), "25 Dec 2026");
    assert.equal(formatDate("last tuesday"), "");
    assert.equal(formatDate(""), "");
  });

  test("showUpdated only when more than a day after created", () => {
    assert.equal(showUpdated({ created: "2024-01-02T12:00:00Z", updated: "" }), false);
    assert.equal(showUpdated({ created: "2024-01-02T12:00:00Z", updated: "2024-01-03T11:00:00Z" }), false);
    assert.equal(showUpdated({ created: "2024-01-02T12:00:00Z", updated: "2024-02-09T12:00:00Z" }), true);
    assert.equal(showUpdated({ created: "junk", updated: "2024-02-09T12:00:00Z" }), false);
  });

  test("bookmarkLabel drops scheme, www. and a trailing slash", () => {
    assert.equal(bookmarkLabel("https://www.example.org/thing/"), "↗ example.org/thing");
    assert.equal(bookmarkLabel("http://example.org"), "↗ example.org");
    assert.equal(bookmarkLabel("https://obsidian.md"), "↗ obsidian.md");
  });
});
