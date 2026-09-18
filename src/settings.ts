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
