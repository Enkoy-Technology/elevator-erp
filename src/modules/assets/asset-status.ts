import type { AssetStatus } from '../../database/schema';
import type { UserRole } from '../../types/auth.types';

/**
 * The next steps from each status, and who presses each. The table is the only
 * route a lift normally takes; a wrong press is undone with Correct status.
 */
export const ASSET_STATUS_MOVES: Readonly<
  Record<
    AssetStatus,
    readonly { to: AssetStatus; roles: readonly UserRole[] }[]
  >
> = {
  ON_ORDER: [{ to: 'CHECKING', roles: ['STORE_KEEPER'] }],
  CHECKING: [{ to: 'IN_STORE', roles: ['STORE_KEEPER'] }],
  IN_STORE: [{ to: 'AT_SITE', roles: ['STORE_KEEPER'] }],
  AT_SITE: [
    { to: 'ACTIVE', roles: ['TECHNICAL_MANAGER'] },
    { to: 'IN_STORE', roles: ['STORE_KEEPER'] },
  ],
  ACTIVE: [
    { to: 'INACTIVE', roles: ['TECHNICAL_MANAGER', 'MAINTENANCE_ENGINEER'] },
    { to: 'DECOMMISSIONED', roles: ['TECHNICAL_MANAGER'] },
  ],
  INACTIVE: [
    { to: 'ACTIVE', roles: ['TECHNICAL_MANAGER', 'MAINTENANCE_ENGINEER'] },
    { to: 'DECOMMISSIONED', roles: ['TECHNICAL_MANAGER'] },
  ],
  DECOMMISSIONED: [],
};

const ASSET_OVERRIDE_ROLES: readonly UserRole[] = [
  'CEO',
  'ADMIN',
  'GENERAL_MANAGER',
];

/** General Manager, and the super roles who pass every @Roles check anyway. */
export const canSkipAssetRules = (role: UserRole): boolean =>
  ASSET_OVERRIDE_ROLES.includes(role);

export const allowedAssetMoves = (
  status: AssetStatus,
  role: UserRole,
): AssetStatus[] =>
  ASSET_STATUS_MOVES[status]
    .filter((move) => canSkipAssetRules(role) || move.roles.includes(role))
    .map((move) => move.to);
