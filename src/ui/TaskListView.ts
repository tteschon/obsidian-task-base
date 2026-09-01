import { ItemView, Menu, TFile, type WorkspaceLeaf, setIcon, setTooltip } from "obsidian";
import type TaskBasePlugin from "../main";
import type { Task } from "../model/task";
import type { Buckets } from "../model/taskRepository";
import { describeFrequency } from "../recurrence";
import { formatHuman, relativeDay, todayISO } from "../dates";
import { CompleteTaskModal } from "./CompleteTaskModal";

export const TASK_VIEW_TYPE = "task-base-view";

interface Section {
	key: keyof Omit<Buckets, "all" | "stalled" | "invalidRule">;
	title: string;
	empty: string;
	cls?: string;
	/** Rendered behind a disclosure, folded until asked for. */
	collapsible?: boolean;
}

const SECTIONS: Section[] = [
	{
		key: "overdue",
		title: "Overdue",
		empty: "Nothing overdue.",
		cls: "task-base-section-overdue",
	},
	{ key: "today", title: "Today", empty: "Nothing due today." },
	{ key: "thisWeek", title: "This week", empty: "Nothing else due in the next seven days." },
	{
		key: "needsAttention",
		title: "Needs attention",
		empty: "Every recurring task has a due date.",
	},
	{
		key: "later",
		title: "Later",
		empty: "Nothing further out.",
		collapsible: true,
	},
];

/** The sidebar list, mirroring the saved views in tasks/task base.base. */
export class TaskListView extends ItemView {
	/**
	 * Which collapsible sections are folded.
	 *
	 * Held on the view so a re-render keeps it, and reset by a workspace
	 * reload — the right default for a triage pane, which should open on what
	 * is urgent rather than on however it was left weeks ago.
	 */
	private collapsed = new Set<string>(["later"]);

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: TaskBasePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return TASK_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Tasks";
	}

	getIcon(): string {
		return "list-checks";
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass("task-base-view");
		this.render();
	}

	render(): void {
		const today = todayISO();
		const buckets = this.plugin.repository.buckets(today);
		const el = this.contentEl;
		el.empty();

		this.renderToolbar(el);

		// Surfaced, never auto-fixed: a recurring task at done: true has
		// silently stopped recurring and nothing else reports it.
		if (buckets.stalled.length) {
			const warn = el.createDiv({ cls: "task-base-warning" });
			warn.createDiv({
				text: `${buckets.stalled.length} recurring ${
					buckets.stalled.length === 1 ? "task is" : "tasks are"
				} marked done and have stopped recurring:`,
			});
			for (const task of buckets.stalled) {
				const line = warn.createEl("button", { cls: "task-base-name", text: task.name });
				line.addEventListener("click", () => this.complete(task));
			}
		}

		if (buckets.invalidRule.length) {
			const warn = el.createDiv({ cls: "task-base-warning" });
			warn.createDiv({
				text: `${buckets.invalidRule.length} ${
					buckets.invalidRule.length === 1 ? "task has a repeat rule" : "tasks have repeat rules"
				} that cannot be read:`,
			});
			for (const task of buckets.invalidRule) {
				const line = warn.createEl("button", {
					cls: "task-base-name",
					text: `${task.name} — ${task.frequency}`,
				});
				line.addEventListener("click", () => this.open(task));
			}
		}

		for (const section of SECTIONS) {
			const tasks = buckets[section.key];
			const sectionEl = el.createDiv({ cls: `task-base-section ${section.cls ?? ""}` });
			const folded = section.collapsible === true && this.collapsed.has(section.key);

			if (section.collapsible) {
				// A real button, so the disclosure is reachable by keyboard and
				// announced with its state rather than being a clickable div.
				const header = sectionEl.createEl("button", {
					cls: "task-base-section-header task-base-disclosure",
				});
				header.setAttr("aria-expanded", String(!folded));
				setIcon(
					header.createSpan({ cls: "task-base-chevron" }),
					folded ? "chevron-right" : "chevron-down",
				);
				header.createSpan({ text: section.title });
				header.createSpan({ cls: "task-base-count", text: String(tasks.length) });
				header.addEventListener("click", () => {
					if (this.collapsed.has(section.key)) this.collapsed.delete(section.key);
					else this.collapsed.add(section.key);
					this.render();
				});
			} else {
				const header = sectionEl.createDiv({ cls: "task-base-section-header" });
				header.createSpan({ text: section.title });
				header.createSpan({ cls: "task-base-count", text: String(tasks.length) });
			}

			// The count on a folded header is the whole point — it says how much
			// is tucked away without making you open it.
			if (folded) continue;

			if (!tasks.length) {
				sectionEl.createDiv({ cls: "task-base-empty", text: section.empty });
				continue;
			}
			for (const task of tasks) this.renderRow(sectionEl, task, today);
		}

		const footer = el.createDiv({ cls: "task-base-empty" });
		footer.setText(
			`${buckets.all.filter((t) => !t.done).length} open of ${buckets.all.length} task notes.`,
		);
	}

	/**
	 * Actions the pane can take on its own.
	 *
	 * Sticky, so the primary action stays reachable once the list scrolls —
	 * the pane is otherwise read-only and every write has to go through the
	 * command palette.
	 */
	private renderToolbar(parent: HTMLElement): void {
		const bar = parent.createDiv({ cls: "task-base-toolbar" });

		const create = bar.createEl("button", { cls: "task-base-new mod-cta" });
		setIcon(create.createSpan({ cls: "task-base-btn-icon" }), "plus");
		create.createSpan({ text: "New task" });
		create.addEventListener("click", () => this.plugin.openCreateTaskModal());

		this.iconButton(bar, "refresh-cw", "Refresh", () => this.render());

		// Only offered when the base actually exists, so a renamed or missing
		// base leaves no button that silently does nothing.
		const base = this.baseFile();
		if (base) {
			this.iconButton(bar, "table", "Open base file", () => {
				void this.app.workspace.getLeaf(false).openFile(base);
			});
		}
	}

	private baseFile(): TFile | null {
		const path = this.plugin.settings.basePath.trim();
		if (!path) return null;
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	}

	private iconButton(
		parent: HTMLElement,
		icon: string,
		label: string,
		onClick: () => void,
	): void {
		const button = parent.createEl("button", { cls: "task-base-icon-button" });
		setIcon(button, icon);
		setTooltip(button, label);
		button.setAttr("aria-label", label);
		button.addEventListener("click", onClick);
	}

	private renderRow(parent: HTMLElement, task: Task, today: string): void {
		const row = parent.createDiv({ cls: "task-base-row" });
		row.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			this.showMenu(task, e);
		});

		const check = row.createEl("input", { cls: "task-base-check" });
		check.type = "checkbox";
		check.checked = task.done;
		check.setAttr("aria-label", `Complete ${task.name}`);
		check.addEventListener("click", (e) => {
			e.preventDefault();
			this.complete(task);
		});

		const main = row.createDiv();
		const name = main.createEl("button", { cls: "task-base-name", text: task.name });
		name.addEventListener("click", () => this.open(task));

		const meta = main.createDiv({ cls: "task-base-meta" });
		if (task.category) meta.createSpan({ cls: "task-base-chip", text: task.category });
		if (task.due) {
			meta.createSpan({
				cls: task.due < today ? "task-base-due-late" : "",
				text: `${formatHuman(task.due)} · ${relativeDay(task.due, today)}`,
			});
		} else {
			meta.createSpan({ text: "no due date" });
		}
		if (task.priority !== "low") {
			meta.createSpan({
				cls: task.priority === "high" ? "task-base-priority-high" : "",
				text: task.priority,
			});
		}
		const freq = describeFrequency(task.frequency);
		if (freq) meta.createSpan({ cls: "task-base-chip", text: freq });
	}

	private open(task: Task): void {
		void this.app.workspace.getLeaf(false).openFile(task.file);
	}

	private showMenu(task: Task, event: MouseEvent): void {
		const menu = new Menu();
		menu.addItem((i) =>
			i
				.setTitle("Edit task")
				.setIcon("pencil")
				.onClick(() => this.plugin.openEditTaskModal(task)),
		);
		menu.addItem((i) =>
			i
				.setTitle(task.done ? "Roll forward" : "Complete")
				.setIcon("check")
				.onClick(() => this.complete(task)),
		);
		menu.addItem((i) =>
			i
				.setTitle("Open note")
				.setIcon("file-text")
				.onClick(() => this.open(task)),
		);
		menu.showAtMouseEvent(event);
	}

	private complete(task: Task): void {
		new CompleteTaskModal(this.app, task, this.plugin.settings, () => this.render()).open();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}
}
