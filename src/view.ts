import { ItemView, type WorkspaceLeaf } from "obsidian";
import type PublicTxtSearchPlugin from "./main.ts";

export const VIEW_TYPE = "publictxt-search";

export class SearchView extends ItemView {
  plugin: PublicTxtSearchPlugin;
  private rootEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: PublicTxtSearchPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return "PublicTxt Search";
  }

  getIcon(): string {
    return "search";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.rootEl = this.contentEl.createDiv({ cls: "publictxt-search" });
  }

  async onClose(): Promise<void> {
    this.rootEl = null;
  }
}
