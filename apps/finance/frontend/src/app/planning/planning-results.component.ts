import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { UiCardComponent, UiDataTableComponent, UiIconComponent } from '@vivek/ui';
import {
  PlanningCheckpointResult,
  PlanningRun,
  PlanningProjectionRow,
} from '../models/planning.model';
import { McChartData, MonteCarloFanChartComponent } from './monte-carlo-fan-chart.component';
import { formatEstimate } from '../shared/stored-money';

@Component({
  selector: 'app-planning-results',
  standalone: true,
  imports: [UiCardComponent, UiDataTableComponent, UiIconComponent, MonteCarloFanChartComponent],
  templateUrl: './planning-results.component.html',
  styleUrl: './planning-results.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanningResultsComponent {
  @Input() lastRun: PlanningRun | null = null;
  @Input() baselineRun: PlanningRun | null = null;
  @Input() scenarioRun: PlanningRun | null = null;
  @Input() chartData: McChartData | null = null;

  fanPathCaption(): string | null {
    const artifacts = this.lastRun?.result_artifacts;
    const simulated = artifacts?.n_paths_simulated ?? this.lastRun?.result_summary?.n_paths;
    const displayed = artifacts?.fan_paths?.length ?? artifacts?.fan_paths_displayed;
    if (!simulated) return null;
    if (displayed != null && displayed < simulated) {
      return `Fan chart shows ${displayed.toLocaleString()} sample paths (evenly spaced from ${simulated.toLocaleString()} simulated). Percentiles use the full run.`;
    }
    return `Fan shows all ${simulated.toLocaleString()} simulated paths.`;
  }

  checkpointRows(): PlanningCheckpointResult[] {
    return this.lastRun?.result_artifacts.checkpoint_results ?? [];
  }

  projectionRows(): PlanningProjectionRow[] {
    return this.lastRun?.result_artifacts.projection_table ?? [];
  }

  formatMoney(value: number | undefined | null): string {
    return formatEstimate(value);
  }

  formatSignedMoney(value: number | undefined | null): string {
    return formatEstimate(value, 'always');
  }

  formatPct(value: number | undefined | null, source: 'decimal' | 'percent' = 'decimal'): string {
    if (value == null || Number.isNaN(value)) return '-';
    const percent = source === 'decimal' ? value * 100 : value;
    return `${percent.toFixed(percent >= 10 ? 0 : 1)}%`;
  }

  successVariant(): 'success' | 'warning' | 'danger' {
    const probability = this.lastRun?.result_summary.success_rate_pct ?? 0;
    if (probability >= 75) return 'success';
    if (probability >= 45) return 'warning';
    return 'danger';
  }
}
