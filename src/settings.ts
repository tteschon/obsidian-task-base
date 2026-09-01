import { type App, PluginSettingTab, Setting } from "obsidian";
import type HomeTasksPlugin from "./main";
import { PRIORITIES, type Priority } from "./model/task";

export interface HomeTasksSettings {
	/** Where new task notes are created. */
	taskFolder: string;
	/** Excluded from the task list, mirroring the base's !file.inFolder clause. */
	templateFolder: string;
	/** Daily-note folder, for the `created` backlink. */
	dailyNoteFolder: string;
	/** Offered in the create modal alongside anything already in the vault. */
	categories: string[];
	defaultPriority: Priority;
	/** Heading the completion log is appended under. */
	logHeading: string;
	/** The task base, opened by a button in the task pane. Empty hides it. */
	basePath: string;
	openViewOnStart: boolean;
}

export const DEFAULT_SETTINGS: HomeTasksSettings = {
	taskFolder: "tasks",
	templateFolder: "Templates",
	dailyNoteFolder: "📝 Daily Notes",
	categories: ["home", "yard", "errands", "vehicle", "health"],
	defaultPriority: "low",
	logHeading: "Service log",
	basePath: "tasks/task base.base",
	openViewOnStart: false,
};

export class HomeTasksSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: HomeTasksPlugin,
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
			.setName("Template folder")
			.setDesc(
				"Excluded from the task list. Must match the !file.inFolder clause in your task base, or the two will disagree.",
			)
			.addText((t) =>
				t
					.setPlaceholder("Templates")
					.setValue(this.plugin.settings.templateFolder)
					.onChange(async (v) => {
						this.plugin.settings.templateFolder = v.trim();
						await this.plugin.saveSettings();
						this.plugin.refreshViews();
					}),
			);

		new Setting(containerEl)
			.setName("Daily note folder")
			.setDesc("Used for the created backlink on a new task.")
			.addText((t) =>
				t
					.setValue(this.plugin.settings.dailyNoteFolder)
					.onChange(async (v) => {
						this.plugin.settings.dailyNoteFolder = v.trim();
						await this.plugin.saveSettings();
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
			.setName("Task base")
			.setDesc(
				"Opened by the button in the task pane. Leave empty to hide the button.",
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
