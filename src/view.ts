import { ItemView, type HoverPopover, type PaneType, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { card } from "./cards.ts";
import { normalizeTag } from "./derive.ts";
import { excerpt } from "./excerpt.ts";
import { emptySearchState, sortedKeys, type Counts, type SearchHit, type SearchState } from "./index.ts";
import type PublicTxtSearchPlugin from "./main.ts";
import type { OpenIn } from "./settings.ts";

export const VIEW_TYPE = "publictxt-search";

const INPUT_DEBOUNCE_MS = 200;
/** Below this content width the filters stack above the results, as the site does under 900px. */
const NARROW_PX = 900;

function paneFor(openIn: OpenIn): PaneType | false {
  return openIn === "current" ? false : openIn;
}

/** A search state from anything the workspace layout or a command hands us. */
export function toSearchState(raw: unknown): SearchState {
  const state = emptySearchState();
  if (typeof raw !== "object" || raw === null) return state;
  const r = raw as Record<string, unknown>;
  if (typeof r.q === "string") state.q = r.q;
  if (typeof r.type === "string") state.type = r.type.trim();
  const tags = Array.isArray(r.tags) ? r.tags : typeof r.tags === "string" ? [r.tags] : [];
  for (const t of tags) {
    const n = typeof t === "string" ? normalizeTag(t) : "";
    if (n && !state.tags.includes(n)) state.tags.push(n);
  }
  return state;
}

export class SearchView extends ItemView {
  plugin: PublicTxtSearchPlugin;
  state: SearchState = emptySearchState();
  /** For Page Preview: the view is the hover parent of its title links. */
  hoverPopover: HoverPopover | null = null;

  private rootEl: HTMLElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private typeEl: HTMLElement | null = null;
  private tagEl: HTMLElement | null = null;
  private tagHintEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private moreEl: HTMLButtonElement | null = null;
  private inputTimer: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private current: SearchHit[] = [];
  private shown = 0;
  private hasQuery = false;

  constructor(leaf: WorkspaceLeaf, plugin: PublicTxtSearchPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.navigation = true;
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

  // ---- state (the site keeps this in ?q=&type=&tag=) ----------------------------

  getState(): Record<string, unknown> {
    return { q: this.state.q, type: this.state.type, tags: [...this.state.tags] };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    // Obsidian may call this before onOpen; the state is kept and drawn once the view exists.
    // If the index is not built yet, run() shows "Indexing…" and the build's "changed" event re-runs it.
    if (typeof state === "object" && state !== null && ("q" in state || "type" in state || "tags" in state)) {
      this.state = toSearchState(state);
      if (this.inputEl) this.inputEl.value = this.state.q;
      this.run();
    }
    await super.setState(state, result);
  }

  /** Seed the search from a command; anything not given is cleared. */
  setSearch(state: Partial<SearchState>): void {
    this.state = toSearchState(state);
    if (this.inputEl) this.inputEl.value = this.state.q;
    this.run();
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
    this.inputEl.value = this.state.q;
    this.inputEl.addEventListener("input", () => {
      if (this.inputTimer !== null) window.clearTimeout(this.inputTimer);
      this.inputTimer = window.setTimeout(() => {
        this.inputTimer = null;
        this.state.q = this.inputEl?.value ?? "";
        this.run();
      }, INPUT_DEBOUNCE_MS);
    });
    const clear = form.createEl("button", { cls: "btn-ghost", text: "Clear all", type: "button" });
    clear.addEventListener("click", () => this.clear());

    const layout = root.createDiv({ cls: "search-layout" });

    const filters = layout.createEl("aside", { cls: "search-filters" });
    const typeGroup = filters.createDiv({ cls: "filter-group" });
    typeGroup.createEl("h3", { cls: "side-heading", text: "Type" });
    this.typeEl = typeGroup.createDiv({ cls: "chip-row" });
    const tagGroup = filters.createDiv({ cls: "filter-group" });
    const tagHeading = tagGroup.createEl("h3", { cls: "side-heading", text: "Tags " });
    this.tagHintEl = tagHeading.createSpan({ cls: "muted" });
    this.tagEl = tagGroup.createDiv({ cls: "chip-row" });

    const results = layout.createEl("section", { cls: "search-results", attr: { "aria-live": "polite" } });
    this.statusEl = results.createEl("p", { cls: "muted search-status" });
    this.listEl = results.createEl("ol", { cls: "result-list" });
    this.moreEl = results.createEl("button", { cls: "btn-ghost search-more", text: "Show more", type: "button" });
    this.moreEl.hidden = true;
    this.moreEl.addEventListener("click", () => this.showMore());

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
    this.rootEl = this.inputEl = this.typeEl = this.tagEl = this.tagHintEl = this.statusEl = this.listEl = null;
    this.moreEl = null;
  }

  // ---- filter chips ---------------------------------------------------------------

  private chip(kind: "type" | "tag", name: string, count: number, active: boolean): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip filter-chip" + (active ? " active" : "") + (count === 0 ? " empty" : "");
    b.setAttribute("aria-pressed", String(active));
    b.append((kind === "tag" ? "#" : "") + name);
    const n = document.createElement("span");
    n.className = "count";
    n.textContent = String(count);
    b.append(n);
    b.addEventListener("click", () => {
      if (kind === "type") {
        this.state.type = this.state.type === name ? "" : name;
        this.run();
      } else this.toggleTag(name);
    });
    return b;
  }

  /** Every known chip, with its count within the current result set; order comes from the totals. */
  private renderFilters(counts: Counts): void {
    if (!this.typeEl || !this.tagEl || !this.tagHintEl) return;
    const all = this.plugin.index.totals;
    this.typeEl.replaceChildren(
      ...sortedKeys(all.type).map((n) => this.chip("type", n, counts.type[n] ?? 0, this.state.type === n)),
    );
    this.tagEl.replaceChildren(
      ...sortedKeys(all.tag).map((n) => this.chip("tag", n, counts.tag[n] ?? 0, this.state.tags.includes(n))),
    );
    this.tagHintEl.setText(this.state.tags.length > 1 ? "— all selected must match" : "");
  }

  // ---- search (from txt-hugo/assets/js/search.js) --------------------------------

  toggleTag(t: string): void {
    const i = this.state.tags.indexOf(t);
    if (i === -1) this.state.tags.push(t);
    else this.state.tags.splice(i, 1);
    this.run();
  }

  /** The "Clear all" button: reset everything and focus the input. */
  clear(): void {
    this.state = emptySearchState();
    if (this.inputEl) this.inputEl.value = "";
    this.run();
    this.inputEl?.focus();
  }

  run(): void {
    if (!this.listEl || !this.statusEl || !this.moreEl) return;
    this.app.workspace.requestSaveLayout();
    if (!this.plugin.indexReady) {
      this.statusEl.setText("Indexing…");
      return;
    }
    const res = this.plugin.index.search(this.state);
    this.current = res.hits;
    this.hasQuery = res.hasQuery;
    this.shown = 0;
    this.listEl.empty();
    this.renderFilters(res.counts);
    const n = this.current.length;
    const what = [res.hasQuery ? `“${this.state.q}”` : "", this.state.type, ...this.state.tags.map((t) => "#" + t)]
      .filter(Boolean)
      .join(" · ");
    this.statusEl.setText(`${n} page${n === 1 ? "" : "s"}` + (what ? ` — ${what}` : ""));
    this.showMore();
  }

  showMore(): void {
    if (!this.listEl || !this.moreEl) return;
    const batch = this.current.slice(this.shown, this.shown + this.plugin.settings.resultsPerBatch);
    for (const hit of batch) this.listEl.appendChild(this.resultCard(hit));
    this.shown += batch.length;
    this.moreEl.hidden = this.shown >= this.current.length;
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
