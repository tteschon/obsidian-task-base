import { type App, Modal, Notice, Setting, type TFile } from "obsidian";
import { todayISO } from "../dates";
import { createAsset } from "../model/asset";
import type { AssetRepository } from "../model/assetRepository";
import { metadataSettled } from "../model/metadata";
import { sanitizeFileName } from "../model/frontmatter";
import { findFolder } from "../model/note";

export interface CreateAssetSpec {
	/** Where the note is written. Empty means the vault root. */
	folder: string;
	assets: AssetRepository;
	/** Prefills the name, so a typed-but-unmatched asset carries straight over. */
	initialName?: string;
	/**
	 * What to do with the new note.
	 *
	 * Deliberately not "open it": from the asset picker there is a modal in
	 * front of the user and opening a note behind it is disorienting, while from
	 * the command palette opening it is the entire point. The caller knows
	 * which situation it is in; this modal does not.
	 */
	onCreated: (file: TFile) => void;
}

/**
 * Create an asset note.
 *
 * Small on purpose. The note gets `type: asset` and `created`, and nothing
 * else — the identity property is all this plugin needs, and a lawn mower is
 * described with fields no task plugin can guess. The description says both of
 * those things out loud, because "where do the assets in this list come from"
 * was the question that prompted this modal existing.
 */
export class CreateAssetModal extends Modal {
	private name: string;
	private body = "";

	constructor(
		app: App,
		private spec: CreateAssetSpec,
	) {
		super(app);
		this.name = spec.initialName?.trim() ?? "";
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("task-base-modal");
		contentEl.createEl("h3", { text: "New asset" });

		// The vault's own spelling, not the setting's: a setting reading
		// `inventory` against a vault holding `Inventory` writes to the latter,
		// and a line explaining where a note goes should not name the wrong one.
		const configured = this.spec.folder.trim();
		const folder = configured ? (findFolder(this.app, configured)?.path ?? configured) : "";
		contentEl.createDiv({
			cls: "task-base-note",
			text: `Creates a note carrying type: asset in ${folder || "the vault root"}, which is what puts it in the asset list. Change the folder in the plugin's settings.`,
		});

		new Setting(contentEl).setName("Name").addText((t) => {
			t.setPlaceholder("Family car");
			t.setValue(this.name).onChange((v) => (this.name = v));
			t.inputEl.focus();
			t.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") void this.submit();
			});
		});

		new Setting(contentEl)
			.setName("Notes")
			.setClass("task-base-notes")
			.addTextArea((t) => {
				t.setPlaceholder("Model, serial number, where it lives — anything worth keeping.").onChange(
					(v) => (this.body = v),
				);
				t.inputEl.rows = 5;
			});

		const buttons = contentEl.createDiv({ cls: "task-base-buttons" });
		buttons.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		buttons
			.createEl("button", { text: "Create asset", cls: "mod-cta" })
			.addEventListener("click", () => void this.submit());
	}

	private async submit(): Promise<void> {
		if (!sanitizeFileName(this.name)) {
			new Notice("An asset needs a name.");
			return;
		}
		try {
			const file = await createAsset(this.app, {
				name: this.name,
				folder: this.spec.folder,
				body: this.body,
				createdOn: todayISO(),
			});
			// Await the cache before invalidating, or the repository rebuilds from
			// a cache that has not seen the new file yet and the note is missing
			// from the very list it was created for.
			await metadataSettled(this.app, file);
			this.spec.assets.invalidate();
			new Notice(`Created ${file.path}`);
			this.spec.onCreated(file);
			this.close();
		} catch (e) {
			new Notice(`Could not create the asset: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
