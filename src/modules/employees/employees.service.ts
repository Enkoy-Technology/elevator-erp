import { ForbiddenException, Injectable } from '@nestjs/common';
import { hash } from 'bcrypt';

import { BCRYPT_ROUNDS } from '../../common/security.constants';
import type { AuthenticatedUser, UserRole } from '../../types/auth.types';
import type { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
import { IMPORTABLE_ROLES } from './employees-import.service';
import { EmployeesRepository } from './employees.repository';

/** Roles that manage every account. Mirrors RolesGuard's SUPER_ROLES. */
const SUPER_ROLES: readonly UserRole[] = ['CEO', 'ADMIN'];

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

  /**
   * The spec gives the Sales Manager user management; without this rule
   * that would let a sales manager create a CEO login or reset an admin's
   * password. Anyone below the super roles may only grant, and only touch,
   * the roles a spreadsheet import may grant: staff below management.
   */
  private async assertMayManage(
    user: AuthenticatedUser,
    grantedRole: UserRole | undefined,
    targetId?: string,
  ): Promise<void> {
    if (SUPER_ROLES.includes(user.role)) {
      return;
    }
    const targetRole = targetId
      ? await this.employeesRepository.findRoleById(user.tenantId, targetId)
      : undefined;
    for (const role of [grantedRole, targetRole]) {
      if (role !== undefined && !IMPORTABLE_ROLES.includes(role)) {
        throw new ForbiddenException(
          `Only the CEO or an admin may manage a ${role} account`,
        );
      }
    }
  }

  async create(user: AuthenticatedUser, dto: CreateEmployeeDto) {
    await this.assertMayManage(user, dto.role);
    return this.employeesRepository.create(user.tenantId, {
      email: dto.email,
      fullName: dto.fullName,
      phone: dto.phone,
      role: dto.role,
      password: dto.password,
      smsConsentGiven: dto.smsConsentGiven,
    });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateEmployeeDto) {
    await this.assertMayManage(user, dto.role, id);
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
