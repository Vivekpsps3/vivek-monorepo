import { HttpRequest } from '@angular/common/http';
import { fakeAsync, tick } from '@angular/core/testing';
import { NEVER } from 'rxjs';
import { SILENT_ERROR_TOAST } from '@vivek/ui';
import { requestPolicyInterceptor } from './request-policy.interceptor';

describe('Suite request policy', () => {
  it('bounds a stalled save and lets the owning screen show its retained draft', fakeAsync(() => {
    let failed = false;
    let cancelled = false;
    const subscription = requestPolicyInterceptor(new HttpRequest('PATCH', '/media/api/entries/7', {}), request => {
      expect(request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
      return NEVER;
    });
    const pending = subscription.subscribe({ error: () => failed = true });
    pending.add(() => cancelled = true);
    tick(11_999);
    expect(failed).toBeFalse();
    tick(1);
    expect(failed).toBeTrue();
    expect(cancelled).toBeTrue();
  }));
});
