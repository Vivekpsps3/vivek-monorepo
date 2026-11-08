import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
import { ConfirmService, UiButtonComponent, UiConfirmDialogComponent, UiDialogComponent } from '@vivek/ui';
import { WorldApi } from '../data/world-api';
import { WORLD_COPY, type ConceptDraft, type ConceptFieldErrors, type ConceptRecord } from '../world.types';

export interface ConceptChange {
  kind: 'text' | 'archive' | 'weeks';
  id?: number;
  name?: string;
  weeks?: readonly string[];
}

type ConceptTab = 'notyet' | 'understood' | 'archived';

interface ConceptProblem {
  status: number;
  message: string;
  fieldErrors: ConceptFieldErrors;
}

function asConcepts(value: unknown): ConceptRecord[] {
  if (Array.isArray(value)) return value as ConceptRecord[];
  if (value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)) {
    return (value as { items: ConceptRecord[] }).items;
  }
  return [];
}

function hasControl(value: string): boolean {
  return [...value].some(char => {
    const code = char.charCodeAt(0);
    return code <= 31 || (code >= 127 && code <= 159);
  });
}

function problemOf(error: unknown): ConceptProblem {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { message?: string; detail?: string; fieldErrors?: ConceptFieldErrors } | null;
    const detail = typeof body?.detail === 'string' ? body.detail : '';
    return { status: error.status, message: body?.message || detail || error.message, fieldErrors: body?.fieldErrors ?? {} };
  }
  if (error && typeof error === 'object') {
    const record = error as { status?: number; message?: string; fieldErrors?: ConceptFieldErrors };
    return {
      status: record.status ?? 0,
      message: record.message || 'Something went wrong.',
      fieldErrors: record.fieldErrors ?? {},
    };
  }
  return { status: 0, message: 'Something went wrong.', fieldErrors: {} };
}

@Component({
  selector: 'app-concept-sheet',
  imports: [UiButtonComponent, UiDialogComponent, UiConfirmDialogComponent],
  templateUrl: './concept-sheet.component.html',
  styleUrl: './concept-sheet.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConceptSheetComponent {
  private readonly api = inject(WorldApi);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  readonly open = input(false);
  readonly today = input('');
  readonly focusId = input<number | null>(null);
  readonly creating = input(false);
  readonly closed = output<void>();
  readonly changed = output<ConceptChange>();

  readonly copy = WORLD_COPY;
  readonly tab = signal<ConceptTab>('notyet');
  readonly concepts = signal<ConceptRecord[]>([]);
  readonly showForm = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly draft = signal<ConceptDraft>({ name: '', note: '', source: '', understood_on: '' });
  readonly formError = signal('');
  readonly listError = signal('');
  readonly fieldErrors = signal<ConceptFieldErrors>({});
  readonly notice = signal('');
  readonly panelClass = signal('world-concept-bottom');
  readonly busy = signal(false);

  private requests = new AbortController();
  private loadId = 0;

  constructor() {
    const query = typeof matchMedia === 'function' ? matchMedia('(min-width: 768px)') : null;
    const apply = () => this.panelClass.set(query?.matches ? 'world-concept-side' : 'world-concept-bottom');
    apply();
    query?.addEventListener?.('change', apply);
    this.router.events.pipe(
      filter(event => event instanceof NavigationStart),
      takeUntilDestroyed(),
    ).subscribe(() => this.abortRequests());
    this.destroyRef.onDestroy(() => {
      query?.removeEventListener?.('change', apply);
      this.requests.abort();
    });
    effect(() => {
      if (!this.open()) return;
      void this.reload();
    });
  }

  visibleConcepts(): ConceptRecord[] {
    const tab = this.tab();
    return this.concepts().filter(concept => {
      if (tab === 'archived') return concept.archived;
      if (concept.archived) return false;
      return tab === 'understood' ? concept.understood_on != null : concept.understood_on == null;
    });
  }

  close(): void {
    this.showForm.set(false);
    this.closed.emit();
  }

  startCreate(): void {
    this.editingId.set(null);
    this.draft.set({ name: '', note: '', source: '', understood_on: '' });
    this.formError.set('');
    this.fieldErrors.set({});
    this.showForm.set(true);
    this.focusName();
  }

  edit(concept: ConceptRecord): void {
    this.editingId.set(concept.id);
    this.draft.set({
      name: concept.name,
      note: concept.note ?? '',
      source: concept.source ?? '',
      understood_on: concept.understood_on ?? '',
    });
    this.formError.set('');
    this.fieldErrors.set({});
    this.showForm.set(true);
    this.focusName();
  }

  onDraft(field: keyof ConceptDraft, event: Event): void {
    const value = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
      ? event.target.value
      : '';
    this.draft.update(draft => ({ ...draft, [field]: value }));
  }

  async save(event?: Event): Promise<void> {
    event?.preventDefault();
    if (this.busy()) return;
    const draft = this.draft();
    const name = draft.name.trim();
    const bounds = this.boundErrors(draft, name);
    if (Object.keys(bounds).length) {
      this.fieldErrors.set(bounds);
      this.focusName();
      return;
    }
    this.fieldErrors.set({});
    this.formError.set('');
    this.busy.set(true);
    const body = {
      name,
      note: draft.note.trim() || null,
      source: draft.source.trim() || null,
      understood_on: draft.understood_on || null,
      tz: this.api.timezone(),
    };
    const editing = this.editingId();
    const previous = editing == null ? null : this.concepts().find(concept => concept.id === editing) ?? null;
    const signal = this.requests.signal;
    try {
      const saved = editing == null
        ? await this.api.createConcept(body, signal)
        : await this.api.patchConcept(editing, body, signal);
      if (signal.aborted) return;
      const record = saved ?? null;
      if (record) this.replace(record);
      const weeks: string[] = [];
      if ((previous?.understood_on ?? '') !== (body.understood_on ?? '')) {
        if (previous?.understood_on) weeks.push(previous.understood_on);
        if (body.understood_on) weeks.push(body.understood_on);
      }
      const id = record?.id ?? editing ?? undefined;
      this.changed.emit(weeks.length ? { kind: 'weeks', id, name, weeks } : { kind: 'text', id, name });
      if (editing == null) this.draft.set({ name: '', note: '', source: '', understood_on: '' });
      this.showForm.set(false);
    } catch (error) {
      if (signal.aborted) return;
      const problem = problemOf(error);
      this.formError.set(problem.message);
      this.fieldErrors.set(problem.fieldErrors);
      this.focusName();
    } finally {
      this.busy.set(false);
    }
  }

  async copySource(source: string | null): Promise<void> {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard');
      await navigator.clipboard.writeText(source ?? '');
      this.notice.set(WORLD_COPY.copied);
    } catch {
      this.notice.set(WORLD_COPY.copyFailed);
    }
  }

  async markUnderstood(concept: ConceptRecord): Promise<void> {
    const today = this.today();
    if (!today || this.busy()) return;
    const previous = concept.understood_on;
    this.replace({ ...concept, understood_on: today });
    this.tab.set('understood');
    const signal = this.requests.signal;
    try {
      const saved = await this.api.patchConcept(concept.id, { understood_on: today, tz: this.api.timezone() }, signal);
      if (signal.aborted) return;
      if (saved) this.replace(saved);
      this.changed.emit({ kind: 'weeks', id: concept.id, name: concept.name, weeks: [previous ?? '', today].filter(Boolean) });
    } catch (error) {
      if (signal.aborted) return;
      this.replace({ ...concept, understood_on: previous });
      this.tab.set(previous ? 'understood' : 'notyet');
      this.formError.set(problemOf(error).message);
    }
  }

  async undo(concept: ConceptRecord): Promise<void> {
    const previous = concept.understood_on;
    this.replace({ ...concept, understood_on: null });
    const signal = this.requests.signal;
    try {
      const saved = await this.api.patchConcept(concept.id, { understood_on: null, tz: this.api.timezone() }, signal);
      if (signal.aborted) return;
      if (saved) this.replace(saved);
      this.changed.emit({ kind: 'weeks', id: concept.id, weeks: [previous ?? ''].filter(Boolean) });
    } catch (error) {
      if (signal.aborted) return;
      this.replace({ ...concept, understood_on: previous });
      this.formError.set(problemOf(error).message);
    }
  }

  async changeDate(concept: ConceptRecord, event: Event): Promise<void> {
    const value = event.target instanceof HTMLInputElement ? event.target.value : '';
    if (!value) return;
    if (value < '2000-01-01' || (this.today() && value > this.today())) {
      this.formError.set(WORLD_COPY.dateBounds);
      return;
    }
    const previous = concept.understood_on;
    this.replace({ ...concept, understood_on: value });
    const signal = this.requests.signal;
    try {
      const saved = await this.api.patchConcept(concept.id, { understood_on: value, tz: this.api.timezone() }, signal);
      if (signal.aborted) return;
      if (saved) this.replace(saved);
      this.changed.emit({ kind: 'weeks', id: concept.id, weeks: [previous ?? '', value].filter(Boolean) });
    } catch (error) {
      if (signal.aborted) return;
      this.replace({ ...concept, understood_on: previous });
      this.formError.set(problemOf(error).message);
    }
  }

  async archive(concept: ConceptRecord, archived: boolean): Promise<void> {
    this.replace({ ...concept, archived });
    const signal = this.requests.signal;
    try {
      const saved = await this.api.patchConcept(concept.id, { archived, tz: this.api.timezone() }, signal);
      if (signal.aborted) return;
      if (saved) this.replace(saved);
      this.changed.emit({ kind: 'archive', id: concept.id });
    } catch (error) {
      if (signal.aborted) return;
      this.replace(concept);
      this.formError.set(problemOf(error).message);
    }
  }

  async remove(concept: ConceptRecord): Promise<void> {
    const confirmed = await this.confirm.ask(WORLD_COPY.deleteTitle, WORLD_COPY.deleteMessage, WORLD_COPY.deleteConfirm);
    if (!confirmed || this.requests.signal.aborted) return;
    const signal = this.requests.signal;
    try {
      await this.api.deleteConcept(concept.id, signal);
      if (signal.aborted) return;
      this.concepts.update(list => list.filter(item => item.id !== concept.id));
      this.changed.emit({
        kind: 'weeks',
        id: concept.id,
        weeks: concept.understood_on ? [concept.understood_on] : [],
      });
    } catch (error) {
      if (signal.aborted) return;
      this.formError.set(problemOf(error).message);
    }
  }

  private async reload(): Promise<void> {
    const id = ++this.loadId;
    const signal = this.requests.signal;
    this.listError.set('');
    try {
      const [active, archived] = await Promise.all([
        this.api.listConcepts(false, signal),
        this.api.listConcepts(true, signal),
      ]);
      if (id !== this.loadId || signal.aborted) return;
      const byId = new Map<number, ConceptRecord>();
      for (const concept of [...asConcepts(active), ...asConcepts(archived)]) byId.set(concept.id, concept);
      this.concepts.set([...byId.values()]);
      const focus = this.focusId();
      if (focus != null) this.reveal(focus);
    } catch (error) {
      if (id !== this.loadId || signal.aborted) return;
      this.listError.set(problemOf(error).message);
    }
  }

  private reveal(id: number): void {
    const concept = this.concepts().find(item => item.id === id);
    if (!concept) return;
    this.tab.set(concept.archived ? 'archived' : concept.understood_on ? 'understood' : 'notyet');
    queueMicrotask(() => document.getElementById(`concept-${id}`)?.focus());
  }

  private replace(concept: ConceptRecord): void {
    this.concepts.update(list => {
      const index = list.findIndex(item => item.id === concept.id);
      if (index < 0) return [...list, concept];
      const next = list.slice();
      next[index] = concept;
      return next;
    });
  }

  private boundErrors(draft: ConceptDraft, name: string): ConceptFieldErrors {
    const errors: ConceptFieldErrors = {};
    if (name.length < 1 || name.length > 80 || hasControl(name)) errors.name = WORLD_COPY.nameBounds;
    if (draft.note.length > 2000) errors.note = WORLD_COPY.noteBounds;
    if (draft.source.length > 500 || draft.source.includes('\n') || draft.source.includes('\r')) {
      errors.source = WORLD_COPY.sourceBounds;
    }
    const day = draft.understood_on;
    const today = this.today();
    if (day && (day < '2000-01-01' || (today && day > today))) errors.understood_on = WORLD_COPY.dateBounds;
    return errors;
  }

  private focusName(): void {
    queueMicrotask(() => this.nameInput()?.nativeElement.focus());
  }

  private abortRequests(): void {
    this.requests.abort();
    this.requests = new AbortController();
  }
}
