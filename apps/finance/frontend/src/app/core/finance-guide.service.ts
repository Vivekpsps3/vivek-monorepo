import { Injectable, signal } from '@angular/core';

/**
 * F6 §4.6: the Guide's "Show first steps on Home" hand-off. In-memory
 * only (no URL param, per NAV-03); lasts until a page reload.
 */
@Injectable({ providedIn: 'root' })
export class FinanceGuideService {
  private readonly requested = signal(false);
  readonly firstStepsRequested = this.requested.asReadonly();

  requestFirstSteps(): void {
    this.requested.set(true);
  }

  clear(): void {
    this.requested.set(false);
  }
}
