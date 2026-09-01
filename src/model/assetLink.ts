/**
 * Asset wikilinks.
 *
 * A task's `asset` property holds a quoted wikilink to the note for the thing
 * being serviced — `"[[Lawn Mower]]"`. These are the pure conversions between
 * that stored form and the bare name the UI shows.
 *
 * No `obsidian` import here, deliberately: that is what lets the tests run
 * outside the app, the same split that keeps `model/frontmatter.ts` testable.
 */

/**
 * `"[[Refrigerator]]"` to `Refrigerator`.
 *
 * Accepts a bare name too, so a hand-written `asset: Refrigerator` still
 * resolves. `[[Note|alias]]` yields the target, since that is what the link
 * actually points at.
 */
export function assetNameFromLink(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	const link = /^\[\[(.*)\]\]$/.exec(trimmed);
	const inner = (link ? link[1] : trimmed).trim();
	// A display alias is not the note's name; the part before the pipe is.
	const target = inner.split("|")[0].trim();
	// Strip a heading or block reference: [[Note#Heading]] still names Note.
	const name = target.split("#")[0].trim();
	return name || null;
}

/**
 * `Refrigerator` to `[[Refrigerator]]`, ready to be written.
 *
 * Returns null for an empty name so a cleared field becomes a null property
 * rather than a link to nothing. The field this replaces built `[[]]` from
 * whitespace, which reads as a link and resolves to no note at all.
 */
export function formatAssetLink(name: unknown): string | null {
	const bare = assetNameFromLink(name);
	return bare ? `[[${bare}]]` : null;
}
