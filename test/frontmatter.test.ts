import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
	appendLogLine,
	normalizeEmptyKeysIn,
	renderAssetNote,
	renderTaskNote,
	sanitizeFileName,
} from "../src/model/frontmatter";

const note = (fm: string, body = "\nSome body text.\n") => `---\n${fm}\n---\n${body}`;

test("an emptied key comes out bare, matching the template", () => {
	const before = note(
		["done: false", "due: 2026-09-07", "frequency: null", "type: task"].join("\n"),
	);
	const after = normalizeEmptyKeysIn(before, ["frequency"]);
	assert.match(after, /^frequency:$/m);
	assert.doesNotMatch(after, /frequency: null/);
});

test("every empty spelling normalises, including the one that breaks Bases", () => {
	// `frequency: ''` is the dangerous one: an empty string is not null, so a
	// `frequency != null` filter would match a task that has no rule.
	for (const empty of ["null", "~", '""', "''", "  null  "]) {
		const after = normalizeEmptyKeysIn(note(`frequency: ${empty}\ntype: task`), ["frequency"]);
		assert.match(after, /^frequency:$/m, empty);
	}
});

test("keys with a space are handled", () => {
	const after = normalizeEmptyKeysIn(note("last done: null\ntype: task"), ["last done"]);
	assert.match(after, /^last done:$/m);
});

test("real values are never touched", () => {
	const before = note(
		[
			"done: false",
			"due: 2026-12-31",
			"frequency: FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=-1",
			'asset: "[[Family Car]]"',
			"type: task",
		].join("\n"),
	);
	assert.equal(normalizeEmptyKeysIn(before, ["frequency", "due", "asset"]), before);
});

test("only the named keys change", () => {
	const before = note("due: null\nfrequency: null\ntype: task");
	const after = normalizeEmptyKeysIn(before, ["frequency"]);
	assert.match(after, /^due: null$/m, "due was not in the patch and must be left alone");
	assert.match(after, /^frequency:$/m);
});

test("the note body is never rewritten", () => {
	const body = "\n## Service log\n\n- 2026-06-19 - 22,731 mi\n\nfrequency: null\n";
	const before = note("frequency: null\ntype: task", body);
	const after = normalizeEmptyKeysIn(before, ["frequency"]);
	assert.ok(after.endsWith(body), "body must survive byte for byte");
	assert.equal((after.match(/^frequency: null$/gm) ?? []).length, 1, "the body line stays");
});

test("a note with no frontmatter is returned unchanged", () => {
	for (const content of ["Just a note.\n", "", "---\nunterminated: true\n"]) {
		assert.equal(normalizeEmptyKeysIn(content, ["frequency"]), content);
	}
});

test("file names drop characters Obsidian rejects", () => {
	assert.equal(sanitizeFileName("Oil change: Car/2023"), "Oil change Car2023");
	assert.equal(sanitizeFileName("  Mow   Lawn  "), "Mow Lawn");
	assert.equal(sanitizeFileName('#^[]|*?"<>:\\/'), "");
});

test("a new one-time task is rendered with bare empty keys", () => {
	const note = renderTaskNote({
		due: null,
		created: "2026-08-31",
		priority: "low",
		category: null,
		frequency: null,
		asset: null,
		body: "",
	});
	// The template's key order, so a plugin-made note is indistinguishable
	// from a hand-made one.
	assert.equal(
		note.split("\n").slice(0, 10).join("\n"),
		[
			"---",
			"done: false",
			"due:",
			"created: 2026-08-31",
			"priority: low",
			"category:",
			"last done:",
			"frequency:",
			"type: task",
			"---",
		].join("\n"),
	);
	assert.doesNotMatch(note, /: ''/, "an empty string here would break the base's filters");
	assert.doesNotMatch(note, /created:.*\[\[/, "created is a date property, not a wikilink");
	assert.doesNotMatch(note, /: null/);
});

test("a recurring task carries its rule, asset and body", () => {
	const note = renderTaskNote({
		due: "2026-12-31",
		created: "2026-08-31",
		priority: "medium",
		category: "vehicle",
		frequency: "FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=-1",
		asset: "[[Family Car]]",
		body: "See the asset note for oil specs.",
	});
	assert.match(note, /^frequency: FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=-1$/m);
	assert.match(note, /^asset: "\[\[Family Car\]\]"$/m);
	assert.match(note, /^due: 2026-12-31$/m);
	assert.ok(note.trimEnd().endsWith("See the asset note for oil specs."));
});

test("a log entry lands under the heading, newest first", () => {
	const note = "---\ntype: task\n---\n\n## Service log\n\n- 2026-06-19 - 22,731 mi\n";
	const after = appendLogLine(note, "25,731 mi", "Service log", "2026-12-31");
	const lines = after.split("\n").filter((l) => l.startsWith("- "));
	assert.deepEqual(lines, ["- 2026-12-31 - 25,731 mi", "- 2026-06-19 - 22,731 mi"]);
});

test("a missing log heading is created rather than skipped", () => {
	const after = appendLogLine("---\ntype: task\n---\n", "did the thing", "Service log", "2026-08-31");
	assert.match(after, /^## Service log$/m);
	assert.match(after, /^- 2026-08-31 - did the thing$/m);
});

test("a new asset note carries the property that makes it an asset", () => {
	// This is the whole contract with assetRepository.ts: a note it created must
	// come back out of the picker it was created for.
	const note = renderAssetNote({ created: "2026-09-03", body: "" });
	assert.match(note, /^type: asset$/m);
});

test("an asset's created date is bare, so Bases reads it as a date", () => {
	// Quoted, it is a string: date sorting silently falls back to text order and
	// nothing reports it — the same trap `due` has on tasks.
	const note = renderAssetNote({ created: "2026-09-03", body: "" });
	assert.match(note, /^created: 2026-09-03$/m);
	assert.doesNotMatch(note, /created: ['"]/);
});

test("an asset note carries nothing this plugin does not own", () => {
	// A lawn mower is described with fields no task plugin can guess. Stamping
	// priority or category onto someone's inventory note would be this plugin
	// imposing a schema on notes that are not its own.
	const frontmatter = renderAssetNote({ created: "2026-09-03", body: "" }).split("---")[1];
	assert.deepEqual(
		frontmatter.trim().split("\n").map((line) => line.split(":")[0]),
		["type", "created"],
	);
});

test("asset notes are valid frontmatter with and without a body", () => {
	const empty = renderAssetNote({ created: "2026-09-03", body: "   " });
	assert.ok(empty.startsWith("---\n"), "frontmatter must open the file");
	assert.equal((empty.match(/^---$/gm) ?? []).length, 2, "exactly one delimiter pair");
	assert.doesNotMatch(empty, /\s{2}$/, "whitespace-only notes must not become a body");

	const withBody = renderAssetNote({ created: "2026-09-03", body: "  Serial 4471-B  " });
	assert.match(withBody, /^Serial 4471-B$/m, "the body is trimmed, not padded");
	assert.equal((withBody.match(/^---$/gm) ?? []).length, 2);
});
