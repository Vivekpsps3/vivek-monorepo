import type { ProfilePayload } from '../models/planning.model';

export type MissingSpendingMode = 'components' | 'manual' | 'recurring';

/**
 * Mode when none was saved.
 * Components when spending_components is set, else manual when annual_spending != null, else recurring.
 */
export const spendingModeInference = {
  inferMissing(
    payload: Pick<ProfilePayload, 'spending_components' | 'annual_spending'>,
  ): MissingSpendingMode {
    if (payload.spending_components) return 'components';
    if (payload.annual_spending != null) return 'manual';
    return 'recurring';
  },
};
