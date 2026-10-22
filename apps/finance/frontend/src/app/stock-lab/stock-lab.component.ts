import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, finalize, takeUntil } from 'rxjs';
import { Holding } from '../models/transaction.model';
import { MarketResearchResponse, StockLabScenario } from '../models/stock-lab.model';
import { FinanceService } from '../services/finance.service';
import { MarketResearchService } from '../services/market-research.service';
import { StockLabScenarioService } from '../services/stock-lab-scenario.service';
import { ToastService } from '@vivek/ui';
import { UiButtonComponent, UiCardComponent, UiDataTableComponent, UiEmptyStateComponent, UiPageHeaderComponent, UiSkeletonComponent } from '@vivek/ui';
import { InfoTipComponent } from '../shared/info-tip.component';
import { buildScorecard, calculatePurchasePlan, calculateReturnPeriods, detectDividendCadence, trailingTwelveMonthDividend } from '../utils/stock-lab.util';
import {
  EvidenceCard,
  evidenceKindLabel,
  stockLabEvidenceCards,
} from '../utils/evidence-labels.util';
import { AppDatePipe } from '../shared/pipes/app-date.pipe';
import { formatEstimate as formatEstimateMoney, formatStoredMoney } from '../shared/stored-money';


@Component({
  selector: 'app-stock-lab',
  standalone: true,
  imports: [
    AppDatePipe, CommonModule, FormsModule, UiPageHeaderComponent, UiCardComponent, UiButtonComponent, UiDataTableComponent, UiEmptyStateComponent, UiSkeletonComponent, InfoTipComponent],
  templateUrl: './stock-lab.component.html',
  styleUrl: './stock-lab.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockLabComponent implements OnInit, OnDestroy {
  @Input() embedded = false;
  readonly disclosure = 'Ticker symbols on this page are sent to market data services. Scenario inputs stay encrypted in your vault.';
  readonly calculateReturnPeriods = calculateReturnPeriods;
  readonly evidenceKindLabel = evidenceKindLabel;
  scenarios: StockLabScenario[] = [];
  scenario: StockLabScenario;
  holdings: Holding[] = [];
  research: MarketResearchResponse[] = [];
  loading = false;
  saving = false;
  error: string | null = null;
  period = '10y';
  newComparisonSymbol = '';
  private destroy$ = new Subject<void>();
  private marketRequest = 0;

  constructor(
    private market: MarketResearchService,
    private scenariosSvc: StockLabScenarioService,
    private finance: FinanceService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {
    this.scenario = this.scenariosSvc.createDefaultScenario('VOO');
  }

  ngOnInit(): void {
    void this.loadScenarios();
    this.finance.holdings$.pipe(takeUntil(this.destroy$)).subscribe(holdings => {
      this.holdings = holdings;
      this.cdr.markForCheck();
    });
    this.finance.getHoldings(false).pipe(takeUntil(this.destroy$)).subscribe();
    this.loadMarketData(false);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get primaryResearch(): MarketResearchResponse | null {
    return this.research.find(row => row.symbol === this.scenario.primary_symbol) ?? this.research[0] ?? null;
  }

  get returnRows() {
    return this.primaryResearch ? calculateReturnPeriods(this.primaryResearch) : [];
  }

  get scorecard() {
    return this.primaryResearch ? buildScorecard(this.primaryResearch, this.ownedExposurePct(this.primaryResearch.symbol)) : [];
  }

  get purchasePlan() {
    if (!this.primaryResearch) return null;
    return calculatePurchasePlan(this.primaryResearch, {
      purchase_mode: this.scenario.purchase_mode,
      shares: this.scenario.shares,
      budget: this.scenario.budget,
      target_price: this.scenario.target_price,
      projection_years: this.scenario.projection_years,
      growth_rate: this.scenario.custom_growth_rate ?? this.scenario.base_growth_rate,
      dividend_growth_rate: this.scenario.dividend_growth_rate,
      reinvest_dividends: this.scenario.reinvest_dividends,
      tax_drag: this.scenario.tax_drag,
      fee_drag: this.scenario.fee_drag,
      inflation_rate: this.scenario.inflation_rate,
    });
  }

  get dividendCadence(): string {
    return this.primaryResearch ? detectDividendCadence(this.primaryResearch.dividends) : 'none';
  }

  get trailingDividend(): number {
    return this.primaryResearch ? trailingTwelveMonthDividend(this.primaryResearch) : 0;
  }

  asPercent(rate: number | null | undefined): number | null {
    return rate == null || !Number.isFinite(Number(rate)) ? null : Number((Number(rate) * 100).toFixed(6));
  }

  setRatePercent(key: 'base_growth_rate' | 'dividend_growth_rate' | 'inflation_rate', percent: number | string | null): void {
    const value = Number(percent);
    this.scenario[key] = Number.isFinite(value) ? value / 100 : 0;
  }

  get evidenceCards(): EvidenceCard[] {
    const primary = this.primaryResearch;
    return stockLabEvidenceCards({
      primarySymbol: this.scenario.primary_symbol,
      hasQuote: !!primary?.quote?.current_price,
      cacheStatus: primary?.cache_status,
    });
  }

  symbols(): string[] {
    const symbols = [this.scenario.primary_symbol, ...this.scenario.comparison_symbols];
    if (this.scenario.include_owned_symbols) symbols.push(...this.scenario.selected_owned_symbols);
    return Array.from(new Set(symbols.map(symbol => symbol.trim().toUpperCase()).filter(Boolean))).slice(0, 5);
  }

  loadMarketData(refresh: boolean): void {
    const request = ++this.marketRequest;
    const symbols = this.symbols();
    if (symbols.length === 0) {
      this.research = [];
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();
    this.market.getBatch(symbols, { refresh, period: this.period }).pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        if (request === this.marketRequest) {
          this.loading = false;
          this.cdr.markForCheck();
        }
      })
    ).subscribe({
      next: batch => {
        if (request !== this.marketRequest) return;
        this.research = batch.results;
        if (batch.failed.length) this.error = batch.failed.map(row => `${row.symbol}: ${row.error}`).join('; ');
      },
      error: err => {
        if (request !== this.marketRequest) return;
        this.error = err?.error?.detail || err?.message || 'Market research failed.';
      },
    });
  }

  async loadScenarios(): Promise<void> {
    try {
      this.scenarios = await this.scenariosSvc.list();
      // Hydrate draft with first saved scenario; re-fetch market so research matches symbols.
      if (this.scenarios.length && this.scenario.id === 0) {
        this.scenario = { ...this.scenarios[0] };
        this.loadMarketData(false);
      }
    } catch (err: unknown) {
      const message = this.errorMessage(err, 'Could not load scenarios.');
      this.error = message;
      this.toast.error(message);
    }
    this.cdr.markForCheck();
  }

  async saveScenario(): Promise<void> {
    this.saving = true;
    this.cdr.markForCheck();
    try {
      const saved = await this.scenariosSvc.save(this.scenario);
      this.scenario = { ...saved };
      await this.loadScenarios();
      this.toast.success('Scenario saved.');
    } catch (err: unknown) {
      const message = this.errorMessage(err, 'Could not save scenario.');
      this.error = message;
      this.toast.error(message);
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  async deleteScenario(): Promise<void> {
    if (!this.scenario.id) return;
    this.saving = true;
    this.cdr.markForCheck();
    try {
      await this.scenariosSvc.delete(this.scenario.id);
      this.scenario = this.scenariosSvc.createDefaultScenario('VOO');
      await this.loadScenarios();
      this.loadMarketData(false);
      this.toast.success('Scenario deleted.');
    } catch (err: unknown) {
      const message = this.errorMessage(err, 'Could not delete scenario.');
      this.error = message;
      this.toast.error(message);
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  selectScenario(id: string): void {
    // Empty value = "Current draft": keep in-memory draft intentionally (no reset, no market reload).
    if (!id) return;
    const parsed = Number(id);
    const found = this.scenarios.find(row => row.id === parsed);
    if (found) {
      this.scenario = { ...found };
      this.loadMarketData(false);
      return;
    }
    this.error = 'Selected scenario is no longer available.';
    this.cdr.markForCheck();
  }

  setIncludeOwnedSymbols(include: boolean): void {
    this.scenario = { ...this.scenario, include_owned_symbols: include };
    this.loadMarketData(false);
  }

  private errorMessage(err: unknown, fallback: string): string {
    const anyErr = err as { error?: { detail?: string }; message?: string } | null;
    return anyErr?.error?.detail || anyErr?.message || fallback;
  }

  setPrimarySymbol(symbol: string): void {
    this.scenario = { ...this.scenario, primary_symbol: symbol.trim().toUpperCase() };
  }

  addComparisonSymbol(): void {
    const symbol = this.newComparisonSymbol.trim().toUpperCase();
    if (!symbol || this.symbols().includes(symbol)) return;
    this.scenario.comparison_symbols = [...this.scenario.comparison_symbols, symbol].slice(0, 4);
    this.newComparisonSymbol = '';
    this.loadMarketData(false);
  }

  removeComparisonSymbol(symbol: string): void {
    this.scenario.comparison_symbols = this.scenario.comparison_symbols.filter(row => row !== symbol);
    this.loadMarketData(false);
  }

  addOwnedSymbol(symbol: string): void {
    const upper = symbol.trim().toUpperCase();
    if (!upper || this.scenario.selected_owned_symbols.includes(upper)) return;
    this.scenario.selected_owned_symbols = [...this.scenario.selected_owned_symbols, upper].slice(0, 4);
    this.loadMarketData(false);
  }

  ownedSymbols(): string[] {
    return Array.from(new Set(this.holdings.map(holding => holding.symbol?.trim().toUpperCase()).filter(Boolean)));
  }

  ownedExposurePct(symbol: string): number {
    const total = this.holdings.reduce((sum, holding) => sum + Number(holding.value || 0), 0);
    if (total <= 0) return 0;
    const exposure = this.holdings
      .filter(holding => holding.symbol?.toUpperCase() === symbol.toUpperCase())
      .reduce((sum, holding) => sum + Number(holding.value || 0), 0);
    return (exposure / total) * 100;
  }

  formatMoney(value: number | null | undefined): string {
    return formatStoredMoney(value);
  }

  formatEstimate(value: number | null | undefined): string {
    return formatEstimateMoney(value);
  }

  formatPct(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return '-';
    return `${(value * 100).toFixed(Math.abs(value) >= 0.1 ? 1 : 2)}%`;
  }
}
