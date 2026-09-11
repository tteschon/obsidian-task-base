import { type App, Modal } from "obsidian";

export interface NotesModalSpec {
	/** Heading, so the field this stands in for is named. */
	title: string;
	placeholder: string;
	/** What the field holds when the editor opens. */
	value: string;
	/** Fired on every keystroke — see the note on committing, below. */
	onChange: (body: string) => void;
}

/**
 * Edit a note body with nothing above it.
 *
 * This exists for the phone. In the create forms the notes box is the last
 * field of a long modal, so tapping it scrolls it under the on-screen keyboard
 * and you type into a box you cannot see. A modal holding one field puts that
 * field at the top of the screen, which is the half of it the keyboard leaves
 * alone.
 *
 * There is no Cancel, and the value is committed on every keystroke rather
 * than on Done. A modal that commits on Done loses what you typed to the
 * Android back gesture, to Escape, and to a tap outside it — three ways to
 * dismiss a modal that a phone offers far too readily for a field a paragraph
 * long. Nothing is written to the vault here either way: the parent form still
 * has to be submitted.
 */
export class NotesModal extends Modal {
	constructor(
		app: App,
		private spec: NotesModalSpec,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("task-base-modal");
		contentEl.addClass("task-base-notes-modal");
		contentEl.createEl("h3", { text: this.spec.title });

		const area = contentEl.createEl("textarea", { cls: "task-base-notes-input" });
		area.placeholder = this.spec.placeholder;
		area.value = this.spec.value;
		area.addEventListener("input", () => this.spec.onChange(area.value));

		area.focus();
		// Land after what is already there, not on top of it. Focusing a
		// textarea selects nothing but places the caret at the start, so
		// reopening the editor to add a line would otherwise have you typing
		// above everything you wrote the first time.
		area.setSelectionRange(area.value.length, area.value.length);

		const buttons = contentEl.createDiv({ cls: "task-base-buttons" });
		buttons
			.createEl("button", { text: "Done", cls: "mod-cta" })
			.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
