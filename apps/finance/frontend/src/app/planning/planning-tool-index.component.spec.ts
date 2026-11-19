import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { PlanningToolIndexComponent } from './planning-tool-index.component';

describe('planning tool index', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([
        { path: 'finance/planning', component: PlanningToolIndexComponent },
        { path: 'finance/planning/retirement', component: PlanningToolIndexComponent },
        { path: 'finance/planning/simulation', component: PlanningToolIndexComponent },
        { path: 'finance/planning/savings', component: PlanningToolIndexComponent },
        { path: 'finance/planning/debt', component: PlanningToolIndexComponent },
        { path: 'finance/planning/projection', component: PlanningToolIndexComponent },
        { path: 'finance/planning/research', component: PlanningToolIndexComponent },
      ])],
    });
    harness = await RouterTestingHarness.create();
  });

  it('links every tool and marks only the open one current', async () => {
    await harness.navigateByUrl('/finance/planning', PlanningToolIndexComponent);
    const links = [...harness.routeNativeElement!.querySelectorAll('a')] as HTMLAnchorElement[];
    expect(links.map(link => link.querySelector('.label')?.textContent?.trim())).toEqual([
      'Retirement', 'Simulation', 'Savings', 'Debt', 'Projection', 'Stock research',
    ]);
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/finance/planning/retirement',
      '/finance/planning/simulation',
      '/finance/planning/savings',
      '/finance/planning/debt',
      '/finance/planning/projection',
      '/finance/planning/research',
    ]);
    expect(links.filter(link => link.getAttribute('aria-current') === 'page')).toEqual([]);
    expect(harness.routeNativeElement!.querySelector('nav h2')?.textContent?.trim()).toBe('Planning tools');
    expect(harness.routeNativeElement!.querySelector('nav')?.getAttribute('aria-labelledby')).toBe('planning-tools-heading');
    expect(links[0].textContent).toContain('Estimate a target');

    await harness.navigateByUrl('/finance/planning/projection', PlanningToolIndexComponent);
    const current = [...harness.routeNativeElement!.querySelectorAll('a')]
      .filter(link => link.getAttribute('aria-current') === 'page');
    expect(current).toHaveSize(1);
    expect(current[0].querySelector('.label')?.textContent?.trim()).toBe('Projection');
  });
});
