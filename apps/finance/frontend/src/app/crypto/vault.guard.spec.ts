import { TestBed } from '@angular/core/testing';
import { Router, type ActivatedRouteSnapshot, type RouterStateSnapshot, type UrlTree } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { SESSION_CONTEXT, type SessionPort } from '@vivek/ui';
import { VaultService } from './vault.service';
import { vaultGuard } from './vault.guard';

describe('vaultGuard (F5)', () => {
  const user = { id: 7, username: 'vivek' } as SessionPort['currentUser'];
  let vault: jasmine.SpyObj<VaultService>;
  let trees: Array<{ commands: unknown; extras: unknown }>;

  function setup(status: { exists: boolean }, unlocked: boolean): void {
    vault = jasmine.createSpyObj<VaultService>('VaultService', ['refreshStatus']);
    vault.refreshStatus.and.resolveTo(status as never);
    Object.defineProperty(vault, 'isUnlocked', { get: () => unlocked });
    trees = [];
    const auth: SessionPort = {
      user$: new BehaviorSubject(user),
      currentUser: user,
      csrfToken: null,
      revision: 0,
      cleared$: new Subject<void>(),
      isAdmin: () => false,
      loadSession: () => of(user),
      clearLocalSession: () => Promise.resolve(),
      logout: () => undefined,
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: SESSION_CONTEXT, useValue: auth },
        { provide: VaultService, useValue: vault },
        {
          provide: Router,
          useValue: {
            createUrlTree: (commands: unknown, extras: unknown) => {
              const tree = { commands, extras };
              trees.push(tree);
              return tree as unknown as UrlTree;
            },
          },
        },
      ],
    });
  }

  async function run(url: string): Promise<unknown> {
    const guard = TestBed.runInInjectionContext(() =>
      vaultGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );
    return new Promise(resolve => {
      (guard as import('rxjs').Observable<unknown>).subscribe(resolve);
    });
  }

  it('locked vault redirects to unlock with next=state.url', async () => {
    setup({ exists: true }, false);
    await run('/finance/spending?t=calendar');
    expect(trees).toEqual([
      { commands: ['/finance/vault/unlock'], extras: { queryParams: { next: '/finance/spending?t=calendar' } } },
    ]);
  });

  it('missing vault redirects to setup with next', async () => {
    setup({ exists: false }, false);
    await run('/finance/have');
    expect(trees).toEqual([
      { commands: ['/finance/vault/setup'], extras: { queryParams: { next: '/finance/have' } } },
    ]);
  });

  it('unlocked passes', async () => {
    setup({ exists: true }, true);
    await expectAsync(run('/finance/have')).toBeResolvedTo(true);
    expect(trees).toEqual([]);
  });
});
