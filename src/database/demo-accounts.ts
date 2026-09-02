import type { UserRole } from '../types/auth.types';

/**
 * The demo tenant's sign-in accounts, one per role.
 *
 * A demo given entirely as the CEO shows none of the permission model
 * working, because CEO and ADMIN pass every check (see SUPER_ROLES in
 * roles.guard.ts). Having a seat per role means "here is what the finance
 * manager sees" is a click rather than a description.
 *
 * The login screen shows this same list as a picker, and its copy is
 * duplicated there because `web/` builds separately from `src/` and cannot
 * import across the boundary. `demo-accounts.spec.ts` fails if the two drift.
 */
export const DEMO_PASSWORD = 'Demo!Passw0rd';

export interface DemoAccount {
  email: string;
  fullName: string;
  role: UserRole;
  /** What this seat is for, in the words someone demoing would use. */
  blurb: string;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    email: 'ceo@demo.example.com',
    fullName: 'Demo CEO',
    role: 'CEO',
    blurb: 'Sees everything. The seat to open a demo from.',
  },
  {
    email: 'sales@demo.example.com',
    fullName: 'Demo Sales Manager',
    role: 'SALES_MANAGER',
    blurb: 'Quotes, proformas and contracts. Owns the price.',
  },
  {
    email: 'finance@demo.example.com',
    fullName: 'Demo Finance Manager',
    role: 'FINANCE',
    blurb: 'Invoices, payments, receivables and rates.',
  },
  {
    email: 'technical@demo.example.com',
    fullName: 'Demo Technical Lead',
    role: 'TECHNICAL_LEAD',
    blurb: 'Specifications, assets and maintenance planning.',
  },
  {
    email: 'engineer@demo.example.com',
    fullName: 'Demo Field Engineer',
    role: 'FIELD_ENGINEER',
    blurb: 'Service visits and breakdowns, from site.',
  },
  {
    email: 'dispatcher@demo.example.com',
    fullName: 'Demo Dispatcher',
    role: 'DISPATCHER',
    blurb: 'Assigns breakdowns and schedules visits.',
  },
  {
    email: 'warehouse@demo.example.com',
    fullName: 'Demo Warehouse Manager',
    role: 'WAREHOUSE_MANAGER',
    blurb: 'Assets and the parts that go with them.',
  },
  {
    email: 'admin@demo.example.com',
    fullName: 'Demo Administrator',
    role: 'ADMIN',
    blurb: 'Employees, settings and the standing document text.',
  },
  {
    email: 'customer@demo.example.com',
    fullName: 'Demo Customer',
    role: 'CUSTOMER',
    blurb: 'No screens yet — lands on an empty sidebar. Seeded so the role is testable.',
  },
];
