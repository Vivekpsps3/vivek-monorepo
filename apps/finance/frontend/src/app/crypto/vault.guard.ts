import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { from, map, of, switchMap } from 'rxjs';
import { authNavigation } from '@vivek/ui';
import { SESSION_CONTEXT } from '@vivek/ui';
import { VaultService } from './vault.service';

/**
 * Requires an authenticated session and an unlocked vault.
 * - no vault -> /vault/setup?next=<attempted url>
 * - vault locked -> /vault/unlock?next=<attempted url>
 * The unlock/setup screens return the user to `next` afterwards (F5).
 */
export const vaultGuard: CanActivateFn = (_route, state) => {
  const auth = inject(SESSION_CONTEXT);
  const vault = inject(VaultService);
  const router = inject(Router);

  return auth.loadSession().pipe(
    switchMap(user => {
      if (!user) {
        authNavigation.goToLogin();
        return of(false);
      }
      return from(vault.refreshStatus()).pipe(
        map(status => {
          if (!status.exists) return router.createUrlTree(['/finance/vault/setup'], { queryParams: { next: state.url } });
          if (!vault.isUnlocked) return router.createUrlTree(['/finance/vault/unlock'], { queryParams: { next: state.url } });
          return true;
        })
      );
    })
  );
};
