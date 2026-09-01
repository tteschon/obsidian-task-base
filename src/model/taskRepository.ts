import { type App, type TFile } from "obsidian";
import { type Task, readTask } from "./task";
import { type ISODate, addDays, parseISO, toISO, todayISO } from "../dates";
import { frequencyState, isRecurring } from "../recurrence";

/**
 * Finding tasks.
 *
 * Bases exposes no documented plugin API, so this does not query
 * `tasks/task base.base`. It walks the vault and re-implements the base's two
 * filter clauses against the metadata cache:
 *
 *     type == "task"   and   !file.inFolder("Templates")
 *
 * That is a seam: if the `.base` file's filters change, this must change with
 * it. The buckets below likewise mirror the base's saved views by hand.
 */

export interface Buckets {
	overdue: Task[];
	today: Task[];
	thisWeek: Task[];
	needsAttention: Task[];
	/** Recurring tasks left at `done: true` — they have stopped recurring. */
	stalled: Task[];
	/** Tasks whose `frequency` is set but unreadable. */
	invalidRule: Task[];
	all: Task[];
}

export class TaskRepository {
	constructor(
		private app: App,
		private getTemplateFolder: () => string,
	) {}

	private isExcluded(file: TFile): boolean {
		const folder = this.getTemplateFolder().replace(/\/+$/, "");
		if (!folder) return false;
		return file.path === `${folder}` || file.path.startsWith(`${folder}/`);
	}

	/** Every note carrying `type: task`, minus the template folder. */
	all(): Task[] {
		const out: Task[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (this.isExcluded(file)) continue;
			const task = readTask(this.app, file);
			if (task) out.push(task);
		}
		return out;
	}

	/** A task for a specific file, or null if the note is not one. */
	get(file: TFile): Task | null {
		return readTask(this.app, file);
	}

	/** Open tasks, ranked: overdue first, then by due date, then by priority. */
	static rank(tasks: Task[], today: ISODate = todayISO()): Task[] {
		const weight: Record<string, number> = { high: 0, medium: 1, low: 2 };
		return [...tasks].sort((a, b) => {
			if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
			if (a.due && !b.due) return -1;
			if (!a.due && b.due) return 1;
			const p = weight[a.priority] - weight[b.priority];
			if (p !== 0) return p;
			return a.name.localeCompare(b.name);
		});
	}

	buckets(today: ISODate = todayISO()): Buckets {
		const all = this.all();
		const open = all.filter((t) => !t.done);
		const todayDate = parseISO(today);
		const weekOut = todayDate ? toISO(addDays(todayDate, 7)) : today;

		const overdue = open.filter((t) => t.due !== null && t.due < today);
		const dueToday = open.filter((t) => t.due === today);
		const thisWeek = open.filter((t) => t.due !== null && t.due > today && t.due <= weekOut);
		// Recurring tasks with no due date are waiting on a first completion.
		// They are a queue, not overdue work — the sidebar says so.
		const needsAttention = open.filter((t) => t.due === null && isRecurring(t.frequency));
		// A recurring task sitting at done: true has silently stopped
		// recurring. Nothing else in the vault reports this.
		const stalled = all.filter((t) => t.done && isRecurring(t.frequency));
		// A frequency that will not parse is neither recurring nor one-time.
		// Completing it either way would be a guess, so it is reported instead.
		const invalidRule = all.filter((t) => frequencyState(t.frequency) === "invalid");

		return {
			overdue: TaskRepository.rank(overdue, today),
			today: TaskRepository.rank(dueToday, today),
			thisWeek: TaskRepository.rank(thisWeek, today),
			needsAttention: TaskRepository.rank(needsAttention, today),
			stalled: TaskRepository.rank(stalled, today),
			invalidRule: TaskRepository.rank(invalidRule, today),
			all,
		};
	}

	/** Distinct category values already in use, for the create modal. */
	categories(): string[] {
		const seen = new Set<string>();
		for (const t of this.all()) if (t.category) seen.add(t.category);
		return [...seen].sort();
	}
}
