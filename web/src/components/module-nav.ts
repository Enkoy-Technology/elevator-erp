export interface ModuleNavItem {
  name: string;
  description: string;
  /** Delivery phase from product plan; null = shipped. */
  phase: number | null;
  href: string | null;
  icon: string;
}

/**
 * Shining Star modules — shipped items link; upcoming stay visible but locked.
 * Keep this list short: only what the client PDF needs, one simple slice at a time.
 */
export const MODULES: ModuleNavItem[] = [
  {
    name: 'Dashboard',
    description: 'Company overview',
    phase: null,
    href: '/',
    icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  },
  {
    name: 'Calculator',
    description: 'Specs & ETB pricing',
    phase: null,
    href: '/calculator',
    icon: 'M9 7h6m-6 4h6m-6 4h3M5 3h14a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z',
  },
  {
    name: 'Customers',
    description: 'CRM accounts',
    phase: null,
    href: '/customers',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  },
  {
    name: 'Projects',
    description: 'Sales pipeline',
    phase: null,
    href: '/projects',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  },
  {
    name: 'Quotations',
    description: 'Quote → contract + PDF',
    phase: null,
    href: '/quotations',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  {
    name: 'Employees',
    description: 'Staff & roles',
    phase: null,
    href: '/employees',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  },
];
