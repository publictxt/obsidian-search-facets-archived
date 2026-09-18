import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { excerpt } from "../src/excerpt.ts";

const words = (n: number, prefix = "w") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe("excerpt", () => {
  test("marks the matched term with context either side", () => {
    const body = [...words(20), "Brain", ...words(20, "z")].join(" ");
    const html = excerpt(body, ["brain"], 3);
    assert.equal(html, "… w17 w18 w19 <mark>Brain</mark> z0 z1 z2 …");
  });

  test("no ellipsis at the edges; every matched term in the window is marked", () => {
    assert.equal(excerpt("the brain thinks about the brain", ["brain", "thinks"]), "the <mark>brain</mark> <mark>thinks</mark> about the <mark>brain</mark>");
  });

  test("matches inside punctuation and hashtags, escaping the rest", () => {
    assert.equal(excerpt("see #info-politics <now>", ["politics"]), "see #info-<mark>politics</mark> &lt;now&gt;");
  });

  test("empty when nothing matches or there is nothing to match", () => {
    assert.equal(excerpt("nothing here", ["brain"]), "");
    assert.equal(excerpt("", ["brain"]), "");
    assert.equal(excerpt("some words", []), "");
  });

  test("terms are compared case-insensitively", () => {
    assert.equal(excerpt("Free Software", ["FREE"]), "<mark>Free</mark> Software");
  });
});
