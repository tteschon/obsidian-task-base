import { type App, Platform, Setting, type TextAreaComponent } from "obsidian";
import { NotesModal } from "./NotesModal";
import { notesPreview } from "./notesPreview";

export interface NotesFieldSpec {
	app: App;
	placeholder: string;
	/** Said under the label, where the row needs explaining. */
	desc?: string;
	/** The body already on the note, for a form that edits one. */
	initial?: string;
	/** The body text, as it changes. */
	onChange: (body: string) => void;
}

/** The row's label, and the heading on the editor it opens. */
const NAME = "Notes";

/**
 * The Notes row, built once for the modals that capture a note body.
 *
 * The row always offers the expanded editor — `NotesModal`, one field with
 * nothing above it — because a paragraph typed into a box ten lines tall is
 * awkward on any screen. On a **phone** it offers nothing else: the inline box
 * is replaced by a button carrying the opening of what you wrote.
 *
 * That replacement is the fix, not a shortcut around building one. The notes
 * box sits last in the form — seven fields in Create task — and on a phone that
 * form is already taller than the screen; a ten-line box at the bottom of it is
 * under the keyboard by the time it has focus. Collapsing it to one line
 * lifts every field above it back into view as well, which is the same
 * complaint from the other end.
 */
export function addNotesField(parent: HTMLElement, spec: NotesFieldSpec): void {
	let body = spec.initial ?? "";
	const setting = new Setting(parent).setName(NAME).setClass("task-base-notes");
	if (spec.desc) setting.setDesc(spec.desc);

	/** Open the expanded editor, keeping `render` in step as it is typed into. */
	const expand = (render: (value: string) => void) => {
		new NotesModal(spec.app, {
			title: NAME,
			placeholder: spec.placeholder,
			value: body,
			onChange: (value) => {
				body = value;
				render(value);
				spec.onChange(value);
			},
		}).open();
	};

	if (Platform.isPhone) {
		const button = setting.controlEl.createEl("button", { cls: "task-base-notes-open" });
		const render = (value: string) => {
			const preview = notesPreview(value);
			button.setText(preview || "Add notes…");
			button.toggleClass("task-base-notes-empty", !preview);
		};
		button.addEventListener("click", () => expand(render));
		render(body);
		return;
	}

	let area: TextAreaComponent | null = null;
	setting.addTextArea((t) => {
		area = t;
		t.setPlaceholder(spec.placeholder)
			.setValue(body)
			.onChange((value) => {
				body = value;
				spec.onChange(value);
			});
	});
	setting.addExtraButton((b) =>
		b
			.setIcon("maximize-2")
			.setTooltip("Edit in a larger window")
			// The braces are load-bearing. Obsidian's components carry a fluent
			// `then`, which makes every one of them thenable to the type checker,
			// so returning `setValue`'s component from a void callback reads as a
			// floating promise and fails lint.
			.onClick(() =>
				expand((value) => {
					area?.setValue(value);
				}),
			),
	);
}
