import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedUser } from '../../types/auth.types';
import { IS_PUBLIC_KEY } from '../decorators';
import { TenantIsolationError } from '../exceptions';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ensures every authenticated request carries a well-formed tenant_id claim
 * before any DB operation. Runs after JwtAuthGuard.
 */
@Injectable()
export class TenantGuard implements CanActivate {
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

    const tenantId = request.user?.tenantId;
    if (!tenantId || !UUID_RE.test(tenantId)) {
      throw new TenantIsolationError(
        'Authenticated request is missing a valid tenant context',
      );
    }
    return true;
  }
}
