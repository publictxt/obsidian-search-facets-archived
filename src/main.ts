import { Plugin, type WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, type PublicTxtSearchSettings } from "./settings.ts";
import { SearchView, VIEW_TYPE } from "./view.ts";

export default class PublicTxtSearchPlugin extends Plugin {
  settings: PublicTxtSearchSettings = DEFAULT_SETTINGS;

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
