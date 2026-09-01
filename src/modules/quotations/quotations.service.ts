import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { todayIso } from '../../common/business-time';
import {
  DiscountApprovalRequiredError,
  WorkflowTransitionError,
} from '../../common/exceptions';
import type { PaginatedResult } from '../../common/pagination';
import type { QuoteStatus } from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import { D, money } from '../elevator-calc/calc-math';
import { ElevatorCalcService } from '../elevator-calc/elevator-calc.service';
import type { CalcInput, PricingBreakdown } from '../elevator-calc/types';
import { ProjectsService } from '../projects/projects.service';
import { ratePayloadSchemaFor } from '../rates/rate-payloads';
import { RatesService } from '../rates/rates.service';
import type { CreateQuotationDto } from './dto/create-quotation.dto';
import type { PriceQuotationDto } from './dto/price-quotation.dto';
import type {
  CreateQuotationLineDto,
  ReorderQuotationLinesDto,
  UpdateQuotationLineDto,
} from './dto/quotation-line.dto';
import type { UpdateQuotationTermsDto } from './dto/quotation-terms.dto';
import type { QuotationDocumentRow } from './quotation-document.mapper';
import {
  allocateToLines,
  computeDiscount,
  deriveFromGrandTotal,
} from './quote-pricing';
import {
  buildSpecSummary,
  describeFloorPlan,
  paymentTermsMismatchReason,
} from './quote-spec';
import { canTransitionQuoteStatus } from './quote-status';
import {
  QuotationsRepository,
  type QuotationInsert,
  type QuotationLineRecord,
  type QuotationLineValues,
  type QuotationPaymentTermRecord,
  type QuotationRecord,
} from './quotations.repository';

@Injectable()
export class QuotationsService {
  constructor(
    private readonly quotationsRepository: QuotationsRepository,
    private readonly calcService: ElevatorCalcService,
    private readonly projectsService: ProjectsService,
    private readonly ratesService: RatesService,
  ) {}

  list(
    user: AuthenticatedUser,
    options: {
      projectId?: string;
      status?: QuoteStatus;
      page?: string;
      pageSize?: string;
    },
  ): Promise<PaginatedResult<QuotationRecord>> {
    return this.quotationsRepository.list(user.tenantId, options);
  }

  async getById(
    user: AuthenticatedUser,
    id: string,
  ): Promise<QuotationRecord> {
    const row = await this.quotationsRepository.findById(user.tenantId, id);
    if (!row) {
      throw new NotFoundException('Quotation not found');
    }
    return row;
  }

  async createForProject(
    user: AuthenticatedUser,
    projectId: string,
    dto: CreateQuotationDto,
  ): Promise<QuotationRecord> {
    // Reuses the exported ProjectsService (tenant-scoped, 404s on missing).
    // Deliberately does NOT gate on project status: quoting is allowed from
    // any stage, and the project's stage is advanced to QUOTATION as a
    // consequence of the insert — see QuotationsRepository.create, which does
    // it in the insert's own transaction.
    const project = await this.projectsService.getById(user, projectId);

    const { validUntil, notes, ...calcInput } = dto;

    // VAT is a statutory rate, never a client-supplied or hardcoded percent:
    // resolve today's open rate version and do the tax math ourselves in
    // decimal.js off its string payload, so the money never round-trips
    // through a float.
    const rateVersion = await this.ratesService.resolve('VAT', todayIso());
    const vatPayload = ratePayloadSchemaFor('VAT').parse(
      rateVersion.payload,
    ) as { percent: string };
    const vatPercent = D(vatPayload.percent);

    // calc's own taxPercent input is unused here — pass 0 as a placeholder
    // and override the tax/total lines below with the VAT computed above,
    // so the persisted snapshot matches the persisted numeric columns.
    const result = this.calcService.calculateSpecs({ ...calcInput, taxPercent: 0 });

    const subtotalWithMargin = D(result.pricing.subtotalWithMargin);
    const taxAmount = subtotalWithMargin.mul(vatPercent).div(100);
    const totalPrice = subtotalWithMargin.plus(taxAmount);
    const taxAmountEtb = money(taxAmount);
    const totalPriceEtb = money(totalPrice);

    const pricingBreakdown: PricingBreakdown = {
      ...result.pricing,
      taxAmount: taxAmountEtb,
      totalPrice: totalPriceEtb,
    };

    const id = randomUUID();
    return this.quotationsRepository.create(user.tenantId, {
      tenantId: user.tenantId,
      id,
      projectId: project.id,
      customerId: project.customerId,
      quoteNumber: buildQuoteNumber(id),
      status: 'DRAFT',
      version: 1,
      calcInput,
      technicalSpec: result.technical,
      pricingBreakdown,
      rateVersionId: rateVersion.id,
      marginPercent: String(calcInput.marginPercent),
      taxPercent: vatPercent.toFixed(2),
      subtotalEtb: result.pricing.totalBeforeMargin,
      marginAmountEtb: result.pricing.marginAmount,
      taxAmountEtb,
      totalPriceEtb,
      validUntil: validUntil ? new Date(validUntil) : null,
      notes: notes ?? null,
      createdByUserId: user.userId,
      statusChangedAt: new Date(),
    });
  }

  /**
   * Row + customer/project display names for document rendering (pdf/docx/
   * xlsx). Allowed regardless of status — including DRAFT — per the task-3
   * brief: no watermark, no gate; flagged there as a product follow-up.
   */
  async getDocumentData(
    user: AuthenticatedUser,
    id: string,
  ): Promise<QuotationDocumentData> {
    const row = await this.quotationsRepository.findByIdForDocument(
      user.tenantId,
      id,
    );
    if (!row) {
      throw new NotFoundException('Quotation not found');
    }
    // Additive: `lines` and `paymentTerms` are new keys alongside everything
    // the existing templates already read, so a renderer that ignores them
    // renders exactly what it rendered before. `listLines` synthesizes the
    // single line a pre-lines quotation implies, so this is never empty.
    const [lines, paymentTerms] = await Promise.all([
      this.quotationsRepository.listLines(user.tenantId, id),
      this.quotationsRepository.listPaymentTerms(user.tenantId, id),
    ]);
    return { ...row, lines, paymentTerms };
  }

  submit(user: AuthenticatedUser, id: string): Promise<QuotationRecord> {
    return this.transition(user, id, 'PENDING_APPROVAL');
  }

  approve(user: AuthenticatedUser, id: string): Promise<QuotationRecord> {
    return this.transition(user, id, 'APPROVED', {
      approvedByUserId: user.userId,
      approvedAt: new Date(),
    });
  }

  reject(
    user: AuthenticatedUser,
    id: string,
    reason: string,
  ): Promise<QuotationRecord> {
    return this.transition(user, id, 'REJECTED', { rejectedReason: reason });
  }

  expire(user: AuthenticatedUser, id: string): Promise<QuotationRecord> {
    return this.transition(user, id, 'EXPIRED');
  }

  // ---------------------------------------------------------------------
  // Line items. One quotation can sell three lifts of two different specs
  // (their page 1 has a "No of Units" column), and each line is priced by
  // its OWN calculator run — the same call the single-spec flow above makes.
  // ---------------------------------------------------------------------

  async listLines(
    user: AuthenticatedUser,
    id: string,
  ): Promise<QuotationLineRecord[]> {
    return this.quotationsRepository.listLines(user.tenantId, id);
  }

  async addLine(
    user: AuthenticatedUser,
    id: string,
    dto: CreateQuotationLineDto,
  ): Promise<QuotationLineRecord> {
    const quote = await this.getById(user, id);
    return this.quotationsRepository.addLine(
      user.tenantId,
      id,
      this.buildLineValues(quote.taxPercent, dto),
    );
  }

  /**
   * Patch semantics: the body is merged onto the line's stored `calcInput`
   * and spec fields, and the calculator is re-run off the merged result — so
   * changing the control system does not require restating the capacity, and
   * changing the floor labels re-derives the stops the price uses.
   */
  async updateLine(
    user: AuthenticatedUser,
    id: string,
    lineId: string,
    dto: UpdateQuotationLineDto,
  ): Promise<QuotationLineRecord> {
    const quote = await this.getById(user, id);
    const lines = await this.quotationsRepository.listLines(user.tenantId, id);
    const line = lines.find((candidate) => candidate.id === lineId);
    if (!line) {
      throw new NotFoundException('Quotation line not found');
    }
    const merged = {
      ...(line.calcInput as Record<string, unknown>),
      quantity: line.quantity,
      specSummary: line.specSummary,
      machineRoomLabel: line.machineRoomLabel,
      floorLabels: line.floorLabels,
      floorDisplaySummary: line.floorDisplaySummary,
      doorHeightMm: line.doorHeightMm,
      ropingRatio: line.ropingRatio,
      tractionMachineType: line.tractionMachineType,
      controlSystem: line.controlSystem,
      powerSupply: line.powerSupply,
      lightSupply: line.lightSupply,
      entranceCount: line.entranceCount,
      ...definedOnly(dto),
    } as CreateQuotationLineDto;
    return this.quotationsRepository.updateLine(
      user.tenantId,
      id,
      lineId,
      this.buildLineValues(quote.taxPercent, merged),
    );
  }

  async removeLine(
    user: AuthenticatedUser,
    id: string,
    lineId: string,
  ): Promise<QuotationLineRecord[]> {
    return this.quotationsRepository.removeLine(user.tenantId, id, lineId);
  }

  async reorderLines(
    user: AuthenticatedUser,
    id: string,
    dto: ReorderQuotationLinesDto,
  ): Promise<QuotationLineRecord[]> {
    return this.quotationsRepository.reorderLines(
      user.tenantId,
      id,
      dto.lineIds,
    );
  }

  // ---------------------------------------------------------------------
  // Negotiated pricing.
  // ---------------------------------------------------------------------

  /**
   * Price the quotation BACKWARD from the round figure the customer pays,
   * which is how this client actually sells: their proforma reads
   * 7,835,000.00 where the formula gives 8,521,500.00, and the document's
   * ex-VAT and VAT lines are derived from the total, never the other way
   * round.
   *
   * `marginAmountEtb` is zeroed because the negotiated subtotal IS the
   * selling price and already contains the margin — leaving the calculator's
   * margin on the header would print a document whose Subtotal + Margin +
   * VAT does not equal its Total, which is the exact class of drift this
   * work exists to remove. `marginPercent` is left alone: it is the INPUT
   * the calculator was run with, and it is what makes `calculatedTotalEtb`
   * reproducible.
   */
  async priceFromGrandTotal(
    user: AuthenticatedUser,
    id: string,
    dto: PriceQuotationDto,
  ): Promise<QuotationRecord> {
    const quote = await this.getById(user, id);
    const lines = await this.quotationsRepository.listLines(user.tenantId, id);

    // The CALCULATOR's own list totals, not the lines' current amounts:
    // re-pricing an already-negotiated quotation must measure the discount
    // against the formula, not against last week's negotiation.
    const listTotals = lines.map((line) => listTotalEtb(line));
    const listSum = listTotals.reduce((sum, total) => sum.plus(D(total)), D(0));
    const calculatedTotalEtb = money(
      listSum.mul(D(quote.taxPercent).div(100).plus(1)),
    );

    const { subtotalEtb, taxAmountEtb, totalEtb } = deriveFromGrandTotal(
      dto.grandTotalEtb,
      quote.taxPercent,
    );
    const allocated = allocateToLines(listTotals, subtotalEtb);
    const { discountAmountEtb, discountPercent } = computeDiscount(
      calculatedTotalEtb,
      totalEtb,
    );
    // discount_percent is numeric(5,2): it can hold +/-999.99 and no more.
    // A fat-fingered extra zero on the grand total yields a four-digit
    // premium, which Postgres rejects with 22003 and the exception filter
    // renders as a 500. A price that far from the formula is a typo, not a
    // negotiation, so name it at the boundary and return a 400.
    if (D(discountPercent).abs().greaterThan(999.99)) {
      throw new BadRequestException(
        `Quoted total ${dto.grandTotalEtb} ETB is ${discountPercent}% away from the calculated ${calculatedTotalEtb} ETB. Check the figure — a difference beyond 999.99% is treated as a typo.`,
      );
    }

    return this.quotationsRepository.applyPricing(
      user.tenantId,
      id,
      {
        subtotalEtb,
        marginAmountEtb: '0.00',
        taxAmountEtb,
        totalPriceEtb: totalEtb,
        calculatedTotalEtb,
        discountAmountEtb,
        discountPercent,
      },
      lines.map((line, index) => {
        const lineTotalEtb = allocated[index]!;
        return {
          id: line.id,
          lineTotalEtb,
          // Derived by division, so unit * units can differ from the line
          // total by a cent — which is exactly the rounding the client
          // absorbs when they agree a round grand total (see the
          // `line_total_etb` note in document-lines.ts).
          unitPriceEtb: money(D(lineTotalEtb).div(Math.max(1, line.quantity))),
        };
      }),
    );
  }

  /**
   * Sign the discount off, as yourself. Deliberately not a field on the
   * pricing body: an approver names themselves, they are not named by the
   * person whose discount is being approved.
   */
  async approveDiscount(
    user: AuthenticatedUser,
    id: string,
  ): Promise<QuotationRecord> {
    const quote = await this.getById(user, id);
    if (quote.discountPercent === null) {
      throw new BadRequestException(
        'This quotation has no negotiated discount to approve — price it first.',
      );
    }
    return this.quotationsRepository.setDiscountApprovedBy(
      user.tenantId,
      id,
      user.userId,
    );
  }

  /**
   * NULL threshold — the default — means no approval is required at all and
   * the sales manager just saves. The lookup only happens on a quotation
   * that actually carries a negotiated discount.
   */
  private async assertDiscountApproved(
    user: AuthenticatedUser,
    quote: QuotationRecord,
  ): Promise<void> {
    if (quote.discountPercent === null || quote.discountApprovedByUserId) {
      return;
    }
    const threshold =
      await this.quotationsRepository.getDiscountApprovalThresholdPercent(
        user.tenantId,
      );
    // A negative percent is a PREMIUM, not a discount — it passes.
    if (threshold === null || D(quote.discountPercent).lte(D(threshold))) {
      return;
    }
    throw new DiscountApprovalRequiredError(quote.discountPercent, threshold);
  }

  // ---------------------------------------------------------------------
  // Commercial terms (page 1's prose + the payment schedule).
  // ---------------------------------------------------------------------

  async listPaymentTerms(
    user: AuthenticatedUser,
    id: string,
  ): Promise<QuotationPaymentTermRecord[]> {
    return this.quotationsRepository.listPaymentTerms(user.tenantId, id);
  }

  async updateTerms(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateQuotationTermsDto,
  ): Promise<{
    quotation: QuotationRecord;
    paymentTerms: QuotationPaymentTermRecord[];
  }> {
    const { paymentTerms, ...terms } = dto;
    if (paymentTerms) {
      const mismatch = paymentTermsMismatchReason(paymentTerms);
      if (mismatch) {
        throw new BadRequestException(mismatch);
      }
    }
    const quotation = await this.quotationsRepository.updateTerms(
      user.tenantId,
      id,
      definedOnly(terms),
    );
    const saved = paymentTerms
      ? await this.quotationsRepository.replacePaymentTerms(
          user.tenantId,
          id,
          paymentTerms,
        )
      : await this.quotationsRepository.listPaymentTerms(user.tenantId, id);
    return { quotation, paymentTerms: saved };
  }

  /**
   * One line's calculator run, plus the page-2 spec fields a human types.
   *
   * `stops` is the ONE place the two halves meet: when floor labels are
   * given, their count fills the existing `calcInput.stops`. How stops feed
   * the price is untouched — the frozen formula is called with the same
   * field it has always been called with.
   */
  private buildLineValues(
    taxPercent: string,
    dto: CreateQuotationLineDto,
  ): QuotationLineValues {
    const plan = describeFloorPlan(dto.floorLabels, dto.entranceCount);
    const stops = plan?.stops ?? dto.stops;
    if (stops === undefined) {
      throw new BadRequestException(
        'A line needs either stops or floorLabels (the floor count is what fills stops).',
      );
    }

    const calcInput: CalcInput = {
      productType: dto.productType,
      capacityKg: dto.capacityKg,
      stops,
      travelHeightM: dto.travelHeightM,
      speedMs: dto.speedMs,
      machineRoomType: dto.machineRoomType,
      doorType: dto.doorType,
      doorWidthMm: dto.doorWidthMm,
      buildingUsage: dto.buildingUsage,
      marginPercent: dto.marginPercent,
      // Same placeholder as createForProject: VAT is the statutory rate
      // already resolved onto the quotation header, applied below in
      // decimal.js so no money round-trips through a float.
      taxPercent: 0,
    };
    const result = this.calcService.calculateSpecs(calcInput);

    const subtotalWithMargin = D(result.pricing.subtotalWithMargin);
    const taxAmount = subtotalWithMargin.mul(D(taxPercent)).div(100);
    const pricingBreakdown: PricingBreakdown = {
      ...result.pricing,
      taxAmount: money(taxAmount),
      totalPrice: money(subtotalWithMargin.plus(taxAmount)),
    };

    const quantity = dto.quantity ?? 1;
    const { taxPercent: _unused, ...storedCalcInput } = calcInput;

    return {
      productType: dto.productType,
      calcInput: storedCalcInput,
      technicalSpec: result.technical,
      pricingBreakdown,
      quantity,
      // List prices. A negotiated grand total overwrites both — see
      // priceFromGrandTotal.
      unitPriceEtb: money(subtotalWithMargin),
      lineTotalEtb: money(subtotalWithMargin.mul(quantity)),
      specSummary:
        dto.specSummary ??
        buildSpecSummary({
          capacityKg: dto.capacityKg,
          capacityPersons: result.technical.capacityPersons,
          speedMs: dto.speedMs,
          plan,
        }),
      machineRoomLabel: dto.machineRoomLabel ?? null,
      floorLabels: dto.floorLabels ?? null,
      floorDisplaySummary:
        dto.floorDisplaySummary ?? plan?.displaySummary ?? null,
      doorHeightMm: dto.doorHeightMm ?? null,
      ropingRatio: dto.ropingRatio ?? null,
      tractionMachineType: dto.tractionMachineType ?? null,
      controlSystem: dto.controlSystem ?? null,
      powerSupply: dto.powerSupply ?? null,
      lightSupply: dto.lightSupply ?? null,
      entranceCount: dto.entranceCount ?? null,
    };
  }

  private async transition(
    user: AuthenticatedUser,
    id: string,
    to: QuoteStatus,
    extra: Partial<
      Pick<QuotationInsert, 'approvedByUserId' | 'approvedAt' | 'rejectedReason'>
    > = {},
  ): Promise<QuotationRecord> {
    const quote = await this.getById(user, id);
    if (!canTransitionQuoteStatus(quote.status, to)) {
      throw new WorkflowTransitionError(
        `Cannot transition quotation from ${quote.status} to ${to}`,
      );
    }
    if (to === 'PENDING_APPROVAL') {
      await this.assertDiscountApproved(user, quote);
    }
    return this.quotationsRepository.updateStatus(
      user.tenantId,
      id,
      quote.status,
      to,
      extra,
    );
  }
}

// ponytail: non-sequential quote number (year + first 8 hex of the id) — unique
// with no cross-transaction sequence/race. Swap to a per-tenant sequence if
// finance ever needs gap-free numbering.
const buildQuoteNumber = (id: string): string =>
  `QTN-${new Date().getFullYear()}-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

/**
 * Everything the document renderers read, in one shape: the quotation row
 * with its display names (unchanged), plus its lines and payment schedule.
 */
export type QuotationDocumentData = QuotationDocumentRow & {
  lines: QuotationLineRecord[];
  paymentTerms: QuotationPaymentTermRecord[];
};

/**
 * A PATCH body must not blank what it does not mention. TypeScript class
 * fields are defined-as-undefined under this tsconfig, so an absent optional
 * property is present-and-undefined on the DTO instance and would spread
 * over a stored value.
 */
const definedOnly = <T extends object>(source: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  ) as Partial<T>;

/**
 * What the CALCULATOR says a line is worth, ex-VAT — the basis both the
 * discount and the pro-rata allocation are measured against, so neither
 * drifts when a quotation is re-priced. Falls back to the stored line total
 * for a hand-entered line no calculator run produced.
 */
const listTotalEtb = (line: QuotationLineRecord): string => {
  const breakdown = line.pricingBreakdown as {
    subtotalWithMargin?: string;
  } | null;
  return breakdown?.subtotalWithMargin
    ? money(D(breakdown.subtotalWithMargin).mul(line.quantity))
    : (line.lineTotalEtb ?? '0.00');
};
