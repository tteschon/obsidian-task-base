import type { ISODate } from "../dates";
import { frequencyState, nextDueOnOrAfter } from "../recurrence";
import type { TaskPatch } from "./task";

/**
 * Where rescheduling moves an overdue task.
 *
 * Pure — no `obsidian` import — for the reason `model/completion.ts` is: this
 * rewrites every overdue note at once, and the dates it replaces cannot be
 * read back afterwards, so the branch is tested here rather than left to the
 * modal that runs it.
 *
 * Rescheduling is not completing. Only `due` moves; `done`, `last done` and
 * the service log are left alone, because nothing was done.
 */

export type RescheduleKind = "recurring" | "one-time" | "skipped";

export interface RescheduleOutcome {
	kind: RescheduleKind;
	/** The frontmatter change to apply — only ever `due`. Empty when skipped. */
	patch: TaskPatch;
	/** The new due date, for a caller that shows it before writing. */
	due?: ISODate;
	/** Why the task is left as it is. Set only when `kind` is "skipped". */
	reason?: string;
}

/**
 * The patch that reschedules one task, and which of the three cases it is.
 *
 * - **recurring** — `due` moves to the first date in its own schedule on or
 *   after today. See `nextDueOnOrAfter` for why that is not simply the date
 *   completing it today would give.
 * - **one-time** — `due` moves to today.
 * - **skipped** — anything not open and overdue, a rule that cannot be read,
 *   or a schedule that has ended. An unreadable rule is not one-time here
 *   either: moving it to today would guess at a schedule it may still mean to
 *   keep, so it is left for the rule to be fixed.
 */
export function rescheduleOverdue(
	task: { done: boolean; due: ISODate | null; frequency: string | null },
	today: ISODate,
): RescheduleOutcome {
	if (task.done || !task.due || task.due >= today) {
		return { kind: "skipped", patch: {}, reason: "Not overdue." };
	}

	const state = frequencyState(task.frequency);

	if (state === "invalid") {
		return { kind: "skipped", patch: {}, reason: "The repeat rule cannot be read." };
	}

	if (state === "none") {
		return { kind: "one-time", patch: { due: today }, due: today };
	}

	const due = nextDueOnOrAfter(task.frequency, task.due, today);
	if (!due) {
		return { kind: "skipped", patch: {}, reason: "The repeat rule has no further dates." };
	}
	return { kind: "recurring", patch: { due }, due };
}
