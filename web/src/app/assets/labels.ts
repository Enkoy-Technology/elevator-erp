import type { AssetCategory, AssetStatus } from '@/lib/api';

/** Display names for the asset enums — shared by the list and both forms. */
export const ASSET_CATEGORY_LABEL: Record<AssetCategory, string> = {
  ELEVATOR: 'Elevator',
  ESCALATOR: 'Escalator',
  STAIRS: 'Stairs',
  OTHER: 'Other',
};

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  DECOMMISSIONED: 'Decommissioned',
};

export const ASSET_STATUS_TONE: Record<
  AssetStatus,
  'neutral' | 'active' | 'good' | 'warn' | 'danger'
> = {
  ACTIVE: 'good',
  INACTIVE: 'neutral',
  DECOMMISSIONED: 'danger',
};
