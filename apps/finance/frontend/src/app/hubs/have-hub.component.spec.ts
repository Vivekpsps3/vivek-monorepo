import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { FinanceService } from '../services/finance.service';
import { VaultService } from '../crypto/vault.service';
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
          getAssets: () => of([]), getLiabilities: () => of([]), getNetWorth: () => of(null),
        } },
        { provide: VaultService, useValue: { isUnlocked: true, unlocked$: of(true) } },
      ],
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
    ]) {
      await harness.navigateByUrl('/finance/have' + suffix, HaveHubComponent);
      harness.detectChanges();
      expect(harness.routeNativeElement!.querySelector('h1')?.textContent?.trim()).toBe(title);
      expect(harness.routeNativeElement!.querySelector(view)).not.toBeNull();
    }
  });
});
