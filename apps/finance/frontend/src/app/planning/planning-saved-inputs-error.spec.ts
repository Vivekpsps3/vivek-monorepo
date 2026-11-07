import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { ConfirmService, ToastService, failureCopy } from '@vivek/ui';
import { FinanceService } from '../services/finance.service';
import { PlanningService } from '../services/planning.service';
import { DEFAULT_MC_ASSUMPTIONS, PlanningProfile } from '../models/planning.model';
import { PlanningComponent } from './planning.component';

/**
 * F23 regression tests: Planning saved-inputs load/save/delete errors render
 * inside the Saved inputs card (standard form-error pattern), announce via
 * role="alert", carry a non-colour warning cue, receive focus on failure,
 * and clear after a later successful save/delete.
 */
describe('PlanningComponent Saved inputs card errors (F23)', () => {
  let fixture: ComponentFixture<PlanningComponent>;
  let component: PlanningComponent;
  let planning: jasmine.SpyObj<PlanningService>;

  const profile: PlanningProfile = {
    id: 4,
    name: 'Probe profile',
    base_currency: 'USD',
    payload: structuredClone(DEFAULT_MC_ASSUMPTIONS),
    created_at: '',
    updated_at: '',
  };

  function savedInputsCard(): HTMLElement | null {
    const cards = fixture.nativeElement.querySelectorAll('ui-card');
    for (const card of Array.from(cards) as HTMLElement[]) {
      if (card.querySelector('.ui-card__title')?.textContent?.trim() === 'Saved inputs') return card;
    }
    return null;
  }

  function cardError(): HTMLElement | null {
    return savedInputsCard()?.querySelector('[data-error-summary]') ?? null;
  }

  async function settleFocus(): Promise<void> {
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 20));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    planning = jasmine.createSpyObj('PlanningService', [
      'createProfile', 'updateProfile', 'deleteProfile', 'createRun', 'getInputs',
      'getSpendingSuggestionContext', 'listProfiles',
    ]);
    planning.listProfiles.and.returnValue(of([]));
    planning.getInputs.and.returnValue(of({
      net_worth_total: 100_000, net_worth_portfolio: 40_000, avg_monthly_income: 5_000,
      recurring_annual_spending: 30_000, implied_annual_spending: 30_000,
      annual_fixed_expenses: 20_000, annual_subscriptions: 10_000,
    }) as never);
    planning.getSpendingSuggestionContext.and.returnValue(of({
      transactions: [], receipts: [], accounts: [],
    }) as never);
    planning.deleteProfile.and.returnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [PlanningComponent],
      providers: [
        provideRouter([]),
        { provide: PlanningService, useValue: planning },
        { provide: FinanceService, useValue: { dataChanges$: new Subject() } },
        { provide: ConfirmService, useValue: { ask: () => Promise.resolve(true) } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'info']) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PlanningComponent);
    fixture.componentRef.setInput('tool', 'simulation');
    component = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    fixture.destroy();
  });

  it('renders a failed save inside the Saved inputs card with an alert role, warning cue and focus', async () => {
    planning.createProfile.and.returnValue(throwError(() => ({ status: 503 })));
    component.savedInputName = 'Baseline';

    component.saveSavedInputs();
    await settleFocus();

    const error = cardError();
    expect(error).not.toBeNull();
    expect(error!.getAttribute('role')).toBe('alert');
    expect(error!.getAttribute('tabindex')).toBe('-1');
    expect(error!.textContent).toContain('⚠');
    expect(error!.textContent).toContain(failureCopy('save', 'these inputs'));
    expect(document.activeElement).toBe(error);
    // The page-level error stays empty: the failure belongs to the card.
    expect(component.error).toBeNull();
  });

  it('removes the card error from the DOM after a later successful save', async () => {
    planning.createProfile.and.returnValue(throwError(() => ({ status: 503 })));
    component.savedInputName = 'Baseline';
    component.saveSavedInputs();
    await settleFocus();
    expect(cardError()).not.toBeNull();

    planning.createProfile.and.returnValue(of(profile));
    component.saveSavedInputs();
    await settleFocus();

    expect(cardError()).toBeNull();
    expect(component.savedInputsError).toBeNull();
  });

  it('renders a failed delete in the card, focuses it, and a later successful save clears it', async () => {
    planning.deleteProfile.and.returnValue(throwError(() => ({ status: 503 })));
    component.profiles = [profile];
    component.selectedProfileId = profile.id;

    await component.deleteSelectedProfile();
    await settleFocus();

    const error = cardError();
    expect(error).not.toBeNull();
    expect(error!.textContent).toContain(failureCopy('delete', 'these saved inputs'));
    expect(document.activeElement).toBe(error);

    planning.createProfile.and.returnValue(of({ ...profile, id: 9 }));
    component.savedInputName = 'Replacement';
    component.selectedProfileId = null;
    component.saveSavedInputs();
    await settleFocus();

    expect(cardError()).toBeNull();
  });

  it('renders a saved-inputs load failure in the card without stealing focus', async () => {
    // Recreate with a failing listProfiles (the init load already happened).
    planning.listProfiles.and.returnValue(throwError(() => ({ status: 503 })));
    component.ngOnInit();
    await settleFocus();

    const error = cardError();
    expect(error).not.toBeNull();
    expect(error!.getAttribute('role')).toBe('alert');
    expect(error!.textContent).toContain(failureCopy('load', 'your saved inputs'));
    expect(document.activeElement).not.toBe(error);
  });
});
