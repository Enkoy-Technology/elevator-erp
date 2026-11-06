import { allowedAssetMoves, canSkipAssetRules } from './asset-status';

describe('allowedAssetMoves', () => {
  it('gives each step to the role that does it', () => {
    expect(allowedAssetMoves('ON_ORDER', 'STORE_KEEPER')).toEqual(['CHECKING']);
    expect(allowedAssetMoves('CHECKING', 'STORE_KEEPER')).toEqual(['IN_STORE']);
    expect(allowedAssetMoves('IN_STORE', 'STORE_KEEPER')).toEqual(['AT_SITE']);
    expect(allowedAssetMoves('AT_SITE', 'TECHNICAL_MANAGER')).toEqual(['ACTIVE']);
    expect(allowedAssetMoves('AT_SITE', 'STORE_KEEPER')).toEqual(['IN_STORE']);
    expect(allowedAssetMoves('ACTIVE', 'MAINTENANCE_ENGINEER')).toEqual([
      'INACTIVE',
    ]);
    expect(allowedAssetMoves('INACTIVE', 'TECHNICAL_MANAGER')).toEqual([
      'ACTIVE',
      'DECOMMISSIONED',
    ]);
  });

  it('gives a role nothing for a step that is not theirs', () => {
    expect(allowedAssetMoves('ON_ORDER', 'TECHNICAL_MANAGER')).toEqual([]);
    expect(allowedAssetMoves('AT_SITE', 'SALES_MANAGER')).toEqual([]);
    expect(allowedAssetMoves('ACTIVE', 'STORE_KEEPER')).toEqual([]);
  });

  it('lets the General Manager press every button', () => {
    expect(allowedAssetMoves('AT_SITE', 'GENERAL_MANAGER')).toEqual([
      'ACTIVE',
      'IN_STORE',
    ]);
    expect(allowedAssetMoves('ACTIVE', 'GENERAL_MANAGER')).toEqual([
      'INACTIVE',
      'DECOMMISSIONED',
    ]);
    expect(allowedAssetMoves('ON_ORDER', 'CEO')).toEqual(['CHECKING']);
  });

  it('ends at Decommissioned for everyone', () => {
    expect(allowedAssetMoves('DECOMMISSIONED', 'CEO')).toEqual([]);
  });
});

describe('canSkipAssetRules', () => {
  it('covers the General Manager, CEO and Admin only', () => {
    expect(canSkipAssetRules('GENERAL_MANAGER')).toBe(true);
    expect(canSkipAssetRules('CEO')).toBe(true);
    expect(canSkipAssetRules('ADMIN')).toBe(true);
    expect(canSkipAssetRules('SALES_MANAGER')).toBe(false);
  });
});
