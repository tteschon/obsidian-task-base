import type { ISODate } from "../dates";

/**
 * Pure text handling for task notes.
 *
 * Nothing here touches the Obsidian API, which keeps it testable outside the
 * app — and these are exactly the functions worth testing, since a regex that
 * strays out of the frontmatter would quietly rewrite someone's note body.
 */

/** Characters Obsidian will not accept in a file name. */
export function sanitizeFileName(name: string): string {
	return name
		.replace(/[\\/:*?"<>|#^[\]]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

export interface TaskNoteFields {
	due: ISODate | null;
	created: ISODate;
	priority: string;
	category: string | null;
	frequency: string | null;
	asset: string | null;
	body: string;
}

const value = (v: string | null): string => (v == null ? "" : ` ${v}`);

/**
 * Render a new task note.
 *
 * Key order follows the vault's task template, and empty fields come out as
 * bare keys — `frequency:` and never `frequency: ''`. An empty string is not
 * null to Bases, so a `frequency != null` filter would match a one-time task
 * and the base's "Needs attention" view would return the wrong rows with
 * nothing to explain why.
 */
export function renderTaskNote(fields: TaskNoteFields): string {
	const lines = [
		"---",
		"done: false",
		`due:${value(fields.due)}`,
		`created: "[[${fields.created}]]"`,
		`priority: ${fields.priority}`,
		`category:${value(fields.category)}`,
		"last done:",
		`frequency:${value(fields.frequency)}`,
		"type: task",
	];
	if (fields.asset) lines.push(`asset: "${fields.asset}"`);
	lines.push("---", "");
	if (fields.body.trim()) lines.push("", fields.body.trim(), "");
	return lines.join("\n");
}

/**
 * Rewrite `key: null` / `key: ~` / `key: ''` to a bare `key:`.
 *
 * Whatever the YAML serialiser does with an emptied property, the file ends up
 * in the one shape the template and the base agree on. The scan stops at the
 * closing frontmatter delimiter, so the note body is never touched.
 */
export function normalizeEmptyKeysIn(content: string, keys: string[]): string {
	if (!content.startsWith("---") || keys.length === 0) return content;
	const end = content.indexOf("\n---", 3);
	if (end === -1) return content;

	const head = content.slice(0, end);
	const tail = content.slice(end);
	const escaped = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	const pattern = new RegExp(`^(${escaped.join("|")}):[ \\t]*(null|~|""|'')[ \\t]*$`, "gm");
	return head.replace(pattern, "$1:") + tail;
}

/** Append a dated line under `## <heading>`, creating the heading if absent. */
export function appendLogLine(
	content: string,
	detail: string,
	heading: string,
	when: ISODate,
): string {
	const entry = `- ${when} - ${detail.trim()}`;
	const headingRe = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
	const match = headingRe.exec(content);
	if (!match) {
		const spacer = content.endsWith("\n") ? "" : "\n";
		return `${content}${spacer}\n## ${heading}\n\n${entry}\n`;
	}
	const insertAt = match.index + match[0].length;
	const rest = content.slice(insertAt).replace(/^\n+/, "");
	return `${content.slice(0, insertAt)}\n\n${entry}\n${rest}`;
}
