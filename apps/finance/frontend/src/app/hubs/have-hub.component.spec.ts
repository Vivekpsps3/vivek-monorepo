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

  function links(): HTMLAnchorElement[] {
    return [...harness.routeNativeElement!.querySelectorAll('.hub-tabs a')] as HTMLAnchorElement[];
  }

  it('the default link href has no t= and exactly one link is current', async () => {
    await harness.navigateByUrl('/finance/have', HaveHubComponent);
    harness.detectChanges();
    const [assets, holdings] = links();
    expect(assets.textContent?.trim()).toBe('Assets and debts');
    expect(assets.getAttribute('href')).not.toContain('t=');
    expect(holdings.getAttribute('href')).toContain('t=holdings');
    const current = links().filter(link => link.getAttribute('aria-current') === 'page');
    expect(current.length).toBe(1);
    expect(current[0].textContent?.trim()).toBe('Assets and debts');
    expect(harness.routeNativeElement!.querySelector('.hub-tabs')?.getAttribute('aria-label')).toBe('Net worth sections');
  });

  it('have-hub with t=assets still shows Assets and debts', async () => {
    await harness.navigateByUrl('/finance/have?t=assets', HaveHubComponent);
    harness.detectChanges();
    const current = links().filter(link => link.getAttribute('aria-current') === 'page');
    expect(current.length).toBe(1);
    expect(current[0].textContent?.trim()).toBe('Assets and debts');
    expect(harness.routeDebugElement?.componentInstance).toBeInstanceOf(HaveHubComponent);
    expect((harness.routeDebugElement?.componentInstance as HaveHubComponent).tab).toBe('assets');
  });
});
