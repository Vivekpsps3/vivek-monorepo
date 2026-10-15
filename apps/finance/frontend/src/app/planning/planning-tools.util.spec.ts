import {
  addCalendarMonths,
  calculateDebtPayoffMonths,
  calculateDebtTotalInterest,
  calculateFireTarget,
  calculateGoalProjectedValue,
  calculateMonthlyGoalContribution,
} from './planning-tools.util';

describe('planning calculator math', () => {
  it('calculates FIRE targets from the selected spending basis', () => {
    expect(calculateFireTarget(40_000, 0.04)).toBe(1_000_000);
    expect(calculateFireTarget(-5_000, 0.04)).toBe(0);
  });

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

  it('does not claim payoff when the payment only covers interest', () => {
    expect(calculateDebtPayoffMonths({ balance: 1_000, monthlyPayment: 10, apr: 0.12 })).toBeNull();
    expect(calculateDebtTotalInterest({ balance: 1_000, monthlyPayment: 10, apr: 0.12 })).toBeNull();
  });

  it('calculates zero-APR payoff and interest without adding phantom interest', () => {
    const inputs = { balance: 1_200, monthlyPayment: 300, apr: 0 };
    expect(calculateDebtPayoffMonths(inputs)).toBe(4);
    expect(calculateDebtTotalInterest(inputs)).toBe(0);
  });

  it('keeps a month-end payoff date in the intended month', () => {
    const result = addCalendarMonths(new Date(2024, 0, 31), 1);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(1);
  });
});
