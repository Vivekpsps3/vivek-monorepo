export interface SavingsGoalInputs {
  targetAmount: number;
  currentSaved: number;
  years: number;
  expectedReturn: number;
}

export interface DebtPayoffInputs {
  balance: number;
  monthlyPayment: number;
  apr: number;
}

export function calculateFireTarget(annualSpending: number, withdrawalRate: number): number {
  return Math.max(0, Number(annualSpending) || 0) / Math.max(0.001, Number(withdrawalRate) || 0.04);
}

export function calculateMonthlyGoalContribution(inputs: SavingsGoalInputs): number {
  const target = Math.max(0, Number(inputs.targetAmount) || 0);
  const current = Math.max(0, Number(inputs.currentSaved) || 0);
  const years = Math.max(0.1, Number(inputs.years) || 0);
  const months = Math.max(1, Math.round(years * 12));
  const monthlyReturn = Math.max(-0.99, Number(inputs.expectedReturn) || 0) / 12;
  const futureCurrent = current * Math.pow(1 + monthlyReturn, months);
  const gap = Math.max(0, target - futureCurrent);
  if (gap <= 0) return 0;
  if (monthlyReturn === 0) return Math.round(gap / months);
  return Math.round((gap * monthlyReturn) / (Math.pow(1 + monthlyReturn, months) - 1));
}

export function calculateGoalProjectedValue(inputs: SavingsGoalInputs): number {
  const contribution = calculateMonthlyGoalContribution(inputs);
  const current = Math.max(0, Number(inputs.currentSaved) || 0);
  const months = Math.max(1, Math.round(Math.max(0.1, Number(inputs.years) || 0) * 12));
  const monthlyReturn = Math.max(-0.99, Number(inputs.expectedReturn) || 0) / 12;
  if (monthlyReturn === 0) return current + contribution * months;
  return current * Math.pow(1 + monthlyReturn, months)
    + contribution * ((Math.pow(1 + monthlyReturn, months) - 1) / monthlyReturn);
}

export function calculateDebtPayoffMonths(inputs: DebtPayoffInputs): number | null {
  const balance = Number(inputs.balance);
  const payment = Number(inputs.monthlyPayment);
  const rate = Number(inputs.apr) / 12;
  if (![balance, payment, rate].every(Number.isFinite) || balance <= 0 || payment <= 0 || rate < 0) {
    return null;
  }
  if (payment <= balance * rate) return null;

  let remaining = balance;
  let months = 0;
  while (remaining > 0 && months < 600) {
    remaining = remaining * (1 + rate) - payment;
    months += 1;
  }
  return months >= 600 ? null : months;
}

export function calculateDebtTotalInterest(inputs: DebtPayoffInputs): number | null {
  const months = calculateDebtPayoffMonths(inputs);
  if (months == null) return null;
  let remaining = Number(inputs.balance);
  let interest = 0;
  const rate = Number(inputs.apr) / 12;
  for (let month = 0; month < months && remaining > 0; month += 1) {
    const charge = remaining * rate;
    interest += charge;
    remaining = Math.max(0, remaining + charge - Number(inputs.monthlyPayment));
  }
  return interest;
}

/** Returns the displayed payoff month without JavaScript's month-end rollover. */
export function addCalendarMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}
