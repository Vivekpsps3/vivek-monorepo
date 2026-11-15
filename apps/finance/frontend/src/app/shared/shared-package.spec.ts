import { fakeAsync,tick } from '@angular/core/testing';
import { ConfirmService,ToastService } from '@vivek/ui';

describe('shared UI package helpers', () => {
  const storageKey = 'test-theme-preference';
  let previousTheme: string | null;
  let previousColorScheme: string;

  beforeEach(() => {
    previousTheme = document.documentElement.getAttribute('data-theme');
    previousColorScheme = document.documentElement.style.colorScheme;
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    localStorage.removeItem(storageKey);
  });

  afterEach(() => {
    if (previousTheme === null) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', previousTheme);
    document.documentElement.style.colorScheme = previousColorScheme;
    localStorage.removeItem(storageKey);
  });

  it('settles the replaced confirmation as cancelled', async () => {
    const service = new ConfirmService();
    const previous = service.ask('First', 'First question');
    const current = service.ask('Second', 'Second question');

    await expectAsync(previous).toBeResolvedTo(false);
    service.close(true);
    await expectAsync(current).toBeResolvedTo(true);
  });

  it('still auto-dismisses a success toast that offers Undo', fakeAsync(() => {
    const service = new ToastService();
    const visible: string[][] = [];
    service.toasts$.subscribe(value => visible.push(value.map(toast => toast.message)));
    service.success('Holding deleted', () => undefined);
    tick(7999);
    expect(visible.at(-1)).toEqual(['Holding deleted']);
    tick(1);
    expect(visible.at(-1)).toEqual([]);
  }));

});
