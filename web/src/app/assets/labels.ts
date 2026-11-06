import type { AssetCategory, AssetStatus, UserRole } from '@/lib/api';

/** Display names for the asset enums — shared by the list and both forms. */
export const ASSET_CATEGORY_LABEL: Record<AssetCategory, string> = {
  ELEVATOR: 'Elevator',
  ESCALATOR: 'Escalator',
  STAIRS: 'Stairs',
  OTHER: 'Other',
};

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  ON_ORDER: 'On order',
  CHECKING: 'Checking',
  IN_STORE: 'In store',
  AT_SITE: 'At site',
  ACTIVE: 'In service',
  INACTIVE: 'Out of service',
  DECOMMISSIONED: 'Decommissioned',
};

export const ASSET_STATUS_TONE: Record<
  AssetStatus,
  'neutral' | 'active' | 'good' | 'warn' | 'danger'
> = {
  ON_ORDER: 'neutral',
  CHECKING: 'warn',
  IN_STORE: 'active',
  AT_SITE: 'active',
  ACTIVE: 'good',
  INACTIVE: 'neutral',
  DECOMMISSIONED: 'danger',
};

/** The words on the next-step button, which depend on where the lift is coming from. */
export const assetMoveLabel = (from: AssetStatus, to: AssetStatus): string => {
  if (to === 'CHECKING') return 'Start checking';
  if (to === 'IN_STORE')
    return from === 'AT_SITE' ? 'Back to store' : 'Finish check';
  if (to === 'AT_SITE') return 'Send to site';
  if (to === 'ACTIVE')
    return from === 'INACTIVE' ? 'Back in service' : 'Mark in service';
  if (to === 'INACTIVE') return 'Out of service';
  return 'Decommission';
};

/** The road from the factory to the building, in order. */
export const ASSET_JOURNEY: readonly AssetStatus[] = [
  'ON_ORDER',
  'CHECKING',
  'IN_STORE',
  'AT_SITE',
  'ACTIVE',
];

/**
 * The one step that moves a lift along its road, if this person has it. Going
 * back or out of service is an exception, not a next step, so it stays on the
 * lift's own page.
 */
export const forwardMove = (
  status: AssetStatus,
  moves: readonly AssetStatus[],
): AssetStatus | undefined => {
  const at = ASSET_JOURNEY.indexOf(status);
  return at < 0
    ? undefined
    : moves.find((to) => ASSET_JOURNEY.indexOf(to) > at);
};

/** Mirrors the API: a lift goes to site only once it has a customer. */
export const moveWaitsForCustomer = (
  to: AssetStatus,
  customerId: string | null,
): boolean => to === 'AT_SITE' && !customerId;

/** Mirrors the sold-to route: Sales until it leaves the store, managers always. */
export const canAssignCustomer = (
  role: UserRole | null,
  status: AssetStatus,
): boolean =>
  role === 'GENERAL_MANAGER' ||
  role === 'CEO' ||
  role === 'ADMIN' ||
  (role === 'SALES_MANAGER' &&
    ASSET_JOURNEY.indexOf(status) >= 0 &&
    ASSET_JOURNEY.indexOf(status) <= ASSET_JOURNEY.indexOf('IN_STORE'));

/** What the next step asks of the person, in the button's own words. */
export const assetNextStepHint = (
  status: AssetStatus,
  {
    hasParts,
    hasCustomer,
    canAssign,
  }: { hasParts: boolean; hasCustomer: boolean; canAssign: boolean },
): string | null => {
  if (status === 'ON_ORDER') {
    return 'When the lift arrives, press Start checking.';
  }
  if (status === 'CHECKING') {
    return hasParts
      ? 'Open each case and tap any part that did not come. Then press Finish check.'
      : 'Check what came, then press Finish check.';
  }
  if (status === 'IN_STORE') {
    if (hasCustomer) {
      return 'Checked and in the store. Press Send to site when it leaves.';
    }
    return canAssign
      ? 'Assign the customer, then it can go to site.'
      : 'This lift has no customer yet. A Sales Manager or General Manager must assign one before it can go to site.';
  }
  return null;
};

/** Mirrors @Roles on the checklist routes; CEO and ADMIN pass every check. */
export const canMarkParts = (role: UserRole | null): boolean =>
  role === 'STORE_KEEPER' ||
  role === 'TECHNICAL_MANAGER' ||
  role === 'GENERAL_MANAGER' ||
  role === 'CEO' ||
  role === 'ADMIN';
