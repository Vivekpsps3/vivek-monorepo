import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IncomeComponent } from '../income/income.component';
import { FixedExpensesComponent } from '../fixed-expenses/fixed-expenses.component';
import { SubscriptionsComponent } from '../subscriptions/subscriptions.component';
import { FinanceService } from '../services/finance.service';
import { FixedExpense, Subscription } from '../models/transaction.model';
import { UiCardComponent, UiEmptyStateComponent } from '../shared/ui';

@Component({
  selector: 'app-recurring-hub',
  standalone: true,
  imports: [CommonModule, RouterLink, IncomeComponent, FixedExpensesComponent, SubscriptionsComponent, UiCardComponent, UiEmptyStateComponent],
  template: `
    <div class="page">
      <h1>Recurring</h1>
      <nav class="hub-tabs" aria-label="Recurring">
        <a [routerLink]="[]" [queryParams]="{ t: 'pay' }" [class.on]="tab === 'pay'">Jobs &amp; pay</a>
        <a [routerLink]="[]" [queryParams]="{ t: 'spend' }" [class.on]="tab === 'spend'">Bills &amp; subscriptions</a>
      </nav>
      @if (tab === 'spend') {
        <ui-card title="Upcoming commitments" class="upcoming-commitments">
          @if (upcomingCommitments.length) {
            <div class="table-scroll">
              <table aria-label="Upcoming commitments">
                <thead><tr><th>Due</th><th>Commitment</th><th>Account</th><th>Autopay</th><th>Frequency</th><th>Amount</th></tr></thead>
                <tbody>
                  @for (item of upcomingCommitments; track item.kind + ':' + item.id) {
                    <tr>
                      <td>{{ item.date | date:'mediumDate':'UTC' }}</td>
                      <td><strong>{{ item.name }}</strong><small>{{ item.kind === 'bill' ? item.category : 'Subscription' }}</small></td>
                      <td>{{ item.account || 'Not recorded' }}</td>
                      <td>{{ item.autopay == null ? 'Not recorded' : item.autopay ? 'Autopay' : 'Manual' }}</td>
                      <td>{{ item.frequency }}</td>
                      <td class="money">&#36;{{ item.amount | number:'1.2-2' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <ui-empty-state icon="calendar" message="No upcoming bills or subscriptions. Add a recurring item below to see due dates here." />
          }
        </ui-card>
        <app-fixed-expenses [embedded]="true" />
        <app-subscriptions [embedded]="true" />
      } @else {
        <app-income [embedded]="true" />
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringHubComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  private financeService = inject(FinanceService);
  tab = 'pay';
  fixedExpenses: FixedExpense[] = [];
  subscriptions: Subscription[] = [];

  get upcomingCommitments(): Array<{
    id: number; kind: 'bill' | 'subscription'; date: string; name: string; category: string;
    account: string | null; autopay: boolean | null; frequency: string; amount: number;
  }> {
    return [
      ...this.fixedExpenses.filter(row => row.is_active && !!row.next_due_date).map(row => ({
        id: row.id, kind: 'bill' as const, date: row.next_due_date!, name: row.name, category: row.category,
        account: row.payment_account || null, autopay: row.autopay, frequency: row.frequency, amount: row.amount,
      })),
      ...this.subscriptions.filter(row => row.is_active && !!row.next_due_date).map(row => ({
        id: row.id, kind: 'subscription' as const, date: row.next_due_date!, name: row.name, category: row.category,
        account: row.payment_account || null, autopay: null, frequency: row.frequency, amount: row.amount,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  }

  ngOnInit(): void {
    this.financeService.fixedExpenses$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(rows => { this.fixedExpenses = rows; this.cdr.markForCheck(); });
    this.financeService.subscriptions$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(rows => { this.subscriptions = rows; this.cdr.markForCheck(); });
    this.financeService.getFixedExpenses().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.financeService.getSubscriptions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const requested = params.get('t');
      this.tab = requested === 'spend' || requested === 'bills' || requested === 'subs' ? 'spend' : 'pay';
      this.cdr.markForCheck();
    });
  }
}
