import type { EmployeeRole } from '@/lib/api';

export const ROLE_LABELS: Record<EmployeeRole, string> = {
  CEO: 'CEO',
  GENERAL_MANAGER: 'General Manager',
  SALES_MANAGER: 'Sales Manager',
  TECHNICAL_LEAD: 'Technical Lead',
  FIELD_ENGINEER: 'Field Engineer',
  FINANCE: 'Finance',
  WAREHOUSE_MANAGER: 'Warehouse Manager',
  DISPATCHER: 'Dispatcher',
  ADMIN: 'Admin',
};
