import { type App, Modal, Notice, Setting } from "obsidian";
import type { TaskBaseSettings } from "../settings";
import { type ISODate, formatHuman, todayISO } from "../dates";
import { type Task, appendLog, writeTask } from "../model/task";
import { type FrequencyState, describeFrequency, frequencyState, nextDue } from "../recurrence";

/**
 * Complete a task, branching on `frequency`.
 *
 * The branch is stated before it is taken, because the two outcomes are not
 * recoverable by reading the note afterwards:
 *
 * - **Recurring** — `last done` = today, `due` recomputed, `done` back to
 *   false. A recurring task is never left at `done: true`; that is what makes
 *   it recur.
 * - **One-time** — `last done` = today, `done` = true. The note stays on disk
 *   and stays in the base. Deleting it is the grooming sweep's job, not this
 *   plugin's.
 */
export class CompleteTaskModal extends Modal {
	private detail = "";
	private computedDue: ISODate | null;
	private recurring: boolean;
	private state: FrequencyState;

	constructor(
		app: App,
		private task: Task,
		private settings: TaskBaseSettings,
		private onDone: () => void,
	) {
		super(app);
		this.state = frequencyState(task.frequency);
		this.recurring = this.state === "valid";
		this.computedDue = this.recurring ? nextDue(task.frequency, todayISO()) : null;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("task-base-modal");
		contentEl.createEl("h3", { text: `Complete "${this.task.name}"` });

		// A recurring task already sitting at done: true has stopped recurring.
		// Say so plainly; rolling it forward is the fix, and it is the user's call.
		if (this.task.done && this.recurring) {
			contentEl.createDiv({
				cls: "task-base-warning",
				text:
					"This recurring task is currently marked done, which means it stopped recurring. " +
					"Completing it now rolls it forward and clears the done flag.",
			});
		}

		// An unreadable rule is not a one-time task. Completing it as one would
		// write done: true and retire a task that was meant to keep recurring,
		// so this refuses to choose and asks for the rule to be fixed.
		if (this.state === "invalid") {
			contentEl.createDiv({
				cls: "task-base-warning",
				text: `The repeat rule on this task cannot be read, so there is no safe way to complete it. Fix it with "Edit repeat rule", or clear it to make this a one-time task.`,
			});
			contentEl.createEl("code", { text: this.task.frequency ?? "" });
			const only = contentEl.createDiv({ cls: "task-base-buttons" });
			only.createEl("button", { text: "Close" }).addEventListener("click", () => this.close());
			return;
		}

		const summary = contentEl.createDiv({ cls: "task-base-preview" });
		if (this.recurring) {
			summary.createDiv({ text: `Recurring — ${describeFrequency(this.task.frequency)}` });
			summary.createEl("code", { text: this.task.frequency ?? "" });
			if (this.computedDue) {
				summary.createDiv({
					cls: "task-base-preview-dates",
					text: `Due moves to ${formatHuman(this.computedDue)}`,
				});
			} else {
				summary.createDiv({
					cls: "task-base-preview-dates",
					text: "The recurrence rule could not be read, so the due date will be cleared.",
				});
			}
		} else {
			summary.createDiv({ text: "One-time — this marks the task done." });
			summary.createDiv({
				cls: "task-base-preview-dates",
				text: "The note stays in the vault and in the base. Nothing is deleted here.",
			});
		}

		if (this.recurring) {
			new Setting(contentEl)
				.setName("Next due")
				.setDesc("Adjust if the computed date is not what you want.")
				.addText((t) => {
					t.inputEl.type = "date";
					t.setValue(this.computedDue ?? "").onChange((v) => (this.computedDue = v || null));
				});
		}

		new Setting(contentEl)
			.setName("Log entry")
			.setDesc(
				`Optional. Appended under "## ${this.settings.logHeading}" in the body — mileage, part numbers, what was done. Never written into last done.`,
			)
			.addText((t) => t.setPlaceholder("22,731 mi").onChange((v) => (this.detail = v)));

		const buttons = contentEl.createDiv({ cls: "task-base-buttons" });
		buttons.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		buttons
			.createEl("button", { text: this.recurring ? "Roll forward" : "Mark done", cls: "mod-cta" })
			.addEventListener("click", () => void this.submit());
	}

	private async submit(): Promise<void> {
		const today = todayISO();
		try {
			if (this.recurring) {
				await writeTask(this.app, this.task.file, {
					lastDone: today,
					due: this.computedDue,
					done: false,
				});
			} else {
				await writeTask(this.app, this.task.file, { lastDone: today, done: true });
			}
			if (this.detail.trim()) {
				await appendLog(this.app, this.task.file, this.detail, this.settings.logHeading, today);
			}
			new Notice(
				this.recurring
					? `${this.task.name} — due ${this.computedDue ?? "cleared"}`
					: `${this.task.name} — done`,
			);
			this.onDone();
			this.close();
		} catch (e) {
			new Notice(`Could not complete the task: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
