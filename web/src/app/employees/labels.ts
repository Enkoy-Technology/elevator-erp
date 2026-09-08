import type { EmployeeRole } from '@/lib/api';

/** The role names of the client's requirement document, as printed there. */
export const ROLE_LABELS: Record<EmployeeRole, string> = {
  CEO: 'CEO',
  GENERAL_MANAGER: 'General Manager',
  MARKETING_MANAGER: 'Marketing Manager',
  SALES_MANAGER: 'Sales Manager',
  SALESPERSON: 'Salesperson',
  FINANCE_OFFICER: 'Finance Officer',
  OFFICE_MANAGER: 'Office Manager',
  TECHNICAL_MANAGER: 'Technical Manager',
  MAINTENANCE_ENGINEER: 'Maintenance Engineer',
  STORE_KEEPER: 'Store Keeper',
  SECRETARY: 'Secretary',
  ADMIN: 'System Administrator',
};
