import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { TimeoutError, catchError, throwError, timeout } from 'rxjs';
import { SILENT_ERROR_TOAST } from '@vivek/ui';

/** Domain screens own their inline errors; all requests have a bounded wait. */
export const requestPolicyInterceptor: HttpInterceptorFn = (request, next) => {
  const localError = request.url.startsWith('/media/api/') || request.url.startsWith('/travel/api/');
  const policy = localError
    ? request.clone({ context: request.context.set(SILENT_ERROR_TOAST, true) })
    : request;
  const deadline = request.url.includes('/calendar/refresh') ? 30_000 : 12_000;
  return next(policy).pipe(timeout(deadline), catchError(error => throwError(() => error instanceof TimeoutError
    ? new HttpErrorResponse({ status: 504, statusText: 'Request timed out', url: request.url, error: {
      code: 'timeout', message: 'This request timed out. Your unsaved changes are still here. Try again.',
    } })
    : error)));
};
