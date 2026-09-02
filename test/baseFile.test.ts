import { strict as assert } from "node:assert";
import { test } from "node:test";
import { defaultBasePath, renderTaskBase } from "../src/model/baseFile";

const render = (excludedFolders: string[] = ["Templates"]) => renderTaskBase({ excludedFolders });

test("the identity filter is what collects tasks at all", () => {
	assert.match(render(), /^ {4}- type == "task"$/m);
});

test("excluded folders become filter clauses, quoted", () => {
	// A leading ! is a YAML tag indicator, so the clause must be quoted or the
	// whole base fails to parse.
	const out = render(["Templates", "🗃 Kanban Cards"]);
	assert.match(out, /^ {4}- '!file\.inFolder\("Templates"\)'$/m);
	assert.match(out, /^ {4}- '!file\.inFolder\("🗃 Kanban Cards"\)'$/m);
});

test("an empty or blank exclusion list adds no clauses", () => {
	for (const folders of [[], ["", "   "]]) {
		const out = renderTaskBase({ excludedFolders: folders });
		assert.doesNotMatch(out, /inFolder/, JSON.stringify(folders));
		assert.match(out, /- type == "task"/);
	}
});

test("a folder name containing a quote does not break the YAML", () => {
	const out = render(["Bob's Notes"]);
	// Single quotes double inside a single-quoted scalar.
	assert.match(out, /- '!file\.inFolder\("Bob''s Notes"\)'/);
});

test("trailing slashes are trimmed so the clause matches the pane's rule", () => {
	assert.match(render(["Templates/"]), /inFolder\("Templates"\)/);
});

test("the four views the pane mirrors are all present", () => {
	const out = render();
	for (const name of ["Table", "Today", "This week", "Needs attention"]) {
		assert.match(out, new RegExp(`^ {4}name: ${name}$`, "m"), name);
	}
});

test("formulas guard against an empty due date", () => {
	// A formula over a missing property errors on every row that lacks it, and
	// .days must come before rounding because subtraction yields a Duration.
	assert.match(render(), /days_until_due: if\(due, \(due - today\(\)\)\.days\.round\(0\), ""\)/);
	assert.match(render(), /overdue: if\(due, due < today\(\), false\)/);
});

test("created is a column now that it is a real date", () => {
	assert.match(render(), /^ {6}- created$/m);
});

test("the file ends with a newline and has no blank lines", () => {
	const out = render();
	assert.ok(out.endsWith("\n"));
	assert.equal(out.split("\n").filter((l) => l.trim() === "").length, 1);
});

test("the default path follows the configured task folder", () => {
	assert.equal(defaultBasePath("tasks"), "tasks/task base.base");
	assert.equal(defaultBasePath(" work/tasks/ "), "work/tasks/task base.base");
	assert.equal(defaultBasePath(""), "task base.base");
});
