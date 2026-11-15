import { ComponentFixture,TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ToastService } from '@vivek/ui';
import { BehaviorSubject } from 'rxjs';
import { loadMarketRefreshCoordinatorService } from '../../../../finance/frontend/src/public-api';
import { FinanceService,VaultService } from '../../../../finance/frontend/src/testing';
import { FinanceSectionComponent } from './finance-section.component';

describe('FinanceSectionComponent', () => {
  async function setup(unlocked: boolean): Promise<{ fixture: ComponentFixture<FinanceSectionComponent>; lock: jasmine.Spy }> {
    const MarketRefreshCoordinatorService = await loadMarketRefreshCoordinatorService();
    const unlocked$ = new BehaviorSubject(unlocked);
    const vault = {
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
        { provide: VaultService, useValue: vault },
        { provide: FinanceService, useValue: { clearSessionState: () => undefined } },
        { provide: MarketRefreshCoordinatorService, useValue: { broadcastLock: () => undefined, endSession: () => undefined } },
        // The F5 lock toast's auto-dismiss timer would hold whenStable open.
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
      ],
    });
    const fixture = TestBed.createComponent(FinanceSectionComponent);
    fixture.detectChanges();
    return { fixture, lock: vault.lock };
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
});
