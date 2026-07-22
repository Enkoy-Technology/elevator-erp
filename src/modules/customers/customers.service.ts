import { Injectable, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../types/auth.types';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import type { UpdateCustomerDto } from './dto/update-customer.dto';
import {
  CustomersRepository,
  type CustomerRecord,
} from './customers.repository';

@Injectable()
export class CustomersService {
  constructor(private readonly customersRepository: CustomersRepository) {}

  list(user: AuthenticatedUser, search?: string): Promise<CustomerRecord[]> {
    return this.customersRepository.list(user.tenantId, search);
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

  create(
    user: AuthenticatedUser,
    dto: CreateCustomerDto,
  ): Promise<CustomerRecord> {
    return this.customersRepository.create(
      user.tenantId,
      user.userId,
      dto,
    );
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
