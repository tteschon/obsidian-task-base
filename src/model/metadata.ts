import type { App, EventRef, TFile } from "obsidian";

/**
 * Resolve once the metadata cache has caught up with a write to `file`.
 *
 * The cache lags the vault by a moment, so re-reading a note immediately after
 * writing it returns the *previous* frontmatter — and a freshly created note
 * reads back as not a task at all. Both look like the write failed. Call this
 * **before** the write so the listener is already attached, then await it
 * after; resolving on a timeout rather than rejecting, because a stale read is
 * a better answer than none.
 */
export function metadataSettled(app: App, file: TFile, timeoutMs = 2000): Promise<void> {
	return new Promise((resolve) => {
		let timer: number | undefined;
		const finish = () => {
			app.metadataCache.offref(ref);
			window.clearTimeout(timer);
			resolve();
		};
		const ref: EventRef = app.metadataCache.on("changed", (changed: TFile) => {
			if (changed.path === file.path) finish();
		});
		timer = window.setTimeout(finish, timeoutMs);
	});
}
