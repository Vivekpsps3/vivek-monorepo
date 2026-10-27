import { HttpContext, HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { HTTP_ERROR_FALLBACK } from './toast-contract';
import { ToastService } from './toast.service';

/** Callers that already show the failure set this so the interceptor stays quiet. */
export const SILENT_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

export function silentErrorToast(): HttpContext {
  return new HttpContext().set(SILENT_ERROR_TOAST, true);
}

export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const silent = req.url.includes('/health') || req.context.get(SILENT_ERROR_TOAST);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (!silent && err.status !== 422) {
        toast.error(HTTP_ERROR_FALLBACK);
      }
      return throwError(() => err);
    })
  );
};
