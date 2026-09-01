# Task Base

An Obsidian plugin for a note-per-task system: capture a task through a form,
pick a cadence from a builder instead of typing RFC 5545, and complete a task
with the next due date computed for you.

It conforms to an existing schema rather than inventing one. A note is a task
because it carries `type: task`; a Bases file collects them from anywhere in
the vault.

## The task note contract

```yaml
---
done: false                     # checkbox
due: 2026-12-31                 # date
created: "[[2026-08-31]]"       # wikilink to the daily note
priority: low                   # low | medium | high
category: vehicle               # home | yard | errands | vehicle | health
last done: 2026-06-19           # date — latest completion only
frequency: FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=-1   # RRULE, or empty
type: task                      # identity — this is what puts it in the base
asset: "[[Family Car]]"                            # optional
---
```

`frequency` is the only thing separating the two kinds of task. Set means
recurring; empty means one-time.

## Commands

| Command | What it does |
|---|---|
| Create task | Form for name, category, priority, due, repeat rule, asset |
| Complete task | Branches on `frequency` — see below |
| Edit task | Change due date, priority, category, repeat rule or asset |
| Edit repeat rule | Opens the RRULE builder on a task |
| Set asset | Attaches, changes, or clears the asset on an existing task |
| Recompute due date from repeat rule | Rolls `due` forward from `last done` |
| Open task list | The sidebar view |

The task pane carries its own toolbar — **New task**, refresh, and a button
that opens the base file. It sticks to the top so the primary action stays
reachable once the list scrolls. Right-click any row for Edit / Complete / Open.

Its sections — Overdue, Today, This week, Needs attention, Later — **partition
the open set**: `Later` is defined as everything not caught by the others, not
as a date window, so no open task can be missing from the pane while the footer
counts it. `Later` is collapsed by default, with its count on the header.

Commands act on the active note when it is a task, and offer a picker when it
is not.

## Assets

A task's `asset` property links the note for the thing being serviced —
`asset: "[[Lawn Mower]]"`.

**A note is an asset because it carries `type: asset`**, the same rule this
plugin uses for tasks. A vault may also collect the same notes by folder — an
`Inventory` base filtering on `file.inFolder("Inventory")`, say. The two agree
as long as every asset note lives in that folder, and diverge if one is moved
out; matching on the property is what keeps the picker working either way.

The asset field is a type-ahead: click it and every asset drops down, typing
narrows the list. A name with no matching note is still accepted — capturing a
chore for something not yet inventoried is normal — but the field says so
plainly rather than writing a dangling link in silence.

## Completing a task

- **Recurring** — `last done` = today, `due` recomputed, `done` back to
  `false`. A recurring task is never left at `done: true`; that is what makes
  it recur.
- **One-time** — `last done` = today, `done` = `true`. The note stays on disk
  and stays in the base. **Nothing is ever deleted.**
- **Unreadable rule** — refuses to act and asks for the rule to be fixed.
  Completing it as one-time would write `done: true` and retire a task that was
  meant to keep recurring.

Anything that is not a date — mileage, part numbers, what was actually done —
goes on a dated line under `## Service log` in the body, never into `last done`.

## How the next due date is computed

The policy is **skip the rest of the period you just did it in**, then take the
schedule's next occurrence.

| Rule | Completed | Next due |
|---|---|---|
| `FREQ=WEEKLY;BYDAY=MO` | Mon 2026-08-24 | 2026-08-31 |
| `FREQ=WEEKLY;BYDAY=SU` | Mon 2026-08-17 | 2026-08-30 |
| `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO` | Mon 2026-08-24 | 2026-09-07 |
| `FREQ=MONTHLY;BYMONTHDAY=-1` | 2026-08-22 | 2026-09-30 |
| `FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=-1` | 2026-06-19 | 2026-12-31 |
| `FREQ=YEARLY` | 2026-06-19 | 2027-06-19 |

Three cases, in order:

1. **No day-selection in the rule** (`FREQ=YEARLY`) — the day is implied by the
   anchor, so the roll is one period later. A yearly task done 19 June comes
   back the following 19 June, not on 1 January.
2. **More than one occurrence per period** (`FREQ=WEEKLY;BYDAY=MO,TH`) — the
   remaining occurrences this period are real, so take the strict next one.
3. **One occurrence per period** — anchor the rule at the start of the current
   period so nothing is clipped, then take the first occurrence after that
   period ends. `INTERVAL` does the rest of the skipping itself.

Case 3 is why this is not a plain `rrule.after(today)`. Anchoring at the
completion date makes `INTERVAL` step from there, so an oil change on
2026-06-19 under `FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=-1` would roll to
2026-06-30 — eleven days out instead of six months.

## Things this plugin will not do

- **Delete a note.** Sweeping finished one-time tasks is deliberately out of
  scope. The sidebar surfaces recurring tasks stuck at `done: true`, and
  unreadable repeat rules, but only ever reports them.
- **Write `.obsidian/types.json`.** The property-type registry is vault-wide;
  a stray write there breaks date sorting on every note at once.
- **Write to a Kanban board or any hand-maintained table.** Frontmatter is the
  source of truth.

## Known seam: the base filters are duplicated

Bases exposes no documented plugin API, so `src/model/taskRepository.ts` does
not query `tasks/task base.base`. It walks the vault and re-implements the
base's two filter clauses against the metadata cache:

```
type == "task"   and   !file.inFolder("Templates")
```

**If the `.base` file's filters change, that file must change with them**, or
the sidebar and the base will quietly disagree. **Excluded folders** is a
setting for exactly this reason.

`src/model/assetRepository.ts` is the same shape for assets, and matches on
`type: asset` rather than mirroring `inventory.base`'s folder filter — see
**Assets** above for why.

## Installing in another vault

The plugin is three files — `main.js`, `manifest.json`, `styles.css` — in
`<vault>/.obsidian/plugins/task-base/`. Pick one route:

| | |
|---|---|
| **Symlink** | `ln -s /path/to/repo <vault>/.obsidian/plugins/task-base` after `npm run build`. One build serves every vault, and `git pull` keeps them current. |
| **Copy** | Copy the three built files in. Each vault can run a different version; you update each by hand. |
| **Clone and build** | For another machine: clone, `npm install`, `npm run build`, then symlink or copy. |

Then enable **Task Base** under Settings → Community plugins.

### A new vault needs configuring, not just the files

The plugin finds tasks by `type: task` **anywhere in the vault**, so the
defaults — which describe one particular vault — are usually wrong somewhere
else. Three settings matter:

- **New task folder** — where new notes land. Created if missing.
- **Excluded folders** — any folder whose notes carry `type: task` for an
  unrelated reason. This is the one that bites: a vault with Kanban cards or
  another `type: task` convention will otherwise list them in the pane's count
  and offer them in the **Complete task** picker, where choosing one writes
  `done: true` and `last done` into a note that was never a task.
- **Task base** — clear it, or point it at that vault's base. When the path
  does not resolve, the pane's "Open task base" button is simply hidden.

**No `.base` file is required.** The pane reads the metadata cache directly, so
every command and every section works in a vault with no base at all. The base
only adds Obsidian's own table view and the button that opens it.

Property types need no setup either: Obsidian infers `done` as a checkbox and
`due` / `last done` as dates from the values the plugin writes. The plugin never
touches `.obsidian/types.json`.

## A hazard worth knowing

**Do not name a method on the view class after a Workspace lifecycle verb.**
`View.open()` is a real method Obsidian calls to open a view, but it is absent
from `obsidian.d.ts` — so defining `private open(task: Task)` on the view type
checks cleanly, overrides Obsidian's own method, and the pane then renders
blank: the view constructs, `onload` and `onOpen` never run, and **nothing is
logged anywhere**. It is named `openNote` for that reason.

`render()` catches its own failures and paints the error into the pane, so the
next render bug reports itself rather than showing an empty panel.

## Layout

```
src/
  main.ts                    commands, view registration, ribbon
  settings.ts                settings + tab
  dates.ts                   all-day date helpers
  recurrence.ts              RRULE parse / describe / next-due / build
  rruleCompat.ts             CJS/ESM interop shim for the rrule package
  model/frontmatter.ts       pure text: note rendering, YAML normalisation
  model/assetLink.ts         pure text: asset wikilink <-> bare name
  model/task.ts              the field contract, read + write
  model/taskRepository.ts    find and bucket tasks
  model/assetRepository.ts   find asset notes
  settingsData.ts            pure: settings shape, defaults, migration
  ui/                        modals and the sidebar view
test/                        node:test suites over the pure modules
```

`model/frontmatter.ts` holds everything that does not touch the Obsidian API,
which is what makes the test suite runnable outside the app — and those are the
functions most worth testing, since a regex that strays out of the frontmatter
would rewrite someone's note body.

## Development

```bash
npm install
echo "$HOME/path/to/YourVault/.obsidian/plugins/task-base" > .vault-plugin-dir
npm run dev     # watch build, writes straight into the vault plugin folder
npm test        # node:test over recurrence, frontmatter, asset links, settings
npm run lint    # eslint
npm run build   # typecheck + minified build to the repo root, for release
```

The dev build destination is per-machine and not committed. It comes from
`.vault-plugin-dir` (gitignored) or from a `VAULT_PLUGIN_DIR` environment
variable, which wins if both are set. `npm run dev` writes `main.js`,
`manifest.json` and `styles.css` there so an Obsidian reload picks the change
up, and exits with an error if neither is set rather than quietly building
somewhere you are not watching. `npm run build` ignores both and writes to the
repo root.

After the first build, enable **Task Base** in Settings → Community plugins.
Reload it after a rebuild with the Obsidian CLI:

```bash
obsidian plugin:reload id=task-base
```
