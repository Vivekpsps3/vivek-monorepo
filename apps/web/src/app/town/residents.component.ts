import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { bindLockNotices, bindLockSnapshots } from '../../../../finance/frontend/src/public-api';
import { SessionService } from '../platform/session.service';
import {
  TREASURY_PUBLIC_OBJECT,
  adaMention,
  chapterVisit,
  dialogueRankEffect,
  dialogueVaultOpen,
  imaniMention,
  junMention,
  sceneFor,
  solMention,
  wrenMention,
  type MentionedObject,
} from './resident-scenes';
import {
  TownApiService,
  type DialogueConversation,
  type DialogueDirectory,
  type DialogueResident,
} from './town.api';

interface TalkChoice {
  readonly residentId: string;
  readonly conversationId: string;
  readonly expectedRevision: number;
  readonly title: string;
  readonly name: string;
  readonly completed: boolean;
  readonly stamps: number;
}

@Component({
  selector: 'app-town-residents',
  imports: [RouterLink],
  templateUrl: './residents.component.html',
  styleUrl: './residents.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResidentsComponent {
  private readonly api = inject(TownApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private owner: number | null = null;
  private generation = 0;

  protected readonly directory = signal<DialogueDirectory | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly loadError = signal(false);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly confirmation = signal<TalkChoice | null>(null);
  protected readonly note = signal('');
  protected readonly selectedChoiceId = signal('');
  protected readonly activeScene = computed(() => {
    const choice = this.confirmation();
    if (!choice) return null;
    return sceneFor(choice.residentId, choice.conversationId);
  });
  protected readonly selected = computed(() => {
    const id = this.selectedId();
    const directory = this.directory();
    if (!id || !directory) return null;
    return directory.residents.find(resident => resident.id === id) ?? null;
  });

  constructor() {
    this.selectedId.set(this.residentId(this.route.snapshot.queryParamMap.get('resident')));
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.selectedId.set(this.residentId(params.get('resident')));
    });
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

  protected talk(resident: DialogueResident, conversation: DialogueConversation): void {
    const current = this.directory();
    if (!current || this.busy() || this.confirmation()) return;
    this.error.set('');
    this.notice.set('');
    this.selectedChoiceId.set('');
    this.confirmation.set({
      residentId: resident.id,
      conversationId: conversation.id,
      expectedRevision: current.revision,
      title: conversation.title,
      name: resident.name,
      completed: conversation.completed,
      stamps: conversation.stamps,
    });
    this.focus('#dialogue-confirmation');
  }

  protected opening(resident: DialogueResident, conversation: DialogueConversation): string {
    return sceneFor(resident.id, conversation.id)?.paragraphs[0] ?? conversation.line;
  }

  protected rankEffect(): string {
    const choice = this.confirmation();
    if (!choice) return '';
    return dialogueRankEffect(choice.completed, choice.conversationId, choice.stamps);
  }

  protected chapterLine(): string {
    const choice = this.confirmation();
    if (!choice || choice.conversationId !== 'reflection') return '';
    if (choice.residentId !== 'wren' && choice.residentId !== 'sol') return '';
    return chapterVisit(choice.completed);
  }

  protected mention(): MentionedObject | null {
    const choice = this.confirmation();
    if (!choice) return null;
    if (choice.residentId === 'ada') {
      const open = dialogueVaultOpen(this.owner);
      return adaMention({
        locked: !open,
        publicLabel: open ? TREASURY_PUBLIC_OBJECT : null,
        account: null,
        spending: null,
        goal: null,
      });
    }
    if (choice.residentId === 'imani') {
      // This talk does not read Travel, so the board stays the labeled sample.
      return imaniMention({ empty: true, tripTitle: null, destination: null, taken: null });
    }
    if (choice.residentId === 'jun') {
      // Vault presence only. Workouts and badges stay in Health.
      return junMention({
        locked: !dialogueVaultOpen(this.owner),
        workout: null,
        badge: null,
        measurement: null,
      });
    }
    if (choice.residentId === 'wren') {
      // This talk does not read a review, a concept note, an album, or a score.
      return wrenMention({ locked: !dialogueVaultOpen(this.owner), review: null, conceptNote: null });
    }
    if (choice.residentId === 'sol') {
      // This talk does not read a review or a concept note.
      return solMention({ locked: !dialogueVaultOpen(this.owner), review: null, conceptNote: null });
    }
    return null;
  }

  protected choose(id: string): void {
    const scene = this.activeScene();
    if (!scene || this.busy() || !scene.choices.some(choice => choice.id === id)) return;
    this.selectedChoiceId.set(id);
  }

  protected selectedReply(): string {
    const scene = this.activeScene();
    const id = this.selectedChoiceId();
    return scene?.choices.find(choice => choice.id === id)?.reply ?? '';
  }

  protected remember(event: Event): void {
    const target = event.target;
    this.note.set(target instanceof HTMLTextAreaElement ? target.value : '');
  }

  protected cancel(): void {
    if (this.busy()) return;
    const choice = this.confirmation();
    this.clearDraft();
    this.error.set('');
    if (choice) this.focus(`#talk-${choice.residentId}-${choice.conversationId}`);
  }

  protected confirm(): void {
    const choice = this.confirmation();
    if (!choice || this.busy() || this.owner === null) return;
    if (this.activeScene() && !this.selectedChoiceId()) return;
    const generation = this.generation;
    const completed = choice.completed;
    this.busy.set(true);
    this.api.completeConversation({
      resident_id: choice.residentId,
      conversation_id: choice.conversationId,
      expected_revision: choice.expectedRevision,
    }).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: directory => {
        if (generation !== this.generation) return;
        this.busy.set(false);
        this.directory.set(directory);
        this.clearDraft();
        this.error.set('');
        const resident = directory.residents.find(item => item.id === choice.residentId);
        const rank = resident?.rank ?? 0;
        if (completed) this.notice.set(`Rank stays at ${rank}.`);
        else if (choice.conversationId === 'welcome') this.notice.set(`Rank is ${rank}. Welcome gave 2 Stamps once.`);
        else this.notice.set(`Rank is ${rank}. No extra Stamps.`);
        this.focus('#dialogue-notice');
      },
      error: (failure: unknown) => {
        if (generation !== this.generation) return;
        this.busy.set(false);
        const status = failureStatus(failure);
        const code = failureCode(failure);
        if (status === 409 || code === 'dialogue_conflict') {
          this.clearDraft();
          this.error.set('This conversation changed. The current ranks are shown.');
          this.load();
          this.focus('#dialogue-error');
          return;
        }
        this.error.set('The conversation did not save. Try it again.');
        this.focus('#dialogue-error');
      },
    });
  }

  protected closeResident(): void {
    const id = this.selectedId();
    void this.router.navigate(['/town/residents']);
    if (id) this.focus(`#inspect-${id}`);
  }

  protected load(): void {
    if (this.owner === null || this.loading() || this.busy()) return;
    const generation = ++this.generation;
    this.loading.set(true);
    this.loadError.set(false);
    this.api.getResidents().pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: directory => {
        if (generation !== this.generation) return;
        this.directory.set(directory);
        this.loading.set(false);
      },
      error: () => {
        if (generation !== this.generation) return;
        this.directory.set(null);
        this.clearDraft();
        this.loadError.set(true);
        this.loading.set(false);
        this.focus('#resident-load-error');
      },
    });
  }

  private residentId(value: string | null): string | null {
    return value && /^[a-z][a-z-]{0,39}$/.test(value) ? value : null;
  }

  private invalidate(): void {
    this.generation += 1;
    this.directory.set(null);
    this.loading.set(false);
    this.busy.set(false);
    this.loadError.set(false);
    this.clearDraft();
    this.notice.set('');
    this.error.set('');
  }

  private clearDraft(): void {
    this.confirmation.set(null);
    this.note.set('');
    this.selectedChoiceId.set('');
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
