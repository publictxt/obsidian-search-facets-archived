// Commands that seed the search view: the vault-side equivalent of a site
// tag page's "combine with other tags" link.

import { tagAtCursor } from "./cursor-tag.ts";
import { isPage } from "./derive.ts";
import type { SearchState } from "./index.ts";
import type PublicTxtSearchPlugin from "./main.ts";
import { SearchView, VIEW_TYPE } from "./view.ts";

/** Open or focus the view and replace its search. */
async function openSearch(plugin: PublicTxtSearchPlugin, state: Partial<SearchState>): Promise<void> {
  const view = await plugin.activateView();
  view?.setSearch(state);
}

export function registerCommands(plugin: PublicTxtSearchPlugin): void {
  const { app } = plugin;

  plugin.addCommand({
    id: "search-tag-under-cursor",
    name: "Search for tag under cursor",
    editorCheckCallback: (checking, editor, ctx) => {
      const file = ctx.file;
      if (!file) return false;
      const cursor = editor.getCursor();
      const tag = tagAtCursor(
        app.metadataCache.getFileCache(file),
        { line: cursor.line, ch: cursor.ch, offset: editor.posToOffset(cursor) },
        (n) => editor.getLine(n),
      );
      if (!tag) return false;
      if (!checking) void openSearch(plugin, { tags: [tag] });
      return true;
    },
  });

  plugin.addCommand({
    id: "search-like-this",
    name: "Search pages like this one",
    checkCallback: (checking) => {
      const file = app.workspace.getActiveFile();
      if (!file || !isPage(file, plugin.settings.excludedFolders)) return false;
      if (!checking) {
        void (async () => {
          const item = plugin.index.get(file.path) ?? (await plugin.pageFor(file));
          if (item) await openSearch(plugin, { type: item.type, tags: [...item.tags] });
        })();
      }
      return true;
    },
  });

  plugin.addCommand({
    id: "clear",
    name: "Clear search",
    checkCallback: (checking) => {
      const view = app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view;
      if (!(view instanceof SearchView)) return false;
      if (!checking) view.clear();
      return true;
    },
  });
}
