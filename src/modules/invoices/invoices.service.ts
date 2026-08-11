import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';

import { todayIso } from '../../common/business-time';
import type { PaginatedResult } from '../../common/pagination';
import type { InvoiceStatus } from '../../database/schema';
import { ratePayloadSchemaFor } from '../rates/rate-payloads';
import { RatesService } from '../rates/rates.service';
import type { AuthenticatedUser } from '../../types/auth.types';
import type { CreateInvoiceDto } from './dto/create-invoice.dto';
import type { FiscalMirrorDto } from './dto/fiscal-mirror.dto';
import type { WithholdingDto } from './dto/withholding.dto';
import { computeLineTotal, sumLineTotals } from './invoice-money';
import {
  InvoicesRepository,
  type AgingRow,
  type InvoiceExportRow,
  type InvoiceRecord,
  type InvoiceWithLines,
} from './invoices.repository';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly invoicesRepository: InvoicesRepository,
    private readonly ratesService: RatesService,
  ) {}

  list(
    user: AuthenticatedUser,
    options: {
      status?: InvoiceStatus;
      customerId?: string;
      q?: string;
      page?: string;
      pageSize?: string;
    },
  ): Promise<PaginatedResult<InvoiceRecord>> {
    return this.invoicesRepository.list(user.tenantId, options);
  }

  streamAll(
    user: AuthenticatedUser,
    options: { status?: InvoiceStatus; customerId?: string; q?: string },
  ): AsyncGenerator<InvoiceExportRow> {
    return this.invoicesRepository.streamAll(user.tenantId, options);
  }

  async getById(user: AuthenticatedUser, id: string): Promise<InvoiceWithLines> {
    const row = await this.invoicesRepository.findByIdWithLines(user.tenantId, id);
    if (!row) {
      throw new NotFoundException('Invoice not found');
    }
    return row;
  }

  issueFromProforma(
    user: AuthenticatedUser,
    proformaId: string,
    dueDate: string | undefined,
  ): Promise<InvoiceWithLines> {
    return this.invoicesRepository.issueFromProforma(
      user.tenantId,
      user.userId,
      proformaId,
      dueDate ?? null,
    );
  }

  /**
   * Standalone invoice (e.g. maintenance billing). VAT is a statutory rate,
   * never client-supplied — resolved here from today's open rate version
   * (same RatesService.resolve('VAT', ...) pattern as
   * QuotationsService.createForProject), and the line/subtotal/VAT/total
   * math is done in decimal.js off that string payload so money never
   * round-trips through a float. The repository only owns the
   * transaction-bound protocol (numbering claim + insert).
   */
  async createStandalone(
    user: AuthenticatedUser,
    dto: CreateInvoiceDto,
  ): Promise<InvoiceWithLines> {
    const rateVersion = await this.ratesService.resolve('VAT', todayIso());
    const vatPayload = ratePayloadSchemaFor('VAT').parse(rateVersion.payload) as {
      percent: string;
    };
    const vatPercent = new Decimal(vatPayload.percent);

    const lines = dto.lines.map((line, index) => ({
      lineNo: index + 1,
      description: line.description,
      quantity: line.quantity,
      unitPriceEtb: line.unitPriceEtb,
      lineTotalEtb: computeLineTotal(line.quantity, line.unitPriceEtb),
    }));
    const subtotalEtb = sumLineTotals(lines.map((l) => l.lineTotalEtb));
    const vatEtb = new Decimal(subtotalEtb)
      .mul(vatPercent)
      .div(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2);
    const totalEtb = new Decimal(subtotalEtb).plus(vatEtb).toFixed(2);

    return this.invoicesRepository.createStandalone(user.tenantId, user.userId, {
      customerId: dto.customerId,
      projectId: dto.projectId ?? null,
      dueDate: dto.dueDate ?? null,
      subtotalEtb,
      vatEtb,
      totalEtb,
      rateVersionId: rateVersion.id,
      lines,
    });
  }

  voidInvoice(
    user: AuthenticatedUser,
    id: string,
    reason: string,
  ): Promise<InvoiceRecord> {
    return this.invoicesRepository.voidInvoice(user.tenantId, id, reason);
  }

  patchFiscal(
    user: AuthenticatedUser,
    id: string,
    dto: FiscalMirrorDto,
  ): Promise<InvoiceRecord> {
    return this.invoicesRepository.patchFiscal(user.tenantId, id, dto);
  }

  recordWithholding(
    user: AuthenticatedUser,
    id: string,
    dto: WithholdingDto,
  ): Promise<InvoiceRecord> {
    return this.invoicesRepository.recordWithholding(user.tenantId, id, dto);
  }

  agingReport(user: AuthenticatedUser): Promise<AgingRow[]> {
    return this.invoicesRepository.agingReport(user.tenantId);
  }
}
