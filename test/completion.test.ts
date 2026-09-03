import { strict as assert } from "node:assert";
import { test } from "node:test";
import { completionPatch } from "../src/model/completion";

/**
 * The branch that decides a task's fate.
 *
 * Each case is here because getting it wrong is unrecoverable by reading the
 * note afterwards: a recurring task written to `done: true` has silently
 * stopped recurring, and a one-time task written back to `done: false` never
 * finishes.
 */

test("a task with no rule is completed as one-time", () => {
	const out = completionPatch({ frequency: null }, { completedOn: "2026-09-02" });
	assert.equal(out.kind, "one-time");
	assert.deepEqual(out.patch, { lastDone: "2026-09-02", done: true });
});

test("an empty rule is one-time, not recurring", () => {
	// The template writes a bare `frequency:` key on every task note, so the
	// empty string and the absent key both have to land here.
	for (const frequency of ["", "   "]) {
		assert.equal(completionPatch({ frequency }, { completedOn: "2026-09-02" }).kind, "one-time");
	}
});

test("a recurring task rolls forward and is never left done", () => {
	const out = completionPatch(
		{ frequency: "FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=-1" },
		{ completedOn: "2026-06-19" },
	);
	assert.equal(out.kind, "recurring");
	assert.deepEqual(out.patch, { lastDone: "2026-06-19", due: "2026-12-31", done: false });
});

test("the completion date is the anchor, not the current due date", () => {
	// Mowing on a Wednesday under a Sunday rule skips the rest of the week:
	// the slot in the period just completed is spent.
	const out = completionPatch({ frequency: "FREQ=WEEKLY;BYDAY=SU" }, { completedOn: "2026-09-02" });
	assert.equal(out.due, "2026-09-13");
});

test("an unreadable rule is refused rather than treated as one-time", () => {
	// Completing this as one-time would write done: true and retire a schedule
	// that was meant to keep running.
	const out = completionPatch({ frequency: "FREQ=FORTNIGHTLY" }, { completedOn: "2026-09-02" });
	assert.equal(out.kind, "refused");
	assert.deepEqual(out.patch, {});
	assert.match(out.reason ?? "", /cannot be read/);
});

test("a due override replaces the computed date without changing the branch", () => {
	const out = completionPatch(
		{ frequency: "FREQ=WEEKLY;BYDAY=SU" },
		{ completedOn: "2026-09-02", dueOverride: "2026-10-04" },
	);
	assert.equal(out.kind, "recurring");
	assert.equal(out.patch.due, "2026-10-04");
	assert.equal(out.patch.done, false);
});

test("an explicitly null override clears the due date", () => {
	// The modal's date field can be emptied, and "no due date" is a choice the
	// user is allowed to make. Only an absent key falls through to the computed
	// date, which is why this is distinguishable from the case above.
	const out = completionPatch(
		{ frequency: "FREQ=WEEKLY;BYDAY=SU" },
		{ completedOn: "2026-09-02", dueOverride: null },
	);
	assert.equal(out.kind, "recurring");
	assert.equal(out.patch.due, null);
});

test("a rule that yields no further date clears due and says so", () => {
	// COUNT exhausted: the series has ended, so there is no date to write.
	const out = completionPatch(
		{ frequency: "FREQ=WEEKLY;BYDAY=MO;COUNT=1" },
		{ completedOn: "2026-09-02" },
	);
	assert.equal(out.kind, "recurring");
	assert.equal(out.patch.due, null);
	assert.match(out.reason ?? "", /no next date/);
});
