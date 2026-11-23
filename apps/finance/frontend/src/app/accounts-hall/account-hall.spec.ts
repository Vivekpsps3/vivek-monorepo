import { projectAccountHall, type AccountHallRecord } from './account-hall';
import { projectAccountHall as publishedHall } from '../../public-api';
import type { NetWorth } from '../models/transaction.model';

describe('account hall projection', () => {
  const checking: AccountHallRecord = {
    kind: 'asset', id: 11, name: 'Harbor checking', category: 'checking', asOf: '2026-10-01', value: 1200,
  };
  const debt: AccountHallRecord = {
    kind: 'debt', id: 21, name: 'Harbor card balance', category: 'credit_card', asOf: '2026-10-11', value: 250,
  };
  const worth: NetWorth = {
    other_assets: 1200,
    portfolio: 300,
    liabilities: 250,
    total_assets: 1500,
    total: 1250,
    excluded_invalid_amounts: 0,
  };

  it('publishes the same projection the public entry exposes', () => {
    expect(publishedHall).toBe(projectAccountHall);
  });

  it('hides every digit until one drawer is unlocked', () => {
    const locked = projectAccountHall([checking, debt], worth, null);
    expect(locked.drawers.every(drawer => drawer.amount == null && !drawer.revealed)).toBeTrue();
    expect(locked.total).toBeNull();
    expect(locked.accounts).toBeNull();
    expect(locked.investments).toBeNull();
    expect(locked.debts).toBeNull();
    expect(locked.revealedKey).toBeNull();
  });

  it('reveals only the unlocked account and copies the published net worth', () => {
    const changed = { ...checking, value: 99999 };
    const view = projectAccountHall([changed, debt], worth, 'asset:11');
    expect(view.drawers[0].amount).toBe(99999);
    expect(view.drawers[1].amount).toBeNull();
    expect(view.drawers[1].revealed).toBeFalse();
    expect(view.total).toBe(1250);
    expect(view.accounts).toBe(1200);
    expect(view.investments).toBe(300);
    expect(view.debts).toBe(-250);
    expect(view.revealedKey).toBe('asset:11');
  });

  it('clears digits when the published net worth is gone', () => {
    const view = projectAccountHall([checking, debt], null, 'asset:11');
    expect(view.drawers.every(drawer => drawer.amount == null)).toBeTrue();
    expect(view.total).toBeNull();
    expect(view.revealedKey).toBeNull();
  });

  it('shows a debt as a reduction and withholds an amount that cannot be counted', () => {
    const broken: AccountHallRecord = { ...checking, id: 12, value: 1e16 };
    const view = projectAccountHall([debt, broken], worth, 'debt:21');
    expect(view.drawers[0].amount).toBe(-250);
    const hidden = projectAccountHall([broken], worth, 'asset:12');
    expect(hidden.drawers[0].amount).toBeNull();
    expect(hidden.drawers[0].problem).toBe('over-max');
    expect(hidden.total).toBe(1250);
  });
});
