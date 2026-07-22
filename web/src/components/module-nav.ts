export interface ModuleNavItem {
  name: string;
  description: string;
  /** Delivery phase from docs/planning/ROADMAP.md; null = shipped. */
  phase: number | null;
  href: string | null;
  icon: string;
}

/** SVG path data (24x24, stroke style) for each module icon. */
export const MODULES: ModuleNavItem[] = [
  {
    name: 'Dashboard',
    description: 'Company overview and KPIs',
    phase: null,
    href: '/',
    icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  },
  {
    name: 'Elevator Calculator',
    description: 'Technical specs & pricing engine',
    phase: null,
    href: '/calculator',
    icon: 'M9 7h6m-6 4h6m-6 4h3M5 3h14a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z',
  },
  {
    name: 'Sales & CRM',
    description: 'Customers and project pipeline',
    phase: null,
    href: '/customers',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  },
  {
    name: 'Project Pipeline',
    description: 'LEAD → COMPLETED status workflow',
    phase: null,
    href: '/projects',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  },
  {
    name: 'Quotations',
    description: 'Quote → proforma → contract',
    phase: null,
    href: '/quotations',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  {
    name: 'Projects & Installation',
    description: 'Site surveys, execution tracking',
    phase: 3,
    href: null,
    icon: 'M6 20V10m6 10V4m6 16v-7',
  },
  {
    name: 'Maintenance',
    description: 'Contracts, schedules, checklists',
    phase: 4,
    href: null,
    icon: 'M10.5 6a4.5 4.5 0 106.4 5.6L21 15.7l-2.8 2.8-4.1-4.1A4.5 4.5 0 0110.5 6zM3 21l6-6',
  },
  {
    name: 'Inventory',
    description: 'Parts, stock ledger, procurement',
    phase: 4,
    href: null,
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10m-8-14v10l8 4',
  },
  {
    name: 'Breakdowns & Dispatch',
    description: 'Tickets, SLA timers, technician dispatch',
    phase: 5,
    href: null,
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
  },
  {
    name: 'Finance',
    description: 'Invoices, payments, billing',
    phase: 6,
    href: null,
    icon: 'M12 8c-2.2 0-4 .9-4 2s1.8 2 4 2 4 .9 4 2-1.8 2-4 2m0-8c1.7 0 3.1.5 3.7 1.3M12 8V6m0 10c-1.7 0-3.1-.5-3.7-1.3M12 16v2m9-6a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    name: 'Analytics',
    description: 'Reports and business intelligence',
    phase: 7,
    href: null,
    icon: 'M8 13v4m4-8v8m4-12v12M4 21h16',
  },
];
