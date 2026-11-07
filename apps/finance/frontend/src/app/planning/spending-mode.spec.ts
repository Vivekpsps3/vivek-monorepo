import { spendingModeInference } from './spending-mode';

describe('spendingModeInference.inferMissing', () => {
  const parts = { fixed_annual: 1, variable_annual: 2, irregular_annual: 3 };

  it('uses components, then a manual total, then recurring', () => {
    expect(spendingModeInference.inferMissing({ spending_components: parts, annual_spending: 9 })).toBe('components');
    expect(spendingModeInference.inferMissing({ annual_spending: 9 })).toBe('manual');
    expect(spendingModeInference.inferMissing({ annual_spending: null })).toBe('recurring');
    expect(spendingModeInference.inferMissing({})).toBe('recurring');
  });
});
