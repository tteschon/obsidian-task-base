import { type App, Modal, Notice, Setting } from "obsidian";
import type { TaskBaseSettings } from "../settingsData";
import { type ISODate, parseISO } from "../dates";
import { PRIORITIES, type Priority, type Task, type TaskPatch, writeTask } from "../model/task";
import { assetNameFromLink, formatAssetLink } from "../model/assetLink";
import { findAssetByName } from "../model/assetRepository";
import { describeFrequency } from "../recurrence";
import { AssetSuggest } from "./AssetSuggest";
import { FrequencyModal } from "./FrequencyModal";

/**
 * Change any field on an existing task.
 *
 * Everything the create modal offers, reachable after the fact — until this
 * existed, changing a due date meant editing frontmatter by hand, which is the
 * thing the plugin is for.
 */
export class EditTaskModal extends Modal {
	private due: ISODate | null;
	private priority: Priority;
	private category: string | null;
	private frequency: string | null;
	private assetName: string;
	private frequencyEl!: HTMLElement;
	private assetHintEl!: HTMLElement;

	constructor(
		app: App,
		private task: Task,
		private settings: TaskBaseSettings,
		private knownCategories: string[],
		private onSaved: () => void,
	) {
		super(app);
		this.due = task.due;
		this.priority = task.priority;
		this.category = task.category;
		this.frequency = task.frequency;
		this.assetName = assetNameFromLink(task.asset) ?? "";
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("task-base-modal");
		contentEl.createEl("h3", { text: `Edit "${this.task.name}"` });

		new Setting(contentEl)
			.setName("Due")
			.setDesc("Clear to leave the task undated.")
			.addText((t) => {
				t.inputEl.type = "date";
				t.setValue(this.due ?? "").onChange((v) => (this.due = v || null));
			});

		const categories = [...new Set([...this.settings.categories, ...this.knownCategories])].sort();
		new Setting(contentEl).setName("Category").addDropdown((d) => {
			d.addOption("", "—");
			for (const c of categories) d.addOption(c, c);
			// A category already on the note but not in the list would otherwise
			// be silently reset to empty by opening this modal.
			if (this.category && !categories.includes(this.category)) {
				d.addOption(this.category, this.category);
			}
			d.setValue(this.category ?? "").onChange((v) => (this.category = v || null));
		});

		new Setting(contentEl).setName("Priority").addDropdown((d) => {
			for (const p of PRIORITIES) d.addOption(p, p);
			d.setValue(this.priority).onChange((v) => (this.priority = v as Priority));
		});

		const freqSetting = new Setting(contentEl).setName("Repeat").addButton((b) =>
			b.setButtonText("Set…").onClick(() => {
				new FrequencyModal(this.app, this.frequency, (freq) => {
					this.frequency = freq;
					this.renderFrequency();
				}).open();
			}),
		);
		this.frequencyEl = freqSetting.descEl;
		this.renderFrequency();

		const assetSetting = new Setting(contentEl)
			.setName("Asset")
			.setDesc("The note this task services. Click the field to see every asset.");
		this.assetHintEl = assetSetting.descEl.createDiv({ cls: "task-base-hint" });
		assetSetting.addText((t) => {
			t.setValue(this.assetName);
			t.onChange((v) => this.setAsset(v));
			new AssetSuggest(this.app, t.inputEl, (picked) => {
				t.setValue(picked);
				this.setAsset(picked);
			});
		});
		this.renderAssetHint();

		const buttons = contentEl.createDiv({ cls: "task-base-buttons" });
		buttons.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		buttons
			.createEl("button", { text: "Save", cls: "mod-cta" })
			.addEventListener("click", () => void this.submit());
	}

	private setAsset(value: string): void {
		this.assetName = value;
		this.renderAssetHint();
	}

	private renderAssetHint(): void {
		const name = assetNameFromLink(this.assetName);
		this.assetHintEl.setText(
			!name || findAssetByName(this.app, name)
				? ""
				: `No asset note named "${name}" — the link will be unresolved.`,
		);
	}

	private renderFrequency(): void {
		this.frequencyEl.setText(
			this.frequency ? `${describeFrequency(this.frequency)} — ${this.frequency}` : "Does not repeat",
		);
	}

	/**
	 * Write only what changed.
	 *
	 * Opening this modal and saving without touching anything must leave the
	 * file byte-identical — otherwise it would stamp keys onto notes that never
	 * carried them, and rewrite `due` on every task it was ever opened on.
	 */
	private async submit(): Promise<void> {
		if (this.due !== null && !parseISO(this.due)) {
			new Notice("That due date is not a real date.");
			return;
		}

		const asset = formatAssetLink(this.assetName);
		const patch: TaskPatch = {};
		if (this.due !== this.task.due) patch.due = this.due;
		if (this.priority !== this.task.priority) patch.priority = this.priority;
		if (this.category !== this.task.category) patch.category = this.category;
		if (this.frequency !== this.task.frequency) patch.frequency = this.frequency;
		if (asset !== this.task.asset) patch.asset = asset;

		const changed = Object.keys(patch);
		if (!changed.length) {
			this.close();
			return;
		}

		try {
			await writeTask(this.app, this.task.file, patch);
			new Notice(`${this.task.name} — updated ${changed.join(", ")}`);
			this.onSaved();
			this.close();
		} catch (e) {
			new Notice(`Could not save: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
