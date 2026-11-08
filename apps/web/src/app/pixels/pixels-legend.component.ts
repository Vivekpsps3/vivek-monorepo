import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { PixelsColorBy } from './pixels-preferences';

@Component({
  selector: 'app-pixels-legend',
  standalone: true,
  templateUrl: './pixels-legend.component.html',
  styleUrls: ['./pixels.css', './pixels-legend.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PixelsLegendComponent {
  colorBy = input<PixelsColorBy>('activity');
}
