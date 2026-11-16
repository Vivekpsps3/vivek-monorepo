import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { todayIsoDate } from '@vivek/browser';
import { VAULT_PRESENCE } from '../../../../finance/frontend/src/public-api';
import { SessionService } from '../platform/session.service';
import { QuickAddComponent } from './quick-add.component';

describe('Quick add uses the existing manual editor', () => {
  afterEach(() => localStorage.removeItem(VAULT_PRESENCE));
  it('preserves browser today through unlocked, locked and setup routes', () => {
    TestBed.configureTestingModule({providers: [provideRouter([]), {provide: SessionService, useValue: {currentUser: {id: 1}}}]});
    const fixture = TestBed.createComponent(QuickAddComponent);
    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    localStorage.removeItem(VAULT_PRESENCE);
    const next = `/finance/spending?t=activity&date=${todayIsoDate()}&add=1`;
    expect(router.serializeUrl(component.transactionHref())).toBe(next);
    localStorage.setItem(VAULT_PRESENCE, '1');
    const locked = component.transactionHref();
    expect(locked.queryParams['next']).toBe(next);
    expect(router.serializeUrl(locked).split('?')[0]).toBe('/finance/vault/unlock');
    fixture.componentRef.setInput('locked', false);
    expect(router.serializeUrl(component.transactionHref())).toBe(next);
  });
});
