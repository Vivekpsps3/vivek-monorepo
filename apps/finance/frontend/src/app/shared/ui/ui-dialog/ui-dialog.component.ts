import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  input,
  output,
} from '@angular/core';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

@Component({
  selector: 'ui-dialog',
  standalone: true,
  templateUrl: './ui-dialog.component.html',
  styleUrl: './ui-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiDialogComponent implements AfterViewChecked, OnDestroy {
  open = input(false);
  labelledBy = input<string | undefined>(undefined);
  describedBy = input<string | undefined>(undefined);
  panelClass = input('');
  closeOnBackdrop = input(true);
  closed = output<void>();

  @ViewChild('panel') private panel?: ElementRef<HTMLElement>;
  private lastFocused: HTMLElement | null = null;
  private focusedOpen = false;
  private lockedScroll: HTMLElement | null = null;
  private previousOverflow = '';

  ngAfterViewChecked(): void {
    if (this.open() && !this.focusedOpen) {
      this.lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.focusedOpen = true;
      this.lockBackgroundScroll();
      queueMicrotask(() => {
        const root = this.panel?.nativeElement;
        if (!root) return;
        const preferred =
          root.querySelector<HTMLElement>('[data-dialog-initial-focus]') ||
          root.querySelector<HTMLElement>(FOCUSABLE);
        preferred?.focus();
      });
    }
    if (!this.open() && this.focusedOpen) {
      this.focusedOpen = false;
      this.unlockBackgroundScroll();
      this.restoreFocus();
    }
  }

  ngOnDestroy(): void {
    this.unlockBackgroundScroll();
    this.restoreFocus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.closed.emit();
  }

  onBackdrop(): void {
    if (this.closeOnBackdrop()) this.closed.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.panel) return;
    const focusable = Array.from(this.panel.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      el => !el.hasAttribute('disabled') && el.tabIndex !== -1
    );
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

  private lockBackgroundScroll(): void {
    const target = document.querySelector('.main-content') instanceof HTMLElement
      ? document.querySelector('.main-content') as HTMLElement
      : document.body;
    this.lockedScroll = target;
    this.previousOverflow = target.style.overflow;
    target.style.overflow = 'hidden';
  }

  private unlockBackgroundScroll(): void {
    if (!this.lockedScroll) return;
    this.lockedScroll.style.overflow = this.previousOverflow;
    this.lockedScroll = null;
  }

  private restoreFocus(): void {
    this.lastFocused?.focus();
    this.lastFocused = null;
  }
}
