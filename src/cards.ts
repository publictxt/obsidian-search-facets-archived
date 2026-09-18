// Port of txt-hugo/assets/js/cards.js, function for function. Takes the item
// shape of the site's index.json; `tagURL` and the link branch of `tagChip`
// are dropped because every tag chip here is a filter button.

import type { PageItem } from "./derive.ts";

export type CardItem = Pick<
  PageItem,
  "url" | "title" | "type" | "tags" | "created" | "updated" | "summary" | "bookmarks"
>;

export interface CardOptions {
  /** Tag names to mark as selected. */
  activeTags?: Set<string>;
  /** Called with the tag name when a tag chip is clicked. */
  onTag?: (name: string) => void;
  /** Pre-rendered HTML (a search excerpt with <mark>) in place of item.summary. */
  summaryHTML?: string;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHTML(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

const DAY = 86400e3;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2 Jan 2006", the same form Hugo's page-date.html renders. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Same rule as page-date.html: show "updated" only when it is more than a day after "created". */
export function dateHTML(item: Pick<CardItem, "created" | "updated">): string {
  if (!item.created) return "";
  let html = `<time class="muted" datetime="${escapeHTML(item.created)}">${escapeHTML(formatDate(item.created))}</time>`;
  if (item.updated && new Date(item.updated).getTime() - new Date(item.created).getTime() > DAY) {
    html += ` <span class="muted">· updated <time datetime="${escapeHTML(item.updated)}">${escapeHTML(formatDate(item.updated))}</time></span>`;
  }
  return html;
}

/** Same as bookmark-label.html: scheme, www. and trailing slash dropped. */
export function bookmarkLabel(url: string): string {
  return "↗ " + url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

/** A page card. Behaviour beyond tag chips (opening the note, hover preview) is attached by the view. */
export function card(item: CardItem, opts: CardOptions = {}): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "page-card";
  const tags = item.tags || [];
  const active = opts.activeTags || new Set<string>();
  const tagChip = (t: string) =>
    `<button type="button" class="chip filter-chip${active.has(t) ? " active" : ""}" data-tag="${escapeHTML(t)}" aria-pressed="${active.has(t)}">#${escapeHTML(t)}</button>`;
  li.innerHTML = `
    <div class="page-card-head">
      <a class="page-card-title" href="${escapeHTML(item.url)}">${escapeHTML(item.title || item.url)}</a>
      ${item.type ? `<span class="chip chip-type">${escapeHTML(item.type)}</span>` : ""}
    </div>
    ${dateHTML(item)}
    ${
      (item.bookmarks || []).length
        ? `<div class="chip-row bookmark-links">${item.bookmarks
            .map((u) => `<a class="chip chip-link" href="${escapeHTML(u)}" rel="noopener external" target="_blank">${escapeHTML(bookmarkLabel(u))}</a>`)
            .join("")}</div>`
        : ""
    }
    ${
      opts.summaryHTML
        ? `<p class="page-card-summary">${opts.summaryHTML}</p>`
        : item.summary
          ? `<p class="page-card-summary">${escapeHTML(item.summary)}</p>`
          : ""
    }
    ${tags.length ? `<div class="chip-row">${tags.slice(0, 6).map(tagChip).join("")}</div>` : ""}`;
  if (opts.onTag) {
    const onTag = opts.onTag;
    li.querySelectorAll<HTMLElement>("[data-tag]").forEach((b) =>
      b.addEventListener("click", () => onTag(b.dataset.tag ?? "")),
    );
  }
  return li;
}
