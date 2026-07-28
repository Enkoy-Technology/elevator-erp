export const USER_ROLES = [
  'CEO',
  'SALES_MANAGER',
  'TECHNICAL_LEAD',
  'FIELD_ENGINEER',
  'FINANCE',
  'WAREHOUSE_MANAGER',
  'DISPATCHER',
  'CUSTOMER',
  'ADMIN',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface JwtPayload {
  /** User id. */
  sub: string;
  tenantId: string;
  role: UserRole;
  type: 'access' | 'refresh';
}

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  role: UserRole;
}
