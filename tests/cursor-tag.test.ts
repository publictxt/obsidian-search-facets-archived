import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { fakeCache } from "./helpers/fake-cache.ts";
import { tagAtCursor } from "../src/cursor-tag.ts";

/** The tag at the given line/column of `text`. */
function at(text: string, line: number, ch: number): string | null {
  const lines = text.split("\n");
  const offset = lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0) + ch;
  return tagAtCursor(fakeCache(text), { line, ch, offset }, (n) => lines[n] ?? "");
}

describe("tagAtCursor", () => {
  test("inline hashtag, anywhere within it and just after it", () => {
    const text = "Some #Info-Politics text and #other";
    assert.equal(at(text, 0, 5), "info-politics");
    assert.equal(at(text, 0, 10), "info-politics");
    assert.equal(at(text, 0, 19), "info-politics");
    assert.equal(at(text, 0, 20), null);
    assert.equal(at(text, 0, 30), "other");
  });

  test("front matter inline list: the entry under the cursor, else the first", () => {
    const text = '---\ntags: [alpha, "beta gamma", delta]\n---\nbody';
    assert.equal(at(text, 1, 8), "alpha");
    assert.equal(at(text, 1, 18), "beta gamma");
    assert.equal(at(text, 1, 32), "delta");
    assert.equal(at(text, 1, 1), "alpha");
  });

  test("front matter scalar and legacy tag: key", () => {
    assert.equal(at("---\ntag: #Solo\n---\n", 1, 8), "solo");
    assert.equal(at("---\ntags: a, b\n---\n", 1, 9), "b");
  });

  test("front matter block list entries", () => {
    const text = "---\ntitle: x\ntags:\n  - one\n  - Two\nother:\n  - nope\n---\nbody";
    assert.equal(at(text, 3, 5), "one");
    assert.equal(at(text, 4, 5), "two");
    assert.equal(at(text, 6, 5), null);
    assert.equal(at(text, 2, 3), null);
    assert.equal(at(text, 1, 3), null);
  });

  test("nothing outside tags", () => {
    assert.equal(at("---\ntags: [a]\n---\nplain body", 3, 3), null);
    assert.equal(at("no front matter, no tags", 0, 3), null);
  });
});
