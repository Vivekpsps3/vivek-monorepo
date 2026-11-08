import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { LifeYearRow } from './life-model';

@Component({
  selector: 'app-life-table',
  standalone: true,
  templateUrl: './life-table.component.html',
  styleUrl: './life-table.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LifeTableComponent {
  years = input.required<readonly LifeYearRow[]>();
  showAge = input(false);
  showTown = input(true);
  selectedRow = input<number | null>(null);

  pick = output<number>();
}
