import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, ViewChild, inject, input } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export interface UiSectionNavItem {
  label: string;
  shortLabel?: string;
  link: string;
  exact?: boolean;
}

@Component({
  selector: 'ui-section-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './ui-section-nav.component.html',
  styleUrl: './ui-section-nav.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiSectionNavComponent implements AfterViewInit {
  /** Accessible name, for example "Travel sections". */
  label = input.required<string>();
  items = input.required<UiSectionNavItem[]>();

  @ViewChild('scroller') private scroller?: ElementRef<HTMLElement>;

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroy = inject(DestroyRef);
  private revealTimer = 0;

  constructor() {
    inject(Router).events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroy),
    ).subscribe(() => this.revealSoon());
    this.destroy.onDestroy(() => {
      if (typeof window !== 'undefined') window.clearTimeout(this.revealTimer);
    });
  }

  ngAfterViewInit(): void {
    const scroller = this.scroller?.nativeElement;
    if (!scroller || typeof document === 'undefined') return;
    const onScroll = () => this.updateFades();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    this.destroy.onDestroy(() => scroller.removeEventListener('scroll', onScroll));
    this.revealSoon();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updateFades();
  }

  private revealSoon(): void {
    if (typeof document === 'undefined') return;
    window.clearTimeout(this.revealTimer);
    this.revealTimer = window.setTimeout(() => {
      const active = this.host.nativeElement.querySelector('[aria-current="page"]');
      if (active instanceof HTMLElement) active.scrollIntoView({ inline: 'nearest', block: 'nearest' });
      this.updateFades();
    });
  }

  private updateFades(): void {
    const scroller = this.scroller?.nativeElement;
    if (!scroller) return;
    const hidden = scroller.scrollWidth - scroller.clientWidth;
    scroller.classList.toggle('is-fade-start', scroller.scrollLeft > 1);
    scroller.classList.toggle('is-fade-end', hidden - scroller.scrollLeft > 1);
  }
}
