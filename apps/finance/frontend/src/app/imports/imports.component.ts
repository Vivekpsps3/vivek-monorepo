import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { UiButtonComponent, UiPageHeaderComponent } from '@vivek/ui';
import { FinanceLockService } from '../core/finance-lock.service';
import { PortfolioComponent } from '../portfolio/portfolio.component';
import { TransactionsComponent } from '../transactions/transactions.component';

@Component({
  selector: 'app-imports',
  standalone: true,
  imports: [RouterLink, UiPageHeaderComponent, UiButtonComponent, TransactionsComponent, PortfolioComponent],
  templateUrl: './imports.component.html',
  styleUrl: './imports.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locks = inject(FinanceLockService);
  start: 'bank' | 'fidelity' | null = null;

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const start = params.get('start');
      this.start = start === 'bank' || start === 'fidelity' ? start : null;
      this.cdr.markForCheck();
    });
  }

  lockFinance(): void {
    void this.locks.lockNow();
  }
}
