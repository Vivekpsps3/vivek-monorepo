import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SESSION_CONTEXT, ToastService } from '@vivek/ui';
import { BehaviorSubject } from 'rxjs';
import { loadMarketRefreshCoordinatorService } from '../../../../finance/frontend/src/public-api';
import { FinanceService,VaultService } from '../../../../finance/frontend/src/testing';
import { FinanceSectionComponent } from './finance-section.component';

describe('FinanceSectionComponent', () => {
  async function setup(unlocked: boolean) {
    const MarketRefreshCoordinatorService = await loadMarketRefreshCoordinatorService();
    const unlocked$ = new BehaviorSubject(unlocked);
    const users = new BehaviorSubject<{ id: number } | null>({ id: 1 });
    const session = { get currentUser() { return users.value; }, user$: users, revision: 1 };
    const change = jasmine.createSpy('changePassphrase').and.resolveTo();
    const vault = {
      changePassphrase: change,
      whenReady: () => Promise.resolve(),
      isUnlocked: unlocked,
      unlocked$,
      lock: jasmine.createSpy('lock').and.callFake(() => {
        vault.isUnlocked = false;
        unlocked$.next(false);
      }),
    };
    TestBed.configureTestingModule({
      imports: [FinanceSectionComponent],
      providers: [
        provideRouter([]),
        { provide: SESSION_CONTEXT, useValue: session },
        { provide: VaultService, useValue: vault },
        { provide: FinanceService, useValue: { clearSessionState: () => undefined } },
        { provide: MarketRefreshCoordinatorService, useValue: { broadcastLock: () => undefined, endSession: () => undefined } },
        // The F5 lock toast's auto-dismiss timer would hold whenStable open.
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
      ],
    });
    const fixture = TestBed.createComponent(FinanceSectionComponent);
    fixture.detectChanges();
    return { fixture, lock: vault.lock, change, users, session };
  }

  it('shows the locked state and no lock button while the vault is locked', async () => {
    const { fixture } = await setup(false);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Finance is locked.');
    expect(text).not.toContain('Lock Finance');
    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toContain('/finance/vault/unlock');
    expect(link.getAttribute('href')).toContain('next=%2Fsettings%2Ffinance');
  });

  it('locks the vault from Lock Finance and then shows only the locked state', async () => {
    const { fixture, lock } = await setup(true);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Lock Finance');
    fixture.nativeElement.querySelector('button').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(lock).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Finance is locked.');
    expect(fixture.nativeElement.textContent).not.toContain('Lock Finance');
  });

  it('Lock Finance locks without navigating', async () => {
    const { fixture } = await setup(true);
    await fixture.whenStable();
    const { FinanceLockService } = await import('../../../../finance/frontend/src/public-api');
    const service = TestBed.inject(FinanceLockService);
    const lockNow = spyOn(service, 'lockNow').and.resolveTo();
    fixture.componentInstance.lock();
    expect(lockNow).toHaveBeenCalledWith({ navigate: false });
  });

  it('auto-lock radio writes the setting', async () => {
    const { fixture } = await setup(true);
    await fixture.whenStable();
    const { FinanceLockService } = await import('../../../../finance/frontend/src/public-api');
    const service = TestBed.inject(FinanceLockService);
    const setAutoLock = spyOn(service, 'setAutoLock');
    fixture.componentInstance.setAutoLock(5);
    expect(setAutoLock).toHaveBeenCalledWith(5);
    fixture.componentInstance.setAutoLock('off');
    expect(setAutoLock).toHaveBeenCalledWith('off');
    expect(localStorage.getItem('finance-auto-lock')).toBeNull();
  });

  it('validates current, new and confirmation in order with linked errors and field focus', async () => {
    const { fixture } = await setup(true);
    await fixture.whenStable(); fixture.detectChanges();
    const component = fixture.componentInstance;
    for (const [field, message] of [
      ['current', 'Enter your current vault passphrase.'],
      ['next', 'Use a new passphrase of 12–1,024 characters.'],
      ['confirm', 'New passphrases do not match.'],
    ] as const) {
      await component.changePassphrase(); fixture.detectChanges();
      const input = fixture.nativeElement.querySelector(`#passphrase-${field}`) as HTMLInputElement;
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toContain('passphrase-error');
      expect(document.activeElement).toBe(input);
      expect(fixture.nativeElement.querySelector('#passphrase-error').textContent).toContain(message);
      if (field === 'current') component.changeCurrent = 'current synthetic passphrase';
      if (field === 'next') component.changeNext = 'next synthetic passphrase';
    }
  });

  it('retains the same-session draft on conflict and focuses the linked alert before a successful retry', async () => {
    const { fixture, change } = await setup(true); await fixture.whenStable(); fixture.detectChanges();
    const component = fixture.componentInstance;
    component.changeCurrent = 'current synthetic passphrase'; component.changeNext = 'next synthetic passphrase'; component.changeConfirm = component.changeNext;
    change.and.rejectWith({ status: 409 });
    await component.changePassphrase(); fixture.detectChanges();
    expect(component.changeCurrent).toBe('current synthetic passphrase'); expect(component.changeNext).toBe(component.changeConfirm);
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#passphrase-error'));
    expect(component.changeError).toContain('Retry'); expect(component.changeBusy).toBeFalse();
    change.and.resolveTo();
    await component.changePassphrase(); fixture.detectChanges();
    expect(component.changeCurrent + component.changeNext + component.changeConfirm).toBe('');
    expect(TestBed.inject(ToastService).success).toHaveBeenCalled();
  });

  it('enables and focuses the linked current field after async wrong-passphrase verification', async () => {
    const { fixture, change } = await setup(true); await fixture.whenStable(); fixture.detectChanges();
    const component = fixture.componentInstance;
    component.changeCurrent = 'wrong synthetic passphrase'; component.changeNext = 'next synthetic passphrase'; component.changeConfirm = component.changeNext;
    change.and.rejectWith(new Error('Current vault passphrase could not be verified.'));
    await component.changePassphrase(); fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#passphrase-current') as HTMLInputElement;
    expect(input.disabled).toBeFalse(); expect(input.getAttribute('aria-describedby')).toContain('passphrase-error');
    expect(document.activeElement).toBe(input);
  });

  for (const interruption of ['lock', 'owner change', 'same-owner revision', 'destroy']) {
    it(`clears passphrases immediately during held change after ${interruption} and ignores its late success`, async () => {
      const { fixture, change, lock, users, session } = await setup(true); await fixture.whenStable(); fixture.detectChanges();
      let release!: () => void; change.and.returnValue(new Promise<void>(resolve => { release = resolve; }));
      const component = fixture.componentInstance;
      component.changeCurrent = 'current synthetic passphrase'; component.changeNext = 'next synthetic passphrase'; component.changeConfirm = component.changeNext;
      const pending = component.changePassphrase();
      const signal = change.calls.mostRecent().args[2] as AbortSignal;
      if (interruption === 'lock') lock();
      if (interruption === 'owner change') users.next({ id: 2 });
      if (interruption === 'same-owner revision') { session.revision++; users.next({ id: 1 }); }
      if (interruption === 'destroy') fixture.destroy();
      expect(component.changeCurrent + component.changeNext + component.changeConfirm).toBe(''); expect(signal.aborted).toBeTrue();
      release(); await pending;
      expect(component.changeError).toBe(''); expect(component.changeBusy).toBeFalse();
      expect(TestBed.inject(ToastService).success).not.toHaveBeenCalled();
    });
  }

});
