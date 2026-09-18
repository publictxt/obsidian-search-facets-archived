import { ItemView, type WorkspaceLeaf } from "obsidian";
import type PublicTxtSearchPlugin from "./main.ts";
import { emptySearchState, type SearchState } from "./index.ts";

export const VIEW_TYPE = "publictxt-search";

const INPUT_DEBOUNCE_MS = 200;

export class SearchView extends ItemView {
  plugin: PublicTxtSearchPlugin;
  state: SearchState = emptySearchState();

  private rootEl: HTMLElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private listEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private inputTimer: number | null = null;

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
    const root = (this.rootEl = this.contentEl.createDiv({ cls: "publictxt-search" }));

    const form = root.createEl("form", { cls: "search-form", attr: { role: "search" } });
    form.addEventListener("submit", (e) => e.preventDefault());
    this.inputEl = form.createEl("input", {
      type: "search",
      placeholder: "Search pages…",
      attr: { "aria-label": "Search text", autocomplete: "off" },
    });
    this.inputEl.addEventListener("input", () => {
      if (this.inputTimer !== null) window.clearTimeout(this.inputTimer);
      this.inputTimer = window.setTimeout(() => {
        this.inputTimer = null;
        this.state.q = this.inputEl?.value ?? "";
        this.run();
      }, INPUT_DEBOUNCE_MS);
    });

    const results = root.createEl("section", { cls: "search-results", attr: { "aria-live": "polite" } });
    this.statusEl = results.createEl("p", { cls: "muted search-status" });
    this.listEl = results.createEl("ul", { cls: "result-list" });

    this.registerEvent(this.plugin.indexEvents.on("changed", () => this.run()));
    this.run();
    if (!this.state.q) this.inputEl.focus();
  }

  async onClose(): Promise<void> {
    if (this.inputTimer !== null) window.clearTimeout(this.inputTimer);
    this.rootEl = this.inputEl = this.listEl = this.statusEl = null;
  }

  run(): void {
    if (!this.listEl || !this.statusEl) return;
    if (!this.plugin.indexReady) {
      this.statusEl.setText("Indexing…");
      return;
    }
    const res = this.plugin.index.search(this.state);
    const n = res.hits.length;
    this.statusEl.setText(`${n} page${n === 1 ? "" : "s"}${res.hasQuery ? ` — “${this.state.q}”` : ""}`);
    this.listEl.empty();
    for (const { item } of res.hits) {
      const li = this.listEl.createEl("li");
      const a = li.createEl("a", { text: item.title, href: "#" });
      a.addEventListener("click", (e) => {
        e.preventDefault();
        void this.app.workspace.openLinkText(item.path, "", e.ctrlKey || e.metaKey ? "tab" : false);
      });
    }
  }
}
