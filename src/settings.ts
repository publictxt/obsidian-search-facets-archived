// Settings types and defaults. Kept free of Obsidian runtime imports so the
// pure modules and scripts that read the defaults run under plain Node.

export type OpenIn = "current" | "tab" | "split";

export interface PublicTxtSearchSettings {
  /** Folder paths (vault-relative) whose notes are not pages. Matched on folder boundaries. */
  excludedFolders: string[];
  /** Merge inline `#hashtags` from the body into a page's tags. */
  includeInlineTags: boolean;
  /** Where a card's title link opens the note. */
  openIn: OpenIn;
  /** The site's `PAGE` constant: cards shown per "Show more". */
  resultsPerBatch: number;
}

export const DEFAULT_SETTINGS: PublicTxtSearchSettings = {
  excludedFolders: [".obsidian", ".trash", ".git", "media"],
  includeInlineTags: true,
  openIn: "current",
  resultsPerBatch: 20,
};

export const OPEN_IN_LABELS: Record<OpenIn, string> = {
  current: "Current tab",
  tab: "New tab",
  split: "Split",
};

/**
 * Settings as read from data.json, with every field checked and anything
 * missing or malformed replaced by its default, so a hand-edited or
 * half-written file can never stop the index from building.
 */
export function normalizeSettings(raw: unknown): PublicTxtSearchSettings {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const s: PublicTxtSearchSettings = { ...DEFAULT_SETTINGS, excludedFolders: [...DEFAULT_SETTINGS.excludedFolders] };
  if (Array.isArray(r.excludedFolders)) {
    s.excludedFolders = r.excludedFolders.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
  } else if (typeof r.excludedFolders === "string") {
    s.excludedFolders = r.excludedFolders.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean);
  }
  if (typeof r.includeInlineTags === "boolean") s.includeInlineTags = r.includeInlineTags;
  if (typeof r.openIn === "string" && r.openIn in OPEN_IN_LABELS) s.openIn = r.openIn as OpenIn;
  const n = typeof r.resultsPerBatch === "string" ? Number.parseInt(r.resultsPerBatch, 10) : r.resultsPerBatch;
  if (typeof n === "number" && Number.isInteger(n) && n >= 1) s.resultsPerBatch = n;
  return s;
}
