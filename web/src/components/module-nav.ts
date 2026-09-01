import type { UserRole } from '@/lib/api';

/** Sidebar sections — what a module is *for*, not what it is called. */
export type ModuleGroup =
  | 'overview'
  | 'sales'
  | 'finance'
  | 'operations'
  | 'hr'
  | 'admin';

/** Render order of the sidebar sections, with their heading keys. */
export const MODULE_GROUPS: readonly {
  key: ModuleGroup;
  labelKey: import('@/lib/i18n').MessageKey;
}[] = [
  { key: 'overview', labelKey: 'nav.group.overview' },
  { key: 'sales', labelKey: 'nav.group.sales' },
  { key: 'finance', labelKey: 'nav.group.finance' },
  { key: 'operations', labelKey: 'nav.group.operations' },
  { key: 'hr', labelKey: 'nav.group.hr' },
  { key: 'admin', labelKey: 'nav.group.admin' },
];

export interface ModuleNavItem {
  nameKey: import('@/lib/i18n').MessageKey;
  /** Sidebar section this module is listed under. */
  group: ModuleGroup;
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
    group: 'overview',
    description: 'Company overview',
    phase: null,
    href: '/',
    icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
    roles: null,
  },
  {
    nameKey: 'nav.calculator',
    group: 'sales',
    description: 'Specs & ETB pricing',
    phase: null,
    href: '/calculator',
    icon: 'M9 7h6m-6 4h6m-6 4h3M5 3h14a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z',
    roles: ['SALES_MANAGER', 'TECHNICAL_LEAD'],
  },
  {
    nameKey: 'nav.customers',
    group: 'sales',
    description: 'CRM accounts',
    phase: null,
    href: '/customers',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    roles: ['SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE', 'DISPATCHER'],
  },
  {
    nameKey: 'nav.projects',
    group: 'sales',
    description: 'Sales pipeline',
    phase: null,
    href: '/projects',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    roles: ['SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE'],
  },
  {
    nameKey: 'nav.quotations',
    group: 'sales',
    description: 'Quote → proforma',
    phase: null,
    href: '/quotations',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    roles: ['SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE'],
  },
  {
    nameKey: 'nav.contracts',
    group: 'sales',
    description: 'Signed → handed over',
    phase: null,
    href: '/contracts',
    icon: 'M9 12h6m-6 4h4m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z M8.5 8.5h3',
    // Mirrors ContractsController's class-level @Roles(...).
    roles: ['SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE'],
  },
  {
    nameKey: 'nav.invoices',
    group: 'finance',
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
    group: 'finance',
    description: 'Receipts & allocations',
    phase: null,
    href: '/invoices?tab=payments',
    icon: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3M4.5 19.5h15a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5h-15A1.5 1.5 0 003 6v12a1.5 1.5 0 001.5 1.5zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
    // Mirrors PaymentsController's class-level @Roles('FINANCE').
    roles: ['FINANCE'],
  },
  {
    nameKey: 'nav.receivables',
    group: 'finance',
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
    group: 'hr',
    description: 'Staff & roles',
    phase: null,
    href: '/employees',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    roles: ['ADMIN'],
  },
  {
    nameKey: 'nav.assets',
    group: 'operations',
    description: 'Elevators, stairs, other',
    phase: null,
    href: '/assets',
    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    roles: ['SALES_MANAGER', 'TECHNICAL_LEAD', 'FIELD_ENGINEER', 'DISPATCHER', 'WAREHOUSE_MANAGER'],
  },
  {
    nameKey: 'nav.notifications',
    group: 'overview',
    description: 'Alerts & assignments',
    phase: null,
    href: '/notifications',
    icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
    roles: null,
  },
  {
    nameKey: 'nav.maintenance',
    group: 'operations',
    description: 'Service & follow-up',
    phase: null,
    href: '/maintenance',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    roles: ['TECHNICAL_LEAD', 'FIELD_ENGINEER', 'DISPATCHER', 'SALES_MANAGER'],
  },
  {
    nameKey: 'nav.messages',
    group: 'finance',
    description: 'SMS delivery log & consent',
    phase: null,
    href: '/messages',
    icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    // Mirrors OutboxController's class-level @Roles('ADMIN') (no per-route
    // override) — CEO/ADMIN reach it via modulesForRole's SUPER_ROLES check.
    roles: ['ADMIN'],
  },
  {
    nameKey: 'nav.settings',
    group: 'admin',
    description: 'Branding & EN / አማርኛ',
    phase: null,
    href: '/settings',
    icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
    roles: ['ADMIN'],
  },
  {
    nameKey: 'nav.boilerplate',
    group: 'admin',
    description: 'Standing text printed on every document',
    phase: null,
    href: '/settings/boilerplate',
    icon: 'M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z M9 8h6 M9 12h6 M9 16h4',
    // Mirrors DocumentContentController's class-level
    // @Roles('SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE'); writing is
    // SALES_MANAGER only and is gated inside the page, not here.
    roles: ['SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE'],
  },
  {
    nameKey: 'nav.components',
    group: 'admin',
    description: 'Brand appendix printed on every document',
    phase: null,
    href: '/settings/components',
    icon: 'M4 5h16v14H4z M4 10h16 M10 5v14',
    // Same controller, same class-level roles.
    roles: ['SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE'],
  },
  {
    nameKey: 'nav.docs',
    group: 'admin',
    description: 'How the whole system works',
    phase: null,
    href: '/docs',
    icon: 'M12 6.5C10.5 5 8.5 4.5 5 4.5v13c3.5 0 5.5.5 7 2m0-13c1.5-1.5 3.5-2 7-2v13c-3.5 0-5.5.5-7 2m0-13v13',
    // Documentation, not data: every role may read it.
    roles: null,
  },
];
