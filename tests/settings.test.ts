import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings.ts";

describe("normalizeSettings", () => {
  test("missing or non-object data gives the defaults", () => {
    assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
    assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
    assert.deepEqual(normalizeSettings("junk"), DEFAULT_SETTINGS);
    assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
  });

  test("valid values are kept", () => {
    const s = normalizeSettings({ excludedFolders: ["a", " b/ "], includeInlineTags: false, openIn: "split", resultsPerBatch: 5 });
    assert.deepEqual(s, { excludedFolders: ["a", "b/"], includeInlineTags: false, openIn: "split", resultsPerBatch: 5 });
  });

  test("malformed fields fall back to their default individually", () => {
    const s = normalizeSettings({ excludedFolders: 7, includeInlineTags: "yes", openIn: "window", resultsPerBatch: 0 });
    assert.deepEqual(s, DEFAULT_SETTINGS);
    assert.equal(normalizeSettings({ resultsPerBatch: -3 }).resultsPerBatch, 20);
    assert.equal(normalizeSettings({ resultsPerBatch: 2.5 }).resultsPerBatch, 20);
    assert.equal(normalizeSettings({ resultsPerBatch: "abc" }).resultsPerBatch, 20);
  });

  test("lenient forms: a string folder list and a numeric string batch size", () => {
    assert.deepEqual(normalizeSettings({ excludedFolders: "media\n.trash, drafts" }).excludedFolders, ["media", ".trash", "drafts"]);
    assert.deepEqual(normalizeSettings({ excludedFolders: ["ok", 3, null] }).excludedFolders, ["ok"]);
    assert.equal(normalizeSettings({ resultsPerBatch: "12" }).resultsPerBatch, 12);
  });

  test("returns a fresh array, never the shared default", () => {
    const s = normalizeSettings({});
    s.excludedFolders.push("x");
    assert.equal(DEFAULT_SETTINGS.excludedFolders.includes("x"), false);
  });
});
