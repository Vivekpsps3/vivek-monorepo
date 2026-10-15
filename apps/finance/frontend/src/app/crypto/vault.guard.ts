import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { from, map, of, switchMap } from 'rxjs';
import { authNavigation } from '../auth/after-auth';
import { AuthService } from '../auth/auth.service';
import { VaultService } from './vault.service';

/**
 * Requires an authenticated session and an unlocked vault.
 * - no vault -> /vault/setup
 * - vault locked -> /vault/unlock
 */
export const vaultGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
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
          if (!status.exists) return router.createUrlTree(['/vault/setup']);
          if (!vault.isUnlocked) return router.createUrlTree(['/vault/unlock']);
          return true;
        })
      );
    })
  );
};
