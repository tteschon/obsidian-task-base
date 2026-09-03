import { type App, type TFile, type TFolder, normalizePath } from "obsidian";
import { sanitizeFileName } from "./frontmatter";

/**
 * Writing a new note into the vault.
 *
 * Task notes and asset notes differ only in what goes between the frontmatter
 * delimiters; everything about *placing* the file is identical, and the rules
 * below are the kind that go wrong quietly — a name Obsidian rejects, a folder
 * that does not exist yet, a second task called "Mow lawn" silently replacing
 * the first. Stated once here so both creators cannot drift apart on them.
 */

export interface NewNote {
	/** The note's title; becomes the file name after illegal characters go. */
	name: string;
	/** Created if missing. Empty means the vault root. */
	folder: string;
	content: string;
}

/**
 * The folder at `path` as the vault actually spells it, or null if there is none.
 *
 * Obsidian looks folders up **case-sensitively** while macOS and Windows store
 * them case-insensitively. A setting reading `inventory` against a vault that
 * holds `Inventory` therefore finds nothing by the exact lookup, and creating
 * it then throws `Folder already exists` — for a folder the line above just
 * said was absent. The lowered comparison is what closes that gap, and
 * returning the vault's own spelling is what lets a caller *show* where a note
 * will go without promising a folder that will not be the one used.
 */
export function findFolder(app: App, path: string): TFolder | null {
	const normalized = normalizePath(path);
	const exact = app.vault.getFolderByPath(normalized);
	if (exact) return exact;

	const wanted = normalized.toLowerCase();
	return app.vault.getAllFolders(true).find((f) => f.path.toLowerCase() === wanted) ?? null;
}

async function resolveFolder(app: App, path: string): Promise<TFolder> {
	return findFolder(app, path) ?? (await app.vault.createFolder(path));
}

export async function createNote(app: App, spec: NewNote): Promise<TFile> {
	const fileName = sanitizeFileName(spec.name);
	if (!fileName) throw new Error("Note name is empty after removing illegal characters.");

	const folder = await resolveFolder(app, spec.folder);

	// Never overwrite an existing note; fall back to a numbered name the way
	// Obsidian itself does. Compared case-insensitively for the same reason the
	// folder is — otherwise `vault.create` refuses a name this loop just
	// declared free, and the caller reports a failure it cannot explain.
	const taken = new Set(folder.children.map((f) => f.name.toLowerCase()));
	let base = fileName;
	for (let i = 1; taken.has(`${base}.md`.toLowerCase()); i++) base = `${fileName} ${i}`;

	const dir = folder.isRoot() ? "" : `${folder.path}/`;
	return app.vault.create(normalizePath(`${dir}${base}.md`), spec.content);
}
