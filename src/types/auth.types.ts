/**
 * The roles of the client's requirement document ("ERP System — Shining Star
 * Electromechanical Works", Organizational Structure), by that document's
 * names, in its order. ADMIN is the platform's tenant administrator and
 * CUSTOMER is reserved for the customer portal; neither is a staff seat.
 * The `user_role` enum in the database lists the same values in the same order.
 */
export const USER_ROLES = [
  'CEO',
  'GENERAL_MANAGER',
  'MARKETING_MANAGER',
  'SALES_MANAGER',
  'SALESPERSON',
  'FINANCE_OFFICER',
  'OFFICE_MANAGER',
  'TECHNICAL_MANAGER',
  'MAINTENANCE_ENGINEER',
  'STORE_KEEPER',
  'SECRETARY',
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
