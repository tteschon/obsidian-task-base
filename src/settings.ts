import { type App, PluginSettingTab, type SettingDefinitionItem, Setting } from "obsidian";
import type TaskBasePlugin from "./main";
import {
	SETTING_SPECS,
	type SettingSpec,
	type TaskBaseSettings,
	listToText,
	textToList,
} from "./settingsData";

export {
	DEFAULT_SETTINGS,
	migrateSettings,
	type TaskBaseSettings,
} from "./settingsData";

/**
 * A control value as display text.
 *
 * `getControlValue` returns `unknown` by contract, so this narrows rather than
 * calling String() on something that might stringify to "[object Object]".
 */
function asText(value: unknown): string {
	return typeof value === "string" ? value : "";
}

/** Settings stored as `string[]` but presented as comma-separated text. */
const LIST_KEYS = new Set<keyof TaskBaseSettings>(
	SETTING_SPECS.filter((s) => s.type.kind === "textList").map((s) => s.key),
);

/**
 * The settings tab, rendered two ways from one description.
 *
 * `getSettingDefinitions` is how Obsidian 1.13+ builds its settings *search*;
 * `display` is how every version actually draws the tab. Both walk
 * `SETTING_SPECS`, so a setting cannot appear in one and be missing from the
 * other.
 */
export class TaskBaseSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: TaskBasePlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return SETTING_SPECS.map((spec): SettingDefinitionItem => {
			const base = { name: spec.name, desc: spec.desc };
			switch (spec.type.kind) {
				case "dropdown":
					return {
						...base,
						control: {
							type: "dropdown",
							key: spec.key,
							options: Object.fromEntries(spec.type.options.map((o) => [o, o])),
						},
					};
				case "toggle":
					return { ...base, control: { type: "toggle", key: spec.key } };
				default:
					return {
						...base,
						control: { type: "text", key: spec.key, placeholder: spec.type.placeholder },
					};
			}
		});
	}

	/**
	 * The list settings store an array; the control shows text. Everything else
	 * reads and writes `plugin.settings[key]` as the base class would.
	 */
	getControlValue(key: string): unknown {
		const value = this.plugin.settings[key as keyof TaskBaseSettings];
		return LIST_KEYS.has(key as keyof TaskBaseSettings) ? listToText(value) : value;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings as unknown as Record<string, unknown>;
		settings[key] = LIST_KEYS.has(key as keyof TaskBaseSettings)
			? textToList(String(value))
			: value;
		await this.plugin.saveSettings();
		if (SETTING_SPECS.find((s) => s.key === key)?.refreshesViews) this.plugin.refreshViews();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		for (const spec of SETTING_SPECS) this.renderSetting(containerEl, spec);
	}

	private renderSetting(parent: HTMLElement, spec: SettingSpec): void {
		const setting = new Setting(parent).setName(spec.name);
		if (spec.desc) setting.setDesc(spec.desc);

		const commit = (value: unknown) => void this.setControlValue(spec.key, value);
		const current = this.getControlValue(spec.key);

		switch (spec.type.kind) {
			case "dropdown":
				setting.addDropdown((d) => {
					for (const option of spec.type.kind === "dropdown" ? spec.type.options : []) {
						d.addOption(option, option);
					}
					d.setValue(asText(current)).onChange(commit);
				});
				return;
			case "toggle":
				setting.addToggle((t) => t.setValue(current === true).onChange(commit));
				return;
			default:
				setting.addText((t) => {
					const placeholder =
						spec.type.kind === "text" || spec.type.kind === "textList"
							? spec.type.placeholder
							: undefined;
					if (placeholder) t.setPlaceholder(placeholder);
					t.setValue(asText(current)).onChange((v) =>
						commit(spec.type.kind === "textList" ? v : v.trim()),
					);
				});
		}
	}
}
