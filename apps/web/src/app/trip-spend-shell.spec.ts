import { Component, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';
import { FinanceTripSpendRegistry } from '@vivek/ui';
import { VAULT_PRESENCE, VAULT_SYNC_CHANNEL, startFinanceTripSpend, tripSpendLoad } from '../../../finance/frontend/src/public-api';
import { PrivateLayoutComponent } from './private-layout.component';
import { SessionService } from './platform/session.service';

@Component({ standalone: true, template: '<main><h1>Trip</h1></main>' })
class TripPageComponent {}

describe('Private shell trip spend', () => {
  const originalLoad = tripSpendLoad.module;

  afterEach(() => {
    tripSpendLoad.module = originalLoad;
    localStorage.removeItem(VAULT_PRESENCE);
  });

  it('does not import the ledger while Finance is locked', () => {
    const load = jasmine.createSpy('load').and.resolveTo({ attachFinanceTripSpend: () => () => undefined });
    tripSpendLoad.module = load;
    TestBed.configureTestingModule({});
    localStorage.removeItem(VAULT_PRESENCE);
    const handle = startFinanceTripSpend(TestBed.inject(Injector));
    handle.sync();
    expect(load).not.toHaveBeenCalled();
    handle.stop();
  });

  it('starts one producer from Travel and drops a held load on lock or owner change', async () => {
    const messages: unknown[] = [];
    const channel = new BroadcastChannel(VAULT_SYNC_CHANNEL);
    channel.onmessage = event => messages.push(event.data);
    const storageEvents: string[] = [];
    const onStorage = (event: StorageEvent) => storageEvents.push(String(event.key));
    window.addEventListener('storage', onStorage);
    let release!: () => void;
    let attaches = 0;
    const loads: string[] = [];
    tripSpendLoad.module = () => {
      loads.push('producer');
      return new Promise(resolve => {
        release = () => resolve({
          attachFinanceTripSpend: () => {
            attaches += 1;
            const unregister = TestBed.inject(FinanceTripSpendRegistry).register(() => [{ currency: 'USD', cents: 500, count: 1 }]);
            return () => {
              attaches -= 1;
              unregister();
            };
          },
        });
      });
    };
    localStorage.setItem(VAULT_PRESENCE, '4');
    const users = new BehaviorSubject({ id: 4, display_name: 'Ada' });
    const session = { currentUser: users.value, user$: users.asObservable(), isAdmin: () => false, logout: () => undefined };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '', component: PrivateLayoutComponent, children: [{ path: 'travel', component: TripPageComponent }] }]),
        { provide: SessionService, useValue: session },
      ],
    });
    const harness = await RouterTestingHarness.create('/travel');
    expect(loads).toEqual(['producer']);
    harness.detectChanges();
    await harness.navigateByUrl('/travel');
    expect(loads).toEqual(['producer']);
    expect(attaches).toBe(0);

    localStorage.removeItem(VAULT_PRESENCE);
    session.currentUser = { id: 8, display_name: 'Bea' };
    users.next(session.currentUser);
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(attaches).toBe(0);
    expect(TestBed.inject(FinanceTripSpendRegistry).lookup()).toBeNull();
    expect(messages).toEqual([]);
    expect(storageEvents).toEqual([]);
    channel.close();
    window.removeEventListener('storage', onStorage);
  });
});
