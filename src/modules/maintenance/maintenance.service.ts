import { Injectable } from '@nestjs/common';

import type { MaintenanceAgreementTemplateData } from '../../common/export/templates/maintenance-agreement.template';
import type { MaintenanceReportTemplateData } from '../../common/export/templates/maintenance-report.template';
import { MaintenanceReminderService } from '../reminders/maintenance-reminders.service';
import type { AuthenticatedUser } from '../../types/auth.types';
import type {
  BreakdownStatus,
  CreateBreakdownDto,
  CreateMaintenanceContractDto,
  LogServiceVisitDto,
  MaintenanceContractStatus,
  UpdateBreakdownDto,
  UpdateMaintenanceContractDto,
} from './dto/maintenance.dto';
import {
  MaintenanceRepository,
  type BreakdownExportRow,
  type MaintenanceContractExportRow,
} from './maintenance.repository';

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly maintenanceRepository: MaintenanceRepository,
    private readonly maintenanceReminderService: MaintenanceReminderService,
  ) {}

  listContracts(
    user: AuthenticatedUser,
    options: {
      page?: string;
      pageSize?: string;
      status?: MaintenanceContractStatus;
      customerId?: string;
    },
  ) {
    return this.maintenanceRepository.listContracts(user.tenantId, options);
  }

  streamAllContracts(
    user: AuthenticatedUser,
    options: { status?: MaintenanceContractStatus; customerId?: string },
  ): AsyncGenerator<MaintenanceContractExportRow> {
    return this.maintenanceRepository.streamAllContracts(
      user.tenantId,
      options,
    );
  }

  getContract(user: AuthenticatedUser, id: string) {
    return this.maintenanceRepository.findContractById(user.tenantId, id);
  }

  createContract(user: AuthenticatedUser, dto: CreateMaintenanceContractDto) {
    return this.maintenanceRepository.createContract(
      user.tenantId,
      user.userId,
      dto,
    );
  }

  updateContract(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateMaintenanceContractDto,
  ) {
    return this.maintenanceRepository.updateContract(user.tenantId, id, dto);
  }

  logVisit(
    user: AuthenticatedUser,
    contractId: string,
    dto: LogServiceVisitDto,
  ) {
    return this.maintenanceRepository.logVisit(
      user.tenantId,
      contractId,
      user.userId,
      dto,
    );
  }

  /** One maintenance contract shaped for the printed Maintenance & Service Agreement. */
  async getContractDocumentData(
    user: AuthenticatedUser,
    id: string,
  ): Promise<MaintenanceAgreementTemplateData> {
    const row = await this.maintenanceRepository.findContractForDocument(
      user.tenantId,
      id,
    );
    return {
      contractRef: row.id,
      startDate: row.startDate,
      customerName: row.customerName ?? '—',
      customerAddress:
        [row.customerAddressLine1, row.customerAddressLine2, row.customerCity]
          .filter(Boolean)
          .join(', ') || null,
      customerPhone: row.customerPhone,
      customerTin: row.customerTin,
      assetName: row.assetName ?? '—',
      buildingName: row.buildingName,
      assetSerialNumber: row.assetSerialNumber,
      specSummary: row.specSummary,
      recurrence: row.recurrence,
      monthlyFeeEtb: row.monthlyFeeEtb,
      feeIncludesVat: row.feeIncludesVat,
      termMonths: row.termMonths,
      autoRenews: row.autoRenews,
      noticeDays: row.noticeDays,
      cureDays: row.cureDays,
      // `notes` is deliberately NOT passed: it is the internal remark field
      // and this document is the one the customer signs.
      scopeOfWork: row.scopeOfWork,
    };
  }

  /**
   * One service visit shaped for the printed Maintenance Report. The
   * mapping lives here rather than in a mapper file because it is a
   * field rename and nothing else — the repository already joins in the
   * asset, customer and technician.
   */
  async getVisitDocumentData(
    user: AuthenticatedUser,
    visitId: string,
  ): Promise<MaintenanceReportTemplateData & { visitId: string }> {
    const row = await this.maintenanceRepository.findVisitForDocument(
      user.tenantId,
      visitId,
    );
    return {
      visitId: row.id,
      contractRef: row.contractId,
      // The client's form says "Elevator Number": the serial is what is
      // stamped on the machine, the name is the fallback for an asset
      // registered without one.
      elevatorNumber: row.assetSerialNumber ?? row.assetName ?? '—',
      assetName: row.assetName ?? '—',
      buildingName: row.buildingName,
      customerName: row.customerName ?? '—',
      visitedAt: row.visitedAt,
      technicianName: row.technicianName,
      inspectionResults: row.inspectionResults,
      partsReplaced: row.partsReplaced,
      recommendations: row.recommendations,
      notes: row.notes,
    };
  }

  listVisits(
    user: AuthenticatedUser,
    contractId: string,
    options: { page?: string; pageSize?: string } = {},
  ) {
    return this.maintenanceRepository.listVisits(
      user.tenantId,
      contractId,
      options,
    );
  }

  listBreakdowns(
    user: AuthenticatedUser,
    options: {
      page?: string;
      pageSize?: string;
      status?: BreakdownStatus;
    },
  ) {
    return this.maintenanceRepository.listBreakdowns(user.tenantId, options);
  }

  streamAllBreakdowns(
    user: AuthenticatedUser,
    options: { status?: BreakdownStatus },
  ): AsyncGenerator<BreakdownExportRow> {
    return this.maintenanceRepository.streamAllBreakdowns(
      user.tenantId,
      options,
    );
  }

  async createBreakdown(user: AuthenticatedUser, dto: CreateBreakdownDto) {
    const breakdown = await this.maintenanceRepository.createBreakdown(
      user.tenantId,
      user.userId,
      dto,
    );
    await this.notifyIfAssigned(user.tenantId, breakdown);
    return breakdown;
  }

  async updateBreakdown(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateBreakdownDto,
  ) {
    const breakdown = await this.maintenanceRepository.updateBreakdown(
      user.tenantId,
      id,
      dto,
    );
    await this.notifyIfAssigned(user.tenantId, breakdown);
    return breakdown;
  }

  /**
   * Immediate (not cron) reminder — task-2 brief §2.2. Fired after EVERY
   * create/update that leaves the breakdown assigned, not only ones that
   * actually change the assignee: the outbox's own dedupeKey
   * (`breakdown:<id>:<assigneeId>`) is what makes that safe, so this never
   * needs to diff old vs new itself. notifyBreakdownAssigned never throws,
   * so a reminder failure can never fail the write that already committed.
   */
  private async notifyIfAssigned(
    tenantId: string,
    breakdown: { id: string; assignedUserId: string | null },
  ): Promise<void> {
    if (breakdown.assignedUserId) {
      await this.maintenanceReminderService.notifyBreakdownAssigned(
        tenantId,
        breakdown.id,
      );
    }
  }
}
