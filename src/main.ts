import { Events, Plugin, type TFile, type WorkspaceLeaf } from "obsidian";
import { derivePage, isPage, type PageItem } from "./derive.ts";
import { PageIndex } from "./index.ts";
import { DEFAULT_SETTINGS, type PublicTxtSearchSettings } from "./settings.ts";
import { SearchView, VIEW_TYPE } from "./view.ts";

const READ_BATCH = 64;

export default class PublicTxtSearchPlugin extends Plugin {
  settings: PublicTxtSearchSettings = DEFAULT_SETTINGS;
  index = new PageIndex();
  indexReady = false;
  /** Fires "changed" whenever the index contents or totals change. */
  indexEvents = new Events();

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE, (leaf) => new SearchView(leaf, this));

    this.addRibbonIcon("search", "Open PublicTxt search", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open",
      name: "Open PublicTxt search",
      callback: () => {
        void this.activateView();
      },
    });

    this.app.workspace.onLayoutReady(() => {
      void this.buildIndex();
    });
  }

  onunload(): void {
    // Obsidian detaches leaves of unregistered view types itself.
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // ---- index ------------------------------------------------------------------

  /** The page record for a vault file, or null when it is not a page. */
  async pageFor(file: TFile): Promise<PageItem | null> {
    if (!isPage(file, this.settings.excludedFolders)) return null;
    const text = await this.app.vault.cachedRead(file);
    const cache = this.app.metadataCache.getFileCache(file);
    return derivePage(file, cache, text, { includeInlineTags: this.settings.includeInlineTags });
  }

  /** Index every page in the vault from scratch. */
  async buildIndex(): Promise<void> {
    this.indexReady = false;
    this.index.clear();
    const files = this.app.vault.getMarkdownFiles();
    for (let i = 0; i < files.length; i += READ_BATCH) {
      const items = await Promise.all(files.slice(i, i + READ_BATCH).map((f) => this.pageFor(f)));
      for (const item of items) if (item) this.index.put(item);
    }
    this.index.recomputeTotals();
    this.indexReady = true;
    this.indexEvents.trigger("changed");
  }

  // ---- view -------------------------------------------------------------------

  /** The one search view: reveal it if open, otherwise open it as a tab. */
  async activateView(): Promise<SearchView | null> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
    return leaf.view instanceof SearchView ? leaf.view : null;
  }
}
