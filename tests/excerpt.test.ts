import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { excerpt, type Segment } from "../src/excerpt.ts";

const words = (n: number, prefix = "w") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
/** Segments as a string with marked terms in brackets, for readable assertions. */
const render = (segs: Segment[]) => segs.map((s) => (s.mark ? `[${s.text}]` : s.text)).join("");

describe("excerpt", () => {
  test("marks the matched term with context either side", () => {
    const body = [...words(20), "Brain", ...words(20, "z")].join(" ");
    assert.equal(render(excerpt(body, ["brain"], 3)), "… w17 w18 w19 [Brain] z0 z1 z2 …");
  });

  test("no ellipsis at the edges; every matched term in the window is marked", () => {
    assert.equal(render(excerpt("the brain thinks about the brain", ["brain", "thinks"])), "the [brain] [thinks] about the [brain]");
  });

  test("matches inside punctuation and hashtags; text is kept verbatim, not escaped", () => {
    assert.equal(render(excerpt("see #info-politics <now>", ["politics"])), "see #info-[politics] <now>");
  });

  test("plain runs are merged into single segments", () => {
    assert.deepEqual(excerpt("a b c", ["b"]), [
      { text: "a ", mark: false },
      { text: "b", mark: true },
      { text: " c", mark: false },
    ]);
  });

  test("empty when nothing matches or there is nothing to match", () => {
    assert.deepEqual(excerpt("nothing here", ["brain"]), []);
    assert.deepEqual(excerpt("", ["brain"]), []);
    assert.deepEqual(excerpt("some words", []), []);
  });

  test("terms are compared case-insensitively", () => {
    assert.equal(render(excerpt("Free Software", ["FREE"])), "[Free] Software");
  });
});
