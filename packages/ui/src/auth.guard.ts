import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { authNavigation } from './after-auth';
import { SESSION_CONTEXT } from './session-context';

export const authGuard: CanActivateFn = () => {
  const auth = inject(SESSION_CONTEXT);
  return auth.loadSession().pipe(map(user => {
    if (user) return true;
    authNavigation.goToLogin();
    return false;
  }));
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(SESSION_CONTEXT);
  const router = inject(Router);
  return auth.loadSession().pipe(
    map(user => (user?.role === 'admin' ? true : router.createUrlTree(['/'])))
  );
};
