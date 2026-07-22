import { Injectable } from '@nestjs/common';

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

  create(user: AuthenticatedUser, dto: CreateEmployeeDto) {
    return this.employeesRepository.create(user.tenantId, {
      email: dto.email,
      fullName: dto.fullName,
      phone: dto.phone,
      role: dto.role,
      password: dto.password,
    });
  }

  update(user: AuthenticatedUser, id: string, dto: UpdateEmployeeDto) {
    return this.employeesRepository.update(user.tenantId, id, dto);
  }
}
