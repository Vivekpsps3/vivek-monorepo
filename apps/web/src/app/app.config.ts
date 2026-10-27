import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideClientHydration } from '@angular/platform-browser';
import { routes } from './routes';
import { SESSION_CONTEXT, UPDATE_NOTICE, httpErrorInterceptor } from '@vivek/ui';
import { ReleaseFreshnessService } from './platform/release-freshness.service';
import { SessionService } from './platform/session.service';
import { authInterceptor } from './platform/auth/auth.interceptor';
import { requestPolicyInterceptor } from './platform/request-policy.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({
      anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled',
    })),
    { provide: SESSION_CONTEXT, useExisting: SessionService },
    { provide: UPDATE_NOTICE, useExisting: ReleaseFreshnessService },
    provideHttpClient(withFetch(), withInterceptors([requestPolicyInterceptor, authInterceptor, httpErrorInterceptor])),
    provideClientHydration(),
  ],
};
