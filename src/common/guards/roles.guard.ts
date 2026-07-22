import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedUser, UserRole } from '../../types/auth.types';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators';

/** Roles with unrestricted access within their tenant (per TAD §5.2). */
const SUPER_ROLES: readonly UserRole[] = ['CEO', 'ADMIN'];

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
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
