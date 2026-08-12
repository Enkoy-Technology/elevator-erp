import { Injectable } from '@nestjs/common';
import { hash } from 'bcrypt';

import { BCRYPT_ROUNDS } from '../../common/security.constants';
import type { AuthenticatedUser } from '../../types/auth.types';
import type { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
import { EmployeesRepository } from './employees.repository';

@Injectable()
export class EmployeesService {
  constructor(private readonly employeesRepository: EmployeesRepository) {}

  list(
    user: AuthenticatedUser,
    options: { page?: string; pageSize?: string; q?: string },
  ) {
    return this.employeesRepository.list(user.tenantId, options);
  }

  streamAll(user: AuthenticatedUser, options: { q?: string }) {
    return this.employeesRepository.streamAll(user.tenantId, options);
  }

  create(user: AuthenticatedUser, dto: CreateEmployeeDto) {
    return this.employeesRepository.create(user.tenantId, {
      email: dto.email,
      fullName: dto.fullName,
      phone: dto.phone,
      role: dto.role,
      password: dto.password,
    });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateEmployeeDto) {
    return this.employeesRepository.update(user.tenantId, id, {
      fullName: dto.fullName,
      phone: dto.phone,
      role: dto.role,
      isActive: dto.isActive,
      smsConsentGiven: dto.smsConsentGiven,
      // Hashed here (never persisted or logged as plaintext) so a reset
      // never touches the wire or the DB layer unhashed.
      ...(dto.password !== undefined
        ? { passwordHash: await hash(dto.password, BCRYPT_ROUNDS) }
        : {}),
    });
  }
}
