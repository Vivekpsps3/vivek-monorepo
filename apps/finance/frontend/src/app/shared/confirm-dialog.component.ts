import { AfterViewChecked, ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy, ViewChild, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ConfirmService } from '../services/confirm.service';
import { UiButtonComponent, UiCardComponent } from './ui';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [UiButtonComponent, UiCardComponent],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent implements AfterViewChecked, OnDestroy {
  private readonly confirmService = inject(ConfirmService);
  private lastFocused: HTMLElement | null = null;
  private focusedDialog = false;
  private lockedScroll: HTMLElement | null = null;
  private previousOverflow = '';
  private viewportCleanups: Array<() => void> = [];
  @ViewChild('dialogPanel') private dialogPanel?: ElementRef<HTMLElement>;
  readonly state = toSignal(this.confirmService.state$, { initialValue: null });

  ngAfterViewChecked(): void {
    if (this.state() && !this.focusedDialog) {
      this.lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.focusedDialog = true;
      this.lockBackgroundScroll();
      this.bindVisualViewport();
      queueMicrotask(() => {
        this.applyVisualViewport();
        this.dialogPanel?.nativeElement.querySelector<HTMLElement>('button')?.focus();
      });
    }
    if (!this.state() && this.focusedDialog) {
      this.focusedDialog = false;
      this.unlockBackgroundScroll();
    }
  }

  ngOnDestroy(): void {
    this.unlockBackgroundScroll();
    this.restoreFocus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.state()) this.close(false);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(this.dialogPanel?.nativeElement.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []);
    if (focusable.length === 0) return;
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && currentIndex <= 0) {
      event.preventDefault();
      focusable.at(-1)?.focus();
    } else if (!event.shiftKey && currentIndex === focusable.length - 1) {
      event.preventDefault();
      focusable[0].focus();
    }
  }

  close(confirmed: boolean): void {
    this.confirmService.close(confirmed);
    this.restoreFocus();
  }

  private lockBackgroundScroll(): void {
    const main = document.querySelector('.main-content');
    const target = main instanceof HTMLElement ? main : document.body;
    this.lockedScroll = target;
    this.previousOverflow = target.style.overflow;
    target.style.overflow = 'hidden';
  }

  private unlockBackgroundScroll(): void {
    this.unbindVisualViewport();
    const backdrop = this.dialogPanel?.nativeElement.parentElement;
    backdrop?.style.removeProperty('--ui-dialog-vv-top');
    backdrop?.style.removeProperty('--ui-dialog-vv-height');
    if (!this.lockedScroll) return;
    this.lockedScroll.style.overflow = this.previousOverflow;
    this.lockedScroll = null;
  }

  private bindVisualViewport(): void {
    this.unbindVisualViewport();
    const onChange = () => this.applyVisualViewport();
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', onChange);
      vv.addEventListener('scroll', onChange);
      this.viewportCleanups.push(() => {
        vv.removeEventListener('resize', onChange);
        vv.removeEventListener('scroll', onChange);
      });
    }
    window.addEventListener('resize', onChange);
    this.viewportCleanups.push(() => window.removeEventListener('resize', onChange));
    onChange();
  }

  private unbindVisualViewport(): void {
    for (const cleanup of this.viewportCleanups) cleanup();
    this.viewportCleanups = [];
  }

  private applyVisualViewport(): void {
    const backdrop = this.dialogPanel?.nativeElement.parentElement;
    if (!(backdrop instanceof HTMLElement)) return;
    const narrow = window.matchMedia?.('(max-width: 768px)')?.matches ?? false;
    const vv = window.visualViewport;
    if (!narrow || !vv || vv.height <= 0) {
      backdrop.style.removeProperty('--ui-dialog-vv-top');
      backdrop.style.removeProperty('--ui-dialog-vv-height');
      return;
    }
    backdrop.style.setProperty('--ui-dialog-vv-top', `${vv.offsetTop}px`);
    backdrop.style.setProperty('--ui-dialog-vv-height', `${vv.height}px`);
  }

  private restoreFocus(): void {
    this.lastFocused?.focus();
    this.lastFocused = null;
  }
}
