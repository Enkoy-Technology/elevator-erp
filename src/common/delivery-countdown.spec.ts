import {
  contractDeliveryCountdown,
  deliveryCountdown,
  type SignedDelivery,
} from './delivery-countdown';
describe('deliveryCountdown', () => {
  const signed = (
    overrides: Partial<SignedDelivery> = {},
  ): SignedDelivery => ({
    signedAt: '2026-09-24',
    deliveryDays: 90,
    contractValueEtb: '7000000.00',
    penaltyPercentPerDay: null,
    penaltyCapPercent: null,
    ...overrides,
  });

  it('counts working days down from the signing date: 90 signed Thu 24 Sep leaves 84 on Fri 2 Oct', () => {
    expect(deliveryCountdown([signed()], '2026-10-02')).toEqual({
      deliveryDueDate: '2027-01-28',
      deliveryDaysLeft: 84,
      deliveryPenaltyEtb: null,
    });
  });

  it('charges no penalty on the due date itself', () => {
    expect(deliveryCountdown([signed()], '2027-01-28')).toEqual({
      deliveryDueDate: '2027-01-28',
      deliveryDaysLeft: 0,
      deliveryPenaltyEtb: null,
    });
  });

  it('once overdue, charges 0.02% of the contract total for every calendar day', () => {
    // Due Thu 28 Jan; Thu 4 Feb is 5 working days and 7 calendar days late.
    // 7,000,000 x 0.02% = 1,400.00 a day.
    expect(deliveryCountdown([signed()], '2027-02-04')).toEqual({
      deliveryDueDate: '2027-01-28',
      deliveryDaysLeft: -5,
      deliveryPenaltyEtb: '9800.00',
    });
  });

  it("uses the contract's own rate and stops at its cap", () => {
    // 0.5% a day is 35,000; 30 days would be 1,050,000 but 5% caps it at 350,000.
    expect(
      deliveryCountdown(
        [signed({ penaltyPercentPerDay: '0.500', penaltyCapPercent: '5.00' })],
        '2027-02-27',
      ).deliveryPenaltyEtb,
    ).toBe('350000.00');
    expect(
      deliveryCountdown(
        [signed({ penaltyPercentPerDay: '0.500', penaltyCapPercent: '5.00' })],
        '2027-01-30',
      ).deliveryPenaltyEtb,
    ).toBe('70000.00');
  });

  it('takes the earliest promise when a project has two signed contracts', () => {
    expect(
      deliveryCountdown(
        [
          signed({ deliveryDays: 120 }),
          signed({ signedAt: '2026-09-17' }),
        ],
        '2026-10-02',
      ).deliveryDueDate,
    ).toBe('2027-01-21');
  });

  it('is blank with no signed contract carrying a delivery period', () => {
    expect(deliveryCountdown([], '2026-10-02')).toEqual({
      deliveryDueDate: null,
      deliveryDaysLeft: null,
      deliveryPenaltyEtb: null,
    });
  });
});

describe('contractDeliveryCountdown', () => {
  const contract = {
    status: 'SIGNED',
    signedAt: '2026-09-24',
    deliveryWorkingDays: 90,
    contractValueEtb: '7000000.00',
    delayPenaltyPercentPerDay: null,
    delayPenaltyCapPercent: null,
  };

  it('counts down a signed contract with a delivery period', () => {
    expect(contractDeliveryCountdown(contract, '2026-10-02')).toEqual({
      deliveryDueDate: '2027-01-28',
      deliveryDaysLeft: 84,
      deliveryPenaltyEtb: null,
    });
  });

  it('is blank for a draft, a handed-over contract, or one without a period', () => {
    const blank = { deliveryDueDate: null, deliveryDaysLeft: null, deliveryPenaltyEtb: null };
    expect(contractDeliveryCountdown({ ...contract, status: 'DRAFT', signedAt: null }, '2026-10-02')).toEqual(blank);
    expect(contractDeliveryCountdown({ ...contract, status: 'COMPLETED' }, '2026-10-02')).toEqual(blank);
    expect(contractDeliveryCountdown({ ...contract, deliveryWorkingDays: null }, '2026-10-02')).toEqual(blank);
  });
});
