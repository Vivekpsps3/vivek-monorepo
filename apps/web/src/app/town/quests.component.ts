import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, Injector, afterNextRender, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { silentErrorToast } from '@vivek/ui';
import { timeout } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { bindLockNotices, bindLockSnapshots } from '../../../../finance/frontend/src/public-api';
import { SessionService } from '../platform/session.service';
import { classifySource, combineSource, type SourceKind, type SourceState } from './quest-sources';
import {
  HUB_SUMMARY_DEADLINE_MS,
  TownApiService,
  type QuestJournal,
  type QuestStepView,
  type QuestView,
} from './town.api';

interface QuestConfirmation {
  readonly questId: string;
  readonly stepId: string;
  readonly actionId: string;
  readonly expectedRevision: number;
  readonly label: string;
  readonly sample: boolean;
}

type Offer = 'done' | 'later' | 'wait' | 'record' | 'sample';

@Component({
  selector: 'app-town-quests',
  imports: [RouterLink],
  templateUrl: './quests.component.html',
  styleUrl: './quests.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestsComponent {
  private readonly api = inject(TownApiService);
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private owner: number | null = null;
  private generation = 0;

  protected readonly journal = signal<QuestJournal | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly loadError = signal(false);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly confirmation = signal<QuestConfirmation | null>(null);
  private readonly library = signal<SourceState>('loading');
  private readonly travel = signal<SourceState>('loading');
  private readonly memory = signal<SourceState>('loading');

  constructor() {
    const refresh = () => {
      this.invalidate();
      this.load();
    };
    this.destroy.onDestroy(bindLockSnapshots(refresh));
    this.destroy.onDestroy(bindLockNotices(refresh));
    inject(SessionService).user$.pipe(
      map(user => user?.id ?? null),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(owner => {
      this.invalidate();
      this.owner = owner;
      this.load();
    });
  }

  @HostListener('document:keydown.escape')
  protected cancelFromEscape(): void {
    if (this.confirmation() && !this.busy()) this.cancel();
  }

  protected offer(quest: QuestView, step: QuestStepView): Offer {
    if (step.recorded_action) return 'done';
    const next = quest.steps.find(item => !item.recorded_action);
    if (next?.id !== step.id) return 'later';
    if (!step.source || !step.sample_action_id) return 'record';
    const state = this.sourceState(step.source);
    if (state === 'loading') return 'wait';
    if (state === 'ready') return 'record';
    return 'sample';
  }

  protected sourceName(source: QuestStepView['source']): string {
    if (source === 'travel') return 'trips';
    if (source === 'memory') return 'memories';
    return 'library';
  }

  protected sampleSentence(step: QuestStepView): string {
    const state = step.source ? this.sourceState(step.source) : 'unavailable';
    const detail = step.sample_detail ?? 'Labeled sample.';
    const word = state === 'locked' ? 'locked' : state === 'empty' ? 'empty' : 'unavailable';
    if (step.source === 'travel') return `Saved trips are ${word}. ${detail}`;
    if (step.source === 'memory') return `Saved memories are ${word}. ${detail}`;
    return `The library is ${word}. ${detail}`;
  }

  protected stepButtonId(quest: QuestView, step: QuestStepView): string {
    return `quest-step-${quest.id}-${step.id}`;
  }

  protected choose(quest: QuestView, step: QuestStepView): void {
    const current = this.journal();
    const offer = this.offer(quest, step);
    if (!current || this.busy() || this.confirmation() || (offer !== 'record' && offer !== 'sample')) return;
    const actionId = offer === 'sample' ? step.sample_action_id : step.action_id;
    if (!actionId) return;
    this.error.set('');
    this.notice.set('');
    this.confirmation.set({
      questId: quest.id,
      stepId: step.id,
      actionId,
      expectedRevision: current.revision,
      label: step.label,
      sample: offer === 'sample',
    });
    this.focus('#quest-confirmation');
  }

  protected cancel(): void {
    if (this.busy()) return;
    const choice = this.confirmation();
    this.confirmation.set(null);
    this.error.set('');
    if (choice) this.focus(`#quest-step-${choice.questId}-${choice.stepId}`);
  }

  protected confirm(): void {
    const choice = this.confirmation();
    if (!choice || this.busy() || this.owner === null) return;
    const generation = this.generation;
    this.busy.set(true);
    this.api.recordQuestStep({
      quest_id: choice.questId,
      step_id: choice.stepId,
      action_id: choice.actionId,
      expected_revision: choice.expectedRevision,
    }).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: journal => {
        if (generation !== this.generation) return;
        const notice = this.rewardNotice(this.journal(), journal);
        this.busy.set(false);
        this.journal.set(journal);
        this.confirmation.set(null);
        this.error.set('');
        this.notice.set(notice);
        this.focus('#quest-notice');
      },
      error: (failure: unknown) => {
        if (generation !== this.generation) return;
        this.busy.set(false);
        const status = failureStatus(failure);
        const code = failureCode(failure);
        if (status === 409 || code === 'quest_conflict' || code === 'quest_action' || code === 'quest_step') {
          this.confirmation.set(null);
          this.error.set('This quest changed. The current steps are shown.');
          this.load();
          this.focus('#quest-error');
          return;
        }
        this.error.set('The quest did not save. Try this step again.');
        this.focus('#quest-error');
      },
    });
  }

  protected load(): void {
    if (this.owner === null || this.loading() || this.busy()) return;
    const generation = ++this.generation;
    this.loading.set(true);
    this.loadError.set(false);
    this.readSources(generation);
    this.api.getQuests().pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: journal => {
        if (generation !== this.generation) return;
        this.journal.set(journal);
        this.loading.set(false);
      },
      error: () => {
        if (generation !== this.generation) return;
        this.journal.set(null);
        this.loadError.set(true);
        this.loading.set(false);
        this.focus('#quest-load-error');
      },
    });
  }

  private rewardNotice(before: QuestJournal | null, journal: QuestJournal): string {
    const finished = journal.quests.find(quest => {
      const prior = before?.quests.find(item => item.id === quest.id);
      return quest.keepsake.kept && prior?.keepsake.kept !== true;
    });
    if (!finished) return 'Recorded once.';
    return `Recorded once. ${finished.keepsake.name}. ${finished.reward_stamps} Stamps, once.`;
  }

  private sourceState(source: SourceKind): SourceState {
    const part = source === 'library' ? this.library() : source === 'travel' ? this.travel() : this.memory();
    return combineSource([part]);
  }

  private readSources(generation: number): void {
    this.library.set('loading');
    this.travel.set('loading');
    this.memory.set('loading');
    this.watchSource('library', '/media/api/summary', generation);
    this.watchSource('travel', '/travel/api/memories', generation);
    this.watchSource('memory', '/api/world/concepts', generation);
  }

  private watchSource(kind: SourceKind, url: string, generation: number): void {
    this.http.get(url, {
      params: { tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
      context: silentErrorToast(),
    }).pipe(timeout(HUB_SUMMARY_DEADLINE_MS), takeUntilDestroyed(this.destroy)).subscribe({
      next: body => this.publishSource(kind, generation, 200, body),
      error: (failure: unknown) => this.publishSource(kind, generation, failureStatus(failure), null),
    });
  }

  private publishSource(kind: SourceKind, generation: number, status: number, body: unknown): void {
    if (generation !== this.generation) return;
    const state = combineSource([classifySource(kind, { status, body })]);
    if (kind === 'library') this.library.set(state);
    else if (kind === 'travel') this.travel.set(state);
    else this.memory.set(state);
  }

  private invalidate(): void {
    this.generation += 1;
    this.journal.set(null);
    this.loading.set(false);
    this.busy.set(false);
    this.loadError.set(false);
    this.confirmation.set(null);
    this.notice.set('');
    this.error.set('');
    this.library.set('loading');
    this.travel.set('loading');
    this.memory.set('loading');
  }

  private focus(selector: string): void {
    const generation = this.generation;
    afterNextRender(() => {
      if (generation !== this.generation || this.destroy.destroyed) return;
      this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus();
    }, { injector: this.injector });
  }
}

function failureStatus(failure: unknown): number {
  if (typeof failure === 'object' && failure && 'status' in failure && typeof failure.status === 'number') {
    return failure.status;
  }
  return 0;
}

function failureCode(failure: unknown): string {
  if (typeof failure !== 'object' || !failure || !('error' in failure)) return '';
  const body = failure.error;
  if (typeof body === 'object' && body && 'code' in body && typeof body.code === 'string') return body.code;
  return '';
}
