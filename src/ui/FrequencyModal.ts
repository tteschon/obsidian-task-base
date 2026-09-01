import { type App, Modal, Setting } from "obsidian";
import {
	DEFAULT_SPEC,
	type FrequencySpec,
	WEEKDAYS,
	type WeekdayCode,
	buildFrequency,
	describeFrequency,
	specFromFrequency,
	upcoming,
} from "../recurrence";
import { formatHuman, todayISO } from "../dates";

interface Preset {
	label: string;
	spec: FrequencySpec;
}

/** Presets drawn from the rules already in the vault. */
const PRESETS: Preset[] = [
	{ label: "Weekly", spec: { freq: "WEEKLY", interval: 1, byday: ["MO"], lastDayOfMonth: false } },
	{
		label: "Every 2 weeks",
		spec: { freq: "WEEKLY", interval: 2, byday: ["MO"], lastDayOfMonth: false },
	},
	{
		label: "Last day of the month",
		spec: { freq: "MONTHLY", interval: 1, byday: [], lastDayOfMonth: true },
	},
	{
		label: "Last day of every 6 months",
		spec: { freq: "MONTHLY", interval: 6, byday: [], lastDayOfMonth: true },
	},
	{ label: "Yearly", spec: { freq: "YEARLY", interval: 1, byday: [], lastDayOfMonth: false } },
];

/**
 * Build an RRULE without typing RFC 5545.
 *
 * Calls back with the rule string, or null when the user chooses "does not
 * repeat" — which the caller must write as a bare key, not an empty string.
 */
export class FrequencyModal extends Modal {
	private spec: FrequencySpec;
	private previewEl!: HTMLElement;
	private weekdayEls = new Map<WeekdayCode, HTMLElement>();
	private bodyEl!: HTMLElement;

	constructor(
		app: App,
		current: string | null,
		private onSubmit: (frequency: string | null) => void,
	) {
		super(app);
		this.spec = specFromFrequency(current) ?? { ...DEFAULT_SPEC };
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("home-tasks-modal");
		contentEl.createEl("h3", { text: "Repeat" });

		const presetRow = contentEl.createDiv({ cls: "home-tasks-weekdays" });
		for (const preset of PRESETS) {
			const chip = presetRow.createSpan({ cls: "home-tasks-weekday", text: preset.label });
			chip.addEventListener("click", () => {
				this.spec = { ...preset.spec };
				this.renderBody();
			});
		}

		this.bodyEl = contentEl.createDiv();
		this.renderBody();

		const buttons = contentEl.createDiv({ cls: "home-tasks-buttons" });
		buttons
			.createEl("button", { text: "Does not repeat" })
			.addEventListener("click", () => {
				this.onSubmit(null);
				this.close();
			});
		const save = buttons.createEl("button", { text: "Set repeat", cls: "mod-cta" });
		save.addEventListener("click", () => {
			this.onSubmit(buildFrequency(this.spec));
			this.close();
		});
	}

	private renderBody(): void {
		this.bodyEl.empty();
		this.weekdayEls.clear();

		new Setting(this.bodyEl).setName("Repeats").addDropdown((d) => {
			d.addOption("DAILY", "Daily");
			d.addOption("WEEKLY", "Weekly");
			d.addOption("MONTHLY", "Monthly");
			d.addOption("YEARLY", "Yearly");
			d.setValue(this.spec.freq).onChange((v) => {
				this.spec.freq = v as FrequencySpec["freq"];
				if (this.spec.freq !== "MONTHLY") this.spec.lastDayOfMonth = false;
				if (this.spec.freq === "DAILY" || this.spec.freq === "YEARLY") this.spec.byday = [];
				this.renderBody();
			});
		});

		new Setting(this.bodyEl)
			.setName("Every")
			.setDesc(this.intervalUnit())
			.addText((t) => {
				t.inputEl.type = "number";
				t.inputEl.min = "1";
				t.setValue(String(this.spec.interval)).onChange((v) => {
					const n = Number.parseInt(v, 10);
					this.spec.interval = Number.isFinite(n) && n > 0 ? n : 1;
					this.renderPreview();
				});
			});

		if (this.spec.freq === "WEEKLY") {
			const setting = new Setting(this.bodyEl).setName("On");
			const row = setting.controlEl.createDiv({ cls: "home-tasks-weekdays" });
			for (const day of WEEKDAYS) {
				const el = row.createSpan({ cls: "home-tasks-weekday", text: day.label });
				if (this.spec.byday.includes(day.code)) el.addClass("is-active");
				el.addEventListener("click", () => {
					this.spec.byday = this.spec.byday.includes(day.code)
						? this.spec.byday.filter((c) => c !== day.code)
						: [...this.spec.byday, day.code];
					el.toggleClass("is-active", this.spec.byday.includes(day.code));
					this.renderPreview();
				});
				this.weekdayEls.set(day.code, el);
			}
		}

		if (this.spec.freq === "MONTHLY") {
			new Setting(this.bodyEl)
				.setName("On the last day of the month")
				.setDesc("Emits BYMONTHDAY=-1, which lands correctly on 28, 29, 30 and 31-day months.")
				.addToggle((t) =>
					t.setValue(this.spec.lastDayOfMonth).onChange((v) => {
						this.spec.lastDayOfMonth = v;
						this.renderPreview();
					}),
				);
		}

		this.previewEl = this.bodyEl.createDiv({ cls: "home-tasks-preview" });
		this.renderPreview();
	}

	private intervalUnit(): string {
		return { DAILY: "days", WEEKLY: "weeks", MONTHLY: "months", YEARLY: "years" }[this.spec.freq];
	}

	private renderPreview(): void {
		if (!this.previewEl) return;
		this.previewEl.empty();
		const rule = buildFrequency(this.spec);
		this.previewEl.createEl("code", { text: rule });
		const text = describeFrequency(rule);
		if (text) this.previewEl.createDiv({ text });
		const dates = upcoming(rule, todayISO(), 3);
		if (dates.length) {
			this.previewEl.createDiv({
				cls: "home-tasks-preview-dates",
				text: `Next: ${dates.map(formatHuman).join(" · ")}`,
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
