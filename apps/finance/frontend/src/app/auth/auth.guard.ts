import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { authNavigation } from './after-auth';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.loadSession().pipe(map(user => {
    if (user) return true;
    authNavigation.goToLogin();
    return false;
  }));
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.loadSession().pipe(
    map(user => (user?.role === 'admin' ? true : router.createUrlTree(['/'])))
  );
};
