import { CommonModule } from '@angular/common';
import { Inject, ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, finalize, takeUntil } from 'rxjs';
import { SESSION_CONTEXT, type SessionPort } from '@vivek/ui';
import { VaultService } from '../crypto/vault.service';
import { NetWorth } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { MarketRefreshCoordinatorService } from '../services/market-refresh-coordinator.service';
import { MoneyPipe } from '@vivek/ui';

@Component({
  selector: 'app-net-worth-embed',
  standalone: true,
  imports: [
    MoneyPipe, CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="card" href="/" target="_top">
      @if (netWorth) {
        <p class="eyebrow">Net worth</p>
        <p class="total money">{{ netWorth.total | money }}</p>
        <p class="break">
          Assets {{ netWorth.other_assets | money }}
          · Holdings {{ netWorth.portfolio | money }}
          · Debts {{ (-netWorth.liabilities) | money }}
        </p>
      } @else if (error) {
        <p class="break">{{ error }}</p>
      } @else {
        <p class="break">Loading net worth…</p>
      }
      @if (marketDisclosure) {
        <p class="disclosure" aria-label="Market price privacy">{{ marketDisclosure }}</p>
      }
    </a>
  `,
  styles: [`
    :host { display:block; min-height:100dvh; background:var(--card-bg); color:var(--text); }
    .card {
      display:flex; flex-direction:column; justify-content:center; box-sizing:border-box;
      min-height:100dvh; padding:24px; color:inherit; text-decoration:none;
      border-left:4px solid var(--accent);
    }
    .eyebrow { margin:0 0 8px; color:var(--text-secondary); font-size:var(--text-sm); font-weight:500; }
    .total { margin:0; font-size:clamp(2rem, 8vw, 2.75rem); font-weight:600; letter-spacing:-0.03em; line-height:1.1; }
    .break { margin:12px 0 0; color:var(--text-secondary); font-size:var(--text-sm); }
    .disclosure { margin:10px 0 0; color:var(--text-secondary); font-size:11px; line-height:1.35; }
  `],
})
export class NetWorthEmbedComponent implements OnInit, OnDestroy {
  netWorth: NetWorth | null = null;
  error: string | null = null;
  marketDisclosure: string | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    private finance: FinanceService,
    private cdr: ChangeDetectorRef,
    @Inject(SESSION_CONTEXT) private auth: SessionPort,
    private vault: VaultService,
    private marketRefresh: MarketRefreshCoordinatorService
  ) {}

  ngOnInit(): void {
    this.auth.user$.pipe(takeUntil(this.destroy$)).subscribe(() => this.syncMarketSession());
    this.vault.unlocked$.pipe(takeUntil(this.destroy$)).subscribe(() => this.syncMarketSession());
    this.finance.netWorth$.pipe(takeUntil(this.destroy$)).subscribe(nw => {
      if (!nw) return;
      this.netWorth = nw;
      this.error = null;
      this.cdr.markForCheck();
    });
    this.finance
      .getNetWorth()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.cdr.markForCheck())
      )
      .subscribe({
        next: nw => {
          this.netWorth = nw;
          this.cdr.markForCheck();
        },
        error: () => {
          this.error = 'Could not load net worth.';
          this.cdr.markForCheck();
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private syncMarketSession(): void {
    const user = this.auth.currentUser;
    if (user && this.vault.isUnlocked) {
      this.marketDisclosure = 'Ticker symbols are sent to market data for prices; holdings and balances stay in your vault.';
      this.marketRefresh.startForSession(user.id, this.finance.sessionToken);
    } else {
      this.marketDisclosure = null;
      this.marketRefresh.endSession();
    }
    this.cdr.markForCheck();
  }
}
