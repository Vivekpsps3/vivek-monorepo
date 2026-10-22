import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService, httpErrorMessage } from '@vivek/ui';

export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const silent = req.url.includes('/health');
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const detail =
        typeof err.error?.detail === 'string'
          ? err.error.detail
          : typeof err.error?.error === 'string'
            ? err.error.error
            : null;
      if (!silent) {
        toast.error(httpErrorMessage(detail));
      }
      return throwError(() => err);
    })
  );
};