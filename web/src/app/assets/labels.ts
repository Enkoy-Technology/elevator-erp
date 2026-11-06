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
  if (to === 'IN_STORE') return from === 'AT_SITE' ? 'Back to store' : 'Finish check';
  if (to === 'AT_SITE') return 'Send to site';
  if (to === 'ACTIVE') return from === 'INACTIVE' ? 'Back in service' : 'Mark in service';
  if (to === 'INACTIVE') return 'Out of service';
  return 'Decommission';
};

/** What the next step asks of the person, in the button's own words. */
export const assetNextStepHint = (
  status: AssetStatus,
  hasParts: boolean,
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
    return 'Checked and in the store. Press Send to site when it leaves.';
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
