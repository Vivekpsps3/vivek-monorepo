import { HttpContext, HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { HTTP_ERROR_FALLBACK, ToastService } from '@vivek/ui';
import { firstValueFrom, throwError } from 'rxjs';
import { httpErrorInterceptor, SILENT_ERROR_TOAST } from './http-error.interceptor';

describe('httpErrorInterceptor', () => {
  let toast: jasmine.SpyObj<ToastService>;

  beforeEach(() => {
    toast = jasmine.createSpyObj('ToastService', ['error', 'success']);
    TestBed.configureTestingModule({
      providers: [{ provide: ToastService, useValue: toast }],
    });
  });

  function fail(url: string, status: number, detail: string, context?: HttpContext) {
    return TestBed.runInInjectionContext(() =>
      httpErrorInterceptor(
        new HttpRequest('POST', url, {}, context ? { context } : undefined),
        () => throwError(() => new HttpErrorResponse({ status, error: { detail }, url })),
      ),
    );
  }

  it('toasts a fixed sentence and never the raw server text', async () => {
    await expectAsync(firstValueFrom(fail('/api/vault/records', 503, 'Synthetic save failed'))).toBeRejected();
    expect(toast.error).toHaveBeenCalledOnceWith(HTTP_ERROR_FALLBACK);
    const text = toast.error.calls.allArgs().flat().join(' ');
    expect(text).not.toContain('Synthetic save failed');
  });

  it('stays quiet for 422 responses and for callers that already handle the error', async () => {
    const silent = new HttpContext().set(SILENT_ERROR_TOAST, true);
    await expectAsync(firstValueFrom(fail('/api/vault/records', 422, 'Invalid amount'))).toBeRejected();
    await expectAsync(firstValueFrom(fail('/api/vault/records', 500, 'Synthetic save failed', silent))).toBeRejected();
    await expectAsync(firstValueFrom(fail('/health', 500, 'down'))).toBeRejected();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
