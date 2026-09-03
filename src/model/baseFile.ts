/**
 * Generating a task base.
 *
 * Pure text, no `obsidian` import, so the YAML can be tested outside the app —
 * which matters here because a malformed base fails quietly: a bad filter
 * returns no rows and a bad formula shows an error only in the cell where a
 * value should have been.
 */

/** Single-quoted YAML scalar; the only escape inside one is a doubled quote. */
function yamlQuote(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

export interface TaskBaseOptions {
	/** Folders excluded from the task list, mirrored into the base's filters. */
	excludedFolders: string[];
}

/**
 * Render a `.base` file collecting every task note.
 *
 * The exclusion clauses come from the plugin's own `excludedFolders` setting
 * rather than a hardcoded `Templates`, so a base created here agrees with the
 * pane by construction. Keeping them in step afterwards is still manual — the
 * README calls that seam out.
 */
export function renderTaskBase(options: TaskBaseOptions): string {
	const folders = options.excludedFolders.map((f) => f.trim().replace(/\/+$/, "")).filter(Boolean);

	const lines = ["filters:", "  and:", '    - type == "task"'];
	for (const folder of folders) {
		// Leading `!` makes this a YAML tag unless the scalar is quoted.
		lines.push(`    - ${yamlQuote(`!file.inFolder("${folder.replace(/"/g, '\\"')}")`)}`);
	}

	lines.push(
		"formulas:",
		// .days before any rounding: subtracting dates yields a Duration, and a
		// span across a DST boundary is 120 days *and one hour*.
		'  days_until_due: if(due, (due - today()).days.round(0), "")',
		"  overdue: if(due, due < today(), false)",
		"views:",
		"  - type: table",
		"    name: Table",
		"    order:",
		"      - file.name",
		"      - done",
		"      - category",
		"      - frequency",
		"      - created",
		"      - due",
		"      - last done",
		"      - priority",
		"      - asset",
		// A formula the base defines is returned by nothing unless a view lists
		// it, so an unlisted formula is dead YAML: computed nowhere, queryable
		// nowhere, and silent about both.
		"      - formula.days_until_due",
		"      - formula.overdue",
		"    sort:",
		"      - property: done",
		"        direction: ASC",
		"      - property: due",
		"        direction: ASC",
		"  - type: table",
		"    name: Today",
		"    filters:",
		"      and:",
		"        - done != true",
		"        - due != null",
		"        - due <= today()",
		"    order:",
		"      - file.name",
		"      - category",
		"      - due",
		"      - priority",
		"  - type: table",
		"    name: This week",
		"    filters:",
		"      and:",
		"        - done != true",
		"        - due != null",
		'        - due <= today() + "7d"',
		"    order:",
		"      - file.name",
		"      - category",
		"      - due",
		"      - formula.days_until_due",
		"      - priority",
		// Recurring tasks awaiting a first completion — a queue, not overdue work.
		"  - type: table",
		"    name: Needs attention",
		"    filters:",
		"      and:",
		"        - done != true",
		"        - frequency != null",
		"        - due == null",
		"    order:",
		"      - file.name",
		"      - frequency",
		"      - last done",
		"      - priority",
		// Finished one-time tasks, for whoever is clearing them out. Listing
		// them is a report, not a deletion — this plugin never removes a note.
		// The `frequency == null` clause is what keeps a recurring task that is
		// wrongly sitting in `done` off that list.
		"  - type: table",
		"    name: Sweep",
		"    filters:",
		"      and:",
		"        - done == true",
		"        - frequency == null",
		"    order:",
		"      - file.name",
		"      - category",
		"      - last done",
		"      - created",
	);

	return lines.join("\n") + "\n";
}

/** Where a base goes when none is configured. */
export function defaultBasePath(taskFolder: string): string {
	const folder = taskFolder.trim().replace(/^\/+|\/+$/g, "");
	return folder ? `${folder}/task base.base` : "task base.base";
}
