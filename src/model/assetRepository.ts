import { type App, type TFile } from "obsidian";

/**
 * Finding assets.
 *
 * A note is an asset because it carries `type: asset` — the same rule this
 * plugin uses for tasks, and the reason an asset stays findable if the vault
 * is reorganised. `Inventory/inventory.base` collects the same notes by folder
 * instead; the two agree today, and only diverge if an asset is moved out.
 */

const ASSET_TYPE = "asset";

function isAsset(app: App, file: TFile): boolean {
	return app.metadataCache.getFileCache(file)?.frontmatter?.type === ASSET_TYPE;
}

/** Every asset note, by name. */
export function listAssets(app: App): TFile[] {
	return app.vault
		.getMarkdownFiles()
		.filter((f) => isAsset(app, f))
		.sort((a, b) => a.basename.localeCompare(b.basename));
}

/** The asset note with this name, matched the way Obsidian resolves links. */
export function findAssetByName(app: App, name: string): TFile | null {
	const wanted = name.trim().toLowerCase();
	if (!wanted) return null;
	return listAssets(app).find((f) => f.basename.toLowerCase() === wanted) ?? null;
}
