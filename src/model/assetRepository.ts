import { type App, type TFile } from "obsidian";

/**
 * Finding assets.
 *
 * A note is an asset because it carries `type: asset` — the same rule this
 * plugin uses for tasks, and the reason an asset stays findable if the vault
 * is reorganised. A vault may also collect the same notes by folder with an
 * `Inventory` base; matching on the property keeps the picker working either
 * way.
 */

const ASSET_TYPE = "asset";

function isAsset(app: App, file: TFile): boolean {
	return app.metadataCache.getFileCache(file)?.frontmatter?.type === ASSET_TYPE;
}

/**
 * The vault's asset notes, cached.
 *
 * The type-ahead calls this on every keystroke, and computing it means walking
 * every markdown file in the vault and reading each one's metadata cache — over
 * a thousand notes here, and far more in someone else's vault. So it is
 * computed once and kept.
 *
 * The risk a cache introduces is staleness, not slowness: an asset created,
 * renamed or deleted while the picker is open would otherwise be missing from
 * the list or offered after it is gone. `invalidate()` is wired to the same
 * vault and metadata events the task pane already listens to.
 */
export class AssetRepository {
	private cache: TFile[] | null = null;

	constructor(private app: App) {}

	/** Drop the cached list; the next read recomputes it. */
	invalidate(): void {
		this.cache = null;
	}

	/** Every asset note, by name. */
	all(): TFile[] {
		if (!this.cache) {
			this.cache = this.app.vault
				.getMarkdownFiles()
				.filter((f) => isAsset(this.app, f))
				.sort((a, b) => a.basename.localeCompare(b.basename));
		}
		return this.cache;
	}

	/** Asset notes whose name contains `query`; everything when it is empty. */
	search(query: string): TFile[] {
		const q = query.trim().toLowerCase();
		const assets = this.all();
		return q ? assets.filter((f) => f.basename.toLowerCase().includes(q)) : assets;
	}

	/** The asset note with this name, matched the way Obsidian resolves links. */
	findByName(name: string): TFile | null {
		const wanted = name.trim().toLowerCase();
		if (!wanted) return null;
		return this.all().find((f) => f.basename.toLowerCase() === wanted) ?? null;
	}
}
