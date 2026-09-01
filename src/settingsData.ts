import { type Priority } from "./model/frontmatter";

/**
 * Settings shape, defaults, and migration.
 *
 * Kept apart from `settings.ts` because that file imports `obsidian` for
 * `PluginSettingTab`, which no test can load — the same split that keeps
 * `model/frontmatter.ts` and `model/assetLink.ts` testable. Migration is
 * exactly the kind of logic worth testing: it runs once, silently, against
 * data written by an older version that no longer exists to compare against.
 */

export interface HomeTasksSettings {
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

export const DEFAULT_SETTINGS: HomeTasksSettings = {
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
	// Never read by anything: `created` is written as "[[YYYY-MM-DD]]", which
	// Obsidian resolves by note name regardless of which folder it lives in.
	"dailyNoteFolder",
] as const;

/**
 * Stored settings to the current shape.
 *
 * Unknown keys are dropped rather than carried through, so a retired setting
 * cannot be silently rewritten to disk on the next save and reappear as a
 * field nothing reads.
 */
export function migrateSettings(raw: unknown): HomeTasksSettings {
	const stored =
		raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

	const settings = { ...DEFAULT_SETTINGS } as HomeTasksSettings & Record<string, unknown>;

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

export { RETIRED as RETIRED_SETTING_KEYS };
