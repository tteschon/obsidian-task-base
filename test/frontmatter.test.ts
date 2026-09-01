import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
	appendLogLine,
	normalizeEmptyKeysIn,
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
			'created: "[[2026-08-31]]"',
			"priority: low",
			"category:",
			"last done:",
			"frequency:",
			"type: task",
			"---",
		].join("\n"),
	);
	assert.doesNotMatch(note, /: ''/, "an empty string here would break the base's filters");
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
