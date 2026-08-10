import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

import { todayIso } from '../../common/business-time';
import { WorkflowTransitionError } from '../../common/exceptions';
import type { PaginatedResult } from '../../common/pagination';
import type { QuoteStatus } from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import { D, money } from '../elevator-calc/calc-math';
import { ElevatorCalcService } from '../elevator-calc/elevator-calc.service';
import type { PricingBreakdown } from '../elevator-calc/types';
import { ProjectsService } from '../projects/projects.service';
import { ratePayloadSchemaFor } from '../rates/rate-payloads';
import { RatesService } from '../rates/rates.service';
import type { CreateQuotationDto } from './dto/create-quotation.dto';
import { canTransitionQuoteStatus } from './quote-status';
import {
  QuotationsRepository,
  type QuotationInsert,
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
    // ponytail: does not gate on project status. Wiring the DAG (only quote
    // from SPEC_CALCULATION/QUOTATION) is out of scope for this task.
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
