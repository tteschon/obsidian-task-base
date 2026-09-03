import type { App, TFile } from "obsidian";
import type { ISODate } from "../dates";
import { renderAssetNote } from "./frontmatter";
import { createNote } from "./note";

/**
 * Creating asset notes.
 *
 * The read side is `assetRepository.ts`, which finds assets by their `type`
 * property rather than by folder. This is the write side, and the asymmetry is
 * the point: an asset is found *anywhere*, but a new one has to be put
 * *somewhere*, which is what the `assetFolder` setting decides.
 */

export interface NewAsset {
	name: string;
	/** Where the note is written. Empty means the vault root. */
	folder: string;
	body: string;
	createdOn: ISODate;
}

export function createAsset(app: App, spec: NewAsset): Promise<TFile> {
	return createNote(app, {
		name: spec.name,
		folder: spec.folder,
		content: renderAssetNote({ created: spec.createdOn, body: spec.body }),
	});
}
