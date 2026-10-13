import { convertToParamMap } from '@angular/router';
import { normalizeSpendingHubRoute } from './spending-hub.component';

describe('SpendingHub route compatibility', () => {
  it('opens Activity by default', () => {
    expect(normalizeSpendingHubRoute(convertToParamMap({}))).toEqual({
      tab: 'activity',
      activityView: 'all',
      queryParams: null,
    });
  });

  it('translates legacy review links to Activity and keeps their month and account filters', () => {
    const params = convertToParamMap({
      t: 'review',
      month: '2026-04',
      account: 'card-a',
      category: 'Food',
      merchant: 'Cafe',
      review: 'needs',
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      priorStart: '2026-03-01',
      priorEnd: '2026-03-31',
    });

    expect(normalizeSpendingHubRoute(params)).toEqual({
      tab: 'activity',
      activityView: 'all',
      queryParams: {
        t: 'activity',
        v: 'all',
        review: null,
        periodStart: null,
        periodEnd: null,
        priorStart: null,
        priorEnd: null,
        group: null,
        dimension: null,
      },
    });
    expect(params.get('month')).toBe('2026-04');
    expect(params.get('account')).toBe('card-a');
    expect(params.get('category')).toBe('Food');
    expect(params.get('merchant')).toBe('Cafe');
  });

  it('turns an old comparison window into an Activity date range and drops the prior window', () => {
    const params = convertToParamMap({
      t: 'review',
      account: 'card-b',
      periodStart: '2025-12-01',
      periodEnd: '2025-12-31',
      priorStart: '2025-11-01',
      priorEnd: '2025-11-30',
    });

    expect(normalizeSpendingHubRoute(params).queryParams).toEqual({
      t: 'activity',
      v: 'all',
      from: '2025-12-01',
      through: '2025-12-31',
      month: null,
      review: null,
      periodStart: null,
      periodEnd: null,
      priorStart: null,
      priorEnd: null,
      group: null,
      dimension: null,
    });
    expect(params.get('account')).toBe('card-b');
  });

  it('clears legacy review filters from Activity without hiding any transaction state', () => {
    const state = normalizeSpendingHubRoute(convertToParamMap({
      t: 'activity',
      v: 'spending',
      review: 'needs',
    }));

    expect(state.tab).toBe('activity');
    expect(state.activityView).toBe('spending');
    expect(state.queryParams).toEqual({
      review: null,
      periodStart: null,
      periodEnd: null,
      priorStart: null,
      priorEnd: null,
      group: null,
      dimension: null,
    });
  });
});
