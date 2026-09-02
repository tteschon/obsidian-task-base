import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
	buildFrequency,
	describeFrequency,
	frequencyState,
	isRecurring,
	nextDue,
	parseFrequency,
	specFromFrequency,
	upcoming,
} from "../src/recurrence";

/**
 * Every rule value live in the vault, plus the edges the policy exists to get
 * right. The two marked "live" are read straight off task notes and are the
 * regression guard: if either changes, the roll-forward has drifted.
 */
const cases: Array<[rule: string, completedOn: string, expected: string, why: string]> = [
	["FREQ=WEEKLY;BYDAY=MO", "2026-08-24", "2026-08-31", "live: Take out the garbage"],
	["FREQ=WEEKLY;BYDAY=SU", "2026-08-17", "2026-08-30", "weekly snaps to the next Sunday"],
	["FREQ=WEEKLY;INTERVAL=2;BYDAY=MO", "2026-08-24", "2026-09-07", "fortnightly skips a week"],
	["FREQ=MONTHLY;BYMONTHDAY=-1", "2026-08-22", "2026-09-30", "last day of next month"],
	[
		"FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=-1",
		"2026-06-19",
		"2026-12-31",
		"live: Oil Change — six months out, not eleven days",
	],
	["FREQ=YEARLY", "2026-06-19", "2027-06-19", "bare rule keeps the completion anniversary"],
	["FREQ=MONTHLY;BYMONTHDAY=-1", "2026-01-31", "2026-02-28", "short month"],
	["FREQ=MONTHLY;BYMONTHDAY=-1", "2028-01-31", "2028-02-29", "leap February"],
	["FREQ=YEARLY", "2024-02-29", "2025-03-01", "leap day rolls to 1 March"],
	["FREQ=DAILY", "2026-08-31", "2026-09-01", "daily crosses a month boundary"],
	["FREQ=DAILY;INTERVAL=3", "2026-12-30", "2027-01-02", "interval crosses a year boundary"],
	[
		"FREQ=WEEKLY;BYDAY=MO,TH",
		"2026-08-24",
		"2026-08-27",
		"two per week takes the strict next occurrence, not next week",
	],
	[
		"FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=15",
		"2026-06-19",
		"2026-12-15",
		"anchoring at the period start keeps the 15th from being clipped",
	],
];

test("nextDue rolls each live rule forward correctly", () => {
	for (const [rule, from, expected, why] of cases) {
		assert.equal(nextDue(rule, from), expected, `${rule} from ${from} — ${why}`);
	}
});

test("nextDue never returns a date on or before the completion", () => {
	for (const [rule, from] of cases) {
		const got = nextDue(rule, from);
		assert.ok(got !== null && got > from, `${rule} from ${from} returned ${got}`);
	}
});

test("a bad or absent rule yields null rather than throwing", () => {
	for (const bad of [null, undefined, "", "   ", "not a rule", "FREQ=FORTNIGHTLY", 42]) {
		assert.equal(nextDue(bad, "2026-08-31"), null, String(bad));
		assert.equal(isRecurring(bad), false, String(bad));
		assert.equal(parseFrequency(bad), null, String(bad));
	}
});

test("an unreadable rule is its own state, never mistaken for one-time", () => {
	// The dangerous confusion: a one-time task gets done: true on completion,
	// so folding "invalid" into "none" would retire a recurring task.
	assert.equal(frequencyState("FREQ=FORTNIGHTLY"), "invalid");
	assert.equal(frequencyState("not a rule"), "invalid");
	assert.equal(frequencyState("INTERVAL=2"), "invalid");
	assert.equal(frequencyState(null), "none");
	assert.equal(frequencyState(""), "none");
	assert.equal(frequencyState("   "), "none");
	assert.equal(frequencyState("FREQ=WEEKLY;BYDAY=MO"), "valid");
});

test("a bad completion date yields null", () => {
	for (const bad of ["2026-13-01", "2026-02-30", "31/08/2026", "today", ""]) {
		assert.equal(nextDue("FREQ=WEEKLY;BYDAY=MO", bad), null, bad);
	}
});

test("build and parse round-trip, and stay terse", () => {
	assert.equal(
		buildFrequency({ freq: "YEARLY", interval: 1, byday: [], lastDayOfMonth: false }),
		"FREQ=YEARLY",
		"INTERVAL=1 is never emitted",
	);
	for (const rule of [
		"FREQ=WEEKLY;BYDAY=MO",
		"FREQ=WEEKLY;INTERVAL=2;BYDAY=MO",
		"FREQ=MONTHLY;BYMONTHDAY=-1",
		"FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=-1",
		"FREQ=YEARLY",
		"FREQ=DAILY;INTERVAL=3",
	]) {
		const spec = specFromFrequency(rule);
		assert.ok(spec, `no spec for ${rule}`);
		assert.equal(buildFrequency(spec), rule, `round-trip failed for ${rule}`);
	}
});

test("every live rule renders in plain English", () => {
	for (const [rule] of cases) {
		assert.ok(describeFrequency(rule).length > 0, rule);
	}
	assert.equal(describeFrequency(""), "");
});

test("upcoming returns ascending future dates", () => {
	const dates = upcoming("FREQ=WEEKLY;BYDAY=MO", "2026-08-31", 3);
	assert.deepEqual(dates, ["2026-08-31", "2026-09-07", "2026-09-14"]);
	assert.deepEqual(upcoming("nonsense", "2026-08-31"), []);
});

test("a month-end rule reads as a sentence", () => {
	// rrule's own toText stops at "on the last", which is not English. Only the
	// bare trailing form is patched — an ordinal weekday must survive intact.
	assert.equal(describeFrequency("FREQ=MONTHLY;BYMONTHDAY=-1"), "every month on the last day");
	assert.equal(
		describeFrequency("FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=-1"),
		"every 6 months on the last day",
	);
	assert.match(describeFrequency("FREQ=MONTHLY;BYDAY=-1MO"), /last Monday$/);
	assert.equal(describeFrequency("FREQ=WEEKLY;BYDAY=TU"), "every week on Tuesday");
});
