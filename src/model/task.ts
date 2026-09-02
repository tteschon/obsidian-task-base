import { type App, type TFile, normalizePath } from "obsidian";
import { type ISODate, parseISO, todayISO } from "../dates";
import {
	PRIORITIES,
	type Priority,
	appendLogLine,
	normalizeEmptyKeysIn,
	renderTaskNote,
	sanitizeFileName,
} from "./frontmatter";

export { PRIORITIES, sanitizeFileName } from "./frontmatter";
export type { Priority } from "./frontmatter";

/**
 * The task note contract.
 *
 * A note is a task because it carries `type: task` — not because of where it
 * lives. The base at `tasks/task base.base` collects them from anywhere in the
 * vault. Every frontmatter write in this plugin goes through this module, so
 * the rules below are stated once and enforced once.
 */

/** Frontmatter keys, in the order the vault's task template writes them. */
export const FIELD_ORDER = [
	"done",
	"due",
	"created",
	"priority",
	"category",
	"last done",
	"frequency",
	"type",
	"asset",
] as const;

export interface Task {
	file: TFile;
	name: string;
	done: boolean;
	due: ISODate | null;
	created: string | null;
	priority: Priority;
	category: string | null;
	lastDone: ISODate | null;
	frequency: string | null;
	asset: string | null;
}

/** A date property, or null if it holds anything that is not `YYYY-MM-DD`.
 *
 * Text in a date field is the quiet failure this guards against: `due <
 * today()` against a string like "~25,731 mi" returns **false** rather than
 * raising, so the task is never flagged overdue and nothing reports it. */
function readDate(value: unknown): ISODate | null {
	if (value instanceof Date) {
		return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
			value.getDate(),
		).padStart(2, "0")}`;
	}
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return parseISO(trimmed) ? trimmed : null;
}

function readText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length ? trimmed : null;
}

/**
 * A note's frontmatter as unknown-valued properties.
 *
 * Obsidian declares `FrontMatterCache` as `{ [key: string]: any }`, so every
 * read off it is an unsafe `any` unless narrowed here. The values really are
 * unknown — a user can type anything into a property — and `readDate` and
 * `readText` below are what turn them into something trustworthy.
 */
function frontmatterOf(app: App, file: TFile): Record<string, unknown> | null {
	const fm: unknown = app.metadataCache.getFileCache(file)?.frontmatter;
	return fm && typeof fm === "object" ? (fm as Record<string, unknown>) : null;
}

/** Read a task from the metadata cache. Returns null unless `type: task`. */
export function readTask(app: App, file: TFile): Task | null {
	const fm = frontmatterOf(app, file);
	if (!fm || fm.type !== "task") return null;

	const priority = readText(fm.priority)?.toLowerCase();

	return {
		file,
		name: file.basename,
		done: fm.done === true,
		due: readDate(fm.due),
		created: readDate(fm.created),
		priority: (PRIORITIES as string[]).includes(priority ?? "") ? (priority as Priority) : "low",
		category: readText(fm.category),
		lastDone: readDate(fm["last done"]),
		frequency: readText(fm.frequency),
		asset: readText(fm.asset),
	};
}

/** True when a date property holds something that is not a date. */
export function hasCorruptDate(app: App, file: TFile): boolean {
	const fm = frontmatterOf(app, file);
	if (!fm) return false;
	for (const key of ["due", "last done", "created"]) {
		const raw = fm[key];
		if (raw == null || raw === "") continue;
		if (readDate(raw) === null) return true;
	}
	return false;
}

export interface TaskPatch {
	done?: boolean;
	due?: ISODate | null;
	priority?: Priority;
	category?: string | null;
	lastDone?: ISODate | null;
	frequency?: string | null;
	asset?: string | null;
}

/**
 * Apply a patch to a note's frontmatter in a single atomic edit.
 *
 * Clearing a field assigns `null`, never `""`. To Bases an empty string is not
 * null: a `frequency != null` filter then matches every one-time task, and the
 * base's "Needs attention" view silently returns the wrong rows with no error
 * to explain it. A bare `frequency:` key is the correct empty.
 */
export async function writeTask(app: App, file: TFile, patch: TaskPatch): Promise<void> {
	const cleared: string[] = [];
	const clear = (key: string, value: unknown) => {
		if (value == null) cleared.push(key);
		return value ?? null;
	};

	await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
		if (patch.done !== undefined) fm.done = patch.done;
		if (patch.due !== undefined) fm.due = clear("due", patch.due);
		if (patch.priority !== undefined) fm.priority = patch.priority;
		if (patch.category !== undefined) fm.category = clear("category", patch.category);
		if (patch.lastDone !== undefined) fm["last done"] = clear("last done", patch.lastDone);
		if (patch.frequency !== undefined) fm.frequency = clear("frequency", patch.frequency);
		if (patch.asset !== undefined) fm.asset = clear("asset", patch.asset);
		// `type` is the identity field and is never rewritten here. Nothing in
		// this plugin touches .obsidian/types.json either.
	});

	if (cleared.length) await normalizeEmptyKeys(app, file, cleared);
}


/**
 * Force emptied properties into the shape the template and the base agree on.
 *
 * Two reasons, one cosmetic and one not. Cosmetic: every task note in the
 * vault carries bare empty keys, so a note reading `frequency: null` is the
 * odd one out. Not cosmetic: an empty *string* is not null to Bases, so a
 * `frequency != null` filter would match a task that has no rule, and the
 * base's "Needs attention" view would return the wrong rows with no error.
 */
async function normalizeEmptyKeys(app: App, file: TFile, keys: string[]): Promise<void> {
	await app.vault.process(file, (content) => normalizeEmptyKeysIn(content, keys));
}

export interface NewTask {
	name: string;
	folder: string;
	priority: Priority;
	category: string | null;
	due: ISODate | null;
	frequency: string | null;
	asset: string | null;
	body: string;
	/** The date the task was captured. */
	createdOn: ISODate;
}

/**
 * Create a task note.
 *
 * The frontmatter is rendered as text by `renderTaskNote` rather than written
 * through `processFrontMatter`, so the key order matches the vault's template
 * exactly and empty keys come out bare — `frequency:`, not `frequency: ''`.
 */
export async function createTask(app: App, spec: NewTask): Promise<TFile> {
	const fileName = sanitizeFileName(spec.name);
	if (!fileName) throw new Error("Task name is empty after removing illegal characters.");

	const folder = normalizePath(spec.folder);
	if (folder && !app.vault.getFolderByPath(folder)) {
		await app.vault.createFolder(folder);
	}

	let path = normalizePath(folder ? `${folder}/${fileName}.md` : `${fileName}.md`);
	// Never overwrite an existing note; fall back to a numbered name the way
	// Obsidian itself does.
	for (let i = 1; app.vault.getAbstractFileByPath(path); i++) {
		path = normalizePath(folder ? `${folder}/${fileName} ${i}.md` : `${fileName} ${i}.md`);
	}

	return app.vault.create(
		path,
		renderTaskNote({
			due: spec.due,
			created: spec.createdOn,
			priority: spec.priority,
			category: spec.category,
			frequency: spec.frequency,
			asset: spec.asset,
			body: spec.body,
		}),
	);
}

/**
 * Append a dated line to the note's completion log.
 *
 * Mileage, part numbers, and what was actually done belong here — never in
 * `last done`, which holds only the latest completion and is overwritten every
 * cycle. The body log is the history.
 */
export async function appendLog(
	app: App,
	file: TFile,
	detail: string,
	heading = "Service log",
	when: ISODate = todayISO(),
): Promise<void> {
	await app.vault.process(file, (content) => appendLogLine(content, detail, heading, when));
}
