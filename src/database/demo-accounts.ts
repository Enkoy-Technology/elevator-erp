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
    email: 'gm@demo.example.com',
    fullName: 'Demo General Manager',
    role: 'GENERAL_MANAGER',
    blurb: 'Runs the business day to day: projects, approvals, staff, reports.',
  },
  {
    email: 'marketing@demo.example.com',
    fullName: 'Demo Marketing Manager',
    role: 'MARKETING_MANAGER',
    blurb: 'Leads and customer acquisition.',
  },
  {
    email: 'sales@demo.example.com',
    fullName: 'Demo Sales Manager',
    role: 'SALES_MANAGER',
    blurb: 'Approves quotes and prices; issues proformas and contracts.',
  },
  {
    email: 'salesperson@demo.example.com',
    fullName: 'Demo Salesperson',
    role: 'SALESPERSON',
    blurb: 'Registers customers, prepares quotations, follows up.',
  },
  {
    email: 'finance@demo.example.com',
    fullName: 'Demo Finance Officer',
    role: 'FINANCE_OFFICER',
    blurb: 'Invoices, payments, expenses, banks, receivables.',
  },
  {
    email: 'office@demo.example.com',
    fullName: 'Demo Office Manager',
    role: 'OFFICE_MANAGER',
    blurb: 'Employee records, internal communication, messages.',
  },
  {
    email: 'technical@demo.example.com',
    fullName: 'Demo Technical Manager',
    role: 'TECHNICAL_MANAGER',
    blurb: 'Specifications, installation, testing and commissioning.',
  },
  {
    email: 'engineer@demo.example.com',
    fullName: 'Demo Maintenance Engineer',
    role: 'MAINTENANCE_ENGINEER',
    blurb: 'Service visits, emergency response, breakdown repair.',
  },
  {
    email: 'warehouse@demo.example.com',
    fullName: 'Demo Store Keeper',
    role: 'STORE_KEEPER',
    blurb: 'The asset register; inventory when it ships.',
  },
  {
    email: 'secretary@demo.example.com',
    fullName: 'Demo Secretary',
    role: 'SECRETARY',
    blurb: 'Reception: registers callers, opens breakdown calls, prints documents.',
  },
  {
    email: 'admin@demo.example.com',
    fullName: 'Demo Administrator',
    role: 'ADMIN',
    blurb: 'System settings, employees, the standing document text.',
  },
  {
    email: 'customer@demo.example.com',
    fullName: 'Demo Customer',
    role: 'CUSTOMER',
    blurb: 'No screens yet — lands on an empty sidebar. Seeded so the role is testable.',
  },
];
