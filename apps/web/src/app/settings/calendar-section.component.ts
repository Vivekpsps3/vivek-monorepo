import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, OnInit, ViewChild, afterNextRender, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfirmService, UiButtonComponent, UiCardComponent, silentErrorToast } from '@vivek/ui';
import { SessionService } from '../platform/session.service';

interface Feed { id: number; scope: 'travel' | 'media'; timezone: string; }
interface RevealedFeed extends Feed { url: string; }

@Component({
  selector: 'app-calendar-section',
  standalone: true,
  imports: [FormsModule, UiButtonComponent, UiCardComponent],
  templateUrl: './calendar-section.component.html',
  styleUrl: './calendar-section.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarSectionComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly injector = inject(Injector);
  private readonly session = inject(SessionService);
  private readonly destroy = inject(DestroyRef);
  private readonly confirm = inject(ConfirmService);
  readonly feeds = signal<Feed[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly revealed = signal<RevealedFeed | null>(null);
  scope: Feed['scope'] = 'travel';
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  private generation = 0;
  @ViewChild('scopeField') private scopeField?: ElementRef<HTMLSelectElement>;
  @ViewChild('urlField') private urlField?: ElementRef<HTMLInputElement>;
  @ViewChild('errorText') private errorText?: ElementRef<HTMLElement>;

  ngOnInit(): void {
    this.destroy.onDestroy(() => this.clear());
    this.session.user$.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => { this.clear(); void this.load(); });
    this.session.cleared$.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => this.clear());
  }

  private clear(): void {
    this.generation++;
    this.revealed.set(null);
    this.feeds.set([]);
    this.error.set('');
    this.notice.set('');
    this.busy.set(false);
  }

  private current(generation: number, owner: number | undefined): boolean {
    return !this.destroy.destroyed && this.generation === generation && !!owner && this.session.currentUser?.id === owner;
  }

  async load(): Promise<void> {
    await this.perform(async () => {
      const rows = await firstValueFrom(this.http.get<Feed[]>('/api/account/calendar-feeds', {context: silentErrorToast()}).pipe(timeout(8000), takeUntilDestroyed(this.destroy)));
      return () => this.feeds.set(rows);
    });
  }

  hasScope(): boolean { return this.feeds().some(feed => feed.scope === this.scope); }

  async create(): Promise<void> {
    const scope = this.scope;
    const timezone = this.timezone;
    await this.perform(async () => {
      const row = await firstValueFrom(this.http.post<RevealedFeed>('/api/account/calendar-feeds', {scope, timezone}, {context: silentErrorToast()}).pipe(timeout(8000), takeUntilDestroyed(this.destroy)));
      return () => { this.feeds.update(rows => [...rows, {id: row.id, scope: row.scope, timezone: row.timezone}]); this.show(row); };
    });
  }

  async rotate(feed: Feed): Promise<void> {
    const owner = this.session.currentUser?.id;
    const generation = this.generation;
    const accepted = await this.confirm.ask('Rotate calendar URL?', 'The previous URL will stop working. Update your calendar app with the new URL.', 'Rotate URL');
    if (!accepted || !this.current(generation, owner)) return;
    await this.perform(async () => {
      const row = await firstValueFrom(this.http.post<RevealedFeed>(`/api/account/calendar-feeds/${feed.id}/rotate`, {}, {context: silentErrorToast()}).pipe(timeout(8000), takeUntilDestroyed(this.destroy)));
      return () => this.show(row);
    });
  }

  async revoke(feed: Feed): Promise<void> {
    const owner = this.session.currentUser?.id;
    const generation = this.generation;
    const accepted = await this.confirm.ask('Revoke calendar URL?', 'This URL will stop updating. Your calendar app may keep events it already downloaded.', 'Revoke URL');
    if (!accepted || !this.current(generation, owner)) return;
    await this.perform(async () => {
      await firstValueFrom(this.http.delete(`/api/account/calendar-feeds/${feed.id}`, {context: silentErrorToast()}).pipe(timeout(8000), takeUntilDestroyed(this.destroy)));
      return () => { this.feeds.update(rows => rows.filter(row => row.id !== feed.id)); this.revealed.set(null); this.notice.set('Calendar URL revoked.'); this.focusScope(); };
    });
  }

  private show(row: RevealedFeed): void {
    // Keep the one-time URL out of the permanent list and browser storage.
    this.revealed.set(row);
    this.notice.set('Copy this URL now. After hiding it, rotate to get a new one.');
    afterNextRender(() => { if (!this.destroy.destroyed && this.revealed() === row) this.urlField?.nativeElement.focus(); }, {injector: this.injector});
  }

  hide(): void {
    this.revealed.set(null);
    this.notice.set('URL hidden. Rotate to get a new URL.');
    this.focusScope();
  }

  private focusScope(): void {
    const generation = this.generation;
    // NgModel applies its disabled state in a microtask after the render.
    afterNextRender(() => queueMicrotask(() => {
      if (!this.destroy.destroyed && generation === this.generation) this.scopeField?.nativeElement.focus();
    }), {injector: this.injector});
  }

  async copy(): Promise<void> {
    const row = this.revealed();
    if (!row) return;
    const generation = this.generation;
    try {
      await navigator.clipboard.writeText(row.url);
      if (this.generation === generation) this.notice.set('Calendar URL copied.');
    } catch {
      if (this.generation === generation) { this.notice.set('Select and copy the URL from the field.'); this.urlField?.nativeElement.select(); }
    }
  }

  private async perform(operation: () => Promise<() => void>): Promise<void> {
    if (this.busy() || !this.session.currentUser) return;
    const owner = this.session.currentUser.id;
    const generation = ++this.generation;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.revealed.set(null);
    try {
      const publish = await operation();
      if (this.current(generation, owner)) publish();
    } catch (error) {
      if (this.current(generation, owner)) {
        const message = error instanceof HttpErrorResponse && error.status === 422
          ? (error.error?.detail === 'Calendar subscriptions require a configured HTTPS origin.'
            ? 'Open this workspace through its configured HTTPS address to create or rotate a calendar URL.'
            : 'Choose a calendar and enter a valid IANA timezone, such as America/Los_Angeles.')
          : 'Could not update calendar subscriptions. Your selection is kept. Retry, or reload the list if another browser changed it.';
        this.error.set(message);
        afterNextRender(() => { if (this.current(generation, owner)) this.errorText?.nativeElement.focus(); }, {injector: this.injector});
      }
    } finally {
      if (this.current(generation, owner)) this.busy.set(false);
    }
  }
}
