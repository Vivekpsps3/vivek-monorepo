import { ConfirmService,type ConfirmState } from './confirm.service';

describe('ConfirmService confirmAction (K2)', () => {
  let service: ConfirmService;
  let state: ConfirmState | null;

  beforeEach(() => {
    service = new ConfirmService();
    state = null;
    service.state$.subscribe(value => (state = value));
  });

  it('cancel resolves false and never calls run', async () => {
    const run = jasmine.createSpy('run').and.resolveTo();
    const result = service.confirmAction({ title: 'Erase', message: 'Sure?', run });
    service.close(false);
    await expectAsync(result).toBeResolvedTo(false);
    expect(run).not.toHaveBeenCalled();
    expect(state).toBeNull();
  });

});
