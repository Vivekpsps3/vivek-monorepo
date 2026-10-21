import { APP_BASE_HREF, PathLocationStrategy, PlatformLocation } from '@angular/common';
import { Inject, Injectable, Optional } from '@angular/core';

/**
 * Shared sign-in lives at /auth/login, and the hub (including admin) lives at /hub.
 * Both stay outside the /finance/ base href. Other routes still get that prefix.
 */
@Injectable()
export class SuiteLocationStrategy extends PathLocationStrategy {
  constructor(
    platformLocation: PlatformLocation,
    @Optional() @Inject(APP_BASE_HREF) href: string | null,
  ) {
    super(platformLocation, href ?? undefined);
  }

  override prepareExternalUrl(internal: string): string {
    const path = internal.split(/[?#]/)[0];
    if (path === '/auth' || path.startsWith('/auth/') || path === '/hub' || path.startsWith('/hub/')) {
      return internal;
    }
    return super.prepareExternalUrl(internal);
  }
}
