import type { ISODate } from "../dates";
import { frequencyState, nextDue } from "../recurrence";
import type { TaskPatch } from "./task";

/**
 * What completing a task does to its frontmatter.
 *
 * Pure — no `obsidian` import — so the branch that decides a task's fate is
 * testable outside the app, alongside `model/frontmatter.ts` and
 * `recurrence.ts`. That is the reason this is a module and not a method on the
 * modal: three outcomes, one of which retires a schedule, is not a decision to
 * leave covered only by clicking through the UI.
 *
 * The three outcomes are not recoverable by reading the note afterwards, which
 * is why the caller is told which one it got rather than being left to infer
 * it from the patch.
 */

export type CompletionKind = "recurring" | "one-time" | "refused";

export interface CompletionOutcome {
	kind: CompletionKind;
	/** The frontmatter change to apply. Empty when `kind` is "refused". */
	patch: TaskPatch;
	/** Why a refusal happened, or what a caller should know about the result. */
	reason?: string;
	/** The computed due date, for a caller that wants to show it before writing. */
	due?: ISODate | null;
}

export interface CompletionOptions {
	completedOn: ISODate;
	/**
	 * Use this date instead of the computed one.
	 *
	 * The modal offers the computed date in an editable field; passing the
	 * edited value here keeps the rest of the policy identical rather than
	 * letting the UI assemble its own patch.
	 */
	dueOverride?: ISODate | null;
}

/**
 * The patch that completes a task, and which of the three cases it is.
 *
 * - **recurring** — `last done` = the completion date, `due` recomputed, `done`
 *   back to false. A recurring task is never left at `done: true`; that is what
 *   makes it recur.
 * - **one-time** — `last done` = the completion date, `done` = true. The note
 *   stays on disk and stays in the base; deleting it is not this plugin's job.
 * - **refused** — the rule is set but unreadable. Completing it as one-time
 *   would write `done: true` and retire a task that was meant to keep
 *   recurring, so nothing is written and the caller is told to fix the rule.
 */
export function completionPatch(
	task: { frequency: string | null },
	options: CompletionOptions,
): CompletionOutcome {
	const { completedOn } = options;
	const state = frequencyState(task.frequency);

	if (state === "invalid") {
		return {
			kind: "refused",
			patch: {},
			reason:
				"The repeat rule cannot be read, so there is no safe way to complete this task. Fix the rule, or clear it to make this a one-time task.",
		};
	}

	if (state === "none") {
		return {
			kind: "one-time",
			patch: { lastDone: completedOn, done: true },
			due: null,
		};
	}

	// `dueOverride` is deliberately honoured even when null: the modal's date
	// field can be emptied, and "no due date" is a choice the user is allowed
	// to make. Only an absent key falls through to the computed date.
	const due =
		options.dueOverride !== undefined ? options.dueOverride : nextDue(task.frequency, completedOn);

	return {
		kind: "recurring",
		patch: { lastDone: completedOn, due, done: false },
		due,
		reason: due
			? undefined
			: "The recurrence rule produced no next date, so the due date is cleared.",
	};
}
