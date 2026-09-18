import { type App, debounce, PluginSettingTab, Setting } from "obsidian";
import type PublicTxtSearchPlugin from "./main.ts";
import { OPEN_IN_LABELS, type OpenIn } from "./settings.ts";

export class PublicTxtSearchSettingTab extends PluginSettingTab {
  plugin: PublicTxtSearchPlugin;

  constructor(app: App, plugin: PublicTxtSearchPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Typing in the textarea should not rebuild the index on every keystroke.
    const rebuild = debounce(() => void this.plugin.buildIndex(), 600, true);

    new Setting(containerEl)
      .setName("Excluded folders")
      .setDesc("One folder path per line. Notes inside these folders are not pages.")
      .addTextArea((text) => {
        text.setValue(this.plugin.settings.excludedFolders.join("\n"));
        text.inputEl.rows = 5;
        text.inputEl.cols = 30;
        text.onChange(async (value) => {
          this.plugin.settings.excludedFolders = value
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          await this.plugin.saveSettings();
          rebuild();
        });
      });

    new Setting(containerEl)
      .setName("Include inline #hashtags as tags")
      .setDesc("Off means front matter tags only.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.includeInlineTags).onChange(async (value) => {
          this.plugin.settings.includeInlineTags = value;
          await this.plugin.saveSettings();
          await this.plugin.buildIndex();
        }),
      );

    new Setting(containerEl)
      .setName("Open results in")
      .setDesc("Where a card's title opens the note. Ctrl/Cmd-click always opens a new tab.")
      .addDropdown((dropdown) => {
        for (const [value, label] of Object.entries(OPEN_IN_LABELS)) dropdown.addOption(value, label);
        dropdown.setValue(this.plugin.settings.openIn).onChange(async (value) => {
          this.plugin.settings.openIn = (value in OPEN_IN_LABELS ? value : "current") as OpenIn;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Results per batch")
      .setDesc('Cards shown before "Show more".')
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.setValue(String(this.plugin.settings.resultsPerBatch)).onChange(async (value) => {
          const n = Number.parseInt(value, 10);
          if (!Number.isFinite(n) || n < 1) return;
          this.plugin.settings.resultsPerBatch = n;
          await this.plugin.saveSettings();
        });
      });
  }
}
