import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ThemeService, UiCardComponent, type ThemeChoice } from '@vivek/ui';

@Component({
  selector: 'app-appearance-section',
  standalone: true,
  imports: [UiCardComponent],
  templateUrl: './appearance-section.component.html',
  styleUrl: './appearance-section.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppearanceSectionComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  readonly theme = inject(ThemeService);
  readonly choices: { value: ThemeChoice; label: string; preview: ThemeChoice | null }[] = [
    { value: 'system', label: 'System', preview: null },
    { value: 'light', label: 'Light', preview: 'light' },
    { value: 'dark', label: 'Dark', preview: 'dark' },
  ];

  ngOnInit(): void {
    this.theme.choice$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.cdr.markForCheck());
  }

  choose(theme: ThemeChoice): void {
    this.theme.set(theme);
  }
}
