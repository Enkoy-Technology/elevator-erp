import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import type { Response } from 'express';

import { todayIso } from '../../common/business-time';
import { CurrentUser, Roles } from '../../common/decorators';
import { DocumentDocxService } from '../../common/export/document-docx.service';
import { parseDocumentFormat } from '../../common/export/document-format';
import { DocumentPdfService } from '../../common/export/document-pdf.service';
import { parseExportFormat } from '../../common/export/export-query.dto';
import {
  type ColumnDef,
  setDownloadHeaders,
  singleRow,
  writeCsv,
  writeXlsx,
} from '../../common/export/tabular';
import { TenantBrandingProvider } from '../../common/export/tenant-branding.provider';
import { contractStatusEnum, type ContractStatus } from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import { ContractsService } from './contracts.service';
import { CancelContractDto } from './dto/cancel-contract.dto';
import { SignContractDto } from './dto/sign-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';

const CONTRACT_STATUSES = contractStatusEnum.enumValues;

export const CONTRACTS_EXPORT_COLUMNS: ColumnDef[] = [
  { key: 'id', header: 'ID' },
  { key: 'contractNumber', header: 'Contract Number' },
  { key: 'fiscalYearLabel', header: 'Fiscal Year' },
  { key: 'customerName', header: 'Customer' },
  { key: 'projectName', header: 'Project' },
  { key: 'contractValueEtb', header: 'Contract Value (ETB)', format: 'money' },
  { key: 'status', header: 'Status' },
  { key: 'signedAt', header: 'Signed At', format: 'date' },
  { key: 'warrantyMonths', header: 'Warranty (months)' },
  { key: 'handedOverAt', header: 'Handed Over At', format: 'date' },
  { key: 'handedOverToName', header: 'Handed Over To' },
  { key: 'cancelReason', header: 'Cancel Reason' },
  { key: 'proformaId', header: 'Proforma ID' },
  { key: 'projectId', header: 'Project ID' },
  { key: 'customerId', header: 'Customer ID' },
  { key: 'createdAt', header: 'Created At', format: 'date' },
];

/** The single-contract xlsx download — the readable subset, no ids. */
const CONTRACT_DOCUMENT_COLUMNS: ColumnDef[] = [
  { key: 'contractNumber', header: 'Contract Number' },
  { key: 'status', header: 'Status' },
  { key: 'customerName', header: 'Customer' },
  { key: 'projectName', header: 'Project' },
  { key: 'contractValueEtb', header: 'Contract Value (ETB)', format: 'money' },
  { key: 'signedAt', header: 'Signed At', format: 'date' },
  { key: 'warrantyMonths', header: 'Warranty (months)' },
  { key: 'scopeOfWork', header: 'Scope of Work' },
  { key: 'termsAndConditions', header: 'Terms and Conditions' },
];

@ApiTags('contracts')
@ApiBearerAuth('access-token')
@Controller()
@Roles('GENERAL_MANAGER', 'SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE')
export class ContractsController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly pdfService: DocumentPdfService,
    private readonly docxService: DocumentDocxService,
    private readonly tenantBranding: TenantBrandingProvider,
  ) {}

  @Post('proformas/:id/contract')
  @HttpCode(201)
  @Roles('GENERAL_MANAGER', 'SALES_MANAGER')
  @ApiOperation({
    summary:
      'Issue a DRAFT contract from an ISSUED proforma (gapless numbering, one per proforma, one transaction)',
  })
  issue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contractsService.issueFromProforma(user, id);
  }

  @Get('contracts')
  @ApiOperation({
    summary:
      'List contracts (project/customer/status filter + pagination), or stream a CSV/XLSX export with ?format=',
  })
  @ApiOkResponse({ description: 'Paginated contract list' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: false }) res: Response,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('format') formatRaw?: string,
    // Declared last on purpose: named query params, so HTTP order is
    // irrelevant, and appending keeps existing positional callers compiling.
    @Query('customerId') customerId?: string,
  ): Promise<void> {
    if (projectId !== undefined && !isUUID(projectId)) {
      throw new BadRequestException('projectId must be a UUID');
    }
    if (customerId !== undefined && !isUUID(customerId)) {
      throw new BadRequestException('customerId must be a UUID');
    }
    if (
      status !== undefined &&
      !(CONTRACT_STATUSES as readonly string[]).includes(status)
    ) {
      throw new BadRequestException(
        `status must be one of: ${CONTRACT_STATUSES.join(', ')}`,
      );
    }
    const parsedStatus = status as ContractStatus | undefined;
    const format = parseExportFormat(formatRaw);
    if (!format) {
      res.json(
        await this.contractsService.list(user, {
          projectId,
          customerId,
          status: parsedStatus,
          page,
          pageSize,
        }),
      );
      return;
    }
    const rows = this.contractsService.streamAll(user, {
      projectId,
      customerId,
      status: parsedStatus,
    });
    const filename = `contracts-${todayIso()}`;
    if (format === 'csv') {
      await writeCsv(res, filename, CONTRACTS_EXPORT_COLUMNS, rows);
    } else {
      await writeXlsx(res, filename, CONTRACTS_EXPORT_COLUMNS, rows);
    }
  }

  @Get('contracts/:id')
  @ApiOperation({ summary: 'Get contract by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contractsService.getById(user, id);
  }

  @Patch('contracts/:id')
  @ApiOperation({
    summary:
      'Edit the scope, terms and warranty period of a DRAFT contract. 409 once it is signed.',
  })
  @Roles('GENERAL_MANAGER', 'SALES_MANAGER')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDto,
  ) {
    return this.contractsService.update(user, id, dto);
  }

  @Post('contracts/:id/sign')
  @HttpCode(200)
  @Roles('GENERAL_MANAGER', 'SALES_MANAGER')
  @ApiOperation({
    summary:
      'Record that both parties signed (DRAFT -> SIGNED, advances the project to CONTRACT in the same transaction)',
  })
  sign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignContractDto,
  ) {
    return this.contractsService.sign(user, id, dto.signedAt);
  }

  @Post('contracts/:id/cancel')
  @HttpCode(200)
  @Roles('GENERAL_MANAGER', 'SALES_MANAGER')
  @ApiOperation({
    summary:
      'Cancel a DRAFT or SIGNED contract with a reason (append-only — does not revert the source proforma)',
  })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelContractDto,
  ) {
    return this.contractsService.cancel(user, id, dto.reason);
  }

  @Get('contracts/:id/document')
  @ApiOperation({
    summary:
      'Download the contract as PDF, Word, or Excel (?format=pdf|docx|xlsx). A DRAFT renders as "CONTRACT DRAFT"; once signed, as the agreement itself.',
  })
  async document(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('format') formatRaw: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const format = parseDocumentFormat(formatRaw);
    const { row, data } = await this.contractsService.getDocumentData(user, id);
    const filename = `contract-${row.contractNumber}`;

    if (format === 'xlsx') {
      // writeXlsx reads row[col.key] at runtime — the joined row has every
      // field CONTRACT_DOCUMENT_COLUMNS names. Same shape as
      // ProformasController.document.
      await writeXlsx(res, filename, CONTRACT_DOCUMENT_COLUMNS, singleRow(row));
      return;
    }

    const branding = await this.tenantBranding.get(user.tenantId);
    if (format === 'pdf') {
      const buf = await this.pdfService.renderDocumentPdf(
        'contract',
        data,
        branding,
      );
      setDownloadHeaders(res, filename, 'pdf', 'application/pdf');
      res.end(buf);
      return;
    }
    // No docx builder for 'contract' yet — this answers with
    // TemplateNotImplementedError until one is registered, the same
    // behaviour every not-yet-wired template already has.
    const buf = await this.docxService.renderDocumentDocx(
      'contract',
      data,
      branding,
    );
    setDownloadHeaders(
      res,
      filename,
      'docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.end(buf);
  }
}
