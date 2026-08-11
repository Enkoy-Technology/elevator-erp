import type { UserRole } from '@/lib/api';

export interface ModuleNavItem {
  nameKey: import('@/lib/i18n').MessageKey;
  description: string;
  /** Delivery phase from product plan; null = shipped. */
  phase: number | null;
  href: string | null;
  icon: string;
  /** Roles that may open it; null = everyone. Mirrors the class-level
   *  `@Roles()` on the matching API controller — update both together. */
  roles: readonly UserRole[] | null;
}

/** CEO and ADMIN reach everything, matching RolesGuard's SUPER_ROLES. */
const SUPER_ROLES: readonly UserRole[] = ['CEO', 'ADMIN'];

/** Modules this role can open. Unknown/absent role gets the public set only. */
export const modulesForRole = (role: UserRole | null): ModuleNavItem[] =>
  MODULES.filter(
    (module) =>
      module.roles === null ||
      (role !== null &&
        (SUPER_ROLES.includes(role) || module.roles.includes(role))),
  );

/**
 * Shining Star modules — shipped items link; upcoming stay visible but locked.
 */
export const MODULES: ModuleNavItem[] = [
  {
    nameKey: 'nav.dashboard',
    description: 'Company overview',
    phase: null,
    href: '/',
    icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
    roles: null,
  },
  {
    nameKey: 'nav.calculator',
    description: 'Specs & ETB pricing',
    phase: null,
    href: '/calculator',
    icon: 'M9 7h6m-6 4h6m-6 4h3M5 3h14a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z',
    roles: ['SALES_MANAGER', 'TECHNICAL_LEAD'],
  },
  {
    nameKey: 'nav.customers',
    description: 'CRM accounts',
    phase: null,
    href: '/customers',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    roles: ['SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE', 'DISPATCHER'],
  },
  {
    nameKey: 'nav.projects',
    description: 'Sales pipeline',
    phase: null,
    href: '/projects',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    roles: ['SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE'],
  },
  {
    nameKey: 'nav.quotations',
    description: 'Quote → proforma',
    phase: null,
    href: '/quotations',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    roles: ['SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE'],
  },
  {
    nameKey: 'nav.invoices',
    description: 'Issue → collect',
    phase: null,
    href: '/invoices',
    icon: 'M12 6v12m3-8.5c0-1.38-1.343-2.5-3-2.5s-3 1.12-3 2.5c0 1.38 1.343 2 3 2s3 .62 3 2-1.343 2.5-3 2.5-3-1.12-3-2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    // Mirrors InvoicesController's class-level @Roles('FINANCE') (no
    // per-route override) — CEO/ADMIN reach it via modulesForRole's
    // SUPER_ROLES check.
    roles: ['FINANCE'],
  },
  {
    nameKey: 'nav.payments',
    description: 'Receipts & allocations',
    phase: null,
    href: '/invoices?tab=payments',
    icon: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3M4.5 19.5h15a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5h-15A1.5 1.5 0 003 6v12a1.5 1.5 0 001.5 1.5zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
    // Mirrors PaymentsController's class-level @Roles('FINANCE').
    roles: ['FINANCE'],
  },
  {
    nameKey: 'nav.receivables',
    description: 'Aging & statements',
    phase: null,
    href: '/receivables',
    icon: 'M3 13h4v8H3v-8zM10 8h4v13h-4V8zM17 3h4v18h-4V3z',
    // Mirrors GET /invoices/aging (class-level @Roles('FINANCE')) and
    // GET /customers/:id/statement (route-level @Roles('FINANCE'),
    // narrower than CustomersController's own class-level roles).
    roles: ['FINANCE'],
  },
  {
    nameKey: 'nav.employees',
    description: 'Staff & roles',
    phase: null,
    href: '/employees',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    roles: ['ADMIN'],
  },
  {
    nameKey: 'nav.assets',
    description: 'Elevators, stairs, other',
    phase: null,
    href: '/assets',
    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    roles: ['SALES_MANAGER', 'TECHNICAL_LEAD', 'FIELD_ENGINEER', 'DISPATCHER', 'WAREHOUSE_MANAGER'],
  },
  {
    nameKey: 'nav.notifications',
    description: 'Alerts & assignments',
    phase: null,
    href: '/notifications',
    icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
    roles: null,
  },
  {
    nameKey: 'nav.maintenance',
    description: 'Service & follow-up',
    phase: null,
    href: '/maintenance',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    roles: ['TECHNICAL_LEAD', 'FIELD_ENGINEER', 'DISPATCHER', 'SALES_MANAGER'],
  },
  {
    nameKey: 'nav.settings',
    description: 'Branding & EN / አማርኛ',
    phase: null,
    href: '/settings',
    icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
    roles: ['ADMIN'],
  },
];
