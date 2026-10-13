/** Portfolio share of gross assets, used by both the displayed estimate and the simulation. */
export function inferredPortfolioAllocation(
  netWorthTotal: number | null | undefined,
  portfolioValue: number | null | undefined,
  liabilities: number | null | undefined,
): number {
  const total = Number(netWorthTotal) || 0;
  const portfolio = Number(portfolioValue) || 0;
  const owed = Number(liabilities) || 0;
  const grossAssets = total + owed;
  if (grossAssets <= 0 || portfolio <= 0) return 0;
  return Math.max(0, Math.min(1, portfolio / grossAssets));
}
