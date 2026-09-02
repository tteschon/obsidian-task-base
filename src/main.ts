import { Notice, Plugin, TFile, type WorkspaceLeaf, debounce, normalizePath } from "obsidian";
import { TaskBaseSettingTab } from "./settings";
import { type TaskBaseSettings, migrateSettings } from "./settingsData";
import { TaskRepository } from "./model/taskRepository";
import { defaultBasePath, renderTaskBase } from "./model/baseFile";
import { AssetRepository } from "./model/assetRepository";
import { type Task, hasCorruptDate, readTask, writeTask } from "./model/task";
import { isRecurring, nextDue } from "./recurrence";
import { todayISO } from "./dates";
import { CreateTaskModal } from "./ui/CreateTaskModal";
import { EditTaskModal } from "./ui/EditTaskModal";
import { CompleteTaskModal } from "./ui/CompleteTaskModal";
import { FrequencyModal } from "./ui/FrequencyModal";
import { SetAssetModal } from "./ui/SetAssetModal";
import { TaskSuggestModal } from "./ui/TaskSuggestModal";
import { TASK_VIEW_TYPE, TaskListView } from "./ui/TaskListView";

export default class TaskBasePlugin extends Plugin {
	settings!: TaskBaseSettings;
	repository!: TaskRepository;
	assets!: AssetRepository;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.repository = new TaskRepository(this.app, () => this.settings.excludedFolders);
		this.assets = new AssetRepository(this.app);

		this.registerView(TASK_VIEW_TYPE, (leaf: WorkspaceLeaf) => new TaskListView(leaf, this));


		this.addRibbonIcon("list-checks", "Tasks", () => void this.activateView());

		this.addCommand({
			id: "create-task",
			name: "Create task",
			callback: () => this.openCreateTaskModal(),
		});

		this.addCommand({
			id: "complete-task",
			name: "Complete task",
			callback: () => this.withTask("Complete which task?", (task) => this.completeTask(task)),
		});

		this.addCommand({
			id: "edit-task",
			name: "Edit task",
			callback: () => this.withTask("Edit which task?", (task) => this.openEditTaskModal(task)),
		});

		this.addCommand({
			id: "edit-frequency",
			name: "Edit repeat rule",
			callback: () =>
				this.withTask("Set the repeat rule on which task?", (task) => {
					new FrequencyModal(this.app, task.frequency, async (frequency) => {
						// Clearing writes null, not "". An empty string is not null to
						// Bases, and a frequency != null filter would then match this
						// one-time task and quietly return the wrong rows.
						await writeTask(this.app, task.file, { frequency });
						new Notice(frequency ? `Repeat set: ${frequency}` : "Repeat cleared");
						this.refreshViews();
					}).open();
				}),
		});

		this.addCommand({
			id: "set-asset",
			name: "Set asset",
			callback: () =>
				this.withTask("Set the asset on which task?", (task) => {
					new SetAssetModal(this.app, task, this.assets, () => this.refreshViews()).open();
				}),
		});

		this.addCommand({
			id: "recompute-due",
			name: "Recompute due date from repeat rule",
			callback: () =>
				this.withTask("Recompute the due date on which task?", async (task) => {
					if (!isRecurring(task.frequency)) {
						new Notice(`"${task.name}" does not repeat, so it has no rule to compute from.`);
						return;
					}
					const anchor = task.lastDone ?? todayISO();
					const due = nextDue(task.frequency, anchor);
					if (!due) {
						new Notice(`Could not read the repeat rule on "${task.name}".`);
						return;
					}
					await writeTask(this.app, task.file, { due });
					new Notice(`${task.name} — due ${due} (from ${anchor})`);
					this.refreshViews();
				}),
		});

		this.addCommand({
			id: "open-base",
			name: "Open task base",
			callback: () => void this.openOrCreateBase(),
		});

		this.addCommand({
			id: "open-task-view",
			name: "Open task list",
			callback: () => void this.activateView(),
		});

		this.addSettingTab(new TaskBaseSettingTab(this.app, this));

		const refresh = debounce(() => {
			// Any of these can add, rename or remove an asset note, which would
			// leave the picker offering notes that no longer exist.
			this.assets.invalidate();
			this.refreshViews();
		}, 400, true);
		this.registerEvent(this.app.metadataCache.on("changed", refresh));
		this.registerEvent(this.app.vault.on("delete", refresh));
		this.registerEvent(this.app.vault.on("rename", refresh));

		if (this.settings.openViewOnStart) {
			this.app.workspace.onLayoutReady(() => void this.activateView());
		}
	}

	onunload(): void {
		// Leaves are left in place; Obsidian detaches views of unloaded plugins.
	}

	async loadSettings(): Promise<void> {
		// migrateSettings, not Object.assign: a retired key from an older
		// version would otherwise ride along in memory and be written back to
		// disk on the next save.
		this.settings = migrateSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(TASK_VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof TaskListView) view.render();
		}
	}

	/**
	 * Show the task pane, building its view if the workspace only restored a
	 * shell of it.
	 *
	 * Obsidian defers sidebar views: a leaf saved in the layout comes back with
	 * the right state type but **no view behind it**, and `revealLeaf` alone
	 * happily reveals that empty shell — a blank pane, no error, nothing in the
	 * console. `setViewState` does not help either, because the state type is
	 * already correct so there is nothing for it to change. `loadIfDeferred` is
	 * the call that actually constructs the view.
	 */
	/**
	 * Show the task pane, building its view if the workspace only restored a
	 * shell of it.
	 *
	 * Obsidian defers sidebar views: a leaf saved in the layout comes back with
	 * the right state type but no view behind it, and `revealLeaf` alone will
	 * happily reveal that empty shell. `loadIfDeferred` is what actually
	 * constructs and opens the view.
	 */
	async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(TASK_VIEW_TYPE)[0];

		if (!leaf) {
			const right = workspace.getRightLeaf(false);
			if (!right) return;
			leaf = right;
			await leaf.setViewState({ type: TASK_VIEW_TYPE, active: true });
		}

		await leaf.loadIfDeferred();
		await workspace.revealLeaf(leaf);
	}

	/**
	 * Open the task base, creating it first when there isn't one.
	 *
	 * The pane shows this button unconditionally: a base is optional — the pane
	 * reads the metadata cache and works without one — but hiding the button
	 * when no base exists meant the one thing that would give you a base was
	 * invisible until you already had it.
	 *
	 * The generated filters are built from `excludedFolders`, so a base made
	 * here agrees with the pane by construction rather than by coincidence.
	 */
	async openOrCreateBase(): Promise<void> {
		const { vault, workspace } = this.app;
		const configured = this.settings.basePath.trim();
		const path = normalizePath(configured || defaultBasePath(this.settings.taskFolder));

		let file = vault.getAbstractFileByPath(path);

		if (!(file instanceof TFile)) {
			try {
				const folder = path.split("/").slice(0, -1).join("/");
				if (folder && !vault.getFolderByPath(folder)) await vault.createFolder(folder);
				file = await vault.create(
					path,
					renderTaskBase({ excludedFolders: this.settings.excludedFolders }),
				);
				new Notice(`Created ${path}`);
			} catch (e) {
				new Notice(`Could not create the base: ${e instanceof Error ? e.message : String(e)}`);
				return;
			}

			if (configured !== path) {
				this.settings.basePath = path;
				await this.saveSettings();
			}
			this.refreshViews();
		}

		if (file instanceof TFile) await workspace.getLeaf(false).openFile(file);
	}

	/** Shared by the "Create task" command and the task pane's New task button. */
	openCreateTaskModal(): void {
		new CreateTaskModal(this.app, this.settings, this.repository.categories(), this.assets, (file: TFile) => {
			this.refreshViews();
			void this.app.workspace.getLeaf(false).openFile(file);
		}).open();
	}

	/** Shared by the "Edit task" command and the task pane's context menu. */
	openEditTaskModal(task: Task): void {
		new EditTaskModal(this.app, task, this.settings, this.repository.categories(), this.assets, () =>
			this.refreshViews(),
		).open();
	}

	private completeTask(task: Task): void {
		new CompleteTaskModal(this.app, task, this.settings, () => this.refreshViews()).open();
	}

	/** Act on the active note when it is a task, otherwise offer a picker. */
	private withTask(prompt: string, action: (task: Task) => void | Promise<void>): void {
		const file = this.app.workspace.getActiveFile();
		if (file) {
			const task = this.activeTask(file);
			if (task) {
				void action(task);
				return;
			}
		}
		const open = this.repository.all().filter((t) => !t.done);
		if (!open.length) {
			new Notice("No open tasks found. A note is a task once it carries type: task.");
			return;
		}
		new TaskSuggestModal(this.app, TaskRepository.rank(open), (t) => void action(t), prompt).open();
	}

	private activeTask(file: TFile): Task | null {
		const task = readTask(this.app, file);
		if (task && hasCorruptDate(this.app, file)) {
			// due or last done holds something that is not a date. Comparisons
			// against it return false rather than raising, so the task would
			// silently never show as overdue.
			new Notice(
				`"${task.name}" has a non-date value in due or last done. Fix it in the note; date maths on it will not work.`,
			);
		}
		return task;
	}
}

