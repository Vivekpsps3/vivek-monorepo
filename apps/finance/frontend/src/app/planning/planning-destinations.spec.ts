import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { convertToParamMap, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { legacyPlanningDestination, redirectLegacyPlanningQuery } from './planning-destinations';

@Component({ standalone: true, selector: 'app-planning-index-probe', template: 'index' })
class IndexPage {}

@Component({ standalone: true, selector: 'app-planning-projection-probe', template: 'projection' })
class ProjectionPage {}

describe('legacy planning destinations', () => {
  it('sends old queries to the direct tool and leaves the index alone', () => {
    expect(legacyPlanningDestination(convertToParamMap({ t: 'growth', tool: 'simulation' })))
      .toBe('/finance/planning/projection');
    expect(legacyPlanningDestination(convertToParamMap({ t: 'stocks' }))).toBe('/finance/planning/research');
    expect(legacyPlanningDestination(convertToParamMap({ t: 'path', tool: 'simulation' })))
      .toBe('/finance/planning/simulation');
    expect(legacyPlanningDestination(convertToParamMap({ tool: 'retirement-target' })))
      .toBe('/finance/planning/retirement');
    expect(legacyPlanningDestination(convertToParamMap({ tool: 'savings-goal' }))).toBe('/finance/planning/savings');
    expect(legacyPlanningDestination(convertToParamMap({ tool: 'debt-payoff' }))).toBe('/finance/planning/debt');
    expect(legacyPlanningDestination(convertToParamMap({ t: 'path' }))).toBeNull();
    expect(legacyPlanningDestination(convertToParamMap({ tool: 'overview' }))).toBeNull();
    expect(legacyPlanningDestination(convertToParamMap({}))).toBeNull();
    expect(legacyPlanningDestination(convertToParamMap({ t: 'compensation', year: '2024' })))
      .toBe('/finance/pay?history=1&year=2024');
  });

  it('opens a growth query on the projection page', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([
        {
          path: 'finance/planning',
          pathMatch: 'full',
          canActivate: [redirectLegacyPlanningQuery],
          runGuardsAndResolvers: 'paramsOrQueryParamsChange',
          component: IndexPage,
        },
        { path: 'finance/planning/projection', component: ProjectionPage },
      ])],
    });
    const harness = await RouterTestingHarness.create();
    const index = await harness.navigateByUrl('/finance/planning?t=path', IndexPage);
    expect(index).toBeInstanceOf(IndexPage);
    const page = await harness.navigateByUrl('/finance/planning?t=growth', ProjectionPage);
    expect(page).toBeInstanceOf(ProjectionPage);
    expect(harness.routeNativeElement?.textContent).toContain('projection');
  });
});
