import { ItemView, TFile, type WorkspaceLeaf, setIcon, setTooltip } from "obsidian";
import type HomeTasksPlugin from "../main";
import type { Task } from "../model/task";
import type { Buckets } from "../model/taskRepository";
import { describeFrequency } from "../recurrence";
import { formatHuman, relativeDay, todayISO } from "../dates";
import { CompleteTaskModal } from "./CompleteTaskModal";

export const TASK_VIEW_TYPE = "home-tasks-view";

interface Section {
	key: keyof Omit<Buckets, "all" | "stalled" | "invalidRule">;
	title: string;
	empty: string;
	cls?: string;
}

const SECTIONS: Section[] = [
	{
		key: "overdue",
		title: "Overdue",
		empty: "Nothing overdue.",
		cls: "home-tasks-section-overdue",
	},
	{ key: "today", title: "Today", empty: "Nothing due today." },
	{ key: "thisWeek", title: "This week", empty: "Nothing else due in the next seven days." },
	{
		key: "needsAttention",
		title: "Needs attention",
		empty: "Every recurring task has a due date.",
	},
];

/** The sidebar list, mirroring the saved views in tasks/task base.base. */
export class TaskListView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private plugin: HomeTasksPlugin,
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
		this.contentEl.addClass("home-tasks-view");
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
			const warn = el.createDiv({ cls: "home-tasks-warning" });
			warn.createDiv({
				text: `${buckets.stalled.length} recurring ${
					buckets.stalled.length === 1 ? "task is" : "tasks are"
				} marked done and have stopped recurring:`,
			});
			for (const task of buckets.stalled) {
				const line = warn.createDiv({ cls: "home-tasks-name", text: task.name });
				line.addEventListener("click", () => this.complete(task));
			}
		}

		if (buckets.invalidRule.length) {
			const warn = el.createDiv({ cls: "home-tasks-warning" });
			warn.createDiv({
				text: `${buckets.invalidRule.length} ${
					buckets.invalidRule.length === 1 ? "task has a repeat rule" : "tasks have repeat rules"
				} that cannot be read:`,
			});
			for (const task of buckets.invalidRule) {
				const line = warn.createDiv({
					cls: "home-tasks-name",
					text: `${task.name} — ${task.frequency}`,
				});
				line.addEventListener("click", () => {
					void this.app.workspace.getLeaf(false).openFile(task.file);
				});
			}
		}

		for (const section of SECTIONS) {
			const tasks = buckets[section.key];
			const sectionEl = el.createDiv({ cls: `home-tasks-section ${section.cls ?? ""}` });
			const header = sectionEl.createDiv({ cls: "home-tasks-section-header" });
			header.createSpan({ text: section.title });
			header.createSpan({ cls: "home-tasks-count", text: String(tasks.length) });

			if (!tasks.length) {
				sectionEl.createDiv({ cls: "home-tasks-empty", text: section.empty });
				continue;
			}
			for (const task of tasks) this.renderRow(sectionEl, task, today);
		}

		const footer = el.createDiv({ cls: "home-tasks-empty" });
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
		const bar = parent.createDiv({ cls: "home-tasks-toolbar" });

		const create = bar.createEl("button", { cls: "home-tasks-new mod-cta" });
		setIcon(create.createSpan({ cls: "home-tasks-btn-icon" }), "plus");
		create.createSpan({ text: "New task" });
		create.addEventListener("click", () => this.plugin.openCreateTaskModal());

		this.iconButton(bar, "refresh-cw", "Refresh", () => this.render());

		// Only offered when the base actually exists, so a renamed or missing
		// base leaves no button that silently does nothing.
		const base = this.baseFile();
		if (base) {
			this.iconButton(bar, "table", "Open task base", () => {
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
		const button = parent.createEl("button", { cls: "home-tasks-icon-button" });
		setIcon(button, icon);
		setTooltip(button, label);
		button.setAttr("aria-label", label);
		button.addEventListener("click", onClick);
	}

	private renderRow(parent: HTMLElement, task: Task, today: string): void {
		const row = parent.createDiv({ cls: "home-tasks-row" });

		const check = row.createEl("input", { cls: "home-tasks-check" });
		check.type = "checkbox";
		check.checked = task.done;
		check.setAttr("aria-label", `Complete ${task.name}`);
		check.addEventListener("click", (e) => {
			e.preventDefault();
			this.complete(task);
		});

		const main = row.createDiv();
		const name = main.createDiv({ cls: "home-tasks-name", text: task.name });
		name.addEventListener("click", () => {
			void this.app.workspace.getLeaf(false).openFile(task.file);
		});

		const meta = main.createDiv({ cls: "home-tasks-meta" });
		if (task.category) meta.createSpan({ cls: "home-tasks-chip", text: task.category });
		if (task.due) {
			meta.createSpan({
				cls: task.due < today ? "home-tasks-due-late" : "",
				text: `${formatHuman(task.due)} · ${relativeDay(task.due, today)}`,
			});
		} else {
			meta.createSpan({ text: "no due date" });
		}
		if (task.priority !== "low") {
			meta.createSpan({
				cls: task.priority === "high" ? "home-tasks-priority-high" : "",
				text: task.priority,
			});
		}
		const freq = describeFrequency(task.frequency);
		if (freq) meta.createSpan({ cls: "home-tasks-chip", text: freq });
	}

	private complete(task: Task): void {
		new CompleteTaskModal(this.app, task, this.plugin.settings, () => this.render()).open();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}
}
