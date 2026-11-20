import { isHealthEntryId, returnPath, vaultSetupHref, vaultUnlockHref } from './return-context';

describe('return context', () => {
  it('carries known date, collection and pagination coordinates', () => {
    for (const path of [
      '/finance/spending?t=calendar&month=2026-11&date=2026-11-18',
      '/pixels?year=2024&day=2024-02-29',
      '/pixels/day?date=2024-02-29&from=year&year=2024',
      '/pixels/day?date=2024-02-29&from=life&year=2024&span=2024-02-29',
      '/pixels/life?span=2024-02-29',
      '/media/library?kind=artist&sort=title&offset=24',
      '/media/calendar?month=2026-11',
      '/travel/calendar?month=2026-11',
      '/settings/calendars',
      '/town/clinic?entry=hlt_SyntheticWeightEntryAB',
      '/town/gym?entry=hlt_SyntheticLiftEntryABCD',
      '/finance/spending?month=all',
      '/finance/pay?month=2026-10&history=1&year=custom&start=2024-02-29&end=2024-12-31',
      '/finance/bills?kind=subscription&status=active&order=latest',
      '/finance/imports?start=bank',
      '/finance/imports?start=fidelity',
      '/finance/planning/retirement',
      '/finance/spending?date=2024-02-29&pixelsDay=2024-02-29',
    ]) {
      expect(returnPath(path)).withContext(path).toBe(path);
    }
  });

  it('drops private values, invalid dates, duplicate coordinates and fragments', () => {
    expect(returnPath('/finance/spending?t=calendar&date=2026-02-31&name=private&account=private&edit=42#private'))
      .toBe('/finance/spending?t=calendar');
    expect(returnPath('/finance/spending?date=2024-02-29&pixelsDay=2024-02-31&trip=123&account=private&edit=42'))
      .toBe('/finance/spending?date=2024-02-29');
    expect(returnPath('/finance/pay?month=invalid&history=1&year=0000&start=2024-02-30&end=2024-12-31&name=private'))
      .toBe('/finance/pay?history=1&end=2024-12-31');
    expect(returnPath('/finance/imports?start=bank&reattach=4&reattach_file=statement.csv&account=private'))
      .toBe('/finance/imports?start=bank');
    expect(returnPath('/finance/imports?start=other')).toBe('/finance/imports');
    expect(returnPath('/finance/bills?kind=bill&kind=subscription&order=private&status=inactive&edit=42#private'))
      .toBe('/finance/bills?status=inactive');
    expect(returnPath('/media/library?kind=artist&kind=book&q=private&tag=private&offset=24&expanded=42'))
      .toBe('/media/library?offset=24');
    expect(returnPath('/media/library?kind=book&face=text&status=in_progress&sort=title&q=private'))
      .toBe('/media/library?kind=book&status=in_progress&sort=title&face=text');
    expect(returnPath('/media/library?kind=book&face=poster')).toBe('/media/library?kind=book');
    expect(returnPath('/media/library?kind=book&face=text&face=spine')).toBe('/media/library?kind=book');
    expect(returnPath('/town/clinic?entry=hlt_short&kg=80')).toBe('/town/clinic');
    expect(returnPath('/town/clinic?entry=hlt_SyntheticWeightEntryAB&entry=hlt_SyntheticLiftEntryABCD')).toBe('/town/clinic');
    expect(returnPath('/town/gym?entry=80&weight=176.4')).toBe('/town/gym');
  });

  it('rejects external, unknown, and recursive authentication destinations', () => {
    for (const path of [
      '//example.test', '/finance/%2F%2Fexample.test', '/finance/vault/unlock?next=/pixels',
      '/finance/vault/setup', '/auth/login', '/finance/not-an-app-route',
      '/travel/trips', '/settings/connectors',
    ]) {
      expect(vaultUnlockHref(path)).withContext(path).toBe('/finance/vault/unlock');
    }
    const clinic = '/town/clinic?entry=hlt_SyntheticWeightEntryAB';
    expect(vaultUnlockHref(clinic)).toBe('/finance/vault/unlock?next=' + encodeURIComponent(clinic));
    expect(vaultSetupHref(clinic)).toBe('/finance/vault/setup?next=' + encodeURIComponent(clinic));
    expect(vaultSetupHref('/town/clinic?kg=80')).toBe('/finance/vault/setup?next=' + encodeURIComponent('/town/clinic'));
  });

  it('accepts only digit-free 22-character health entry ids', () => {
    for (const id of ['hlt_SyntheticWeightEntryAB', 'hlt_SyntheticLiftEntryABCD', 'hlt_CorruptRowNoticeABCDEF']) {
      expect(id.slice(4)).withContext(id).toHaveSize(22);
      expect(id).withContext(id).not.toMatch(/\d/);
      expect(isHealthEntryId(id)).withContext(id).toBeTrue();
    }
    expect(isHealthEntryId('hlt_short')).toBeFalse();
    expect(isHealthEntryId('80')).toBeFalse();
    expect(isHealthEntryId('hlt_SyntheticWeightEntryAB1')).toBeFalse();
  });
});
