import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UiPageHeaderComponent, returnPath } from '@vivek/ui';
import { financeBillsPath } from '../core/layout/finance-navigation';
import { IncomeComponent } from '../income/income.component';
import { CompensationReportComponent } from '../income/compensation-report.component';

@Component({
  selector: 'app-recurring-hub',
  standalone: true,
  imports: [UiPageHeaderComponent, IncomeComponent, CompensationReportComponent],
  template: `
    @if (showPay) {
      <div class="page recurring-page">
        <ui-page-header title="Pay" [concealTitle]="true" />
        <app-income [embedded]="true" />
        <details class="compensation-history" [open]="historyOpen" (toggle)="historyToggled($event)">
          <summary>View compensation history</summary>
          <app-compensation-report />
        </details>
      </div>
    }
  `,
  styles: [`
    :host { display:block; min-width:0; max-width:100%; }
    .recurring-page { display:grid; gap:var(--space-5, 1.25rem); min-width:0; max-width:100%; }
    .recurring-page > * { min-width:0; max-width:100%; }
    .compensation-history { box-sizing:border-box; min-width:0; max-width:100%; padding:1rem; border:1px solid var(--border-subtle); border-radius:.8rem; background:var(--card-bg); }
    .compensation-history summary { cursor:pointer; font-weight:650; min-height:44px; display:flex; align-items:center; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringHubComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

  showPay = false;
  historyOpen = false;

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const requested = params.get('t');
      if (requested === 'spend' || requested === 'bills' || requested === 'subs') {
        this.showPay = false;
        const query = new URLSearchParams();
        for (const key of ['kind', 'status', 'order']) {
          for (const value of params.getAll(key)) query.append(key, value);
        }
        const target = returnPath(financeBillsPath + '?' + query) ?? financeBillsPath;
        void this.router.navigateByUrl(target, { replaceUrl: true });
      } else if (requested === 'compensation') {
        const queryParams: Record<string, string> = {};
        params.keys.forEach(key => { const value = params.get(key); if (value !== null) queryParams[key] = value; });
        queryParams['t'] = 'pay';
        queryParams['history'] = '1';
        void this.router.navigate(['/finance/recurring'], { queryParams, replaceUrl: true });
      } else {
        this.showPay = true;
        this.historyOpen = params.get('history') === '1';
      }
      this.cdr.markForCheck();
    });
  }

  historyToggled(event: Event): void {
    const isOpen = (event.target as HTMLDetailsElement).open;
    this.historyOpen = isOpen;
    const queryParams = { history: isOpen ? '1' : null };
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
