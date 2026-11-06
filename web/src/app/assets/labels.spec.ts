import {
  assetNextStepHint,
  canAssignCustomer,
  forwardMove,
  moveWaitsForCustomer,
} from './labels';

describe('forwardMove', () => {
  it('finds the step along the road', () => {
    expect(forwardMove('IN_STORE', ['AT_SITE'])).toBe('AT_SITE');
    expect(forwardMove('AT_SITE', ['ACTIVE', 'IN_STORE'])).toBe('ACTIVE');
  });

  it('leaves going back on the lift page', () => {
    expect(forwardMove('AT_SITE', ['IN_STORE'])).toBeUndefined();
  });

  it('never offers taking a working lift out of service as a next step', () => {
    expect(
      forwardMove('ACTIVE', ['INACTIVE', 'DECOMMISSIONED']),
    ).toBeUndefined();
    expect(forwardMove('INACTIVE', ['ACTIVE'])).toBeUndefined();
  });
});

describe('canAssignCustomer', () => {
  it('lets Sales assign a customer until the lift leaves the store', () => {
    expect(canAssignCustomer('SALES_MANAGER', 'IN_STORE')).toBe(true);
    expect(canAssignCustomer('SALES_MANAGER', 'AT_SITE')).toBe(false);
  });

  it('lets managers assign one at any status', () => {
    expect(canAssignCustomer('GENERAL_MANAGER', 'ACTIVE')).toBe(true);
    expect(canAssignCustomer('CEO', 'ACTIVE')).toBe(true);
    expect(canAssignCustomer('ADMIN', 'ACTIVE')).toBe(true);
  });

  it('keeps it from the store keeper, who cannot read customers', () => {
    expect(canAssignCustomer('STORE_KEEPER', 'IN_STORE')).toBe(false);
    expect(canAssignCustomer(null, 'IN_STORE')).toBe(false);
  });
});

describe('moveWaitsForCustomer', () => {
  it('holds a lift with no customer back from going to site', () => {
    expect(moveWaitsForCustomer('AT_SITE', null)).toBe(true);
  });

  it('lets a sold lift go, and leaves every other step alone', () => {
    expect(moveWaitsForCustomer('AT_SITE', 'customer-1')).toBe(false);
    expect(moveWaitsForCustomer('CHECKING', null)).toBe(false);
  });
});

describe('assetNextStepHint', () => {
  const inStock = { hasParts: true, hasCustomer: false, canAssign: false };

  it('tells a store keeper who has to assign the customer', () => {
    expect(assetNextStepHint('IN_STORE', inStock)).toBe(
      'This lift has no customer yet. A Sales Manager or General Manager must assign one before it can go to site.',
    );
  });

  it('tells someone who can assign the customer to do it', () => {
    expect(assetNextStepHint('IN_STORE', { ...inStock, canAssign: true })).toBe(
      'Assign the customer, then it can go to site.',
    );
  });

  it('sends a sold lift on its way', () => {
    expect(
      assetNextStepHint('IN_STORE', { ...inStock, hasCustomer: true }),
    ).toBe('Checked and in the store. Press Send to site when it leaves.');
  });

  it('fits a lift with no parts list', () => {
    expect(assetNextStepHint('CHECKING', { ...inStock, hasParts: false })).toBe(
      'Check what came, then press Finish check.',
    );
  });
});
