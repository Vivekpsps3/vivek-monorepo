import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { VaultService } from './app/crypto/vault.service';
import { financeVaultExists, loadFinanceBudgetKept } from './public-api';

describe('loadFinanceBudgetKept', () => {
  const injector = { get: () => { throw new Error('unread'); } } as unknown as Injector;
  const signal = new AbortController().signal;

  it('throws a bad today, weeks, or deadline as a synchronous RangeError', () => {
    expect(() => loadFinanceBudgetKept(injector, signal, { today: 'not-a-date', weeks: 1 })).toThrowError(RangeError);
    expect(() => loadFinanceBudgetKept(injector, signal, { today: '2026-10-14', weeks: 1.5 })).toThrowError(RangeError);
    expect(() => loadFinanceBudgetKept(injector, signal, { today: '2026-10-14', weeks: 1, deadlineMs: Number.NaN }))
      .toThrowError(RangeError);
  });
});

describe('financeVaultExists', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function read(refreshStatus: () => Promise<{ exists?: boolean; wrapped_dek_b64?: string }>): Promise<boolean | null> {
    TestBed.configureTestingModule({
      providers: [{ provide: VaultService, useValue: { refreshStatus } }],
    });
    return financeVaultExists(TestBed.inject(Injector));
  }

  it('returns whether a vault exists and drops wrap material', async () => {
    const present = await read(async () => ({ exists: true, wrapped_dek_b64: 'synthetic-wrap' }));
    expect(present).toBeTrue();
    TestBed.resetTestingModule();
    expect(await read(async () => ({ exists: false, wrapped_dek_b64: 'synthetic-wrap' }))).toBeFalse();
    TestBed.resetTestingModule();
    expect(await read(async () => ({ wrapped_dek_b64: 'synthetic-wrap' }))).toBeFalse();
    TestBed.resetTestingModule();
    expect(await read(async () => { throw new Error('status failed'); })).toBeNull();
  });
});
