import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { UiButtonComponent } from '../ui-button/ui-button.component';
import { UiEmptyStateComponent } from '../ui-empty-state/ui-empty-state.component';
import { UiIconComponent, type UiIconName } from '../ui-icon/ui-icon.component';
import { UiSkeletonComponent } from '../ui-skeleton/ui-skeleton.component';
import type { HubCardState } from '../hub-card-state';

@Component({
  selector: 'ui-state',
  standalone: true,
  imports: [UiButtonComponent, UiEmptyStateComponent, UiIconComponent, UiSkeletonComponent],
  templateUrl: './ui-state.component.html',
  styleUrl: './ui-state.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiStateComponent {
  state = input.required<HubCardState>();
  /** Noun in the load and session sentences, such as "trips". */
  thing = input.required<string>();
  /** Object in the locked sentence. Defaults to `thing`. */
  detail = input<string | undefined>(undefined);
  emptyTitle = input('Nothing here yet');
  emptyMessage = input('');
  emptyAction = input<string | undefined>(undefined);
  emptyLink = input<string | undefined>(undefined);
  emptyIcon = input<UiIconName | undefined>(undefined);
  pending = input(false);
  /** Epoch ms of the snapshot shown in the stale state. */
  updatedAt = input<number | null>(null);
  /** Path restored after sign-in or unlock. */
  next = input('/hub');

  retry = output<void>();

  protected readonly showSkeleton = signal(false);
  private readonly failures = signal(0);
  private readonly failedAt = signal<number | null>(null);

  constructor() {
    effect(onCleanup => {
      if (this.state() !== 'loading') {
        this.showSkeleton.set(false);
        return;
      }
      const timer = setTimeout(() => this.showSkeleton.set(true), 150);
      onCleanup(() => clearTimeout(timer));
    });
    effect(() => {
      const state = this.state();
      if (state === 'ready' || state === 'empty' || state === 'locked') this.failures.set(0);
    });
  }

  protected unavailableCopy(): string {
    const at = this.failedAt();
    if (this.failures() > 0 && at != null) {
      const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(at);
      return `Still can't load · ${time}`;
    }
    return `Couldn't load ${this.thing()}.`;
  }

  protected expiredCopy(): string {
    return `Your session ended. Sign in again to see ${this.thing()}.`;
  }

  protected lockedCopy(): string {
    return `Finance is locked. Unlock to see ${this.detail() || this.thing()}.`;
  }

  protected relative(): string {
    const at = this.updatedAt();
    if (at == null) return 'earlier';
    const minutes = Math.round((Date.now() - at) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    const days = Math.round(hours / 24);
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }

  protected signInParams(): Record<string, string> {
    return { next: this.next() };
  }

  protected onRetry(): void {
    this.failures.update(count => count + 1);
    this.failedAt.set(Date.now());
    this.retry.emit();
  }
}
