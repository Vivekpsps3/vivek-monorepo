import { convertToParamMap } from '@angular/router';
import { normalizeSpendingHubRoute } from './spending-hub.component';

describe('SpendingHub route compatibility', () => {
  it('opens Activity by default', () => {
    expect(normalizeSpendingHubRoute(convertToParamMap({}))).toEqual({
      tab: 'activity',
      activityView: 'all',
      receiptsOpen: false,
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
      receiptsOpen: false,
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
    expect(state.receiptsOpen).toBeFalse();
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

  it('keeps pay and spend links on Activity with the matching type', () => {
    expect(normalizeSpendingHubRoute(convertToParamMap({ t: 'pay' }))).toEqual({
      tab: 'activity',
      activityView: 'income',
      receiptsOpen: false,
      queryParams: {
        t: 'activity',
        v: 'income',
        review: null,
        periodStart: null,
        periodEnd: null,
        priorStart: null,
        priorEnd: null,
        group: null,
        dimension: null,
      },
    });
    expect(normalizeSpendingHubRoute(convertToParamMap({ t: 'spend' })).activityView).toBe('spending');
    expect(normalizeSpendingHubRoute(convertToParamMap({ t: 'calendar', v: 'income' }))).toEqual({
      tab: 'calendar',
      activityView: 'income',
      receiptsOpen: false,
      queryParams: null,
    });
  });

  it('rewrites an Imports link to Activity with receipts open and leaves the import action in place', () => {
    const state = normalizeSpendingHubRoute(convertToParamMap({
      t: 'imports',
      add: '1',
      reattach: '4',
      reattach_file: 'statement.csv',
      v: 'spending',
    }));

    expect(state).toEqual({
      tab: 'activity',
      activityView: 'spending',
      receiptsOpen: true,
      queryParams: {
        t: 'activity',
        receipts: '1',
        review: null,
        periodStart: null,
        periodEnd: null,
        priorStart: null,
        priorEnd: null,
        group: null,
        dimension: null,
      },
    });
    expect(normalizeSpendingHubRoute(convertToParamMap({ t: 'activity', receipts: '1' }))).toEqual({
      tab: 'activity',
      activityView: 'all',
      receiptsOpen: true,
      queryParams: null,
    });
  });
});
