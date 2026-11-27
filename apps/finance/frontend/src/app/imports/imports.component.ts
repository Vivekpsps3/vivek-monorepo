import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, OnInit, inject } from '@angular/core';
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly locks = inject(FinanceLockService);
  private closed = false;
  start: 'bank' | 'fidelity' | null = null;

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      this.closed = true;
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const start = params.get('start');
      const next = start === 'bank' || start === 'fidelity' ? start : null;
      const closedBank = this.start === 'bank' && next !== 'bank';
      this.start = next;
      if (closedBank) setTimeout(() => this.focusBankImportOpener());
      this.cdr.markForCheck();
    });
  }

  /** Cancel and Done return focus to the bank Import button. */
  private focusBankImportOpener(): void {
    if (this.closed) return;
    const button = this.host.nativeElement.querySelector('.header-actions button');
    if (button instanceof HTMLElement) button.focus();
  }

  lockFinance(): void {
    void this.locks.lockNow();
  }
}
