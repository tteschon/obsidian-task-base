import { PRIORITIES, type Priority } from "./model/frontmatter";

/**
 * Settings shape, defaults, and migration.
 *
 * Kept apart from `settings.ts` because that file imports `obsidian` for
 * `PluginSettingTab`, which no test can load — the same split that keeps
 * `model/frontmatter.ts` and `model/assetLink.ts` testable. Migration is
 * exactly the kind of logic worth testing: it runs once, silently, against
 * data written by an older version that no longer exists to compare against.
 */

export interface TaskBaseSettings {
	/** Where new task notes are created. */
	taskFolder: string;
	/**
	 * Folders whose notes are ignored even when they carry `type: task`.
	 *
	 * A vault may hold notes that use the property for something else — Kanban
	 * cards on their own schema, a task template that would otherwise list
	 * itself. These must match the `!file.inFolder(...)` clauses in the task
	 * base, or the pane and the base will quietly disagree.
	 */
	excludedFolders: string[];
	/** Offered in the create modal alongside anything already in the vault. */
	categories: string[];
	defaultPriority: Priority;
	/** Heading the completion log is appended under. */
	logHeading: string;
	/** The task base, opened by a button in the task pane. Empty hides it. */
	basePath: string;
	openViewOnStart: boolean;
}

export const DEFAULT_SETTINGS: TaskBaseSettings = {
	taskFolder: "tasks",
	excludedFolders: ["Templates"],
	categories: ["home", "yard", "errands", "vehicle", "health"],
	defaultPriority: "low",
	logHeading: "Service log",
	basePath: "tasks/task base.base",
	openViewOnStart: false,
};

/** Keys written by earlier versions that must not survive into the settings. */
const RETIRED = [
	// Superseded by excludedFolders, which holds a list rather than one folder.
	"templateFolder",
	// Never read by anything, and now doubly obsolete: `created` is a bare
	// date registered as a `date` property, not a link to a daily note.
	"dailyNoteFolder",
] as const;

/**
 * Stored settings to the current shape.
 *
 * Unknown keys are dropped rather than carried through, so a retired setting
 * cannot be silently rewritten to disk on the next save and reappear as a
 * field nothing reads.
 */
export function migrateSettings(raw: unknown): TaskBaseSettings {
	const stored =
		raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

	const settings = { ...DEFAULT_SETTINGS } as TaskBaseSettings & Record<string, unknown>;

	for (const key of Object.keys(DEFAULT_SETTINGS)) {
		if (stored[key] !== undefined) settings[key] = stored[key];
	}

	// The single `templateFolder` becomes the first entry of the list. An empty
	// value meant "exclude nothing", which is an empty list, not the default.
	if (stored.excludedFolders === undefined && typeof stored.templateFolder === "string") {
		const folder = stored.templateFolder.trim();
		settings.excludedFolders = folder ? [folder] : [];
	}

	if (!Array.isArray(settings.excludedFolders)) {
		settings.excludedFolders = [...DEFAULT_SETTINGS.excludedFolders];
	}

	return settings;
}

/**
 * Is this note's path inside one of the excluded folders?
 *
 * Matches the folder itself or anything beneath it, never a bare string
 * prefix: excluding `Templates` must leave `Templates 2` alone. Lives here
 * rather than in the repository so it can be tested without the Obsidian API.
 */
export function isInExcludedFolder(path: string, excluded: string[]): boolean {
	return excluded.some((raw) => {
		const folder = raw.trim().replace(/\/+$/, "");
		if (!folder) return false;
		return path === folder || path.startsWith(`${folder}/`);
	});
}

/**
 * The settings, described once.
 *
 * Two renderers consume this: `getSettingDefinitions()`, which gives Obsidian
 * 1.13+ a searchable settings index, and `display()`, which is all that older
 * versions have. Describing them twice would guarantee they drift, and a
 * setting that exists in one and not the other is invisible rather than broken
 * — the worst kind of bug to notice.
 */
export type SettingKind =
	| { kind: "text"; placeholder?: string }
	| { kind: "textList"; placeholder?: string }
	| { kind: "dropdown"; options: readonly string[] }
	| { kind: "toggle" };

export interface SettingSpec {
	key: keyof TaskBaseSettings;
	name: string;
	desc?: string;
	/** Redraw the task pane after a change; folder rules alter what it shows. */
	refreshesViews?: boolean;
	type: SettingKind;
}

export const SETTING_SPECS: readonly SettingSpec[] = [
	{
		key: "taskFolder",
		name: "New task folder",
		desc: "Where the create command puts new task notes.",
		type: { kind: "text", placeholder: "tasks" },
	},
	{
		key: "excludedFolders",
		name: "Excluded folders",
		desc: "Comma-separated. Notes in these folders are ignored even when they carry type: task — a task template, or Kanban cards on their own schema. Must match the !file.inFolder clauses in your task base, or the pane and the base will disagree.",
		refreshesViews: true,
		type: { kind: "textList", placeholder: "Templates" },
	},
	{
		key: "categories",
		name: "Categories",
		desc: "Comma-separated. Categories already used in the vault are offered too.",
		type: { kind: "textList", placeholder: "home, yard, errands" },
	},
	{
		key: "defaultPriority",
		name: "Default priority",
		type: { kind: "dropdown", options: PRIORITIES },
	},
	{
		key: "logHeading",
		name: "Completion log heading",
		desc: "Where completion notes are appended in the note body.",
		type: { kind: "text", placeholder: "Service log" },
	},
	{
		key: "basePath",
		name: "Base file",
		desc: "The .base file opened by the button in the task pane. Optional — the pane reads the vault directly and works without one. Leave empty to hide the button.",
		refreshesViews: true,
		type: { kind: "text", placeholder: "tasks/task base.base" },
	},
	{
		key: "openViewOnStart",
		name: "Open task list on start",
		type: { kind: "toggle" },
	},
];

/** A `string[]` setting as the comma-separated text the UI shows. */
export function listToText(value: unknown): string {
	return Array.isArray(value) ? value.join(", ") : "";
}

/** Comma-separated text back to a `string[]`, dropping blanks. */
export function textToList(value: string): string[] {
	return value
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

export { RETIRED as RETIRED_SETTING_KEYS };
