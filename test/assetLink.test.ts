import { strict as assert } from "node:assert";
import { test } from "node:test";
import { assetNameFromLink, formatAssetLink } from "../src/model/assetLink";

test("a stored wikilink yields the bare note name", () => {
	assert.equal(assetNameFromLink('[[Refrigerator]]'), "Refrigerator");
	assert.equal(assetNameFromLink("[[Family Car]]"), "Family Car");
	assert.equal(assetNameFromLink("  [[Water Heater]]  "), "Water Heater");
});

test("a bare name is accepted, so a hand-written property still resolves", () => {
	assert.equal(assetNameFromLink("Refrigerator"), "Refrigerator");
});

test("an alias or heading yields the target, not the display text", () => {
	// [[Note|alias]] points at Note; the alias is only what is shown.
	assert.equal(assetNameFromLink("[[Refrigerator|the fridge]]"), "Refrigerator");
	assert.equal(assetNameFromLink("[[Refrigerator#Service log]]"), "Refrigerator");
});

test("empty input is null, never an empty link", () => {
	for (const empty of [null, undefined, "", "   ", "[[]]", "[[   ]]", 42]) {
		assert.equal(assetNameFromLink(empty), null, String(empty));
		assert.equal(formatAssetLink(empty), null, String(empty));
	}
});

test("whitespace does not become a link to nothing", () => {
	// The field this replaces built "[[]]" from bracket-and-space input, which
	// reads as a link and resolves to no note at all.
	assert.equal(formatAssetLink("  [[  ]]  "), null);
});

test("formatting produces the shape the vault already stores", () => {
	assert.equal(formatAssetLink("Refrigerator"), "[[Refrigerator]]");
	assert.equal(formatAssetLink("  Water Heater  "), "[[Water Heater]]");
	// Typing the brackets yourself must not double them up.
	assert.equal(formatAssetLink("[[Lawn Mower]]"), "[[Lawn Mower]]");
});

test("names with digits, spaces and mixed case all round-trip", () => {
	for (const name of [
		"2019 Family Car",
		"Lawn Mower 54",
		"Refrigerator",
		"Water Heater",
		"HVAC unit (attic)",
	]) {
		const stored = formatAssetLink(name);
		assert.equal(stored, `[[${name}]]`);
		assert.equal(assetNameFromLink(stored), name);
	}
});
