import { strict as assert } from "node:assert";
import { test } from "node:test";
import { notesPreview } from "../src/ui/notesPreview";

test("an empty body leaves the button to label itself", () => {
	assert.equal(notesPreview(""), "");
	assert.equal(notesPreview("\n\n   \t\n"), "");
});

test("a body opening with blank lines still previews its first words", () => {
	assert.equal(notesPreview("\n\nFilter model HDX FMM-2\nBought at the hardware store"), "Filter model HDX FMM-2 Bought at the hardware store");
});

test("a body longer than the line trails off inside the limit", () => {
	const preview = notesPreview("x".repeat(200), 20);
	assert.equal(preview.length, 20);
	assert.ok(preview.endsWith("…"));
});

test("a body exactly the length of the line keeps all of it", () => {
	assert.equal(notesPreview("y".repeat(20), 20), "y".repeat(20));
});

test("a cut landing on a space does not leave the ellipsis floating", () => {
	// slice(0, 8) is "one two " — without the trim the button would read
	// "one two …", which looks like a rendering fault rather than a truncation.
	assert.equal(notesPreview("one two three four", 9), "one two…");
});
