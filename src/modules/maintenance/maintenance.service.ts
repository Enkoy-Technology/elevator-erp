import { Injectable } from '@nestjs/common';

import type { AuthenticatedUser } from '../../types/auth.types';
import type {
  BreakdownStatus,
  CreateBreakdownDto,
  CreateMaintenanceContractDto,
  LogServiceVisitDto,
  UpdateBreakdownDto,
  UpdateMaintenanceContractDto,
} from './dto/maintenance.dto';
import { MaintenanceRepository } from './maintenance.repository';

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly maintenanceRepository: MaintenanceRepository,
  ) {}

  listContracts(
    user: AuthenticatedUser,
    options: { page?: string; pageSize?: string; status?: string },
  ) {
    return this.maintenanceRepository.listContracts(user.tenantId, options);
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

  listVisits(user: AuthenticatedUser, contractId: string) {
    return this.maintenanceRepository.listVisits(user.tenantId, contractId);
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

  createBreakdown(user: AuthenticatedUser, dto: CreateBreakdownDto) {
    return this.maintenanceRepository.createBreakdown(
      user.tenantId,
      user.userId,
      dto,
    );
  }

  updateBreakdown(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateBreakdownDto,
  ) {
    return this.maintenanceRepository.updateBreakdown(user.tenantId, id, dto);
  }
}
