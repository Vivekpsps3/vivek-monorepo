import { fakeAsync,tick } from '@angular/core/testing';
import { ToastPayload,ToastService } from './toast.service';

describe('Suite toast recovery', () => {

  it('pauses the remaining lifetime while a user interacts with the notices', fakeAsync(() => {
    const service = new ToastService();
    let shown: ToastPayload[] = [];
    service.toasts$.subscribe(value => shown = value);
    service.success('Saved');
    tick(4000);
    service.pause();
    tick(60_000);
    expect(shown.length).toBe(1);
    service.resume();
    tick(999);
    expect(shown.length).toBe(1);
    tick(1);
    expect(shown.length).toBe(0);
  }));
});
