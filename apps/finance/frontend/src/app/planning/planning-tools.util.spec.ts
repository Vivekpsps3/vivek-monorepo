import {
calculateGoalProjectedValue,
calculateMonthlyGoalContribution
} from './planning-tools.util';

describe('planning calculator math', () => {

  it('handles a zero-return savings goal and does not request more when already funded', () => {
    expect(calculateMonthlyGoalContribution({
      targetAmount: 12_000, currentSaved: 0, years: 1, expectedReturn: 0,
    })).toBe(1_000);
    expect(calculateMonthlyGoalContribution({
      targetAmount: 10_000, currentSaved: 10_000, years: 1, expectedReturn: 0,
    })).toBe(0);
    expect(calculateGoalProjectedValue({
      targetAmount: 12_000, currentSaved: 0, years: 1, expectedReturn: 0,
    })).toBe(12_000);
  });

});
