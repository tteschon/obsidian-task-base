import { RRule, type RRuleInstance, type RRuleOptions } from "./rruleCompat";
import { type ISODate, parseISO, toISO } from "./dates";

/**
 * RRULE handling for recurring tasks.
 *
 * `frequency` on a task note holds a bare RFC 5545 RRULE body — no `RRULE:`
 * prefix, no DTSTART — for example `FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=-1`.
 * The rule carries the shape of the schedule; the anchor comes from when the
 * task was actually completed.
 */

export const WEEKDAYS = [
	{ code: "MO", label: "Mon", rrule: RRule.MO },
	{ code: "TU", label: "Tue", rrule: RRule.TU },
	{ code: "WE", label: "Wed", rrule: RRule.WE },
	{ code: "TH", label: "Thu", rrule: RRule.TH },
	{ code: "FR", label: "Fri", rrule: RRule.FR },
	{ code: "SA", label: "Sat", rrule: RRule.SA },
	{ code: "SU", label: "Sun", rrule: RRule.SU },
] as const;

export type WeekdayCode = (typeof WEEKDAYS)[number]["code"];

/** Parsed options, or null when the string is absent or unusable. */
export function parseFrequency(text: unknown): Partial<RRuleOptions> | null {
	if (typeof text !== "string" || !text.trim()) return null;
	let opts: Partial<RRuleOptions>;
	try {
		opts = RRule.parseString(text.trim());
	} catch {
		// A malformed value is a data problem to surface, not a crash.
		return null;
	}
	// parseString does not throw on an unrecognised FREQ — `FREQ=FORTNIGHTLY`
	// comes back with `freq: undefined` and every other field intact. Without
	// this check the task would read as recurring, sit in "Needs attention"
	// forever, and never produce a due date.
	if (typeof opts.freq !== "number" || opts.freq < RRule.YEARLY || opts.freq > RRule.SECONDLY) {
		return null;
	}
	return opts;
}

/**
 * What state a task's `frequency` is in.
 *
 * "invalid" is deliberately not folded into "none". A one-time task gets
 * `done: true` on completion, so silently treating an unreadable rule as
 * one-time would retire a task that was meant to keep recurring.
 */
export type FrequencyState = "none" | "valid" | "invalid";

export function frequencyState(text: unknown): FrequencyState {
	if (typeof text !== "string" || !text.trim()) return "none";
	return parseFrequency(text) ? "valid" : "invalid";
}

/** True when the value is a usable RRULE. */
export function isRecurring(text: unknown): boolean {
	return parseFrequency(text) !== null;
}

/** Plain-English rendering, e.g. "every 6 months on the last day". */
export function describeFrequency(text: unknown): string {
	const opts = parseFrequency(text);
	if (!opts) return "";
	try {
		return new RRule({ ...opts, dtstart: new Date(Date.UTC(2026, 0, 1)) }).toText();
	} catch {
		return typeof text === "string" ? text : "";
	}
}

/** Does the rule select its own days, or is the day implied by the anchor? */
function hasDaySelection(opts: Partial<RRuleOptions>): boolean {
	const keys = ["byweekday", "bymonthday", "bymonth", "byyearday", "bysetpos", "byweekno"] as const;
	return keys.some((k) => {
		const v = opts[k];
		return v != null && (!Array.isArray(v) || v.length > 0);
	});
}

/** Start of the FREQ-sized period containing `from`. Weeks start Monday, matching rrule's default WKST. */
function periodStart(freq: RRuleOptions["freq"], from: Date): Date {
	const y = from.getUTCFullYear();
	const m = from.getUTCMonth();
	const d = from.getUTCDate();
	switch (freq) {
		case RRule.YEARLY:
			return new Date(Date.UTC(y, 0, 1));
		case RRule.MONTHLY:
			return new Date(Date.UTC(y, m, 1));
		case RRule.WEEKLY:
			return new Date(Date.UTC(y, m, d - ((from.getUTCDay() + 6) % 7)));
		default:
			return new Date(Date.UTC(y, m, d));
	}
}

/** Last day of the FREQ-sized period beginning at `start`. */
function periodEnd(freq: RRuleOptions["freq"], start: Date): Date {
	const y = start.getUTCFullYear();
	const m = start.getUTCMonth();
	const d = start.getUTCDate();
	switch (freq) {
		case RRule.YEARLY:
			return new Date(Date.UTC(y + 1, 0, 0));
		case RRule.MONTHLY:
			return new Date(Date.UTC(y, m + 1, 0));
		case RRule.WEEKLY:
			return new Date(Date.UTC(y, m, d + 6));
		default:
			return new Date(Date.UTC(y, m, d));
	}
}

/** `from` advanced by one whole FREQ x INTERVAL period. */
function advanceOnePeriod(opts: Partial<RRuleOptions>, from: Date): Date {
	const n = opts.interval ?? 1;
	const y = from.getUTCFullYear();
	const m = from.getUTCMonth();
	const d = from.getUTCDate();
	switch (opts.freq) {
		case RRule.YEARLY:
			return new Date(Date.UTC(y + n, m, d));
		case RRule.MONTHLY:
			return new Date(Date.UTC(y, m + n, d));
		case RRule.WEEKLY:
			return new Date(Date.UTC(y, m, d + 7 * n));
		default:
			return new Date(Date.UTC(y, m, d + n));
	}
}

/**
 * The next due date after completing a recurring task on `completedOn`.
 *
 * The policy is **skip the rest of the period you just did it in**, then take
 * the schedule's next occurrence. Three cases, in order:
 *
 * 1. **No day-selection in the rule** (`FREQ=YEARLY`). The day is implied by
 *    the anchor, so the roll is simply one period later — a yearly task done
 *    19 June comes back the following 19 June, not on 1 January.
 *
 * 2. **More than one occurrence per period** (`FREQ=WEEKLY;BYDAY=MO,TH`). The
 *    remaining occurrences in this period are real, so take the strict next
 *    one: done Monday, due Thursday.
 *
 * 3. **One occurrence per period**, which is every rule in the vault today.
 *    Anchor the rule at the start of the current period so nothing gets
 *    clipped, then take the first occurrence after that period ends. INTERVAL
 *    does the rest of the skipping on its own.
 *
 * Case 3 is why this is not a plain `rrule.after(today)`. Anchoring at the
 * completion date makes INTERVAL step from there, so an oil change on
 * 2026-06-19 under `FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=-1` would roll to
 * 2026-06-30 — eleven days out instead of six months. Anchoring at the period
 * start and skipping past it yields 2026-12-31, which is what the vault holds.
 */
export function nextDue(text: unknown, completedOn: ISODate): ISODate | null {
	const opts = parseFrequency(text);
	const from = parseISO(completedOn);
	if (!opts || opts.freq == null || !from) return null;
	const freq = opts.freq;

	if (!hasDaySelection(opts)) {
		return toISO(advanceOnePeriod(opts, from));
	}

	const start = periodStart(freq, from);
	const end = periodEnd(freq, start);

	let rule: RRuleInstance;
	try {
		rule = new RRule({ ...opts, dtstart: start });
	} catch {
		return null;
	}

	if (rule.between(start, end, true).length > 1) {
		const strict = rule.after(from, false);
		if (strict) return toISO(strict);
	}

	const next = rule.after(end, false);
	return next ? toISO(next) : null;
}

/** The next `count` occurrences on or after `fromISO`, for preview UI. */
export function upcoming(text: unknown, fromISO: ISODate, count = 3): ISODate[] {
	const opts = parseFrequency(text);
	const from = parseISO(fromISO);
	if (!opts || opts.freq == null || !from) return [];
	try {
		const anchor = hasDaySelection(opts) ? periodStart(opts.freq, from) : from;
		const rule = new RRule({ ...opts, dtstart: anchor });
		const out: ISODate[] = [];
		let cursor: Date | null = from;
		for (let i = 0; i < count && cursor; i++) {
			const hit: Date | null = rule.after(cursor, i === 0);
			if (!hit) break;
			out.push(toISO(hit));
			cursor = hit;
		}
		return out;
	} catch {
		return [];
	}
}

export interface FrequencySpec {
	freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
	interval: number;
	byday: WeekdayCode[];
	lastDayOfMonth: boolean;
}

export const DEFAULT_SPEC: FrequencySpec = {
	freq: "WEEKLY",
	interval: 1,
	byday: [],
	lastDayOfMonth: false,
};

/**
 * A spec from the builder UI to an RRULE string.
 *
 * Only fields that carry meaning are emitted, so output matches the terse
 * style already in the vault: `FREQ=YEARLY`, never `FREQ=YEARLY;INTERVAL=1`.
 */
export function buildFrequency(spec: FrequencySpec): string {
	const parts = [`FREQ=${spec.freq}`];
	if (spec.interval > 1) parts.push(`INTERVAL=${spec.interval}`);
	if ((spec.freq === "WEEKLY" || spec.freq === "MONTHLY") && spec.byday.length > 0) {
		parts.push(`BYDAY=${spec.byday.join(",")}`);
	}
	if (spec.freq === "MONTHLY" && spec.lastDayOfMonth) parts.push("BYMONTHDAY=-1");
	return parts.join(";");
}

/** An RRULE string back to a spec, so the builder can open on an existing rule. */
export function specFromFrequency(text: unknown): FrequencySpec | null {
	const opts = parseFrequency(text);
	if (!opts) return null;
	const freqName = (
		{
			[RRule.DAILY]: "DAILY",
			[RRule.WEEKLY]: "WEEKLY",
			[RRule.MONTHLY]: "MONTHLY",
			[RRule.YEARLY]: "YEARLY",
		} as Record<number, FrequencySpec["freq"]>
	)[opts.freq as number];
	if (!freqName) return null;

	const byday: WeekdayCode[] = [];
	const raw = opts.byweekday;
	if (raw != null) {
		for (const w of Array.isArray(raw) ? raw : [raw]) {
			const n = typeof w === "number" ? w : (w as { weekday: number }).weekday;
			const found = WEEKDAYS[n];
			if (found) byday.push(found.code);
		}
	}

	const md = opts.bymonthday;
	const mdList = md == null ? [] : Array.isArray(md) ? md : [md];

	return {
		freq: freqName,
		interval: opts.interval ?? 1,
		byday,
		lastDayOfMonth: mdList.includes(-1),
	};
}
