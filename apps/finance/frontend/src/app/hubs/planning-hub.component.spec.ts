import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { InvestmentInsightsComponent } from '../investment-insights/investment-insights.component';
import { PlanningComponent } from '../planning/planning.component';
import { StockLabComponent } from '../stock-lab/stock-lab.component';
import { PlanningHubComponent } from './planning-hub.component';

describe('canonical tab links', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'finance/planning', component: PlanningHubComponent }])],
    });
    TestBed.overrideComponent(PlanningHubComponent, {
      remove: { imports: [PlanningComponent, InvestmentInsightsComponent, StockLabComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    await TestBed.compileComponents();
    harness = await RouterTestingHarness.create();
  });

  it('the default link href has no t=, labels match, exactly one link is current', async () => {
    await harness.navigateByUrl('/finance/planning', PlanningHubComponent);
    harness.detectChanges();
    const links = [...harness.routeNativeElement!.querySelectorAll('.hub-tabs a')] as HTMLAnchorElement[];
    expect(links.map(link => link.textContent?.trim())).toEqual(['Retirement and goals', 'Portfolio projection', 'Stock research']);
    expect(links[0].getAttribute('href')).not.toContain('t=');
    expect(links[1].getAttribute('href')).toContain('t=growth');
    expect(links[2].getAttribute('href')).toContain('t=stocks');
    const current = links.filter(link => link.getAttribute('aria-current') === 'page');
    expect(current.length).toBe(1);
    expect(current[0].textContent?.trim()).toBe('Retirement and goals');
    expect(harness.routeNativeElement!.querySelector('.hub-tabs')?.getAttribute('aria-label')).toBe('Planning sections');
  });
});
