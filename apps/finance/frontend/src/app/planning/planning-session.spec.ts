import {
  clearPlanningDrafts,
  readRetirementDraft,
  readSavingsDraft,
  readSpendingSelection,
  writeRetirementDraft,
  writeSavingsDraft,
  writeSimulationDraft,
  writeSpendingSelection,
  readSimulationDraft,
} from './planning-session';

const KEY = 'finance-planning-drafts';

describe('planning session drafts', () => {
  afterEach(() => sessionStorage.removeItem(KEY));

  const retirement = {
    withdrawalRate: 0.04,
    extraAnnualExpenses: 2400,
    includeRecurringExpenses: true,
  };

  it('stores a valid draft and rejects a junk replacement', () => {
    writeRetirementDraft({ ...retirement, withdrawalRate: '0.04', extraAnnualExpenses: '-50' });
    expect(readRetirementDraft()).toEqual({ ...retirement, extraAnnualExpenses: -50 });

    writeRetirementDraft({ withdrawalRate: 'bad', extraAnnualExpenses: 1, includeRecurringExpenses: true });
    expect(readRetirementDraft()?.extraAnnualExpenses).toBe(-50);
  });

  it('keeps a valid section when another section is junk', () => {
    writeSavingsDraft({
      name: '  Cabin fund  ',
      targetAmount: 100000,
      currentSaved: 0,
      years: 5,
      expectedReturn: 0.07,
    });
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
    raw.retirement = { withdrawalRate: 'no' };
    sessionStorage.setItem(KEY, JSON.stringify(raw));

    expect(readRetirementDraft()).toBeNull();
    expect(readSavingsDraft()).toEqual({
      name: 'Cabin fund',
      targetAmount: 100000,
      currentSaved: 0,
      years: 5,
      expectedReturn: 0.07,
    });
  });

  it('ignores a non-object payload and clears every draft', () => {
    writeSimulationDraft({
      horizonYears: '18',
      nPaths: 500,
      seed: 7,
      spendingMode: 'manual',
      annualSpending: null,
    });
    expect(readSimulationDraft()?.horizonYears).toBe(18);

    sessionStorage.setItem(KEY, '[]');
    expect(readSimulationDraft()).toBeNull();

    writeRetirementDraft(retirement);
    clearPlanningDrafts();
    expect(readRetirementDraft()).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('keeps an entered zero distinct from an unset spending amount', () => {
    writeSpendingSelection({
      spendingMode: 'manual',
      annualSpending: 0,
      componentsChosen: false,
      fixedAnnual: 0,
      variableAnnual: 0,
      irregularAnnual: 0,
    });
    expect(readSpendingSelection()?.annualSpending).toBe(0);
    writeSpendingSelection({
      spendingMode: 'manual',
      annualSpending: null,
      componentsChosen: false,
      fixedAnnual: 0,
      variableAnnual: 0,
      irregularAnnual: 0,
    });
    expect(readSpendingSelection()?.annualSpending).toBeNull();
    clearPlanningDrafts();
    expect(readSpendingSelection()).toBeNull();
  });
});
