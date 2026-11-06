import {
  assetNextStepHint,
  canAssignCustomer,
  forwardMove,
  moveWaitsForCustomer,
  noCustomerText,
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
  it('lets Sales and managers assign, change or remove a customer', () => {
    expect(canAssignCustomer('SALES_MANAGER')).toBe(true);
    expect(canAssignCustomer('GENERAL_MANAGER')).toBe(true);
    expect(canAssignCustomer('CEO')).toBe(true);
    expect(canAssignCustomer('ADMIN')).toBe(true);
  });

  it('keeps it from the store keeper, who cannot read customers', () => {
    expect(canAssignCustomer('STORE_KEEPER')).toBe(false);
    expect(canAssignCustomer(null)).toBe(false);
  });
});

describe('noCustomerText', () => {
  it('calls a lift with no customer in stock while it is with us', () => {
    expect(noCustomerText('ON_ORDER')).toBe('In stock');
    expect(noCustomerText('IN_STORE')).toBe('In stock');
  });

  it('does not call a lift in stock once it has left the store', () => {
    expect(noCustomerText('AT_SITE')).toBe('No customer');
    expect(noCustomerText('ACTIVE')).toBe('No customer');
    expect(noCustomerText('INACTIVE')).toBe('No customer');
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
