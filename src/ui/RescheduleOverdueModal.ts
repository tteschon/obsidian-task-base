import { type App, Modal, Notice } from "obsidian";
import { formatHuman, relativeDay, todayISO } from "../dates";
import { type Task, readTask, writeTask } from "../model/task";
import { type RescheduleOutcome, rescheduleOverdue } from "../model/reschedule";
import { describeFrequency } from "../recurrence";

interface Planned {
	task: Task;
	outcome: RescheduleOutcome;
}

/**
 * Move every overdue due date forward, after showing where each one lands.
 *
 * Many notes are rewritten at once, and the dates they held cannot be read
 * back afterwards, so nothing is written until the list has been seen — the
 * reason `CompleteTaskModal` states its branch before taking it. Where each
 * task lands is `model/reschedule.ts`: a repeating task goes to the next date
 * in its own schedule, a one-time task goes to today, and nothing is marked
 * done.
 */
export class RescheduleOverdueModal extends Modal {
	private moving: Planned[] = [];

	constructor(
		app: App,
		private tasks: Task[],
		private onDone: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("task-base-modal");
		contentEl.createEl("h3", { text: "Reschedule overdue tasks" });
		contentEl.createDiv({
			cls: "task-base-note",
			text: "Repeating tasks move to the next date in their schedule, and one-time tasks move to today. Nothing is marked done, and last done is left as it is.",
		});

		const today = todayISO();
		const planned = this.tasks.map((task) => ({ task, outcome: rescheduleOverdue(task, today) }));
		this.moving = planned.filter((p) => p.outcome.kind !== "skipped");
		const skipped = planned.filter((p) => p.outcome.kind === "skipped");

		if (this.moving.length) {
			const list = contentEl.createDiv({ cls: "task-base-preview task-base-reschedule-list" });
			for (const { task, outcome } of this.moving) {
				const to = outcome.due ?? "";
				const row = list.createDiv({ cls: "task-base-reschedule-row" });
				row.createDiv({ text: task.name });
				row.createDiv({
					cls: "task-base-preview-dates",
					text: `${formatHuman(task.due ?? "")} → ${formatHuman(to)} · ${relativeDay(to, today)}`,
				});
				row.createDiv({
					cls: "task-base-preview-dates",
					text: outcome.kind === "recurring" ? describeFrequency(task.frequency) : "one-time",
				});
			}
		}

		// Listed rather than dropped, so the count on the button is not the only
		// sign that some of the Overdue section will still be there afterwards.
		if (skipped.length) {
			const left = contentEl.createDiv({ cls: "task-base-preview task-base-reschedule-list" });
			left.createDiv({ cls: "task-base-reschedule-heading", text: "Left as they are" });
			for (const { task, outcome } of skipped) {
				const row = left.createDiv({ cls: "task-base-reschedule-row" });
				row.createDiv({ text: task.name });
				row.createDiv({ cls: "task-base-preview-dates", text: outcome.reason ?? "" });
			}
		}

		const buttons = contentEl.createDiv({ cls: "task-base-buttons" });
		if (!this.moving.length) {
			buttons.createEl("button", { text: "Close" }).addEventListener("click", () => this.close());
			return;
		}
		buttons.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		const n = this.moving.length;
		const confirm = buttons.createEl("button", {
			text: `Reschedule ${n} ${n === 1 ? "task" : "tasks"}`,
			cls: "mod-cta",
		});
		confirm.addEventListener("click", () => {
			// One run only. A second click while the first is still writing would
			// decide from a metadata cache that has not caught up with it yet.
			confirm.disabled = true;
			void this.submit();
		});
	}

	private async submit(): Promise<void> {
		const today = todayISO();
		let moved = 0;
		let changed = 0;
		const failed: string[] = [];

		for (const { task } of this.moving) {
			// Decided again from the note as it is now, not as it was when the
			// list was drawn: a task completed meanwhile must not be moved from a
			// date it no longer holds, and a list left open past midnight should
			// land on the new day.
			const current = readTask(this.app, task.file);
			const outcome = current ? rescheduleOverdue(current, today) : null;
			if (!outcome || outcome.kind === "skipped") {
				changed++;
				continue;
			}
			try {
				await writeTask(this.app, task.file, outcome.patch);
				moved++;
			} catch (e) {
				failed.push(`${task.name} (${e instanceof Error ? e.message : String(e)})`);
			}
		}

		const parts = [`Rescheduled ${moved} overdue ${moved === 1 ? "task" : "tasks"}.`];
		if (changed) {
			parts.push(
				`${changed} changed after the list was drawn and ${changed === 1 ? "was" : "were"} left alone.`,
			);
		}
		if (failed.length) parts.push(`Could not write ${failed.join(", ")}.`);
		new Notice(parts.join(" "));
		this.onDone();
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
