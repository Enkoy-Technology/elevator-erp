import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedUser, UserRole } from '../../types/auth.types';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators';

/**
 * Roles with unrestricted access within their tenant (per TAD §5.2).
 *
 * GENERAL_MANAGER is deliberately NOT here. It was, briefly, on the reading
 * that a GM works beside the CEO — and a super role passes every @Roles
 * check in the codebase, which turned out to mean three things nobody
 * intended:
 *
 *  - POST /rates writes `rate_versions`, the one GLOBAL, RLS-free table in
 *    the app. A GM in one tenant could rewrite the statutory VAT rate for
 *    every tenant on the installation.
 *  - PATCH /employees/:id accepts a password, with no check that the target
 *    outranks the caller — so a GM could reset the CEO's password and sign
 *    in as them.
 *  - IMPORTABLE_ROLES is USER_ROLES minus CEO/ADMIN/CUSTOMER, so a super
 *    role became grantable from an uploaded spreadsheet.
 *
 * A general manager needs to SEE everything the business does; none of the
 * above is seeing. So GENERAL_MANAGER is listed explicitly on the business
 * modules instead, and administration stays with ADMIN.
 */
const SUPER_ROLES: readonly UserRole[] = ['CEO', 'ADMIN'];

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ url?: string; user?: AuthenticatedUser }>();
    if (request.url?.startsWith('/docs')) {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<
      UserRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const role = request.user?.role;
    if (!role) {
      throw new ForbiddenException('No role in authentication context');
    }
    if (SUPER_ROLES.includes(role) || requiredRoles.includes(role)) {
      return true;
    }
    throw new ForbiddenException(
      `Role ${role} is not permitted to access this resource`,
    );
  }
}
