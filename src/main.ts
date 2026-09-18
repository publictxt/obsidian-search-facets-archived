import { Events, Plugin, TFile, TFolder, type TAbstractFile, type WorkspaceLeaf } from "obsidian";
import { registerCommands } from "./commands.ts";
import { derivePage, isPage, type PageItem } from "./derive.ts";
import { PageIndex } from "./index.ts";
import { PublicTxtSearchSettingTab } from "./settings-tab.ts";
import { DEFAULT_SETTINGS, normalizeSettings, type PublicTxtSearchSettings } from "./settings.ts";
import { SearchView, VIEW_TYPE } from "./view.ts";

const READ_BATCH = 64;
/** Per-path debounce for vault and cache events. */
const UPDATE_DEBOUNCE_MS = 300;
/** Totals are recomputed once after a burst of updates. */
const TOTALS_DEBOUNCE_MS = 100;

export default class PublicTxtSearchPlugin extends Plugin {
  settings: PublicTxtSearchSettings = DEFAULT_SETTINGS;
  index = new PageIndex();
  indexReady = false;
  /** Fires "changed" whenever the index contents or totals change. */
  indexEvents = new Events();

  private pendingUpdates = new Map<string, number>();
  private totalsTimer: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE, (leaf) => new SearchView(leaf, this));
    this.registerHoverLinkSource(VIEW_TYPE, { display: "PublicTxt Search", defaultMod: true });
    this.addSettingTab(new PublicTxtSearchSettingTab(this.app, this));

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

    registerCommands(this);

    this.app.workspace.onLayoutReady(() => {
      void this.buildIndex();
      this.registerEvent(this.app.metadataCache.on("changed", (file) => this.scheduleUpdate(file.path)));
      this.registerEvent(this.app.vault.on("delete", (file) => this.onDeleted(file)));
      this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.onRenamed(file, oldPath)));
    });
  }

  onunload(): void {
    for (const timer of this.pendingUpdates.values()) window.clearTimeout(timer);
    this.pendingUpdates.clear();
    if (this.totalsTimer !== null) window.clearTimeout(this.totalsTimer);
  }

  async loadSettings(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // ---- index ------------------------------------------------------------------

  /**
   * The page record for a vault file, or null when it is not a page. A file
   * that cannot be read or derived is logged and skipped rather than allowed
   * to abort a whole index build.
   */
  async pageFor(file: TFile): Promise<PageItem | null> {
    if (!isPage(file, this.settings.excludedFolders)) return null;
    try {
      const text = await this.app.vault.cachedRead(file);
      const cache = this.app.metadataCache.getFileCache(file);
      return derivePage(file, cache, text, { includeInlineTags: this.settings.includeInlineTags });
    } catch (err) {
      console.error(`PublicTxt Search: could not index ${file.path}`, err);
      return null;
    }
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

  // ---- live updates -------------------------------------------------------------

  /** Re-derive one path after a quiet 300 ms; a path that no longer holds a page is dropped. */
  private scheduleUpdate(path: string): void {
    const pending = this.pendingUpdates.get(path);
    if (pending !== undefined) window.clearTimeout(pending);
    this.pendingUpdates.set(
      path,
      window.setTimeout(() => {
        this.pendingUpdates.delete(path);
        void this.refreshPath(path);
      }, UPDATE_DEBOUNCE_MS),
    );
  }

  private async refreshPath(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    const item = file instanceof TFile ? await this.pageFor(file) : null;
    if (item) this.index.put(item);
    else if (!this.index.remove(path)) return;
    this.scheduleTotals();
  }

  private removeUnder(folderPath: string): boolean {
    let removed = false;
    for (const item of this.index.all()) {
      if (item.path.startsWith(folderPath + "/")) removed = this.index.remove(item.path) || removed;
    }
    return removed;
  }

  private onDeleted(file: TAbstractFile): void {
    if (file instanceof TFolder) {
      if (this.removeUnder(file.path)) this.scheduleTotals();
    } else if (this.index.remove(file.path)) this.scheduleTotals();
  }

  private onRenamed(file: TAbstractFile, oldPath: string): void {
    if (file instanceof TFolder) {
      this.removeUnder(oldPath);
      for (const f of this.app.vault.getMarkdownFiles()) {
        if (f.path.startsWith(file.path + "/")) this.scheduleUpdate(f.path);
      }
    } else {
      this.index.remove(oldPath);
      this.scheduleUpdate(file.path);
    }
    this.scheduleTotals();
  }

  /** Recompute totals once after a burst of updates and tell the view. */
  private scheduleTotals(): void {
    if (this.totalsTimer !== null) window.clearTimeout(this.totalsTimer);
    this.totalsTimer = window.setTimeout(() => {
      this.totalsTimer = null;
      if (!this.indexReady) return; // a full build is under way and will report itself
      this.index.recomputeTotals();
      this.indexEvents.trigger("changed");
    }, TOTALS_DEBOUNCE_MS);
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
