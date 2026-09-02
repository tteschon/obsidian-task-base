import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
	DEFAULT_SETTINGS,
	RETIRED_SETTING_KEYS,
	isInExcludedFolder,
	migrateSettings,
} from "../src/settingsData";

test("the single template folder becomes the first excluded folder", () => {
	const migrated = migrateSettings({
		taskFolder: "tasks",
		templateFolder: "Templates",
		dailyNoteFolder: "Journal",
	});
	assert.deepEqual(migrated.excludedFolders, ["Templates"]);
	assert.equal(migrated.taskFolder, "tasks");
});

test("an empty template folder means exclude nothing, not the default", () => {
	// "" meant "exclude no folder". Falling back to the default here would
	// silently start hiding Templates from someone who had turned it off.
	assert.deepEqual(migrateSettings({ templateFolder: "" }).excludedFolders, []);
	assert.deepEqual(migrateSettings({ templateFolder: "   " }).excludedFolders, []);
});

test("retired keys never survive into the settings", () => {
	const migrated = migrateSettings({
		templateFolder: "Templates",
		dailyNoteFolder: "Journal",
		somethingElseEntirely: true,
	});
	for (const key of RETIRED_SETTING_KEYS) {
		assert.ok(
			!(key in migrated),
			`${key} would be written back to disk on the next save`,
		);
	}
	assert.ok(!("somethingElseEntirely" in migrated));
});

test("an explicit excluded list wins over the old single folder", () => {
	const migrated = migrateSettings({
		templateFolder: "Templates",
		excludedFolders: ["🗂 Project Cards"],
	});
	assert.deepEqual(migrated.excludedFolders, ["🗂 Project Cards"]);
});

test("an empty explicit list is respected, not treated as absent", () => {
	assert.deepEqual(migrateSettings({ excludedFolders: [] }).excludedFolders, []);
});

test("nothing stored yields the defaults", () => {
	for (const nothing of [undefined, null, {}, [], "corrupt", 42]) {
		assert.deepEqual(migrateSettings(nothing), DEFAULT_SETTINGS, String(nothing));
	}
});

test("a corrupt excluded list falls back rather than crashing the pane", () => {
	// TaskRepository calls .some() on this every refresh; a non-array would
	// throw on every render.
	for (const bad of ["Templates", 42, null]) {
		const migrated = migrateSettings({ excludedFolders: bad });
		assert.ok(Array.isArray(migrated.excludedFolders), String(bad));
	}
});

test("unrelated saved settings survive the migration", () => {
	const migrated = migrateSettings({
		templateFolder: "Templates",
		basePath: "work/my base.base",
		categories: ["clients", "admin"],
		defaultPriority: "high",
		logHeading: "Completion log",
		openViewOnStart: true,
	});
	assert.equal(migrated.basePath, "work/my base.base");
	assert.deepEqual(migrated.categories, ["clients", "admin"]);
	assert.equal(migrated.defaultPriority, "high");
	assert.equal(migrated.logHeading, "Completion log");
	assert.equal(migrated.openViewOnStart, true);
});

test("current-shape settings round-trip unchanged", () => {
	const current = { ...DEFAULT_SETTINGS, excludedFolders: ["Templates", "Archive"] };
	assert.deepEqual(migrateSettings(current), current);
});

test("migration does not mutate the defaults", () => {
	const migrated = migrateSettings({ templateFolder: "Elsewhere" });
	migrated.excludedFolders.push("mutated");
	assert.deepEqual(DEFAULT_SETTINGS.excludedFolders, ["Templates"]);
});

test("exclusion matches a folder and its contents", () => {
	const excluded = ["Templates"];
	assert.equal(isInExcludedFolder("Templates/task template.md", excluded), true);
	assert.equal(isInExcludedFolder("Templates/nested/deep.md", excluded), true);
	assert.equal(isInExcludedFolder("Templates", excluded), true);
});

test("exclusion is not a bare string prefix", () => {
	// The bug this guards: excluding "Templates" must leave "Templates 2" and
	// "TemplatesArchive" alone, or a folder is hidden that nobody asked to hide.
	const excluded = ["Templates"];
	assert.equal(isInExcludedFolder("Templates 2/note.md", excluded), false);
	assert.equal(isInExcludedFolder("TemplatesArchive/note.md", excluded), false);
	assert.equal(isInExcludedFolder("My Templates/note.md", excluded), false);
});

test("real vault paths sort correctly", () => {
	const excluded = ["Templates", "🗂 Project Cards"];
	assert.equal(isInExcludedFolder("Templates/task template @{{date}}.md", excluded), true);
	assert.equal(isInExcludedFolder("🗂 Project Cards/Some card.md", excluded), true);
	assert.equal(isInExcludedFolder("tasks/Take out the garbage.md", excluded), false);
	assert.equal(isInExcludedFolder("tasks/task repo/Mow Lawn.md", excluded), false);
});

test("a trailing slash or stray whitespace still matches", () => {
	assert.equal(isInExcludedFolder("Templates/x.md", ["Templates/"]), true);
	assert.equal(isInExcludedFolder("Templates/x.md", ["  Templates  "]), true);
});

test("an empty list, or empty entries, exclude nothing", () => {
	assert.equal(isInExcludedFolder("Templates/x.md", []), false);
	assert.equal(isInExcludedFolder("Templates/x.md", ["", "   ", "/"]), false);
	// An empty entry must never match everything — that would empty the pane.
	assert.equal(isInExcludedFolder("tasks/anything.md", ["", "  "]), false);
});
