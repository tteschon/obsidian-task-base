# Changelog

All notable changes to this plugin are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.2] — 2026-09-02

### Changed

- Lint runs `eslint-plugin-obsidianmd`, the community directory's own rule set,
  and a workflow runs the directory's validation on every push and pull request
  — or on any branch, tag or commit on demand. Both rounds of review feedback so
  far were rules this repo was not checking.
- The month-end toggle's description no longer names the RRULE keyword, and two
  placeholders use sentence case, per `obsidianmd/ui/sentence-case`.

## [0.3.1] — 2026-09-02

### Fixed

- The two `ItemView` lifecycle methods no longer suppress a lint rule at all.
  They return an already-resolved promise instead of being `async` with nothing
  to await, which satisfies the signature without a directive.
- Lint enforces `eslint-comments/require-description`, so any future
  `eslint-disable` has to carry its reason inline — the rule the community
  directory checks, now checked here first.

## [0.3.0] — 2026-09-02

Addresses the Obsidian community directory's automated review.

### Added

- Release assets carry [GitHub artifact attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations),
  so anyone can cryptographically verify a downloaded `main.js` was built from
  this repository by its release workflow.
- The settings tab implements `getSettingDefinitions()`, so on Obsidian 1.13.0
  and later its settings appear in Obsidian's settings search. The classic
  `display()` tab is still there for earlier versions; both are generated from
  one description, so they cannot drift.

### Changed

- The **Open task base** command is now **Open base file** — a command name
  should not repeat the plugin name, which Obsidian already shows beside it.
  The command id is unchanged, so existing hotkeys still work.
- The README documents that the plugin enumerates the vault's markdown files to
  find notes by `type`, why that is necessary, and what it does not do.

### Fixed

- Lint now runs typescript-eslint's **type-checked** rules, and tests are type
  checked too. Several unsafe `any` accesses around Obsidian's frontmatter API
  and one mis-typed async callback were invisible under the previous config.
- Dropped the `builtin-modules` dependency in favour of Node's own
  `node:module` builtin list.

## [0.2.2] — 2026-09-02

### Changed

- The repository moved to `tteschon/obsidian-task-base`, matching the plugin's
  id. The build banner and install instructions point at the new location.

## [0.2.1] — 2026-09-02

### Fixed

- The repeat builder's preset chips ran straight into the **Repeats** row with
  nothing between them, so the two read as one broken group. They are now a
  labelled block with a separator.
- A month-end rule rendered as "every 3 months on the last", which is not a
  sentence. It now reads "on the last day". An ordinal weekday such as "on the
  last Monday" is unaffected.
- The preset chips and weekday toggles were spans carrying click handlers, so
  neither could be reached by keyboard. They are buttons now, and the toggles
  expose their state through `aria-pressed` rather than colour alone.

## [0.2.0] — 2026-09-02

### Added

- Task rows carry an actions menu button, reachable by mouse, touch and
  keyboard. Right-click still works; it is no longer the only way in.
- The base button appears even when no base exists, and creates one when
  clicked. Its filters are generated from the **Excluded folders** setting.
- **Open task base** command.
- **Edit task** command and modal — due date, priority, category, repeat rule
  and asset, all changeable after creation.
- A **Later** section in the task pane, collapsed by default. The pane's
  sections now account for every open task rather than only the next seven days.

### Changed

- `created` is written as a bare `YYYY-MM-DD` date instead of a wikilink to the
  daily note, so it can be sorted and used in formulas. **This is a breaking
  change to the note format** — see Migrating below.
- The note body field in the create modal spans the modal width.
- `minAppVersion` corrected to `1.7.2`, the real floor for the APIs used.

### Fixed

- The task pane rendered blank. A method named `open()` on the view class
  silently overrode `View.open()`, which Obsidian calls to open a view — it is
  absent from `obsidian.d.ts`, so it type checked cleanly.
- The asset type-ahead no longer walks every note in the vault on each
  keystroke.
- Task names and section headers are focusable, so the pane is keyboard
  navigable.

### Migrating from 0.1.0

Existing notes keep working; only newly created ones use the new `created`
format. To convert existing notes, rewrite `created: "[[YYYY-MM-DD]]"` to
`created: YYYY-MM-DD` and register `created` as a `date` property. Note that
**Obsidian property types are vault-wide**, so this affects every note carrying
a `created` property, not only tasks.

## [0.1.0] — 2026-09-01

First release. Note-per-task management with RFC 5545 recurrence, a task pane,
an RRULE builder, and an asset picker.
