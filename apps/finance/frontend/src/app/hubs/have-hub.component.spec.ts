import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AssetsLiabilitiesComponent } from '../assets-liabilities/assets-liabilities.component';
import { PortfolioComponent } from '../portfolio/portfolio.component';
import { HaveHubComponent } from './have-hub.component';

describe('canonical tab links', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'finance/have', component: HaveHubComponent }])],
    });
    TestBed.overrideComponent(HaveHubComponent, {
      remove: { imports: [AssetsLiabilitiesComponent, PortfolioComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    await TestBed.compileComponents();
    harness = await RouterTestingHarness.create();
  });

  it('shows the routed destination for canonical and legacy links', async () => {
    for (const [suffix, title, view] of [
      ['', 'Assets and debts', 'app-assets-liabilities'],
      ['?t=assets', 'Assets and debts', 'app-assets-liabilities'],
      ['?t=holdings', 'Holdings', 'app-portfolio'],
    ]) {
      await harness.navigateByUrl('/finance/have' + suffix, HaveHubComponent);
      harness.detectChanges();
      expect(harness.routeNativeElement!.querySelector('h1')?.textContent?.trim()).toBe(title);
      expect(harness.routeNativeElement!.querySelector(view)).not.toBeNull();
    }
  });
});
