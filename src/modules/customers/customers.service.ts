import { Injectable, NotFoundException } from '@nestjs/common';

import type { PaginatedResult } from '../../common/pagination';
import type { AuthenticatedUser } from '../../types/auth.types';
import { visibleSections } from './customer-overview';
import type { CustomerOverview } from './customer-overview';
import type { CheckDuplicateCustomerDto } from './dto/check-duplicate-customer.dto';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import type { UpdateCustomerDto } from './dto/update-customer.dto';
import {
  CustomersRepository,
  type CustomerRecord,
  type CustomerStatement,
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

  /**
   * Everything hanging off this customer in one round trip. The repository
   * does the 404 itself (it has to check existence inside the same tenant
   * transaction as the sections anyway), so there is no findById call to
   * duplicate here.
   */
  /**
   * The sections come from the CALLER'S ROLE, not from the request: this is
   * the one endpoint that reads eight modules behind a single controller
   * gate, so the gate has to be applied per section here.
   */
  overview(user: AuthenticatedUser, id: string): Promise<CustomerOverview> {
    return this.customersRepository.overview(
      user.tenantId,
      id,
      visibleSections(user.role),
    );
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

  statement(
    user: AuthenticatedUser,
    id: string,
    from: string,
    to: string,
  ): Promise<CustomerStatement> {
    return this.customersRepository.statement(user.tenantId, id, from, to);
  }
}
