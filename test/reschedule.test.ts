import { strict as assert } from "node:assert";
import { test } from "node:test";
import { rescheduleOverdue } from "../src/model/reschedule";

/**
 * Where rescheduling moves an overdue task.
 *
 * The patch is asserted whole every time, because the promise here is as much
 * about what is left alone as about what moves: rescheduling is not
 * completing, so `done` and `last done` must never appear in it.
 */

const TODAY = "2026-09-22";

type Candidate = { done: boolean; due: string | null; frequency: string | null };
const open = (due: string | null, frequency: string | null): Candidate => ({
	done: false,
	due,
	frequency,
});

test("a one-time task moves to today and nothing else changes", () => {
	const out = rescheduleOverdue(open("2026-09-01", null), TODAY);
	assert.equal(out.kind, "one-time");
	assert.deepEqual(out.patch, { due: TODAY });
	assert.equal(out.due, TODAY);
});

test("an empty rule is one-time, not recurring", () => {
	for (const frequency of ["", "   "]) {
		assert.equal(rescheduleOverdue(open("2026-09-01", frequency), TODAY).kind, "one-time");
	}
});

test("a recurring task moves to the next date in its schedule and is not completed", () => {
	// This Sunday. Completing it today would have spent this week's slot and
	// given 2026-10-04.
	const out = rescheduleOverdue(open("2026-09-13", "FREQ=WEEKLY;BYDAY=SU"), TODAY);
	assert.equal(out.kind, "recurring");
	assert.deepEqual(out.patch, { due: "2026-09-27" });
	assert.equal(out.due, "2026-09-27");
});

test("an unreadable rule is left alone rather than moved to today", () => {
	// Moving it to today would treat it as one-time — the guess the plugin
	// refuses to make anywhere else.
	const out = rescheduleOverdue(open("2026-09-01", "FREQ=FORTNIGHTLY"), TODAY);
	assert.equal(out.kind, "skipped");
	assert.deepEqual(out.patch, {});
	assert.match(out.reason ?? "", /cannot be read/);
});

test("a schedule with no further dates is left alone", () => {
	const out = rescheduleOverdue(open("2026-09-14", "FREQ=WEEKLY;BYDAY=MO;COUNT=1"), TODAY);
	assert.equal(out.kind, "skipped");
	assert.deepEqual(out.patch, {});
	assert.match(out.reason ?? "", /no further dates/);
});

test("anything not open and overdue is skipped", () => {
	const notOverdue: Array<[task: Candidate, why: string]> = [
		[open(TODAY, null), "due today"],
		[open("2026-09-30", null), "due later"],
		[open(null, null), "no due date"],
		[open(null, "FREQ=WEEKLY;BYDAY=MO"), "recurring, waiting on a first completion"],
		[{ done: true, due: "2026-09-01", frequency: null }, "one-time and done"],
		[{ done: true, due: "2026-09-01", frequency: "FREQ=WEEKLY;BYDAY=MO" }, "recurring, stuck at done"],
	];
	for (const [task, why] of notOverdue) {
		const out = rescheduleOverdue(task, TODAY);
		assert.equal(out.kind, "skipped", why);
		assert.deepEqual(out.patch, {}, why);
	}
});
