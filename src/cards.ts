// Port of txt-hugo/assets/js/cards.js: the same card, built with DOM calls
// instead of an HTML string so no text from the vault is ever parsed as
// markup. `tagURL` and the link branch of `tagChip` are dropped because
// every tag chip here is a filter button.

import type { PageItem } from "./derive.ts";
import type { Segment } from "./excerpt.ts";

export type CardItem = Pick<
  PageItem,
  "url" | "title" | "type" | "tags" | "created" | "updated" | "summary" | "bookmarks"
>;

export interface CardOptions {
  /** Tag names to mark as selected. */
  activeTags?: Set<string>;
  /** Called with the tag name when a tag chip is clicked. */
  onTag?: (name: string) => void;
  /** A search excerpt, shown in place of item.summary when non-empty. */
  excerpt?: Segment[];
}

const DAY = 86400e3;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Tag chips shown per card, as on the site. */
export const CARD_TAGS = 6;

/** "2 Jan 2006", the same form Hugo's page-date.html renders. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Same rule as page-date.html: show "updated" only when it is more than a day after "created". */
export function showUpdated(item: Pick<CardItem, "created" | "updated">): boolean {
  return !!item.updated && new Date(item.updated).getTime() - new Date(item.created).getTime() > DAY;
}

/** Same as bookmark-label.html: scheme, www. and trailing slash dropped. */
export function bookmarkLabel(url: string): string {
  return "↗ " + url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

/**
 * A page card. Behaviour beyond tag chips (opening the note, hover preview) is
 * attached by the view; the title link carries no real href, since a vault path
 * is not a URL the app could navigate to.
 */
export function card(item: CardItem, opts: CardOptions = {}): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "page-card";
  const active = opts.activeTags ?? new Set<string>();

  const head = li.createDiv({ cls: "page-card-head" });
  head.createEl("a", { cls: "page-card-title", href: "#", text: item.title || item.url });
  if (item.type) head.createSpan({ cls: "chip chip-type", text: item.type });

  if (item.created) {
    li.createEl("time", { cls: "muted", text: formatDate(item.created), attr: { datetime: item.created } });
    if (showUpdated(item)) {
      li.appendText(" ");
      const span = li.createSpan({ cls: "muted", text: "· updated " });
      span.createEl("time", { text: formatDate(item.updated), attr: { datetime: item.updated } });
    }
  }

  const bookmarks = item.bookmarks ?? [];
  if (bookmarks.length) {
    const row = li.createDiv({ cls: "chip-row bookmark-links" });
    for (const u of bookmarks) {
      row.createEl("a", {
        cls: "chip chip-link",
        href: u,
        text: bookmarkLabel(u),
        attr: { rel: "noopener external", target: "_blank" },
      });
    }
  }

  if (opts.excerpt?.length) {
    const p = li.createEl("p", { cls: "page-card-summary" });
    for (const s of opts.excerpt) {
      if (s.mark) p.createEl("mark", { text: s.text });
      else p.appendText(s.text);
    }
  } else if (item.summary) {
    li.createEl("p", { cls: "page-card-summary", text: item.summary });
  }

  const tags = (item.tags ?? []).slice(0, CARD_TAGS);
  if (tags.length) {
    const row = li.createDiv({ cls: "chip-row" });
    for (const t of tags) {
      const on = active.has(t);
      const b = row.createEl("button", {
        cls: ["chip", "filter-chip", ...(on ? ["active"] : [])],
        type: "button",
        text: "#" + t,
        attr: { "data-tag": t, "aria-pressed": String(on) },
      });
      const onTag = opts.onTag;
      if (onTag) b.addEventListener("click", () => onTag(t));
    }
  }
  return li;
}
