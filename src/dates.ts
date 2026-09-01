/**
 * All-day, floating dates.
 *
 * Every date in this plugin is a calendar day with no time and no zone: the
 * `due` and `last done` properties are registered as `date` in the vault, and
 * Obsidian stores them as bare `YYYY-MM-DD`.
 *
 * The trap this module exists to close: `new Date("2026-08-31")` parses as
 * UTC midnight, but `.getDate()` reads local time. Anywhere west of Greenwich
 * that pair reports the 30th. So every date here is built with `Date.UTC` and
 * read back with `getUTC*`, and the two conventions are never mixed. `rrule`
 * works the same way for floating rules, which is why the two agree.
 */

/** A calendar date as `YYYY-MM-DD`. */
export type ISODate = string;

const pad = (n: number) => String(n).padStart(2, "0");

/** Today, in the user's local calendar, as `YYYY-MM-DD`. */
export function todayISO(): ISODate {
	const now = new Date();
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `YYYY-MM-DD` to a UTC-midnight Date. Returns null for anything else. */
export function parseISO(value: unknown): Date | null {
	if (typeof value !== "string") return null;
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
	if (!m) return null;
	const [, y, mo, d] = m;
	const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
	// Rejects impossible dates that Date.UTC would silently roll over, e.g.
	// 2026-02-30 becoming March 2nd.
	if (date.getUTCMonth() !== Number(mo) - 1) return null;
	return date;
}

/** A UTC-midnight Date back to `YYYY-MM-DD`. */
export function toISO(date: Date): ISODate {
	return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDays(date: Date, n: number): Date {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + n));
}

export function addMonths(date: Date, n: number): Date {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, date.getUTCDate()));
}

export function addYears(date: Date, n: number): Date {
	return new Date(Date.UTC(date.getUTCFullYear() + n, date.getUTCMonth(), date.getUTCDate()));
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function daysBetween(a: Date, b: Date): number {
	return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * "in 3 days", "yesterday", "5 days ago" — the relative label the sidebar
 * shows next to a due date.
 */
export function relativeDay(due: ISODate, from: ISODate = todayISO()): string {
	const a = parseISO(from);
	const b = parseISO(due);
	if (!a || !b) return "";
	const n = daysBetween(a, b);
	if (n === 0) return "today";
	if (n === 1) return "tomorrow";
	if (n === -1) return "yesterday";
	return n > 0 ? `in ${n} days` : `${-n} days overdue`;
}

/** A readable calendar label, e.g. "Mon 31 Aug 2026". */
export function formatHuman(value: ISODate): string {
	const d = parseISO(value);
	if (!d) return value;
	return d.toLocaleDateString(undefined, {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	});
}
