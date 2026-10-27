import { fakeAsync, tick } from '@angular/core/testing';
import { ToastPayload, ToastService } from './toast.service';

describe('Suite toast recovery', () => {
  it('keeps an actionable error while evicting the oldest transient notice', fakeAsync(() => {
    const service = new ToastService();
    let shown: ToastPayload[] = [];
    service.toasts$.subscribe(value => shown = value);
    service.error('Retry this save', { label: 'Retry', run: () => undefined });
    service.success('First');
    service.success('Second');
    service.success('Third');
    expect(shown.map(toast => toast.message)).toEqual(['Retry this save', 'Second', 'Third']);
    tick(60_000);
    expect(shown.map(toast => toast.message)).toEqual(['Retry this save']);
    service.dismiss(shown[0].id);
    expect(shown).toEqual([]);
  }));
  it('keeps the cap even when every notice is persistent', () => {
    const service = new ToastService();
    let shown: ToastPayload[] = [];
    service.toasts$.subscribe(value => shown = value);
    for (const message of ['One', 'Two', 'Three', 'Four']) {
      service.error(message, { label: 'Retry', run: () => undefined });
    }
    expect(shown.map(toast => toast.message)).toEqual(['Two', 'Three', 'Four']);
  });
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
