import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';

import {
  DiscountApprovalRequiredError,
  WorkflowTransitionError,
} from '../../common/exceptions';
import type { AuthenticatedUser } from '../../types/auth.types';
import type { CalcResult } from '../elevator-calc/types';
import type { QuotationRecord } from './quotations.repository';
import { QuotationsService } from './quotations.service';

describe('QuotationsService', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'SALES_MANAGER',
  };

  const project = {
    id: '55555555-5555-5555-5555-555555555555',
    customerId: '66666666-6666-6666-6666-666666666666',
  };

  const draft: QuotationRecord = {
    tenantId: user.tenantId,
    id: '44444444-4444-4444-4444-444444444444',
    projectId: project.id,
    customerId: project.customerId,
    quoteNumber: 'QTN-2026-ABCD1234',
    status: 'DRAFT',
    version: 1,
    calcInput: {},
    technicalSpec: {},
    pricingBreakdown: {},
    rateVersionId: '77777777-7777-7777-7777-777777777777',
    marginPercent: '25.00',
    taxPercent: '15.00',
    subtotalEtb: '100.00',
    marginAmountEtb: '25.00',
    taxAmountEtb: '18.75',
    totalPriceEtb: '143.75',
    calculatedTotalEtb: null,
    discountAmountEtb: null,
    discountPercent: null,
    discountApprovedByUserId: null,
    referenceCode: null,
    deliveryDays: null,
    warrantyPartsMonths: null,
    warrantyFreeServiceMonths: null,
    validityDays: null,
    validUntil: null,
    notes: null,
    approvedByUserId: null,
    approvedAt: null,
    rejectedReason: null,
    statusChangedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdByUserId: user.userId,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
  };

  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
    listLines: jest.fn(),
    addLine: jest.fn(),
    updateLine: jest.fn(),
    removeLine: jest.fn(),
    reorderLines: jest.fn(),
    applyPricing: jest.fn(),
    setDiscountApprovedBy: jest.fn(),
    getDiscountApprovalThresholdPercent: jest.fn(),
    updateTerms: jest.fn(),
    listPaymentTerms: jest.fn(),
    replacePaymentTerms: jest.fn(),
  };
  const calc = { calculateSpecs: jest.fn() };
  const projectsService = { getById: jest.fn() };
  const rates = { resolve: jest.fn() };

  const service = new QuotationsService(
    repo as never,
    calc,
    projectsService as never,
    rates as never,
  );

  beforeEach(() => jest.clearAllMocks());

  describe('createForProject', () => {
    const calcResult: CalcResult = {
      technical: { capacityPersons: 13 } as CalcResult['technical'],
      pricing: {
        // PASSENGER, 5 stops (floors to 0), 1000 kg: 7,000,000 + 370,000
        basePrice: '7000000.00',
        stopsAdjustment: '0.00',
        capacityAdjustment: '370000.00',
        totalBeforeMargin: '7370000.00',
        marginAmount: '1842500.00',
        subtotalWithMargin: '9212500.00',
        // Placeholders from calc's own (unused, taxPercent=0) math — the
        // service must overwrite these with the VAT-resolved figures.
        taxAmount: '0.00',
        totalPrice: '9212500.00',
      },
    };

    const dto = {
      productType: 'PASSENGER',
      capacityKg: 1000,
      stops: 5,
      travelHeightM: 15,
      speedMs: 1.6,
      machineRoomType: 'MRL',
      doorType: 'CENTER_OPEN',
      doorWidthMm: 900,
      buildingUsage: 'COMMERCIAL',
      marginPercent: 25,
    } as never;

    beforeEach(() => {
      projectsService.getById.mockResolvedValue(project);
      calc.calculateSpecs.mockReturnValue(calcResult);
      rates.resolve.mockResolvedValue({
        id: '77777777-7777-7777-7777-777777777777',
        kind: 'VAT',
        validFrom: '2024-08-21',
        validTo: null,
        payload: { percent: '15' },
      });
      repo.create.mockResolvedValue(draft);
    });

    it('resolves VAT from RatesService (never a client-supplied or hardcoded percent) and stores the rate version', async () => {
      await service.createForProject(user, project.id, dto);

      expect(rates.resolve).toHaveBeenCalledWith(
        'VAT',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
      const [, values] = repo.create.mock.calls[0]!;
      expect(values.rateVersionId).toBe('77777777-7777-7777-7777-777777777777');
    });

    it('computes tax/total off the resolved VAT percent with decimal.js, not calc\'s placeholder', async () => {
      await service.createForProject(user, project.id, dto);

      const [, values] = repo.create.mock.calls[0]!;
      // 9,212,500.00 * 15% = 1,381,875.00; total = 10,594,375.00
      expect(values.taxAmountEtb).toBe('1381875.00');
      expect(values.totalPriceEtb).toBe('10594375.00');
      expect(values.taxPercent).toBe('15.00');
      expect(values.pricingBreakdown.taxAmount).toBe('1381875.00');
      expect(values.pricingBreakdown.totalPrice).toBe('10594375.00');
    });

    it('never passes the client a way to set taxPercent — calc is called with a 0 placeholder', async () => {
      await service.createForProject(user, project.id, dto);
      expect(calc.calculateSpecs).toHaveBeenCalledWith(
        expect.objectContaining({ taxPercent: 0 }),
      );
    });

    it('creates the quotation as DRAFT under the calling project/customer', async () => {
      const result = await service.createForProject(user, project.id, dto);
      expect(result).toEqual(draft);
      const [tenantId, values] = repo.create.mock.calls[0]!;
      expect(tenantId).toBe(user.tenantId);
      expect(values.status).toBe('DRAFT');
      expect(values.projectId).toBe(project.id);
      expect(values.customerId).toBe(project.customerId);
    });
  });

  describe('transitions', () => {
    it('submits a DRAFT quote to PENDING_APPROVAL', async () => {
      repo.findById.mockResolvedValue(draft);
      repo.updateStatus.mockResolvedValue({
        ...draft,
        status: 'PENDING_APPROVAL',
      });
      await expect(service.submit(user, draft.id)).resolves.toMatchObject({
        status: 'PENDING_APPROVAL',
      });
      expect(repo.updateStatus).toHaveBeenCalledWith(
        user.tenantId,
        draft.id,
        'DRAFT',
        'PENDING_APPROVAL',
        {},
      );
    });

    it('approves a PENDING_APPROVAL quote and stamps approvedByUserId', async () => {
      const pending = { ...draft, status: 'PENDING_APPROVAL' as const };
      repo.findById.mockResolvedValue(pending);
      repo.updateStatus.mockResolvedValue({ ...pending, status: 'APPROVED' });
      await expect(service.approve(user, draft.id)).resolves.toMatchObject({
        status: 'APPROVED',
      });
      expect(repo.updateStatus).toHaveBeenCalledWith(
        user.tenantId,
        draft.id,
        'PENDING_APPROVAL',
        'APPROVED',
        expect.objectContaining({ approvedByUserId: user.userId }),
      );
    });

    it('rejects skipping submission (DRAFT → APPROVED)', async () => {
      repo.findById.mockResolvedValue(draft);
      await expect(service.approve(user, draft.id)).rejects.toBeInstanceOf(
        WorkflowTransitionError,
      );
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });

    it('rejects a PENDING_APPROVAL quote with a reason', async () => {
      const pending = { ...draft, status: 'PENDING_APPROVAL' as const };
      repo.findById.mockResolvedValue(pending);
      repo.updateStatus.mockResolvedValue({
        ...pending,
        status: 'REJECTED',
        rejectedReason: 'Too expensive',
      });
      await expect(
        service.reject(user, draft.id, 'Too expensive'),
      ).resolves.toMatchObject({ status: 'REJECTED' });
      expect(repo.updateStatus).toHaveBeenCalledWith(
        user.tenantId,
        draft.id,
        'PENDING_APPROVAL',
        'REJECTED',
        { rejectedReason: 'Too expensive' },
      );
    });

    it('expires a DRAFT quote', async () => {
      repo.findById.mockResolvedValue(draft);
      repo.updateStatus.mockResolvedValue({ ...draft, status: 'EXPIRED' });
      await expect(service.expire(user, draft.id)).resolves.toMatchObject({
        status: 'EXPIRED',
      });
    });

    it('cannot resurrect a REJECTED quote', async () => {
      repo.findById.mockResolvedValue({ ...draft, status: 'REJECTED' as const });
      await expect(service.approve(user, draft.id)).rejects.toBeInstanceOf(
        WorkflowTransitionError,
      );
    });

    it('propagates a 409 WorkflowTransitionError from a concurrent CAS conflict', async () => {
      // The repository does the actual compare-and-swap; simulate someone
      // else moving the row between our read and our write.
      repo.findById.mockResolvedValue(draft);
      repo.updateStatus.mockRejectedValue(
        new WorkflowTransitionError(
          'Quotation status changed concurrently — reload and retry',
        ),
      );
      await expect(service.submit(user, draft.id)).rejects.toBeInstanceOf(
        WorkflowTransitionError,
      );
    });

    it('throws NotFoundException for a missing quote', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.submit(user, draft.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Line items, negotiated pricing, discount sign-off, commercial terms.
  // -------------------------------------------------------------------------

  /** A priced line as the calculator left it: ex-VAT selling price per unit. */
  const line = (
    id: string,
    subtotalWithMargin: string,
    quantity = 1,
  ): Record<string, unknown> => ({
    id,
    quotationId: draft.id,
    sequence: 1,
    quantity,
    productType: 'PASSENGER',
    calcInput: { productType: 'PASSENGER', stops: 13 },
    technicalSpec: {},
    pricingBreakdown: { subtotalWithMargin },
    unitPriceEtb: subtotalWithMargin,
    lineTotalEtb: subtotalWithMargin,
  });

  describe('priceFromGrandTotal', () => {
    beforeEach(() => {
      repo.findById.mockResolvedValue(draft);
      repo.applyPricing.mockImplementation(async () => draft);
    });

    it("reproduces the client's real proforma to the cent from the round total they typed", async () => {
      // Formula: 7,410,000.00 ex-VAT -> 8,521,500.00 incl VAT.
      // Agreed with the customer: 7,835,000.00.
      repo.listLines.mockResolvedValue([line('L1', '7410000.00')]);

      await service.priceFromGrandTotal(user, draft.id, {
        grandTotalEtb: '7835000.00',
      });

      const [, , header, amounts] = repo.applyPricing.mock.calls[0]!;
      expect(header).toMatchObject({
        subtotalEtb: '6813043.48',
        taxAmountEtb: '1021956.52',
        totalPriceEtb: '7835000.00',
        calculatedTotalEtb: '8521500.00',
        discountAmountEtb: '686500.00',
        discountPercent: '8.06',
      });
      expect(amounts).toEqual([
        { id: 'L1', lineTotalEtb: '6813043.48', unitPriceEtb: '6813043.48' },
      ]);
    });

    it("the header's subtotal is exactly the sum of its lines' totals", async () => {
      repo.listLines.mockResolvedValue([
        line('L1', '7410000.00'),
        line('L2', '3000000.00', 2),
        line('L3', '1234567.89'),
      ]);

      await service.priceFromGrandTotal(user, draft.id, {
        grandTotalEtb: '7835000.00',
      });

      const call = repo.applyPricing.mock.calls[0]!;
      const header = call[2] as Record<string, string>;
      const amounts = call[3] as { lineTotalEtb: string }[];
      const summed = amounts.reduce(
        (sum, amount) => sum.plus(new Decimal(amount.lineTotalEtb)),
        new Decimal(0),
      );
      expect(summed.toFixed(2)).toBe(header.subtotalEtb);
      // ...and the document still balances around it.
      expect(
        new Decimal(header.subtotalEtb!).plus(header.taxAmountEtb!).toFixed(2),
      ).toBe(header.totalPriceEtb);
    });

    it('zeroes the margin amount, because the negotiated subtotal already contains it', async () => {
      repo.listLines.mockResolvedValue([line('L1', '7410000.00')]);
      await service.priceFromGrandTotal(user, draft.id, {
        grandTotalEtb: '7835000.00',
      });
      const [, , header] = repo.applyPricing.mock.calls[0]!;
      expect(header.marginAmountEtb).toBe('0.00');
    });

    it("measures the discount against the CALCULATOR, not against last week's negotiation", async () => {
      // A line already priced down once: its stored amounts are negotiated,
      // its pricingBreakdown is still the formula's.
      const alreadyPriced = {
        ...line('L1', '7410000.00'),
        unitPriceEtb: '6813043.48',
        lineTotalEtb: '6813043.48',
      };
      repo.listLines.mockResolvedValue([alreadyPriced]);

      await service.priceFromGrandTotal(user, draft.id, {
        grandTotalEtb: '7835000.00',
      });

      const [, , header] = repo.applyPricing.mock.calls[0]!;
      expect(header.calculatedTotalEtb).toBe('8521500.00');
      expect(header.discountPercent).toBe('8.06');
    });

    it('records a premium as a negative discount rather than clamping it', async () => {
      repo.listLines.mockResolvedValue([line('L1', '1000000.00')]);
      await service.priceFromGrandTotal(user, draft.id, {
        grandTotalEtb: '1265000.00',
      });
      const [, , header] = repo.applyPricing.mock.calls[0]!;
      // 1,000,000 * 1.15 = 1,150,000 calculated; quoted 1,265,000.
      expect(header.discountAmountEtb).toBe('-115000.00');
      expect(header.discountPercent).toBe('-10.00');
    });
  });

  describe('discount approval', () => {
    const discounted: QuotationRecord = {
      ...draft,
      calculatedTotalEtb: '8521500.00',
      discountAmountEtb: '686500.00',
      discountPercent: '8.06',
    };

    it('never even asks for the threshold when nothing was negotiated', async () => {
      repo.findById.mockResolvedValue(draft);
      repo.updateStatus.mockResolvedValue({
        ...draft,
        status: 'PENDING_APPROVAL',
      });
      await service.submit(user, draft.id);
      expect(repo.getDiscountApprovalThresholdPercent).not.toHaveBeenCalled();
    });

    it('lets a discounted quote through untouched when the tenant set no threshold — the default', async () => {
      repo.findById.mockResolvedValue(discounted);
      repo.getDiscountApprovalThresholdPercent.mockResolvedValue(null);
      repo.updateStatus.mockResolvedValue({
        ...discounted,
        status: 'PENDING_APPROVAL',
      });
      await expect(service.submit(user, draft.id)).resolves.toMatchObject({
        status: 'PENDING_APPROVAL',
      });
    });

    it('blocks submission when the discount is over the threshold and nobody signed it off', async () => {
      repo.findById.mockResolvedValue(discounted);
      repo.getDiscountApprovalThresholdPercent.mockResolvedValue('5.00');
      await expect(service.submit(user, draft.id)).rejects.toBeInstanceOf(
        DiscountApprovalRequiredError,
      );
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });

    it('lets it through once someone has signed it off', async () => {
      repo.findById.mockResolvedValue({
        ...discounted,
        discountApprovedByUserId: '99999999-9999-9999-9999-999999999999',
      });
      repo.getDiscountApprovalThresholdPercent.mockResolvedValue('5.00');
      repo.updateStatus.mockResolvedValue({
        ...discounted,
        status: 'PENDING_APPROVAL',
      });
      await expect(service.submit(user, draft.id)).resolves.toMatchObject({
        status: 'PENDING_APPROVAL',
      });
    });

    it('leaves a discount at or under the threshold alone', async () => {
      repo.findById.mockResolvedValue({ ...discounted, discountPercent: '5.00' });
      repo.getDiscountApprovalThresholdPercent.mockResolvedValue('5.00');
      repo.updateStatus.mockResolvedValue({
        ...discounted,
        status: 'PENDING_APPROVAL',
      });
      await expect(service.submit(user, draft.id)).resolves.toBeDefined();
    });

    it('never blocks a PREMIUM — a negative discount is a quote above the formula', async () => {
      repo.findById.mockResolvedValue({
        ...discounted,
        discountPercent: '-10.00',
      });
      repo.getDiscountApprovalThresholdPercent.mockResolvedValue('5.00');
      repo.updateStatus.mockResolvedValue({
        ...discounted,
        status: 'PENDING_APPROVAL',
      });
      await expect(service.submit(user, draft.id)).resolves.toBeDefined();
    });

    it('does not gate EXPIRED behind an unapproved discount — an offer lapses regardless', async () => {
      repo.findById.mockResolvedValue(discounted);
      repo.getDiscountApprovalThresholdPercent.mockResolvedValue('5.00');
      repo.updateStatus.mockResolvedValue({ ...discounted, status: 'EXPIRED' });
      await expect(service.expire(user, draft.id)).resolves.toMatchObject({
        status: 'EXPIRED',
      });
    });

    it('stamps the approver as the caller, never as whoever the body names', async () => {
      repo.findById.mockResolvedValue(discounted);
      repo.setDiscountApprovedBy.mockResolvedValue(discounted);
      await service.approveDiscount(user, draft.id);
      expect(repo.setDiscountApprovedBy).toHaveBeenCalledWith(
        user.tenantId,
        draft.id,
        user.userId,
      );
    });

    it('refuses to approve a discount that does not exist yet', async () => {
      repo.findById.mockResolvedValue(draft);
      await expect(
        service.approveDiscount(user, draft.id),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('commercial terms', () => {
    beforeEach(() => {
      repo.updateTerms.mockResolvedValue(draft);
      repo.replacePaymentTerms.mockResolvedValue([]);
      repo.listPaymentTerms.mockResolvedValue([]);
    });

    it('rejects a payment schedule that totals 95% and writes nothing', async () => {
      await expect(
        service.updateTerms(user, draft.id, {
          paymentTerms: [
            { label: 'On signing', percent: '50.00' },
            { label: 'On shipping documents', percent: '30.00' },
            { label: 'On delivery', percent: '10.00' },
            { label: 'After commissioning', percent: '5.00' },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.replacePaymentTerms).not.toHaveBeenCalled();
      expect(repo.updateTerms).not.toHaveBeenCalled();
    });

    it("saves the client's 50/30/10/10 schedule alongside the prose", async () => {
      await service.updateTerms(user, draft.id, {
        referenceCode: 'Rodas FUJIHD-E02',
        deliveryDays: 150,
        warrantyPartsMonths: 60,
        warrantyFreeServiceMonths: 12,
        validityDays: 5,
        paymentTerms: [
          { label: 'On signing', percent: '50.00' },
          { label: 'On shipping documents', percent: '30.00' },
          { label: 'On delivery', percent: '10.00' },
          { label: 'After commissioning', percent: '10.00' },
        ],
      });

      expect(repo.updateTerms).toHaveBeenCalledWith(user.tenantId, draft.id, {
        referenceCode: 'Rodas FUJIHD-E02',
        deliveryDays: 150,
        warrantyPartsMonths: 60,
        warrantyFreeServiceMonths: 12,
        validityDays: 5,
      });
      expect(repo.replacePaymentTerms.mock.calls[0]![2]).toHaveLength(4);
    });

    it('a patch that mentions one field does not blank the others', async () => {
      await service.updateTerms(user, draft.id, {
        deliveryDays: 120,
        referenceCode: undefined,
      });
      expect(repo.updateTerms).toHaveBeenCalledWith(user.tenantId, draft.id, {
        deliveryDays: 120,
      });
    });

    it('leaves an untouched schedule alone rather than clearing it', async () => {
      await service.updateTerms(user, draft.id, { deliveryDays: 120 });
      expect(repo.replacePaymentTerms).not.toHaveBeenCalled();
    });
  });

  describe('addLine', () => {
    const calcResultForLine: CalcResult = {
      technical: { capacityPersons: 10 } as CalcResult['technical'],
      pricing: {
        basePrice: '7000000.00',
        stopsAdjustment: '240000.00',
        capacityAdjustment: '170000.00',
        totalBeforeMargin: '7410000.00',
        marginAmount: '0.00',
        subtotalWithMargin: '7410000.00',
        taxAmount: '0.00',
        totalPrice: '7410000.00',
      },
    };

    const lineDto = {
      productType: 'PASSENGER',
      capacityKg: 800,
      travelHeightM: 39,
      speedMs: 1.5,
      machineRoomType: 'MR',
      doorType: 'CENTER_OPEN',
      doorWidthMm: 900,
      buildingUsage: 'COMMERCIAL',
      marginPercent: 0,
      floorLabels: 'B,G,M,1,2,3,4,5,6,7,8,9,10',
      entranceCount: 1,
    } satisfies Record<string, unknown>;

    beforeEach(() => {
      repo.findById.mockResolvedValue(draft);
      calc.calculateSpecs.mockReturnValue(calcResultForLine);
      repo.addLine.mockImplementation(async () => ({}));
    });

    it('fills the frozen formula\'s stops from the floor labels', async () => {
      await service.addLine(user, draft.id, lineDto as never);
      expect(calc.calculateSpecs).toHaveBeenCalledWith(
        expect.objectContaining({ stops: 13, taxPercent: 0 }),
      );
    });

    it('derives the page-1 cell and the compressed floor summary', async () => {
      await service.addLine(user, draft.id, lineDto as never);
      const [, , values] = repo.addLine.mock.calls[0]!;
      expect(values.specSummary).toBe(
        '800KG -10persons / Speed 1.5m/s / B+G+M+10 / 13 floors/13 doors',
      );
      expect(values.floorDisplaySummary).toBe('B+G+M+10');
    });

    it("prices the line's own VAT off the quotation's resolved rate, in decimal", async () => {
      await service.addLine(user, draft.id, lineDto as never);
      const [, , values] = repo.addLine.mock.calls[0]!;
      expect(values.pricingBreakdown.taxAmount).toBe('1111500.00');
      expect(values.pricingBreakdown.totalPrice).toBe('8521500.00');
      expect(values.lineTotalEtb).toBe('7410000.00');
    });

    it('multiplies the line total by the number of units', async () => {
      await service.addLine(user, draft.id, {
        ...lineDto,
        quantity: 3,
      } as never);
      const [, , values] = repo.addLine.mock.calls[0]!;
      expect(values.unitPriceEtb).toBe('7410000.00');
      expect(values.lineTotalEtb).toBe('22230000.00');
    });

    it('refuses a line that states neither stops nor floor labels', async () => {
      const { floorLabels: _drop, ...noFloors } = lineDto;
      await expect(
        service.addLine(user, draft.id, noFloors as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts an explicit stop count when there is no floor plan', async () => {
      const { floorLabels: _drop, ...noFloors } = lineDto;
      await service.addLine(user, draft.id, {
        ...noFloors,
        stops: 6,
      } as never);
      expect(calc.calculateSpecs).toHaveBeenCalledWith(
        expect.objectContaining({ stops: 6 }),
      );
    });
  });
});
