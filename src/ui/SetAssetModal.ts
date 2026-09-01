import { type App, Modal, Notice, Setting } from "obsidian";
import type { Task } from "../model/task";
import { writeTask } from "../model/task";
import { assetNameFromLink, formatAssetLink } from "../model/assetLink";
import { findAssetByName } from "../model/assetRepository";
import { AssetSuggest } from "./AssetSuggest";

/** Attach, change, or clear the asset on an existing task. */
export class SetAssetModal extends Modal {
	private name: string;
	private readonly original: string | null;
	private hintEl!: HTMLElement;

	constructor(
		app: App,
		private task: Task,
		private onDone: () => void,
	) {
		super(app);
		this.original = task.asset;
		this.name = assetNameFromLink(task.asset) ?? "";
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("home-tasks-modal");
		contentEl.createEl("h3", { text: `Asset for "${this.task.name}"` });

		const setting = new Setting(contentEl)
			.setName("Asset")
			.setDesc("The note this task services. Click the field to see every asset.");
		this.hintEl = setting.descEl.createDiv({ cls: "home-tasks-hint" });
		setting.addText((t) => {
			t.setPlaceholder("Family Car");
			t.setValue(this.name);
			t.onChange((v) => this.setName(v));
			new AssetSuggest(this.app, t.inputEl, (picked) => {
				t.setValue(picked);
				this.setName(picked);
			});
			t.inputEl.focus();
		});
		this.renderHint();

		const buttons = contentEl.createDiv({ cls: "home-tasks-buttons" });
		buttons.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		buttons.createEl("button", { text: "Clear asset" }).addEventListener("click", () => {
			this.name = "";
			void this.submit();
		});
		buttons
			.createEl("button", { text: "Save", cls: "mod-cta" })
			.addEventListener("click", () => void this.submit());
	}

	private setName(value: string): void {
		this.name = value;
		this.renderHint();
	}

	private renderHint(): void {
		const name = assetNameFromLink(this.name);
		if (!name || findAssetByName(this.app, name)) {
			this.hintEl.setText("");
			return;
		}
		this.hintEl.setText(`No asset note named "${name}" — the link will be unresolved.`);
	}

	private async submit(): Promise<void> {
		const asset = formatAssetLink(this.name);
		// Writing an unchanged value would add a bare `asset:` key to a note
		// that never had one — several task notes have no asset line at all —
		// so cancelling out by saving leaves the file byte-identical.
		if (asset === this.original) {
			this.close();
			return;
		}
		try {
			await writeTask(this.app, this.task.file, { asset });
			new Notice(asset ? `${this.task.name} — asset ${asset}` : `${this.task.name} — asset cleared`);
			this.onDone();
			this.close();
		} catch (e) {
			new Notice(`Could not set the asset: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
