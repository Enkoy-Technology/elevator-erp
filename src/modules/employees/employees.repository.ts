import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { hash } from 'bcrypt';

import { LastAdminError } from '../../common/exceptions';
import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import { BCRYPT_ROUNDS } from '../../common/security.constants';
import { users } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type { TenantTransaction } from '../../database/database.types';
import type { UserRole } from '../../types/auth.types';

/** Roles that can administer the tenant; the tenant must always keep at
 * least one active user in one of these roles. */
const ADMIN_CAPABLE_ROLES: readonly UserRole[] = ['ADMIN', 'CEO'];

export type EmployeePublic = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

@Injectable()
export class EmployeesRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async list(
    tenantId: string,
    options: { page?: string; pageSize?: string; q?: string },
  ): Promise<PaginatedResult<EmployeePublic>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const filters = [
        isNull(users.deletedAt),
        ne(users.role, 'CUSTOMER'),
      ];
      if (options.q && options.q.trim().length > 0) {
        const pattern = `%${options.q.trim().toLowerCase()}%`;
        filters.push(
          sql`(lower(${users.fullName}) like ${pattern} or lower(${users.email}) like ${pattern})`,
        );
      }
      const where = and(...filters);
      const [totalRow] = await tx
        .select({ value: count() })
        .from(users)
        .where(where);
      const total = Number(totalRow?.value ?? 0);
      const rows = await tx
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          phone: users.phone,
          role: users.role,
          isActive: users.isActive,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(where)
        .orderBy(asc(users.fullName))
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(rows, total, page, pageSize);
    });
  }

  async create(
    tenantId: string,
    input: {
      email: string;
      fullName: string;
      phone?: string;
      role: UserRole;
      password: string;
    },
  ): Promise<EmployeePublic> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const existing = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.email, input.email.toLowerCase()),
            isNull(users.deletedAt),
          ),
        )
        .limit(1);
      if (existing[0]) {
        throw new ConflictException('An employee with this email already exists');
      }
      const [row] = await tx
        .insert(users)
        .values({
          tenantId,
          email: input.email.toLowerCase(),
          fullName: input.fullName,
          phone: input.phone,
          role: input.role,
          passwordHash: await hash(input.password, BCRYPT_ROUNDS),
        })
        .returning({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          phone: users.phone,
          role: users.role,
          isActive: users.isActive,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        });
      if (!row) {
        throw new Error('Failed to create employee');
      }
      return row;
    });
  }

  async update(
    tenantId: string,
    id: string,
    patch: {
      fullName?: string;
      phone?: string | null;
      role?: UserRole;
      isActive?: boolean;
      /** Already-hashed — the service hashes the plaintext before this call. */
      passwordHash?: string;
    },
  ): Promise<EmployeePublic> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      if (patch.role !== undefined || patch.isActive !== undefined) {
        // Serialize the whole last-admin invariant per tenant. Without this,
        // two concurrent demotions of two different admins can each see the
        // other still active under READ COMMITTED and both pass the guard —
        // classic write skew, landing the tenant at zero admins. The lock is
        // transaction-scoped (released on commit/rollback) and only taken
        // when the patch actually touches role/isActive, so ordinary edits
        // never queue behind it.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${tenantId}::text)::bigint)`,
        );
        await this.assertNotLastAdmin(tx, id, patch);
      }

      const [row] = await tx
        .update(users)
        .set({
          ...(patch.fullName !== undefined ? { fullName: patch.fullName } : {}),
          ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
          ...(patch.role !== undefined ? { role: patch.role } : {}),
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
          // A password reset invalidates any live session — never leave a
          // refresh token valid for credentials that no longer apply.
          ...(patch.passwordHash !== undefined
            ? { passwordHash: patch.passwordHash, refreshTokenHash: null }
            : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(users.id, id),
            isNull(users.deletedAt),
            ne(users.role, 'CUSTOMER'),
          ),
        )
        .returning({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          phone: users.phone,
          role: users.role,
          isActive: users.isActive,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        });
      if (!row) {
        throw new NotFoundException('Employee not found');
      }
      return row;
    });
  }

  /**
   * Rejects an update that would leave the tenant with zero active
   * ADMIN/CEO users. Runs inside the caller's transaction so the read and
   * the subsequent update are consistent.
   */
  private async assertNotLastAdmin(
    tx: TenantTransaction,
    id: string,
    patch: { role?: UserRole; isActive?: boolean },
  ): Promise<void> {
    const [current] = await tx
      .select({ role: users.role, isActive: users.isActive })
      .from(users)
      .where(
        and(
          eq(users.id, id),
          isNull(users.deletedAt),
          ne(users.role, 'CUSTOMER'),
        ),
      )
      .limit(1);
    if (!current) {
      throw new NotFoundException('Employee not found');
    }

    const wasAdminCapable =
      current.isActive && ADMIN_CAPABLE_ROLES.includes(current.role);
    const prospectiveRole = patch.role ?? current.role;
    const prospectiveIsActive = patch.isActive ?? current.isActive;
    const willBeAdminCapable =
      prospectiveIsActive && ADMIN_CAPABLE_ROLES.includes(prospectiveRole);

    if (!wasAdminCapable || willBeAdminCapable) {
      return;
    }

    const [another] = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.isActive, true),
          isNull(users.deletedAt),
          inArray(users.role, ADMIN_CAPABLE_ROLES),
          ne(users.id, id),
        ),
      )
      .limit(1);
    if (!another) {
      throw new LastAdminError();
    }
  }
}
