import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

import { WorkflowTransitionError } from '../../common/exceptions';
import type { PaginatedResult } from '../../common/pagination';
import type { QuoteStatus } from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import { ElevatorCalcService } from '../elevator-calc/elevator-calc.service';
import { ProjectsService } from '../projects/projects.service';
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
    // ponytail: slice 1 does not gate on project status. Wiring the DAG
    // (only quote from SPEC_CALCULATION/QUOTATION, block terminal states) is
    // requirement #3 in FEATURE-phase2-quotations.md.
    const project = await this.projectsService.getById(user, projectId);

    const { validUntil, notes, ...calcInput } = dto;
    const result = this.calcService.calculateSpecs(calcInput);

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
      pricingBreakdown: result.pricing,
      marginPercent: String(calcInput.marginPercent),
      taxPercent: String(calcInput.taxPercent),
      subtotalEtb: result.pricing.totalBeforeMargin,
      marginAmountEtb: result.pricing.marginAmount,
      taxAmountEtb: result.pricing.taxAmount,
      totalPriceEtb: result.pricing.totalPrice,
      validUntil: validUntil ? new Date(validUntil) : null,
      notes: notes ?? null,
      createdByUserId: user.userId,
      statusChangedAt: new Date(),
    });
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

  cancel(user: AuthenticatedUser, id: string): Promise<QuotationRecord> {
    return this.transition(user, id, 'CANCELLED');
  }

  async convertToProforma(
    user: AuthenticatedUser,
    id: string,
  ): Promise<QuotationRecord> {
    const quote = await this.transition(user, id, 'PROFORMA', {
      proformaAt: new Date(),
    });
    // Advance the linked project QUOTATION → PROFORMA and record the quoted
    // amount. No-ops if the project already moved on.
    await this.projectsService.applyQuotationConversion(
      user,
      quote.projectId,
      'PROFORMA',
      { quotedAmountEtb: quote.totalPriceEtb },
    );
    return quote;
  }

  async convertToContract(
    user: AuthenticatedUser,
    id: string,
  ): Promise<QuotationRecord> {
    const quote = await this.transition(user, id, 'CONTRACT', {
      contractAt: new Date(),
    });
    await this.projectsService.applyQuotationConversion(
      user,
      quote.projectId,
      'CONTRACT',
      { contractAmountEtb: quote.totalPriceEtb },
    );
    return quote;
  }

  private async transition(
    user: AuthenticatedUser,
    id: string,
    to: QuoteStatus,
    extra: Partial<
      Pick<
        QuotationInsert,
        | 'approvedByUserId'
        | 'approvedAt'
        | 'rejectedReason'
        | 'proformaAt'
        | 'contractAt'
      >
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
