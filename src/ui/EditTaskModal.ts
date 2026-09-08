import { type App, Modal, Notice, Setting } from "obsidian";
import type { TaskBaseSettings } from "../settingsData";
import { type ISODate, parseISO } from "../dates";
import {
	PRIORITIES,
	type Priority,
	type Task,
	type TaskPatch,
	sanitizeFileName,
	writeBody,
	writeTask,
} from "../model/task";
import type { BodyParts } from "../model/frontmatter";
import { renameNote } from "../model/note";
import { assetNameFromLink, formatAssetLink } from "../model/assetLink";
import type { AssetRepository } from "../model/assetRepository";
import { describeFrequency } from "../recurrence";
import { addAssetField } from "./AssetField";
import { addNotesField } from "./NotesField";
import { FrequencyModal } from "./FrequencyModal";

/**
 * Change any field on an existing task.
 *
 * Everything the create modal offers, reachable after the fact — until this
 * existed, changing a due date meant editing frontmatter by hand, which is the
 * thing the plugin is for. That now includes the two things a task note holds
 * outside its properties: its **name**, which is the file name, and its
 * **notes**, which are the body above the completion log.
 */
export class EditTaskModal extends Modal {
	private name: string;
	private due: ISODate | null;
	private priority: Priority;
	private category: string | null;
	private frequency: string | null;
	private assetName: string;
	private notes: string;
	private frequencyEl!: HTMLElement;

	constructor(
		app: App,
		private task: Task,
		/** Read before opening, so the notes box is filled from its first frame. */
		private body: BodyParts,
		private settings: TaskBaseSettings,
		private knownCategories: string[],
		private assets: AssetRepository,
		private onSaved: () => void,
	) {
		super(app);
		this.name = task.name;
		this.due = task.due;
		this.priority = task.priority;
		this.category = task.category;
		this.frequency = task.frequency;
		this.assetName = assetNameFromLink(task.asset) ?? "";
		this.notes = body.notes;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("task-base-modal");
		contentEl.createEl("h3", { text: `Edit "${this.task.name}"` });

		new Setting(contentEl)
			.setName("Name")
			.setDesc("Renames the note. Links pointing at it are updated.")
			.addText((t) => {
				t.setValue(this.name).onChange((v) => (this.name = v));
				t.inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter") void this.submit();
				});
			});

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

		addAssetField(contentEl, {
			app: this.app,
			assets: this.assets,
			assetFolder: () => this.settings.assetFolder,
			desc: "The note this task services.",
			initial: this.assetName,
			onChange: (name) => (this.assetName = name),
		});

		addNotesField(contentEl, {
			app: this.app,
			placeholder: "Anything worth remembering in the note body.",
			desc: this.body.log
				? `The body above "## ${this.settings.logHeading}". The log below it is left alone.`
				: undefined,
			initial: this.notes,
			onChange: (notes) => (this.notes = notes),
		});

		const buttons = contentEl.createDiv({ cls: "task-base-buttons" });
		buttons.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		buttons
			.createEl("button", { text: "Save", cls: "mod-cta" })
			.addEventListener("click", () => void this.submit());
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
	 * carried them, rewrite `due` on every task it was ever opened on, and
	 * reflow the body of every note it was ever pointed at.
	 *
	 * The rename goes last, and reports separately. It is the only step that
	 * can fail on something the form cannot see coming — a sibling note already
	 * holding the name — and running it after the writes means that failure
	 * costs the rename it names rather than the edits it says nothing about.
	 * The modal stays open on it, because the field that needs correcting is
	 * the one already in front of you.
	 */
	private async submit(): Promise<void> {
		const name = sanitizeFileName(this.name);
		if (!name) {
			new Notice("A task needs a name.");
			return;
		}
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

		const properties = Object.keys(patch);
		const notesChanged = this.notes.trim() !== this.body.notes.trim();
		const renamed = name !== this.task.name;

		const changed = [...properties];
		if (notesChanged) changed.push("notes");
		if (renamed) changed.push("name");
		if (!changed.length) {
			this.close();
			return;
		}

		try {
			if (properties.length) await writeTask(this.app, this.task.file, patch);
			if (notesChanged) {
				await writeBody(this.app, this.task.file, this.notes, this.settings.logHeading);
			}
		} catch (e) {
			new Notice(`Could not save: ${e instanceof Error ? e.message : String(e)}`);
			return;
		}

		if (renamed) {
			try {
				await renameNote(this.app, this.task.file, name);
			} catch (e) {
				// Everything above this line is already on disk. Saying only
				// "could not save" would read as having lost it.
				new Notice(`Saved, but not renamed: ${e instanceof Error ? e.message : String(e)}`);
				this.onSaved();
				return;
			}
		}

		new Notice(`${name} — updated ${changed.join(", ")}`);
		this.onSaved();
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
