import { ItemView, type HoverPopover, type PaneType, type WorkspaceLeaf } from "obsidian";
import { card } from "./cards.ts";
import { excerpt } from "./excerpt.ts";
import { emptySearchState, type SearchHit, type SearchState } from "./index.ts";
import type PublicTxtSearchPlugin from "./main.ts";
import type { OpenIn } from "./settings.ts";

export const VIEW_TYPE = "publictxt-search";

const INPUT_DEBOUNCE_MS = 200;
/** Below this content width the filters stack above the results, as the site does under 900px. */
const NARROW_PX = 900;

function paneFor(openIn: OpenIn): PaneType | false {
  return openIn === "current" ? false : openIn;
}

export class SearchView extends ItemView {
  plugin: PublicTxtSearchPlugin;
  state: SearchState = emptySearchState();
  /** For Page Preview: the view is the hover parent of its title links. */
  hoverPopover: HoverPopover | null = null;

  private rootEl: HTMLElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private listEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private inputTimer: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private current: SearchHit[] = [];
  private hasQuery = false;

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

  // ---- layout (from txt-hugo/layouts/search.html) ------------------------------

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    const root = (this.rootEl = this.contentEl.createDiv({ cls: "publictxt-search" }));

    root.createEl("p", {
      cls: "muted search-intro",
      text: "Full-text search and tag browsing. Pick any combination of tags — with or without a search term — to find pages matching all of them.",
    });

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

    const layout = root.createDiv({ cls: "search-layout" });
    const results = layout.createEl("section", { cls: "search-results", attr: { "aria-live": "polite" } });
    this.statusEl = results.createEl("p", { cls: "muted search-status" });
    this.listEl = results.createEl("ol", { cls: "result-list" });

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width ?? this.contentEl.clientWidth;
        root.toggleClass("is-narrow", width < NARROW_PX);
      });
      this.resizeObserver.observe(this.contentEl);
    }

    this.registerEvent(this.plugin.indexEvents.on("changed", () => this.run()));
    this.run();
    if (!this.state.q) this.inputEl.focus();
  }

  async onClose(): Promise<void> {
    if (this.inputTimer !== null) window.clearTimeout(this.inputTimer);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.rootEl = this.inputEl = this.listEl = this.statusEl = null;
  }

  // ---- search (from txt-hugo/assets/js/search.js) --------------------------------

  toggleTag(t: string): void {
    const i = this.state.tags.indexOf(t);
    if (i === -1) this.state.tags.push(t);
    else this.state.tags.splice(i, 1);
    this.run();
  }

  run(): void {
    if (!this.listEl || !this.statusEl) return;
    if (!this.plugin.indexReady) {
      this.statusEl.setText("Indexing…");
      return;
    }
    const res = this.plugin.index.search(this.state);
    this.current = res.hits;
    this.hasQuery = res.hasQuery;
    this.listEl.empty();
    const n = this.current.length;
    const what = [res.hasQuery ? `“${this.state.q}”` : "", this.state.type, ...this.state.tags.map((t) => "#" + t)]
      .filter(Boolean)
      .join(" · ");
    this.statusEl.setText(`${n} page${n === 1 ? "" : "s"}` + (what ? ` — ${what}` : ""));
    for (const hit of this.current) this.listEl.appendChild(this.resultCard(hit));
  }

  /** A card for one hit, with the note-opening and preview behaviour the site's links get from the browser. */
  private resultCard(hit: SearchHit): HTMLLIElement {
    const { item } = hit;
    const li = card(item, {
      activeTags: new Set(this.state.tags),
      onTag: (t) => this.toggleTag(t),
      summaryHTML: this.hasQuery ? excerpt(item.body, hit.terms) : "",
    });

    const title = li.querySelector<HTMLAnchorElement>("a.page-card-title");
    if (title) {
      title.addEventListener("click", (e) => {
        e.preventDefault();
        this.openNote(item.path, e);
      });
      title.addEventListener("mouseover", (event) => {
        this.app.workspace.trigger("hover-link", {
          event,
          source: VIEW_TYPE,
          hoverParent: this,
          targetEl: title,
          linktext: item.path,
          sourcePath: "",
        });
      });
    }

    li.querySelectorAll<HTMLAnchorElement>("a.chip-link").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        window.open(a.href, "_blank", "noopener");
      });
    });
    return li;
  }

  private openNote(path: string, e: MouseEvent): void {
    const pane: PaneType | false = e.ctrlKey || e.metaKey ? "tab" : paneFor(this.plugin.settings.openIn);
    void this.app.workspace.openLinkText(path, "", pane);
  }
}
