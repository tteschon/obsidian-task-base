import { type App, PluginSettingTab, Setting } from "obsidian";
import type TaskBasePlugin from "./main";
import { PRIORITIES, type Priority } from "./model/task";

export {
	DEFAULT_SETTINGS,
	migrateSettings,
	type TaskBaseSettings,
} from "./settingsData";

export class TaskBaseSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: TaskBasePlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("New task folder")
			.setDesc("Where the create command puts new task notes.")
			.addText((t) =>
				t
					.setPlaceholder("tasks")
					.setValue(this.plugin.settings.taskFolder)
					.onChange(async (v) => {
						this.plugin.settings.taskFolder = v.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Excluded folders")
			.setDesc(
				"Comma-separated. Notes in these folders are ignored even when they carry type: task — a task template, or Kanban cards on their own schema. Must match the !file.inFolder clauses in your task base, or the pane and the base will disagree.",
			)
			.addText((t) =>
				t
					.setPlaceholder("Templates")
					.setValue(this.plugin.settings.excludedFolders.join(", "))
					.onChange(async (v) => {
						this.plugin.settings.excludedFolders = v
							.split(",")
							.map((f) => f.trim())
							.filter(Boolean);
						await this.plugin.saveSettings();
						this.plugin.refreshViews();
					}),
			);

		new Setting(containerEl)
			.setName("Categories")
			.setDesc("Comma-separated. Categories already used in the vault are offered too.")
			.addText((t) =>
				t
					.setValue(this.plugin.settings.categories.join(", "))
					.onChange(async (v) => {
						this.plugin.settings.categories = v
							.split(",")
							.map((s) => s.trim())
							.filter(Boolean);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Default priority")
			.addDropdown((d) => {
				for (const p of PRIORITIES) d.addOption(p, p);
				d.setValue(this.plugin.settings.defaultPriority).onChange(async (v) => {
					this.plugin.settings.defaultPriority = v as Priority;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Completion log heading")
			.setDesc("Where completion notes are appended in the note body.")
			.addText((t) =>
				t
					.setValue(this.plugin.settings.logHeading)
					.onChange(async (v) => {
						this.plugin.settings.logHeading = v.trim() || "Service log";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Base file")
			.setDesc(
				"The .base file opened by the button in the task pane. Optional — the pane reads the vault directly and works without one. Leave empty to hide the button.",
			)
			.addText((t) =>
				t
					.setPlaceholder("tasks/task base.base")
					.setValue(this.plugin.settings.basePath)
					.onChange(async (v) => {
						this.plugin.settings.basePath = v.trim();
						await this.plugin.saveSettings();
						this.plugin.refreshViews();
					}),
			);

		new Setting(containerEl)
			.setName("Open task list on start")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.openViewOnStart).onChange(async (v) => {
					this.plugin.settings.openViewOnStart = v;
					await this.plugin.saveSettings();
				}),
			);
	}
}
