import { Injectable } from '@nestjs/common';

import type { PaginatedResult } from '../../common/pagination';
import type { AuthenticatedUser } from '../../types/auth.types';
import {
  BankAccountsRepository,
  type BankAccountWithBalance,
} from './bank-accounts.repository';
import type { CreateBankAccountDto } from './dto/create-bank-account.dto';
import type { UpdateBankAccountDto } from './dto/update-bank-account.dto';

@Injectable()
export class BankAccountsService {
  constructor(private readonly bankAccountsRepository: BankAccountsRepository) {}

  create(user: AuthenticatedUser, dto: CreateBankAccountDto): Promise<BankAccountWithBalance> {
    return this.bankAccountsRepository.create(user.tenantId, {
      name: dto.name,
      bankName: dto.bankName,
      accountNumber: dto.accountNumber,
    });
  }

  list(
    user: AuthenticatedUser,
    options: { page?: string; pageSize?: string },
  ): Promise<PaginatedResult<BankAccountWithBalance>> {
    return this.bankAccountsRepository.list(user.tenantId, options);
  }

  update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateBankAccountDto,
  ): Promise<BankAccountWithBalance> {
    return this.bankAccountsRepository.update(user.tenantId, id, {
      name: dto.name,
      bankName: dto.bankName,
      accountNumber: dto.accountNumber,
      isActive: dto.isActive,
    });
  }
}
