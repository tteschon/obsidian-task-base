import { type App, Modal, Notice, Setting, type TFile } from "obsidian";
import type { TaskBaseSettings } from "../settings";
import { type ISODate, todayISO } from "../dates";
import { PRIORITIES, type Priority, createTask, sanitizeFileName } from "../model/task";
import { describeFrequency, nextDue } from "../recurrence";
import { assetNameFromLink, formatAssetLink } from "../model/assetLink";
import { findAssetByName } from "../model/assetRepository";
import { AssetSuggest } from "./AssetSuggest";
import { FrequencyModal } from "./FrequencyModal";

/** Capture a task: name, category, priority, due date, recurrence, asset. */
export class CreateTaskModal extends Modal {
	private name = "";
	private category: string | null = null;
	private priority: Priority;
	private due: ISODate | null = null;
	private frequency: string | null = null;
	private asset: string | null = null;
	private body = "";
	private frequencyEl!: HTMLElement;
	private dueInput!: HTMLInputElement;
	private assetHintEl!: HTMLElement;

	constructor(
		app: App,
		private settings: TaskBaseSettings,
		private knownCategories: string[],
		private onCreated: (file: TFile) => void,
	) {
		super(app);
		this.priority = settings.defaultPriority;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("task-base-modal");
		contentEl.createEl("h3", { text: "New task" });

		new Setting(contentEl).setName("Name").addText((t) => {
			t.setPlaceholder("Change fridge water filter").onChange((v) => (this.name = v));
			t.inputEl.focus();
			t.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") void this.submit();
			});
		});

		const categories = [...new Set([...this.settings.categories, ...this.knownCategories])].sort();
		new Setting(contentEl).setName("Category").addDropdown((d) => {
			d.addOption("", "—");
			for (const c of categories) d.addOption(c, c);
			d.setValue("").onChange((v) => (this.category = v || null));
		});

		new Setting(contentEl).setName("Priority").addDropdown((d) => {
			for (const p of PRIORITIES) d.addOption(p, p);
			d.setValue(this.priority).onChange((v) => (this.priority = v as Priority));
		});

		new Setting(contentEl)
			.setName("Due")
			.setDesc("Leave empty to let the recurrence set the first due date.")
			.addText((t) => {
				t.inputEl.type = "date";
				this.dueInput = t.inputEl;
				t.onChange((v) => (this.due = v || null));
			});

		const freqSetting = new Setting(contentEl).setName("Repeat").addButton((b) =>
			b.setButtonText("Set…").onClick(() => {
				new FrequencyModal(this.app, this.frequency, (freq) => {
					this.frequency = freq;
					this.renderFrequency();
					// A recurring task with no due date sits in the base's "Needs
					// attention" queue until it is first completed. Filling the
					// date in now keeps it out of that queue.
					if (freq && !this.due) {
						const first = nextDue(freq, todayISO());
						if (first) {
							this.due = first;
							this.dueInput.value = first;
						}
					}
				}).open();
			}),
		);
		this.frequencyEl = freqSetting.descEl;
		this.renderFrequency();

		const assetSetting = new Setting(contentEl)
			.setName("Asset")
			.setDesc("Optional note this task services. Click the field to see every asset.");
		this.assetHintEl = assetSetting.descEl.createDiv({ cls: "task-base-hint" });
		assetSetting.addText((t) => {
			t.setPlaceholder("Family Car");
			t.onChange((v) => this.setAsset(v));
			new AssetSuggest(this.app, t.inputEl, (name) => {
				t.setValue(name);
				this.setAsset(name);
			});
		});

		new Setting(contentEl).setName("Notes").addTextArea((t) =>
			t.setPlaceholder("Anything worth remembering in the note body.").onChange((v) => (this.body = v)),
		);

		const buttons = contentEl.createDiv({ cls: "task-base-buttons" });
		buttons.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		buttons
			.createEl("button", { text: "Create task", cls: "mod-cta" })
			.addEventListener("click", () => void this.submit());
	}

	/**
	 * Record the asset and say plainly when the name matches no note.
	 *
	 * The task is still created either way — capturing a chore for something
	 * not yet inventoried is a normal thing to do, and Obsidian treats the
	 * result as an unresolved link you can fill in later. What is not normal is
	 * a typo you never find out about, which is what the old free-text field
	 * produced.
	 */
	private setAsset(raw: string): void {
		this.asset = formatAssetLink(raw);
		const name = assetNameFromLink(raw);
		if (!name || findAssetByName(this.app, name)) {
			this.assetHintEl.setText("");
			return;
		}
		this.assetHintEl.setText(`No asset note named "${name}" — the link will be unresolved.`);
	}

	private renderFrequency(): void {
		this.frequencyEl.setText(
			this.frequency ? `${describeFrequency(this.frequency)} — ${this.frequency}` : "Does not repeat",
		);
	}

	private async submit(): Promise<void> {
		if (!sanitizeFileName(this.name)) {
			new Notice("A task needs a name.");
			return;
		}
		try {
			const file = await createTask(this.app, {
				name: this.name,
				folder: this.settings.taskFolder,
				priority: this.priority,
				category: this.category,
				due: this.due,
				frequency: this.frequency,
				asset: this.asset,
				body: this.body,
				dailyNoteDate: todayISO(),
			});
			new Notice(`Created ${file.path}`);
			this.onCreated(file);
			this.close();
		} catch (e) {
			new Notice(`Could not create the task: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
