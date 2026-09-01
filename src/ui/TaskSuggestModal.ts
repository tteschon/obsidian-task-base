import { type App, FuzzySuggestModal } from "obsidian";
import type { Task } from "../model/task";
import { relativeDay } from "../dates";

/** Pick a task when the active note is not one. */
export class TaskSuggestModal extends FuzzySuggestModal<Task> {
	constructor(
		app: App,
		private tasks: Task[],
		private onChoose: (task: Task) => void,
		placeholder = "Pick a task",
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	getItems(): Task[] {
		return this.tasks;
	}

	getItemText(task: Task): string {
		const bits = [task.name];
		if (task.category) bits.push(task.category);
		if (task.due) bits.push(`${task.due} ${relativeDay(task.due)}`);
		return bits.join("  ·  ");
	}

	onChooseItem(task: Task): void {
		this.onChoose(task);
	}
}
