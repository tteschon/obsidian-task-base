import { type App, Setting, type TextComponent } from "obsidian";
import { assetNameFromLink } from "../model/assetLink";
import type { AssetRepository } from "../model/assetRepository";
import { AssetSuggest } from "./AssetSuggest";
import { CreateAssetModal } from "./CreateAssetModal";

export interface AssetFieldSpec {
	app: App;
	assets: AssetRepository;
	/** Read at click time, so changing the setting mid-session takes effect. */
	assetFolder: () => string;
	/** Leading sentence; the sourcing rule is appended to it. */
	desc: string;
	/** The bare name already on the task, if any. */
	initial?: string;
	/** Focus the input on open, for a modal whose only field this is. */
	focus?: boolean;
	/** The bare name, or "" when the field is cleared. */
	onChange: (name: string) => void;
}

/**
 * The Asset row, built once for the three modals that offer it.
 *
 * Extracted for two reasons. The obvious one: Create task, Edit task and Set
 * asset held three copies of the same input, and the create button had to land
 * in all of them. The one that matters more: **a note is an asset because it
 * carries `type: asset`**, and that rule lived only in the README. Someone
 * looking at an empty dropdown had nothing on screen saying why it was empty or
 * what would fill it. The rule is now in the description, and the button beside
 * the field is the answer to it.
 */
export function addAssetField(parent: HTMLElement, spec: AssetFieldSpec): void {
	let name = spec.initial?.trim() ?? "";
	let input: TextComponent | null = null;

	const setting = new Setting(parent)
		.setName("Asset")
		.setDesc(`${spec.desc} A note is an asset when it carries type: asset, wherever it lives.`);
	const hintEl = setting.descEl.createDiv({ cls: "task-base-hint" });

	/**
	 * Say plainly when the field will not resolve, and why.
	 *
	 * A name with no note behind it is still accepted — capturing a chore for
	 * something not yet inventoried is normal, and Obsidian treats the result as
	 * an unresolved link you can fill in later. What is not normal is a typo you
	 * never find out about, which is what the old free-text field produced. The
	 * empty-vault case is the one the picker alone explains worst: it drops a
	 * blank popover and says nothing at all.
	 */
	const renderHint = () => {
		const wanted = assetNameFromLink(name);
		if (!wanted) {
			hintEl.setText(
				spec.assets.all().length
					? ""
					: "No asset notes in this vault yet — use + to create the first one.",
			);
			return;
		}
		hintEl.setText(
			spec.assets.findByName(wanted)
				? ""
				: `No asset note named "${wanted}" — the link will be unresolved. Use + to create it.`,
		);
	};

	const set = (value: string) => {
		name = value;
		renderHint();
		spec.onChange(value);
	};

	setting.addText((t) => {
		input = t;
		t.setPlaceholder("Family car");
		t.setValue(name).onChange(set);
		if (spec.focus) t.inputEl.focus();
		new AssetSuggest(spec.app, t.inputEl, spec.assets, (picked) => {
			t.setValue(picked);
			set(picked);
		});
	});

	setting.addExtraButton((b) =>
		b
			.setIcon("plus")
			.setTooltip("Create a new asset note")
			.onClick(() => {
				new CreateAssetModal(spec.app, {
					folder: spec.assetFolder(),
					assets: spec.assets,
					// Whatever is half-typed carries over, so a name the picker
					// could not match becomes the name of the note that fixes that.
					initialName: name,
					onCreated: (file) => {
						input?.setValue(file.basename);
						set(file.basename);
					},
				}).open();
			}),
	);

	renderHint();
}
