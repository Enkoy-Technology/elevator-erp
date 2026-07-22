import { Injectable, NotFoundException } from '@nestjs/common';

import { DuplicateCustomerError } from '../../common/exceptions';
import type { PaginatedResult } from '../../common/pagination';
import type { AuthenticatedUser } from '../../types/auth.types';
import { DuplicateDetectionService } from './duplicate-detection.service';
import type { CheckDuplicateCustomerDto } from './dto/check-duplicate-customer.dto';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import type { UpdateCustomerDto } from './dto/update-customer.dto';
import {
  CustomersRepository,
  type CustomerRecord,
} from './customers.repository';

@Injectable()
export class CustomersService {
  constructor(
    private readonly customersRepository: CustomersRepository,
    private readonly duplicateDetection: DuplicateDetectionService,
  ) {}

  list(
    user: AuthenticatedUser,
    options: { search?: string; page?: string; pageSize?: string },
  ): Promise<PaginatedResult<CustomerRecord>> {
    return this.customersRepository.list(user.tenantId, options);
  }

  async getById(
    user: AuthenticatedUser,
    id: string,
  ): Promise<CustomerRecord> {
    const row = await this.customersRepository.findById(user.tenantId, id);
    if (!row) {
      throw new NotFoundException('Customer not found');
    }
    return row;
  }

  checkDuplicate(
    user: AuthenticatedUser,
    dto: CheckDuplicateCustomerDto,
  ) {
    return this.duplicateDetection.check(user.tenantId, dto);
  }

  async create(
    user: AuthenticatedUser,
    dto: CreateCustomerDto,
  ): Promise<CustomerRecord> {
    const check = await this.duplicateDetection.check(user.tenantId, {
      name: dto.name,
      phone: dto.phone,
      alternatePhone: dto.alternatePhone,
      buildingName: dto.buildingName,
    });

    if (check.recommendation === 'HIGH_CONFIDENCE_DUPLICATE') {
      throw new DuplicateCustomerError(
        'A highly similar customer already exists. Creation blocked.',
        check.recommendation,
        check.matches,
      );
    }
    if (
      check.recommendation === 'REVIEW_BEFORE_CREATE' &&
      !dto.acknowledgePossibleDuplicate
    ) {
      throw new DuplicateCustomerError(
        'Possible duplicate customer. Review matches and resubmit with acknowledgePossibleDuplicate=true.',
        check.recommendation,
        check.matches,
      );
    }

    const row = await this.customersRepository.create(
      user.tenantId,
      user.userId,
      dto,
    );
    await this.duplicateDetection.upsertFingerprint(user.tenantId, row.id, {
      name: row.name,
      phone: row.phone ?? undefined,
      alternatePhone: row.alternatePhone ?? undefined,
      buildingName: row.buildingName ?? undefined,
      latitude: row.latitude,
      longitude: row.longitude,
    });
    return row;
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<CustomerRecord> {
    const row = await this.customersRepository.update(user.tenantId, id, dto);
    await this.duplicateDetection.upsertFingerprint(user.tenantId, row.id, {
      name: row.name,
      phone: row.phone ?? undefined,
      alternatePhone: row.alternatePhone ?? undefined,
      buildingName: row.buildingName ?? undefined,
      latitude: row.latitude,
      longitude: row.longitude,
    });
    return row;
  }

  softDelete(user: AuthenticatedUser, id: string): Promise<void> {
    return this.customersRepository.softDelete(user.tenantId, id);
  }
}
