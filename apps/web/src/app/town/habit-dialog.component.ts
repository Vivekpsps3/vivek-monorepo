import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ConfirmService, ToastService, UiButtonComponent, UiDialogComponent } from '@vivek/ui';
import { TownApiService, type PatchHabit } from './town.api';
import { SLOT_DEFAULT_STYLE } from './town.constants';
import { townSpriteUrl } from './town-sprites';
import { apiProblem, cadenceLabel, habitNameError, normalizedHabitName, pendingHint } from './town-text';
import type { Habit, TownResponse } from './town.types';

const STYLES = ['forge', 'garden', 'cottage'] as const;

@Component({
  selector: 'app-habit-dialog',
  imports: [UiButtonComponent, UiDialogComponent],
  templateUrl: './habit-dialog.component.html',
  styleUrl: './habit-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HabitDialogComponent {
  private readonly api = inject(TownApiService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly destroy = inject(DestroyRef);
  readonly data = input.required<TownResponse>();
  readonly slot = input<number | null>(null);
  readonly habitId = input<number | null>(null);
  readonly prefill = input('');
  readonly closed = output<boolean>();
  readonly name = signal('');
  readonly buildingStyle = signal<Habit['building_style']>('forge');
  readonly perWeek = signal(7);
  readonly chosenSlot = signal(0);
  readonly nameError = signal('');
  readonly formError = signal('');
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly busy = signal(false);
  readonly styles = STYLES;
  readonly weeks = [7, 6, 5, 4, 3, 2, 1];
  readonly cadenceLabel = cadenceLabel;
  private seeded = false;
  /** Cadence shown when the dialog opened. Edit saves omit per_week until the user moves off it. */
  private seededPerWeek = 7;

  readonly habit = computed(() => this.data().habits.find(item => item.id === this.habitId()) ?? null);
  readonly editing = computed(() => this.habit() != null);
  readonly emptySlots = computed(() => this.data().lots.filter(lot => lot.state === 'empty').map(lot => lot.slot));
  readonly hint = computed(() => {
    const habit = this.habit();
    return habit ? pendingHint(habit) : '';
  });
  readonly count = computed(() => [...this.name()].length);

  constructor() {
    effect(() => {
      const habit = this.habit();
      const slots = this.emptySlots();
      const preset = this.slot();
      if (this.seeded) return;
      const seededPerWeek = habit?.cadence.pending?.per_week ?? habit?.cadence.per_week ?? 7;
      this.name.set(habit?.name ?? this.prefill());
      this.buildingStyle.set(habit?.building_style ?? SLOT_DEFAULT_STYLE[preset ?? 0] ?? 'forge');
      this.perWeek.set(seededPerWeek);
      this.seededPerWeek = seededPerWeek;
      this.chosenSlot.set(preset != null && (slots.includes(preset) || slots.length === 0) ? preset : slots[0] ?? preset ?? 0);
      this.seeded = true;
    });
  }

  slotChoices(): number[] {
    const slots = this.emptySlots();
    const chosen = this.chosenSlot();
    return slots.length ? slots : [chosen];
  }

  onName(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.name.set(event.target.value);
  }
  onSlot(event: Event): void {
    if (event.target instanceof HTMLSelectElement) this.chosenSlot.set(Number(event.target.value));
  }
  onStyle(style: Habit['building_style']): void { this.buildingStyle.set(style); }
  preview(style: Habit['building_style']): string {
    return townSpriteUrl(style === 'forge' ? 'forge-2' : style === 'garden' ? 'garden-2' : 'cottage-2');
  }
  onCadence(event: Event): void {
    if (event.target instanceof HTMLSelectElement) this.perWeek.set(Number(event.target.value));
  }

  save(event?: Event): void {
    event?.preventDefault();
    const nameError = habitNameError(this.name());
    this.nameError.set(nameError ?? '');
    this.formError.set('');
    this.fieldErrors.set({});
    if (nameError || this.busy()) return;
    const name = normalizedHabitName(this.name());
    const habit = this.habit();
    const request = habit
      ? this.api.patchHabit(habit.id, this.editPatch(habit, name))
      : this.api.createHabit({ name, slot: this.chosenSlot(), per_week: this.perWeek(), building_style: this.buildingStyle() });
    this.busy.set(true);
    request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: () => { this.busy.set(false); this.closed.emit(true); },
      error: (error: unknown) => {
        this.busy.set(false);
        const problem = apiProblem(error);
        this.fieldErrors.set(problem.fields);
        this.formError.set(problem.message);
        this.toast.error(problem.message);
      },
    });
  }

  private editPatch(habit: Habit, name: string): PatchHabit {
    const body: PatchHabit = {};
    if (name !== habit.name) body.name = name;
    if (this.buildingStyle() !== habit.building_style) body.building_style = this.buildingStyle();
    // Sending this week's per_week deletes a pending Monday row (§6.4). Leave it off when the select is unchanged.
    if (this.perWeek() !== this.seededPerWeek) body.per_week = this.perWeek();
    return body;
  }

  archive(): void {
    const habit = this.habit();
    if (!habit || this.busy()) return;
    void this.confirm.ask(
      'Archive habit',
      `Archive '${habit.name}'? It leaves the town, frees its lot and keeps its ${habit.xp} XP. You can't undo this.`,
      'Archive',
      'Cancel',
    ).then(ok => {
      if (!ok) return;
      this.busy.set(true);
      this.api.patchHabit(habit.id, { archived: true }).pipe(takeUntilDestroyed(this.destroy)).subscribe({
        next: () => { this.busy.set(false); this.closed.emit(true); },
        error: (error: unknown) => {
          this.busy.set(false);
          const problem = apiProblem(error);
          this.formError.set(problem.message);
          this.toast.error(problem.message);
        },
      });
    });
  }

  dismiss(): void {
    if (!this.busy()) this.closed.emit(false);
  }
}
