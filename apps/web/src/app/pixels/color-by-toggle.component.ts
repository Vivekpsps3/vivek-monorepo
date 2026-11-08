import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { UiSegmentedComponent, type UiSegmentedOption } from '@vivek/ui';
import { PixelsPreferences, type PixelsColorBy } from './pixels-preferences';

@Component({
  selector: 'app-color-by-toggle',
  standalone: true,
  imports: [UiSegmentedComponent],
  templateUrl: './color-by-toggle.component.html',
  styleUrl: './color-by-toggle.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColorByToggleComponent {
  private readonly preferences = inject(PixelsPreferences);

  readonly options: readonly UiSegmentedOption[] = [
    { value: 'activity', label: 'Activity' },
    { value: 'app', label: 'By app' },
  ];

  colorBy(): PixelsColorBy {
    return this.preferences.colorBy();
  }

  setColor(value: string | number | null): void {
    if (value === 'activity' || value === 'app') this.preferences.setColorBy(value);
  }
}
