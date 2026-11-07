import { TestBed } from '@angular/core/testing';
import { FinanceGuideService } from './finance-guide.service';

describe('FinanceGuideService (F6)', () => {
  it('starts false, requestFirstSteps makes it true, and clear resets it', () => {
    const service = TestBed.inject(FinanceGuideService);
    expect(service.firstStepsRequested()).toBe(false);
    service.requestFirstSteps();
    expect(service.firstStepsRequested()).toBe(true);
    service.clear();
    expect(service.firstStepsRequested()).toBe(false);
  });
});
