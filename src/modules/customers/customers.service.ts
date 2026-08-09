import { Injectable, NotFoundException } from '@nestjs/common';

import type { PaginatedResult } from '../../common/pagination';
import type { AuthenticatedUser } from '../../types/auth.types';
import type { CheckDuplicateCustomerDto } from './dto/check-duplicate-customer.dto';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import type { UpdateCustomerDto } from './dto/update-customer.dto';
import {
  CustomersRepository,
  type CustomerRecord,
  type SimilarCustomer,
} from './customers.repository';

@Injectable()
export class CustomersService {
  constructor(private readonly customersRepository: CustomersRepository) {}

  list(
    user: AuthenticatedUser,
    options: { search?: string; page?: string; pageSize?: string },
  ): Promise<PaginatedResult<CustomerRecord>> {
    return this.customersRepository.list(user.tenantId, options);
  }

  streamAll(
    user: AuthenticatedUser,
    options: { search?: string },
  ): AsyncGenerator<CustomerRecord> {
    return this.customersRepository.streamAll(user.tenantId, options);
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

  /** Advisory only — create never blocks on the result. */
  checkDuplicate(
    user: AuthenticatedUser,
    dto: CheckDuplicateCustomerDto,
  ): Promise<SimilarCustomer[]> {
    return this.customersRepository.findSimilar(
      user.tenantId,
      dto.name,
      dto.phone,
    );
  }

  create(
    user: AuthenticatedUser,
    dto: CreateCustomerDto,
  ): Promise<CustomerRecord> {
    return this.customersRepository.create(user.tenantId, user.userId, dto);
  }

  update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<CustomerRecord> {
    return this.customersRepository.update(user.tenantId, id, dto);
  }

  softDelete(user: AuthenticatedUser, id: string): Promise<void> {
    return this.customersRepository.softDelete(user.tenantId, id);
  }
}
