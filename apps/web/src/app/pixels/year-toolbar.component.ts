import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiButtonComponent, UiIconComponent } from '@vivek/ui';
import { ColorByToggleComponent } from './color-by-toggle.component';
import { PixelsPreferences } from './pixels-preferences';
import type { FinanceJoinStatus } from './pixels.types';

@Component({
  selector: 'app-year-toolbar',
  standalone: true,
  imports: [ColorByToggleComponent, RouterLink, UiButtonComponent, UiIconComponent],
  templateUrl: './year-toolbar.component.html',
  styleUrl: './year-toolbar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YearToolbarComponent {
  private readonly preferences = inject(PixelsPreferences);

  year = input.required<number>();
  financeStatus = input<FinanceJoinStatus | null>(null);
  shift = output<number>();

  readonly viewLabel = computed(() => this.preferences.view() === 'grid' ? 'View as table' : 'View as grid');

  toggleView(): void {
    this.preferences.setView(this.preferences.view() === 'grid' ? 'table' : 'grid');
  }
}
