import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import type { AuthenticatedUser, UserRole } from '../../types/auth.types';
import { IS_PUBLIC_KEY } from '../decorators';
import { RolesGuard } from './roles.guard';

/**
 * These branches are the whole authorisation model — every @Roles decorator in
 * the app resolves here — so each one is pinned: a wrong flip would otherwise
 * hand a field engineer the settings screen with the suite still green.
 */
describe('RolesGuard', () => {
  const context = (user?: Partial<AuthenticatedUser>, url = '/v1/settings') =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ url, user }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as unknown as ExecutionContext;

  /** Stubs the two metadata lookups canActivate performs, in order. */
  const guardWith = (options: {
    isPublic?: boolean;
    requiredRoles?: UserRole[];
  }) => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === IS_PUBLIC_KEY ? options.isPublic : options.requiredRoles,
      ),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  };

  it('allows a user whose role is listed', () => {
    const guard = guardWith({ requiredRoles: ['SALES_MANAGER', 'FINANCE'] });
    expect(guard.canActivate(context({ role: 'FINANCE' }))).toBe(true);
  });

  it('denies a user whose role is not listed', () => {
    const guard = guardWith({ requiredRoles: ['SALES_MANAGER'] });
    expect(() => guard.canActivate(context({ role: 'FIELD_ENGINEER' }))).toThrow(
      ForbiddenException,
    );
  });

  it.each(['CEO', 'ADMIN'] as const)(
    'lets %s through any role gate',
    (role) => {
      const guard = guardWith({ requiredRoles: ['DISPATCHER'] });
      expect(guard.canActivate(context({ role }))).toBe(true);
    },
  );

  it('does not treat other senior roles as super-roles', () => {
    const guard = guardWith({ requiredRoles: ['DISPATCHER'] });
    expect(() =>
      guard.canActivate(context({ role: 'TECHNICAL_LEAD' })),
    ).toThrow(ForbiddenException);
  });

  it('allows routes that declare no roles', () => {
    const guard = guardWith({ requiredRoles: undefined });
    expect(guard.canActivate(context({ role: 'CUSTOMER' }))).toBe(true);
  });

  it('allows an empty role list (treated as no gate)', () => {
    const guard = guardWith({ requiredRoles: [] });
    expect(guard.canActivate(context({ role: 'CUSTOMER' }))).toBe(true);
  });

  it('allows public routes without inspecting the role', () => {
    const guard = guardWith({ isPublic: true, requiredRoles: ['ADMIN'] });
    expect(guard.canActivate(context(undefined, '/v1/auth/login'))).toBe(true);
  });

  it('rejects an authenticated request that carries no role', () => {
    const guard = guardWith({ requiredRoles: ['ADMIN'] });
    expect(() => guard.canActivate(context({}))).toThrow(ForbiddenException);
  });
});
