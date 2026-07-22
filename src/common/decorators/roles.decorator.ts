import { SetMetadata } from '@nestjs/common';

import type { UserRole } from '../../types/auth.types';

export const ROLES_KEY = 'roles';

/** Restricts a route to the given roles. CEO and ADMIN always pass. */
export const Roles = (
  ...roles: UserRole[]
): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);
