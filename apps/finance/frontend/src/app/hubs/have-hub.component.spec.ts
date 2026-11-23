import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { PlanningService } from '../services/planning.service';
import { VaultService } from '../crypto/vault.service';
import { PlanningStudyComponent } from '../planning-study/planning-study.component';
import { PortfolioComponent } from '../portfolio/portfolio.component';
import { HaveHubComponent } from './have-hub.component';

describe('canonical tab links', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'finance/have', component: HaveHubComponent }]),
        { provide: FinanceService, useValue: {
          sessionToken: 1, assets$: of([]), liabilities$: of([]), netWorth$: of(null),
          holdings$: of([]), transactions$: of([]),
          fixedExpenses$: of([]), subscriptions$: of([]), jobIncomes$: of([]),
          getAssets: () => of([]), getLiabilities: () => of([]), getNetWorth: () => of(null),
          getHoldings: () => of([]), getTransactions: () => of([]),
          getFixedExpenses: () => of([]), getSubscriptions: () => of([]), getJobIncomes: () => of([]),
          getAllTransactions: () => of([]),
        } },
        { provide: PlanningService, useValue: { createRun: () => of({}) } },
        { provide: VaultService, useValue: { isUnlocked: true, unlocked$: of(true) } },
      ],
    });
    TestBed.overrideComponent(PlanningStudyComponent, {
      set: { imports: [], template: '<h1>Planning study</h1>' },
    });
    TestBed.overrideComponent(HaveHubComponent, {
      remove: { imports: [PortfolioComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    await TestBed.compileComponents();
    harness = await RouterTestingHarness.create();
  });

  it('shows the routed destination for canonical and legacy links', async () => {
    for (const [suffix, title, view] of [
      ['', 'Accounts', 'app-assets-liabilities'],
      ['?t=assets', 'Accounts', 'app-assets-liabilities'],
      ['?t=holdings', 'Holdings', 'app-portfolio'],
      ['?t=hall', 'Accounts hall', 'app-accounts-hall'],
      ['?t=gallery', 'Treasury gallery', 'app-treasury-gallery'],
      ['?t=study', 'Planning study', 'app-planning-study'],
    ]) {
      await harness.navigateByUrl('/finance/have' + suffix, HaveHubComponent);
      harness.detectChanges();
      expect(harness.routeNativeElement!.querySelector('h1')?.textContent?.trim()).toBe(title);
      expect(harness.routeNativeElement!.querySelector(view)).not.toBeNull();
    }
  });
});
