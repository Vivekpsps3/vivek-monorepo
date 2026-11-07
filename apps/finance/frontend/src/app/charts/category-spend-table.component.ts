import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MoneyPipe } from '@vivek/ui';
import { formatPercent } from '@vivek/browser';
import { CategorySpendRow } from '../utils/category-spend';

export interface CategorySpendTableRow extends CategorySpendRow {
  /** Drilldown query params; null renders the expand-categories button. */
  query: { [key: string]: string } | null;
  synthetic?: boolean;
}

/**
 * The category table that accompanies the doughnut everywhere it appears:
 * signed net amounts (refunds stay visible) and share of gross purchases.
 */
@Component({
  selector: 'app-category-spend-table',
  standalone: true,
  imports: [CommonModule, RouterLink, MoneyPipe],
  template: `
    <table aria-label="Spending category data table">
      <thead><tr><th>Category</th><th>Amount</th><th>%</th></tr></thead>
      <tbody>
        @for (row of rows; track (row.synthetic ? 'synthetic:' : 'category:') + row.label) {
          <tr>
            <td>
              @if (row.synthetic) {
                <button type="button" class="chart-drilldown-link" (click)="expand.emit()">{{ row.label }} · Show all categories</button>
              } @else {
                <a [routerLink]="['/finance/spending']" [queryParams]="row.query || {}">{{ row.label }}</a>
              }
            </td>
            <td>{{ row.net | money }}</td>
            <td>@if (row.share == null) { Unavailable } @else { {{ formatShare(row.share) }} }</td>
          </tr>
        }
      </tbody>
    </table>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategorySpendTableComponent {
  @Input() rows: CategorySpendTableRow[] = [];
  @Output() expand = new EventEmitter<void>();

  formatShare(value: number | null | undefined): string {
    return formatPercent(value, 0);
  }
}
