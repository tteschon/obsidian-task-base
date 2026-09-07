/**
 * The one line that stands in for a notes box where there is no room for one.
 *
 * Kept apart from `NotesField.ts` for the reason `settingsData.ts` is kept
 * apart from `settings.ts`: that file imports `obsidian`, which no test can
 * load, and the truncation rule below is worth a test.
 */

/** How much of the body a stand-in button shows before it trails off. */
const PREVIEW_LIMIT = 80;

/**
 * A body as a single line of button text, or "" when it holds nothing.
 *
 * Whitespace is collapsed rather than preserved: a body that opens with a
 * blank line or a heading underline would otherwise label the button with
 * nothing, or with a run of spaces that reads as nothing.
 */
export function notesPreview(body: string, limit = PREVIEW_LIMIT): string {
	const collapsed = body.replace(/\s+/g, " ").trim();
	if (collapsed.length <= limit) return collapsed;
	return `${collapsed.slice(0, limit - 1).trimEnd()}…`;
}
