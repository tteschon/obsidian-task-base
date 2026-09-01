import { AbstractInputSuggest, type App, type TFile } from "obsidian";
import { listAssets } from "../model/assetRepository";

/**
 * Type-ahead over the vault's asset notes.
 *
 * On an empty query it returns every asset, so clicking the field drops the
 * whole list the way a select would — but it still narrows as you type and
 * still accepts a name that has no note yet.
 */
export class AssetSuggest extends AbstractInputSuggest<TFile> {
	constructor(
		app: App,
		private inputEl: HTMLInputElement,
		private onPick: (name: string) => void,
	) {
		super(app, inputEl);
		// The base class opens on input, not on focus. Its own change handler
		// is not part of the public API, so re-dispatching an input event is
		// the supported way to make the list appear as soon as the field is
		// focused rather than only after the first keystroke.
		inputEl.addEventListener("focus", () => {
			inputEl.dispatchEvent(new Event("input"));
		});
	}

	getSuggestions(query: string): TFile[] {
		const assets = listAssets(this.app);
		const q = query.trim().toLowerCase();
		if (!q) return assets;
		return assets.filter((f) => f.basename.toLowerCase().includes(q));
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.basename);
	}

	selectSuggestion(file: TFile): void {
		this.setValue(file.basename);
		// Deliberately not re-dispatching "input" here: that would reopen the
		// popover we are about to close. The callback carries the change
		// instead, so the caller never depends on the text component's own
		// onChange firing for a programmatic set.
		this.onPick(file.basename);
		this.close();
	}
}
