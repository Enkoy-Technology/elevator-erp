/**
 * System documentation content.
 *
 * Plain data so the page stays a renderer. Everything here is written from
 * the code it describes — when a controller's routes, a status DAG or a rate
 * payload changes, update the matching entry in the same commit.
 */

export interface Endpoint {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  /** Roles allowed on the route. CEO and ADMIN always pass (SUPER_ROLES). */
  roles: string;
  note: string;
}

export interface Flow {
  title: string;
  /** Rendered as a left-to-right chain of pills. */
  steps: string[];
  note?: string;
}

/**
 * One step of a walkthrough: what to do, and what the screen must show if it
 * worked. Written so a non-engineer can follow it without being told where
 * anything is — the action always names the route it starts from.
 */
export interface Check {
  /** What the tester does. Starts with a verb. */
  action: string;
  /** What must be true afterwards. If it is not, the step failed. */
  expect: string;
}

export interface Fact {
  label: string;
  value: string;
}

export interface DocSection {
  id: string;
  title: string;
  tagline: string;
  /** SVG path data, same 24x24 stroke convention as the sidebar icons. */
  icon: string;
  body: string[];
  facts?: Fact[];
  flows?: Flow[];
  rules?: string[];
  /** A numbered walkthrough. Rendered as a do-this / expect-that table. */
  checks?: Check[];
  endpoints?: Endpoint[];
}

export interface DocGroup {
  id: string;
  title: string;
  blurb: string;
  sections: DocSection[];
}

const ICON = {
  book: 'M12 6.5C10.5 5 8.5 4.5 5 4.5v13c3.5 0 5.5.5 7 2m0-13c1.5-1.5 3.5-2 7-2v13c-3.5 0-5.5.5-7 2m0-13v13',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm9 9-9 5-9-5m18 4-9 5-9-5',
  shield: 'M12 3l8 3v6c0 4.5-3.2 7.9-8 9-4.8-1.1-8-4.5-8-9V6l8-3Zm-3 9 2 2 4-4',
  users:
    'M17 20h5v-2a3 3 0 0 0-5.4-1.9M17 20H7m10 0v-2c0-.7-.1-1.3-.4-1.9M7 20H2v-2a3 3 0 0 1 5.4-1.9M7 20v-2c0-.7.1-1.3.4-1.9m0 0a5 5 0 0 1 9.2 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  gauge: 'M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z',
  calc: 'M9 7h6m-6 4h6m-6 4h3M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z',
  contact: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7Z',
  folder:
    'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2',
  doc: 'M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.6a1 1 0 0 1 .7.3l5.4 5.4a1 1 0 0 1 .3.7V19a2 2 0 0 1-2 2Z',
  stamp: 'M6 21h12M8 17h8a1 1 0 0 0 1-1v-1H7v1a1 1 0 0 0 1 1Zm1-4V9a3 3 0 0 1 6 0v4',
  money:
    'M12 6v12m3-8.5c0-1.4-1.3-2.5-3-2.5s-3 1.1-3 2.5 1.3 2 3 2 3 .6 3 2-1.3 2.5-3 2.5-3-1.1-3-2.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  card: 'M2.3 9h19.5m-16.5 5.3h6m-6 2.2h3M4.5 19.5h15a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5h-15A1.5 1.5 0 0 0 3 6v12a1.5 1.5 0 0 0 1.5 1.5Z',
  chart: 'M3 13h4v8H3v-8ZM10 8h4v13h-4V8ZM17 3h4v18h-4V3Z',
  receipt:
    'M6 3v18l2-1.5L10 21l2-1.5L14 21l2-1.5L18 21V3l-2 1.5L14 3l-2 1.5L10 3 8 4.5 6 3Zm3 6h6M9 13h6',
  bank: 'M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M2 20h20M12 3 3 8h18l-9-5Z',
  percent: 'M19 5 5 19M6.5 9a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Zm11 11a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z',
  building:
    'M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5m-4 0h4',
  wrench:
    'M14.7 6.3a4 4 0 0 0 5.3 5.3l-7.9 7.9a2.4 2.4 0 0 1-3.4-3.4l7.9-7.9Zm0 0L11 2.6a5 5 0 0 0-6.4 6.4L8.3 12',
  bell: 'M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 0 0-4-5.7V5a2 2 0 1 0-4 0v.3C7.7 6.2 6 8.4 6 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9',
  sms: 'M3 8l7.9 5.3a2 2 0 0 0 2.2 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z',
  clock: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  sliders:
    'M12 6V4m0 2a2 2 0 1 0 0 4m0-4a2 2 0 1 1 0 4m-6 8a2 2 0 1 0 0-4m0 4a2 2 0 1 1 0-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 1 0 0-4m0 4a2 2 0 1 1 0-4m0 4v2m0-6V4',
  terminal: 'm5 8 4 4-4 4m6 1h8M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z',
  scale: 'M12 3v18M8 21h8M3 8l4-4 4 4M3 8a4 4 0 0 0 8 0M13 12l4-4 4 4m-8 0a4 4 0 0 0 8 0',
  server:
    'M4 5h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm0 8h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Zm3-5h.01M7 16h.01',
};

export const HERO_FACTS: Fact[] = [
  { label: 'Backend modules', value: '19' },
  { label: 'UI screens', value: '14' },
  { label: 'User roles', value: '9' },
  { label: 'Currency', value: 'ETB' },
];

export const DOC_GROUPS: DocGroup[] = [
  {
    id: 'platform',
    title: 'Platform',
    blurb:
      'What the system is, how a request travels through it, and what keeps one tenant out of another tenant’s data.',
    sections: [
      {
        id: 'overview',
        title: 'System overview',
        tagline: 'One multi-tenant ERP for elevator & electromechanical companies',
        icon: ICON.book,
        body: [
          'The platform runs a Shining Star–style elevator business end to end: a lead becomes a site survey, the survey becomes a calculated technical spec and an ETB price, the price becomes a quotation, then a proforma, then an invoice, then collected cash — and after handover the same machine becomes a maintenance contract with scheduled visits and breakdown tickets.',
          'Everything is one deployment serving many tenants. A tenant is a company; its data never leaves its own boundary, and that boundary is enforced by the database itself rather than by application code remembering to filter.',
          'Money is ETB throughout, computed with arbitrary-precision decimals. No monetary value anywhere in the system passes through a JavaScript float.',
        ],
        facts: [
          { label: 'API', value: 'NestJS 11 + TypeScript (strict)' },
          { label: 'Admin UI', value: 'Next.js App Router + Tailwind' },
          { label: 'Database', value: 'PostgreSQL 16 + row-level security' },
          { label: 'ORM', value: 'Drizzle' },
          { label: 'Money', value: 'decimal.js, 40-digit precision, HALF_UP' },
          { label: 'Documents', value: 'Server-rendered PDF & DOCX' },
        ],
        flows: [
          {
            title: 'The commercial spine',
            steps: [
              'Customer',
              'Project',
              'Calculation',
              'Quotation',
              'Proforma',
              'Invoice',
              'Payment',
              'Maintenance',
            ],
            note: 'Every step is a separate module with its own permissions; each hands the next a document, never a re-typed number.',
          },
        ],
      },
      {
        id: 'architecture',
        title: 'Architecture',
        tagline: 'Where code lives and what may import what',
        icon: ICON.layers,
        body: [
          'The API is organised by feature module. A module owns its controller (HTTP surface and role gates), its service (domain rules), its repository (all database access) and its DTOs (validated input). Controllers never touch SQL and services never build queries by hand.',
          'Cross-module imports are forbidden. If two modules need the same logic it moves to /common — which is why invoice ageing, the customer balance recomputation and the payment reminders all arrive at the same outstanding-amount formula by importing it rather than by three teams agreeing to keep it in sync.',
          'The admin UI is a separate Next.js app under web/. It talks to the API over HTTP only, holds no database credentials, and mirrors the API’s role rules in its navigation so a user is never shown a screen the API will refuse.',
        ],
        facts: [
          { label: '/src/modules', value: 'Feature modules' },
          { label: '/src/common', value: 'Guards, filters, export, shared math' },
          { label: '/src/database', value: 'Drizzle schema, migrations, RLS' },
          { label: '/src/config', value: 'Environment validation' },
          { label: 'API port', value: '3002 (local dev)' },
          { label: 'UI port', value: '3003 (local dev)' },
        ],
        rules: [
          'Never import from /modules/X into /modules/Y — shared code goes to /common.',
          'Never write raw SQL in a controller or service; repositories only.',
          'Never modify a committed file in /database/migrations — write a new migration.',
          'Named exports only, const by default, no implicit any.',
        ],
      },
      {
        id: 'tenancy',
        title: 'Multi-tenancy & security',
        tagline: 'The database is the last line, not the application',
        icon: ICON.shield,
        body: [
          'Every tenant-scoped table carries a composite primary key of (tenant_id, id), and every row is protected by a row-level-security policy keyed on the session variable app.tenant_id.',
          'All tenant-scoped queries go through withTenant(), which opens a transaction and sets app.tenant_id as a transaction-local setting before running the callback. Because the setting is transaction-local it cannot leak into the next query that borrows the same pooled connection.',
          'The application connects as a non-owner role, so RLS actually applies to it — a table owner would silently bypass its own policies. Migrations and seeds use the owner role through a separate admin connection string. The SMS dispatcher goes further and uses its own least-privilege role, because a background worker that only needs to read a queue should not hold the API’s grants.',
          'Authentication is JWT. The token carries the tenant_id claim; TenantGuard validates it before any database work happens, and RolesGuard then checks the route’s @Roles() list, with CEO and ADMIN passing everything.',
        ],
        flows: [
          {
            title: 'Request lifecycle',
            steps: [
              'JWT verified',
              'TenantGuard sets tenant',
              'RolesGuard checks role',
              'DTO validated',
              'withTenant() transaction',
              'RLS policy applies',
            ],
            note: 'A failure at any stage becomes an RFC 7807 Problem Details response from the global exception filter.',
          },
        ],
        rules: [
          'The app never runs as the table owner in production.',
          'RLS is never bypassed except through the explicit admin_bypass policy.',
          'Errors propagate to the global filter — no defensive try/catch around single calls.',
          'Secrets, tokens and PII are never logged.',
        ],
      },
      {
        id: 'roles',
        title: 'Roles & permissions',
        tagline: 'Nine roles; the navigation mirrors the API',
        icon: ICON.users,
        body: [
          'Roles are a database enum, so an unknown role cannot be stored. CEO and ADMIN are super-roles: RolesGuard lets them through every gate, which is why they do not appear in the per-module role lists below.',
          'The sidebar filters itself by the signed-in user’s role using the same lists that decorate the controllers. When a controller’s @Roles() changes, the navigation entry changes with it in the same commit — otherwise a user sees a menu item that answers 403.',
        ],
        facts: [
          { label: 'CEO', value: 'Full access (super-role)' },
          { label: 'ADMIN', value: 'Full access + employees, settings, SMS log' },
          { label: 'SALES_MANAGER', value: 'Customers, projects, quotes, proformas' },
          { label: 'TECHNICAL_LEAD', value: 'Calculator, specs, assets, maintenance' },
          { label: 'FINANCE', value: 'Invoices, payments, expenses, banks, receivables' },
          { label: 'FIELD_ENGINEER', value: 'Assets, maintenance visits, breakdowns' },
          { label: 'DISPATCHER', value: 'Maintenance scheduling, breakdown assignment' },
          { label: 'WAREHOUSE_MANAGER', value: 'Assets' },
          { label: 'CUSTOMER', value: 'Reserved for the customer portal' },
        ],
      },
    ],
  },
  {
    id: 'sales',
    title: 'Sales & engineering',
    blurb:
      'From a name in a notebook to a signed, priced, technically-specified machine.',
    sections: [
      {
        id: 'dashboard',
        title: 'Dashboard',
        tagline: 'The company at a glance',
        icon: ICON.gauge,
        body: [
          'The landing screen summarises the tenant: pipeline by project status, quotation and invoice counts, outstanding receivables and upcoming maintenance. It is a single aggregated read — one endpoint, not a dozen list calls the browser stitches together.',
        ],
        endpoints: [
          {
            method: 'GET',
            path: '/dashboard/summary',
            roles: 'Any authenticated user',
            note: 'Aggregated counts and totals for the signed-in tenant.',
          },
        ],
      },
      {
        id: 'calculator',
        title: 'Elevator calculator',
        tagline: 'EN 81 geometry and the ETB price list in one call',
        icon: ICON.calc,
        body: [
          'The calculator takes what the salesperson knows — product type, capacity, stops, travel height, speed, machine-room type, door type and usage — and returns both the technical block (car and shaft dimensions, pit depth, overhead clearance, counterweight mass, motor power, guide-rail spec, machine-room dimensions) and the commercial block (base price, adjustments, margin, VAT, grand total).',
          'The technical formulas follow the EN 81-20/50 lift geometry regardless of what is being sold; product type drives pricing only. Hospital lifts are priced as passenger lifts, but a HOSPITAL building usage still produces the taller car and prints as a hospital lift on the quotation.',
          'Pricing is the product owner’s ETB price list, not a cost model. The reference machine is 10 stops at 630 kg; more of either costs the per-unit rate on top. Both adjustments floor at the reference point, so an under-spec machine costs the base rather than pricing below it.',
        ],
        facts: [
          { label: 'Passenger base — 2 to 19 stops', value: 'ETB 7,000,000' },
          { label: 'Passenger base — 20 to 30 stops', value: 'ETB 8,000,000' },
          { label: 'Passenger base — 31+ stops', value: 'ETB 11,000,000' },
          { label: 'Car / platform lift', value: 'ETB 5,200,000 flat' },
          { label: 'Escalator', value: 'ETB 6,000,000 flat' },
          { label: 'Per stop above 10 (passenger)', value: 'ETB 80,000' },
          { label: 'Per kg above 630 (passenger)', value: 'ETB 1,000' },
          { label: 'Reference machine', value: '10 stops @ 630 kg' },
        ],
        flows: [
          {
            title: 'Price build-up',
            steps: [
              'Base by tier',
              '+ stops above 10',
              '+ kg above 630',
              '+ margin %',
              '+ VAT %',
              'Grand total',
            ],
            note: 'The 10-stop reference stays constant across tiers: a 20-stop passenger lift is 8,000,000 + 10 × 80,000, not 8,000,000 flat. The tier boundary is where the base jumps, not where the stop count restarts.',
          },
        ],
        rules: [
          'Platform lifts and escalators have zero escalation rates — flat by design, not by omission.',
          'Every money value is rounded exactly once, HALF_UP, at the point it becomes a money value.',
          'The formulas are covered by the worked examples in docs/elevator-calc-formulas.md.',
        ],
        endpoints: [
          {
            method: 'POST',
            path: '/elevator-specs/calculate',
            roles: 'SALES_MANAGER, TECHNICAL_LEAD',
            note: 'Stateless — returns specs and pricing without persisting.',
          },
        ],
      },
      {
        id: 'customers',
        title: 'Customers',
        tagline: 'CRM accounts, duplicate defence and statements',
        icon: ICON.contact,
        body: [
          'Customers are residential, commercial or government. Phone numbers are validated and normalised at the DTO boundary so the same person cannot be stored three ways and so the SMS outbox always has a dialable number.',
          'Before a salesperson creates an account, the duplicate check compares the candidate against existing records — the cheapest moment to catch “Abebe Trading” versus “Abebe Trading PLC” is before both exist.',
          'Finance can pull a customer statement: every invoice, payment and allocation for that account in one document.',
        ],
        endpoints: [
          { method: 'GET', path: '/customers', roles: 'SALES_MANAGER, TECHNICAL_LEAD, FINANCE, DISPATCHER', note: 'Paginated list with search.' },
          { method: 'POST', path: '/customers/check-duplicate', roles: 'SALES_MANAGER', note: 'Run before create; returns likely matches.' },
          { method: 'GET', path: '/customers/:id', roles: 'SALES_MANAGER, TECHNICAL_LEAD, FINANCE, DISPATCHER', note: 'Single account.' },
          { method: 'GET', path: '/customers/:id/statement', roles: 'FINANCE', note: 'Account statement document.' },
          { method: 'POST', path: '/customers', roles: 'SALES_MANAGER', note: 'Create.' },
          { method: 'PATCH', path: '/customers/:id', roles: 'SALES_MANAGER', note: 'Update.' },
          { method: 'DELETE', path: '/customers/:id', roles: 'SALES_MANAGER', note: 'Remove.' },
        ],
      },
      {
        id: 'projects',
        title: 'Projects',
        tagline: 'The sales pipeline, enforced as a DAG',
        icon: ICON.folder,
        body: [
          'A project is one opportunity for one customer. Its status is not a free-text field: the allowed transitions are a directed acyclic graph, and an illegal move raises a WorkflowTransitionError rather than silently corrupting the pipeline.',
          'Any status except EXECUTION can be cancelled. COMPLETED and CANCELLED are terminal — nothing moves out of them, which is what makes historical reporting trustworthy.',
        ],
        flows: [
          {
            title: 'Project status DAG',
            steps: [
              'LEAD',
              'SITE_SURVEY',
              'SPEC_CALCULATION',
              'QUOTATION',
              'PROFORMA',
              'CONTRACT',
              'EXECUTION',
              'COMPLETED',
            ],
            note: 'CANCELLED is reachable from every stage up to CONTRACT. Once a project reaches EXECUTION the only remaining move is COMPLETED.',
          },
        ],
        endpoints: [
          { method: 'GET', path: '/projects', roles: 'SALES_MANAGER, TECHNICAL_LEAD, FINANCE', note: 'Paginated pipeline.' },
          { method: 'GET', path: '/projects/:id', roles: 'SALES_MANAGER, TECHNICAL_LEAD, FINANCE', note: 'Single project.' },
          { method: 'POST', path: '/projects', roles: 'SALES_MANAGER', note: 'Create at LEAD.' },
          { method: 'PATCH', path: '/projects/:id/status', roles: 'SALES_MANAGER', note: 'Transition — validated against the DAG.' },
        ],
      },
      {
        id: 'quotations',
        title: 'Quotations',
        tagline: 'Draft, submit, approve — then it becomes a proforma',
        icon: ICON.doc,
        body: [
          'A quotation snapshots the calculator output against a project: the technical block, the priced lines, the margin and the VAT as they stood the day it was quoted. Later price-list changes never rewrite an issued quote.',
          'Approval is an explicit two-step: a draft is submitted for approval and only then approved. A quote can also lapse — DRAFT and PENDING_APPROVAL both reach EXPIRED without a decision, which is the honest record of what usually happens.',
          'REJECTED, EXPIRED and CONVERTED_TO_PROFORMA are terminal. Converting is the only move out of APPROVED, and it is the proforma module that performs it.',
          'Any quotation can be exported as a branded PDF or DOCX carrying the tenant’s logo, colours and stamp.',
        ],
        flows: [
          {
            title: 'Quotation lifecycle',
            steps: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'CONVERTED_TO_PROFORMA'],
            note: 'Branches: DRAFT and PENDING_APPROVAL can go EXPIRED; PENDING_APPROVAL can go REJECTED. All three are dead ends.',
          },
        ],
        endpoints: [
          { method: 'GET', path: '/quotations', roles: 'SALES_MANAGER, TECHNICAL_LEAD, FINANCE', note: 'Paginated list.' },
          { method: 'GET', path: '/quotations/:id', roles: 'SALES_MANAGER, TECHNICAL_LEAD, FINANCE', note: 'Single quote with lines.' },
          { method: 'GET', path: '/quotations/:id/document', roles: 'SALES_MANAGER, TECHNICAL_LEAD, FINANCE', note: 'Branded PDF or DOCX.' },
          { method: 'POST', path: '/projects/:projectId/quotations', roles: 'SALES_MANAGER', note: 'Create a draft against a project.' },
          { method: 'POST', path: '/quotations/:id/submit', roles: 'SALES_MANAGER', note: 'DRAFT → PENDING_APPROVAL.' },
          { method: 'POST', path: '/quotations/:id/approve', roles: 'SALES_MANAGER', note: 'PENDING_APPROVAL → APPROVED.' },
          { method: 'POST', path: '/quotations/:id/reject', roles: 'SALES_MANAGER', note: 'PENDING_APPROVAL → REJECTED.' },
          { method: 'POST', path: '/quotations/:id/expire', roles: 'SALES_MANAGER', note: 'Lapse an undecided quote.' },
        ],
      },
      {
        id: 'proformas',
        title: 'Proformas',
        tagline: 'An append-only book with gapless numbering',
        icon: ICON.stamp,
        body: [
          'Converting an approved quotation issues a proforma. Proformas are never edited and never deleted — the only statuses are ISSUED and CANCELLED, and cancelling one does not revert the quotation it came from.',
          'Numbers are claimed per tenant per fiscal year from a shared sequence table, using a single atomic insert-on-conflict that returns the issued number. Because the claim and the return are the same statement, two concurrent issues can never receive the same number and the series never skips one.',
          'The Ethiopian fiscal year boundary is configuration, not a constant — the same date arithmetic backs both rate lookups and document numbering.',
        ],
        endpoints: [
          { method: 'POST', path: '/quotations/:id/convert-to-proforma', roles: 'SALES_MANAGER', note: 'Issues the proforma and claims its number.' },
          { method: 'GET', path: '/proformas', roles: 'SALES_MANAGER, TECHNICAL_LEAD, FINANCE', note: 'Paginated list.' },
          { method: 'GET', path: '/proformas/:id', roles: 'SALES_MANAGER, TECHNICAL_LEAD, FINANCE', note: 'Single proforma.' },
          { method: 'GET', path: '/proformas/:id/document', roles: 'SALES_MANAGER, TECHNICAL_LEAD, FINANCE', note: 'Branded PDF or DOCX.' },
          { method: 'POST', path: '/proformas/:id/cancel', roles: 'SALES_MANAGER', note: 'ISSUED → CANCELLED. Never a deletion.' },
        ],
      },
    ],
  },
  {
    id: 'finance',
    title: 'Finance',
    blurb:
      'Receivables, cash in, cash out, and the statutory rates that shape both.',
    sections: [
      {
        id: 'invoices',
        title: 'Invoices',
        tagline: 'The internal AR document — never the legal tax receipt',
        icon: ICON.money,
        body: [
          'An invoice is created by converting a proforma, or standalone with its own lines. Each line total is quantity × unit price rounded once to two decimal places, matching the column it lands in exactly.',
          'Invoices are never deleted. A mistake is voided, and VOID is a status the row keeps forever. The paid status is derived, not typed: ISSUED, PARTIALLY_PAID and PAID follow from the allocations against it.',
          'The system does not claim to issue Ethiopia’s legal tax document. Five nullable fiscal columns exist so an invoice can be annotated with the details of the fiscal receipt issued alongside it in the machine that legally may — the ERP keeps the parallel book, it does not replace the legal one.',
          'Withholding is recorded against an invoice when the customer withholds at source, and the outstanding amount accounts for it.',
        ],
        flows: [
          {
            title: 'Invoice payment status',
            steps: ['ISSUED', 'PARTIALLY_PAID', 'PAID'],
            note: 'Derived from total − withholding − allocated payments. VOID sits outside the chain and is reachable from any non-paid state.',
          },
        ],
        endpoints: [
          { method: 'POST', path: '/proformas/:id/convert-to-invoice', roles: 'FINANCE', note: 'Carries the proforma’s lines across.' },
          { method: 'POST', path: '/invoices', roles: 'FINANCE', note: 'Standalone invoice with its own lines.' },
          { method: 'GET', path: '/invoices', roles: 'FINANCE', note: 'Paginated, with outstanding amount per row.' },
          { method: 'GET', path: '/invoices/aging', roles: 'FINANCE', note: 'Aged receivables report.' },
          { method: 'GET', path: '/invoices/:id', roles: 'FINANCE', note: 'Single invoice.' },
          { method: 'GET', path: '/invoices/:id/document', roles: 'FINANCE', note: 'Branded PDF or DOCX.' },
          { method: 'POST', path: '/invoices/:id/void', roles: 'FINANCE', note: 'Void — never a row deletion.' },
          { method: 'PATCH', path: '/invoices/:id/fiscal', roles: 'FINANCE', note: 'Annotate with the legal fiscal receipt details.' },
          { method: 'POST', path: '/invoices/:id/withholding', roles: 'FINANCE', note: 'Record tax withheld at source.' },
        ],
      },
      {
        id: 'payments',
        title: 'Payments',
        tagline: 'Receipts, allocations, and a double-submit that cannot double-charge',
        icon: ICON.card,
        body: [
          'A payment records cash arriving through one of six settlement rails: cash, bank transfer, cheque, CBE Birr, telebirr or other. Recording it is separate from allocating it — one payment can settle several invoices, and an unallocated payment is a legitimate state, not an error.',
          'Recording accepts an idempotency key. The key is stored with a fingerprint of the request body: replaying the identical request returns the original result, replaying the same key with a different body is rejected as a conflict, and a request still in flight is reported as in-progress rather than processed twice. A jittery connection or an impatient second click can no longer create a duplicate receipt.',
          'Payments are reversed, never deleted, and every reversal is its own entry.',
        ],
        flows: [
          {
            title: 'Idempotent record',
            steps: [
              'Client sends key',
              'Key claimed',
              'Payment recorded',
              'Result stored',
              'Replay returns the same result',
            ],
            note: 'Same key + different body → conflict. Same key while still running → in-progress. Neither creates a second payment.',
          },
        ],
        endpoints: [
          { method: 'POST', path: '/payments', roles: 'FINANCE', note: 'Record a receipt. Accepts an idempotency key.' },
          { method: 'GET', path: '/payments', roles: 'FINANCE', note: 'Paginated list.' },
          { method: 'POST', path: '/payments/:id/allocations', roles: 'FINANCE', note: 'Apply the payment across invoices.' },
          { method: 'POST', path: '/payments/:id/reverse', roles: 'FINANCE', note: 'Reversing entry, not a deletion.' },
          { method: 'GET', path: '/payments/:id/document', roles: 'FINANCE', note: 'Receipt PDF or DOCX.' },
        ],
      },
      {
        id: 'receivables',
        title: 'Receivables',
        tagline: 'Ageing buckets and what each customer actually owes',
        icon: ICON.chart,
        body: [
          'The ageing report buckets every non-void invoice by how many whole calendar days it is past due. Not-yet-due and due-today are current; then 1–30, 31–60, 61–90, and 91 days and beyond.',
          'One invoice’s outstanding amount is its total, less any tax withheld at source, less everything allocated to it. The ageing report, the invoice list’s outstanding column and the nightly customer-balance recomputation all import that single formula rather than each restating it.',
        ],
        facts: [
          { label: 'current', value: 'Not yet due, or due today' },
          { label: 'd1_30', value: '1–30 days overdue' },
          { label: 'd31_60', value: '31–60 days overdue' },
          { label: 'd61_90', value: '61–90 days overdue' },
          { label: 'd90_plus', value: '91 days and beyond' },
        ],
        endpoints: [
          { method: 'GET', path: '/invoices/aging', roles: 'FINANCE', note: 'Bucketed ageing across the tenant.' },
          { method: 'GET', path: '/customers/:id/statement', roles: 'FINANCE', note: 'Per-customer statement document.' },
        ],
      },
      {
        id: 'expenses',
        title: 'Expenses',
        tagline: 'Cash out, on the same immutable-ledger rules',
        icon: ICON.receipt,
        body: [
          'Expenses are recorded against a category — materials, transport, salary advance, rent, utilities, fuel, per diem, office, tax or other — and paid through the same six settlement rails as incoming payments.',
          'Correcting an expense creates a reversing entry. The original row keeps its RECORDED status forever; the REVERSED status labels the reversing entry itself, not the row it corrects. Nothing in the ledger is ever mutated after the fact.',
        ],
        endpoints: [
          { method: 'POST', path: '/expenses', roles: 'FINANCE', note: 'Record an expense.' },
          { method: 'GET', path: '/expenses', roles: 'FINANCE', note: 'Paginated list.' },
          { method: 'GET', path: '/expenses/:id', roles: 'FINANCE', note: 'Single expense.' },
          { method: 'POST', path: '/expenses/:id/reverse', roles: 'FINANCE', note: 'Creates a reversing entry.' },
        ],
      },
      {
        id: 'banks',
        title: 'Bank accounts',
        tagline: 'Statements in, reconciliation out',
        icon: ICON.bank,
        body: [
          'Each bank account holds its own transaction ledger: deposits, withdrawals, charges and transfers in or out. Transactions are reversed rather than edited, exactly like payments and expenses.',
          'The unreconciled view lists bank transactions with no matching system entry — the working list a bookkeeper clears against the statement each month.',
          'Bank accounts are API-only today: the endpoints below are live, but the admin UI has no screen for them yet. Until one exists, a tenant with no bank account on file cannot record a bank transfer, cheque, CBE Birr or telebirr payment — those methods require an account id, so only cash and other are usable.',
        ],
        endpoints: [
          { method: 'POST', path: '/bank-accounts', roles: 'FINANCE', note: 'Create an account.' },
          { method: 'GET', path: '/bank-accounts', roles: 'FINANCE', note: 'List accounts.' },
          { method: 'PATCH', path: '/bank-accounts/:id', roles: 'FINANCE', note: 'Update account details.' },
          { method: 'POST', path: '/bank-accounts/:id/transactions', roles: 'FINANCE', note: 'Record a bank transaction.' },
          { method: 'POST', path: '/bank-accounts/:id/transactions/:txId/reverse', roles: 'FINANCE', note: 'Reversing entry.' },
          { method: 'GET', path: '/bank-accounts/:id/transactions', roles: 'FINANCE', note: 'Account ledger.' },
          { method: 'GET', path: '/bank-accounts/:id/unreconciled', roles: 'FINANCE', note: 'Transactions awaiting a match.' },
        ],
      },
      {
        id: 'rates',
        title: 'Statutory rates',
        tagline: 'Tax rates are effective-dated data, never constants',
        icon: ICON.percent,
        body: [
          'VAT, withholding, PAYE bands and pension contributions live in a versioned rate table with a valid-from and an optional valid-to date. Rates are national rather than per-tenant, so this one table is deliberately global and outside RLS: every tenant reads it, only ADMIN writes to it.',
          'A rate change means inserting a new version, not editing the old one. A document raised last year keeps being computed with last year’s rate, which is the only way historical figures stay reproducible.',
          'Withholding applies above a de-minimis threshold that differs for goods and services. The 30% no-TIN rate carries no threshold — not because it has none, but because none has been confirmed, and the lookup treats an absent threshold as “always applies”. Confirming one later is a data change, not a code change.',
        ],
        facts: [
          { label: 'VAT', value: '15% — VAT Proclamation 1341/2024' },
          { label: 'WHT on goods', value: '3% above ETB 20,000' },
          { label: 'WHT on services', value: '3% above ETB 10,000' },
          { label: 'WHT without TIN', value: '30%, no confirmed threshold' },
          { label: 'PAYE', value: '6 bands, 0% to 35%' },
          { label: 'Pension', value: '7% employee / 11% employer on basic' },
        ],
        rules: [
          'Values sourced from an unverified amendment are labelled as such in the seed and must not be treated as confirmed.',
          'Never hard-code a rate in application code — read it from the table for the document’s date.',
        ],
        endpoints: [
          { method: 'GET', path: '/rates', roles: 'Any authenticated user', note: 'Current or as-of-date rate lookup.' },
          { method: 'POST', path: '/rates', roles: 'ADMIN', note: 'Publish a new version; closes the previous one.' },
        ],
      },
    ],
  },
  {
    id: 'operations',
    title: 'Operations',
    blurb: 'The installed base, the people who service it, and the alerts that keep both moving.',
    sections: [
      {
        id: 'employees',
        title: 'Employees',
        tagline: 'Staff records and role assignment',
        icon: ICON.users,
        body: [
          'Employees carry the staff record and the role that governs what its holder can reach. Administration is ADMIN-only: the screen that grants access is itself the most sensitive screen in the system.',
        ],
        endpoints: [
          { method: 'GET', path: '/employees', roles: 'ADMIN', note: 'Paginated staff list.' },
          { method: 'POST', path: '/employees', roles: 'ADMIN', note: 'Create.' },
          { method: 'PATCH', path: '/employees/:id', roles: 'ADMIN', note: 'Update details or role.' },
        ],
      },
      {
        id: 'assets',
        title: 'Assets',
        tagline: 'The installed base a maintenance contract points at',
        icon: ICON.building,
        body: [
          'An asset is a physical machine at a customer site: an elevator, an escalator, stairs or other equipment. It is the anchor a maintenance contract, its visits and its breakdown tickets all attach to.',
          'Assets are active, inactive or decommissioned. A decommissioned machine keeps its whole service history — the record outlives the equipment.',
        ],
        endpoints: [
          { method: 'GET', path: '/assets', roles: 'SALES_MANAGER, TECHNICAL_LEAD, FIELD_ENGINEER, DISPATCHER, WAREHOUSE_MANAGER', note: 'Paginated list.' },
          { method: 'GET', path: '/assets/:id', roles: 'Same as list', note: 'Single asset.' },
          { method: 'POST', path: '/assets', roles: 'SALES_MANAGER, TECHNICAL_LEAD', note: 'Register a machine.' },
          { method: 'PATCH', path: '/assets/:id', roles: 'SALES_MANAGER, TECHNICAL_LEAD', note: 'Update.' },
          { method: 'DELETE', path: '/assets/:id', roles: 'SALES_MANAGER, TECHNICAL_LEAD', note: 'Remove.' },
        ],
      },
      {
        id: 'maintenance',
        title: 'Maintenance',
        tagline: 'Contracts, scheduled visits and breakdown response',
        icon: ICON.wrench,
        body: [
          'A maintenance contract binds a customer and an asset to a recurrence — daily, weekly, biweekly, monthly, quarterly, biannual or annual — and is active, paused or ended. The recurrence engine derives the next due visit; the nightly reminder job turns that into an SMS before the crew is late rather than after.',
          'Visits are logged against the contract. Breakdowns are logged against the asset and carry a severity, moving OPEN → ASSIGNED → DONE as the dispatcher assigns and the engineer closes.',
          'Severity levels carry the business’s response-time policy: emergency within 30 minutes, critical within an hour, high within four hours, medium within a day, low within two. The severities are stored and reported; the clock itself is a policy the team works to, not a timer the system enforces today.',
        ],
        flows: [
          {
            title: 'Breakdown ticket',
            steps: ['OPEN', 'ASSIGNED', 'DONE'],
            note: 'Reported by anyone with maintenance access, assigned by a dispatcher or technical lead, closed by the engineer who fixed it.',
          },
        ],
        endpoints: [
          { method: 'GET', path: '/maintenance/contracts', roles: 'TECHNICAL_LEAD, FIELD_ENGINEER, DISPATCHER, SALES_MANAGER', note: 'Paginated contracts.' },
          { method: 'POST', path: '/maintenance/contracts', roles: 'Same as list', note: 'Create a contract with its recurrence.' },
          { method: 'PATCH', path: '/maintenance/contracts/:id', roles: 'Same as list', note: 'Update or pause.' },
          { method: 'POST', path: '/maintenance/contracts/:id/visits', roles: 'TECHNICAL_LEAD, FIELD_ENGINEER, DISPATCHER', note: 'Log a service visit.' },
          { method: 'GET', path: '/maintenance/contracts/:id/visits', roles: 'Same as contracts list', note: 'Visit history.' },
          { method: 'GET', path: '/maintenance/breakdowns', roles: 'Same as contracts list', note: 'Paginated tickets.' },
          { method: 'POST', path: '/maintenance/breakdowns', roles: 'Same as contracts list', note: 'Report a breakdown.' },
          { method: 'PATCH', path: '/maintenance/breakdowns/:id', roles: 'TECHNICAL_LEAD, FIELD_ENGINEER, DISPATCHER', note: 'Assign or close.' },
        ],
      },
      {
        id: 'notifications',
        title: 'Notifications',
        tagline: 'In-app alerts for assignments and approvals',
        icon: ICON.bell,
        body: [
          'Notifications are the in-app feed: general messages, quote decisions, work assignments and maintenance alerts. Unlike SMS they cost nothing and never leave the system, so they carry the routine traffic.',
        ],
        endpoints: [
          { method: 'GET', path: '/notifications', roles: 'Any authenticated user', note: 'The signed-in user’s feed.' },
          { method: 'POST', path: '/notifications', roles: 'SALES_MANAGER, TECHNICAL_LEAD, DISPATCHER', note: 'Send a notification.' },
          { method: 'POST', path: '/notifications/read-all', roles: 'Any authenticated user', note: 'Clear the badge.' },
          { method: 'PATCH', path: '/notifications/:id/read', roles: 'Any authenticated user', note: 'Mark one as read.' },
        ],
      },
      {
        id: 'messages',
        title: 'SMS outbox',
        tagline: 'A durable queue, real money per message, and consent on record',
        icon: ICON.sms,
        body: [
          'Nothing sends an SMS directly. Every outbound message is written to an outbox table inside the same transaction as the thing that caused it, so a message is queued if and only if the business event actually committed. A dispatcher then drains the queue once a minute.',
          'A message moves QUEUED → SENDING when claimed, then to SENT, or back to QUEUED with exponential backoff — one minute, five, thirty — and to FAILED after the fourth failed attempt. The claim step is what stops two dispatcher runs sending the same message twice.',
          'Two Ethiopian providers are supported, AfroMessage and GeezSMS, behind one interface, plus a no-op provider for environments that must never send. Outside production an allowlist guard blocks any number not explicitly permitted, so a restored production dump cannot text real customers from a laptop.',
          'SMS costs the tenant money and reaches a person, so the log records segment counts and cost per message, and customer consent is recorded before promotional traffic goes out. The channel is generic from the start — email is a later consumer of the same queue, not a second one.',
        ],
        flows: [
          {
            title: 'Message lifecycle',
            steps: ['QUEUED', 'SENDING', 'SENT'],
            note: 'A failed attempt returns it to QUEUED with backoff of 1m, 5m, then 30m. The fourth failure is terminal: FAILED.',
          },
        ],
        facts: [
          { label: 'Dispatcher', value: 'Runs every minute' },
          { label: 'Max attempts', value: '4' },
          { label: 'Backoff', value: '1m → 5m → 30m' },
          { label: 'Providers', value: 'AfroMessage, GeezSMS, no-op' },
          { label: 'Non-prod guard', value: 'Number allowlist' },
          { label: 'Database role', value: 'Dedicated least-privilege dispatcher' },
        ],
        endpoints: [
          { method: 'GET', path: '/outbox', roles: 'ADMIN', note: 'Delivery log with status, segments and cost.' },
          { method: 'GET', path: '/outbox/provider', roles: 'ADMIN', note: 'Which provider is live, without reading server logs.' },
          { method: 'POST', path: '/outbox/:id/retry', roles: 'ADMIN', note: 'Requeue a failed message.' },
        ],
      },
      {
        id: 'jobs',
        title: 'Scheduled jobs',
        tagline: 'Four crons, each with one job',
        icon: ICON.clock,
        body: [
          'Background work runs on in-process schedules — no external queue to operate, which matters for a client running the system on their own LAN server.',
          'Each job enumerates tenants explicitly and does its work inside that tenant’s boundary, so a nightly batch cannot become the one place tenant isolation quietly does not apply.',
        ],
        facts: [
          { label: 'Every minute', value: 'SMS outbox dispatcher' },
          { label: '01:00 daily', value: 'Customer balance reconciliation' },
          { label: '06:00 daily', value: 'Maintenance visit reminders' },
          { label: '07:00 daily', value: 'Payment / overdue reminders' },
        ],
        rules: [
          'Reminder lead time and payment reminder offsets are per-tenant settings, not constants.',
          'Reminders enqueue into the outbox; they never call a provider directly.',
        ],
      },
      {
        id: 'settings',
        title: 'Settings',
        tagline: 'Branding, language and reminder cadence per tenant',
        icon: ICON.sliders,
        body: [
          'Each tenant sets its own primary and secondary colours, logo, stamp, official address and contact details. Those flow straight into every generated PDF and DOCX, which is why a quotation looks like the company’s own paper rather than the software’s.',
          'The default locale, the maintenance reminder lead time and the payment reminder offsets (for example day 0, day 7, day 30 past due) are configured here rather than compiled in.',
        ],
        endpoints: [
          { method: 'GET', path: '/settings', roles: 'ADMIN', note: 'Current tenant settings.' },
          { method: 'PATCH', path: '/settings', roles: 'ADMIN', note: 'Update branding, locale and reminder cadence.' },
        ],
      },
    ],
  },
  {
    id: 'reference',
    title: 'Reference',
    blurb: 'The conventions every module obeys, and the ground rules the product is built on.',
    sections: [
      {
        id: 'api',
        title: 'API conventions',
        tagline: 'One shape for lists, one shape for errors',
        icon: ICON.terminal,
        body: [
          'Authentication is a bearer JWT obtained from the login endpoint and renewed through refresh. The token carries the tenant claim; logout revokes the refresh side.',
          'Every list endpoint returns the same envelope and accepts the same query parameters, so a new screen needs no bespoke pagination handling.',
          'Every error — validation, permission, workflow, database — is formatted by the global exception filter as RFC 7807 Problem Details. Domain errors are thrown and left to propagate rather than caught and re-wrapped at each call site.',
          'Inputs are validated by DTOs with class-validator at the boundary; anything arriving from an external API is parsed with a Zod schema before it is trusted.',
        ],
        facts: [
          { label: 'List response', value: '{ items, page, pageSize, total, totalPages }' },
          { label: 'Query', value: 'page (1-based), pageSize (default 20, max 100)' },
          { label: 'Errors', value: 'RFC 7807 Problem Details' },
          { label: 'Auth', value: 'Bearer JWT with a tenant_id claim' },
          { label: 'Documents', value: '?format=pdf | docx on any /document route' },
          { label: 'Idempotency', value: 'Idempotency-Key header on POST /payments' },
        ],
        endpoints: [
          { method: 'POST', path: '/auth/login', roles: 'Public', note: 'Returns access and refresh tokens.' },
          { method: 'POST', path: '/auth/refresh', roles: 'Public (valid refresh token)', note: 'Rotate the access token.' },
          { method: 'POST', path: '/auth/logout', roles: 'Any authenticated user', note: 'Revoke the session.' },
          { method: 'GET', path: '/auth/me', roles: 'Any authenticated user', note: 'Current user, role and tenant.' },
        ],
      },
      {
        id: 'money',
        title: 'Money & documents',
        tagline: 'Decimal arithmetic, one rounding point, gapless numbers',
        icon: ICON.scale,
        body: [
          'All monetary arithmetic uses decimal.js at 40-digit precision with HALF_UP rounding, and every money value is rounded exactly once — at the moment it becomes that value, to the precision of the column it is stored in. Values cross module boundaries as decimal strings, never as JavaScript numbers.',
          'Financial records are an immutable ledger. Payments, expenses and bank transactions are reversed with a new entry; invoices are voided; proformas are cancelled. Nothing in the money path is ever deleted or edited in place.',
          'Documents — quotations, proformas, invoices, receipts, statements — render server-side to PDF or DOCX from the same template and the same tenant branding, so the two formats cannot drift apart.',
        ],
        rules: [
          'Never use a float for money, anywhere.',
          'Round once, at the boundary, HALF_UP.',
          'Document numbers are claimed atomically per tenant per fiscal year and are gapless.',
          'Never read a sequence with a plain select and use the value — only the number returned by the claim is safe.',
        ],
      },
      {
        id: 'compliance',
        title: 'Ethiopian context',
        tagline: 'What the law requires, and what the product deliberately does not do',
        icon: ICON.shield,
        body: [
          'The ERP does not issue Ethiopia’s legal tax document and does not pretend to. It keeps the internal accounts-receivable book and annotates each invoice with the fiscal receipt raised alongside it. Treating the ERP as the system of record for tax would be a compliance claim the software cannot honour.',
          'Personal data of Ethiopian residents is expected to be stored on servers in Ethiopia, which is why the deployment target is the client’s own hardware rather than a foreign cloud region.',
          'The interface is English on purpose. Ethiopian business users work in English — the tax portal, IFRS and the accounting job market all are — and no comparable ERP ships a usable Amharic locale. What is required instead is Amharic-safe data: Ethiopic homophones are distinct codepoints, so names are normalised on write and on query, an Ethiopic font is embedded for PDF output, and Amharic prints on customer-facing documents.',
          'Infrastructure assumes frequent power interruptions rather than internet shutdowns: Addis connectivity is generally fine, the grid is not. That shapes durability choices — the outbox, the immutable ledger, the atomic number claim — far more than any offline-first UI would.',
        ],
        rules: [
          'Statutory rates are effective-dated data with a cited source, never constants.',
          'Unverified proclamation numbers are labelled UNVERIFIED and never built against.',
          'Invoices carry nullable fiscal columns — the hedge that keeps the parallel book honest.',
        ],
      },
      {
        id: 'ops',
        title: 'Running the system',
        tagline: 'Local development and the client’s LAN server',
        icon: ICON.server,
        body: [
          'Local development runs the database in Docker, applies migrations, then starts the API and the admin UI together. The application connects as a restricted role so row-level security genuinely applies in development too — the one environment where an RLS mistake is cheap to find.',
          'Migrations and seeds are the only things that connect as the database owner, through a separate admin connection string. Production images and a compose bundle exist for the client’s on-premises LAN server, with migrations run as their own one-shot job rather than on API startup.',
        ],
        facts: [
          { label: 'pnpm run dev', value: 'Database, migrate, API and UI' },
          { label: 'pnpm test', value: 'Full unit suite' },
          { label: 'pnpm run test:e2e', value: 'End-to-end against a live database' },
          { label: 'pnpm run db:migrate', value: 'Apply migrations (owner role)' },
          { label: 'pnpm run typecheck', value: 'Strict TypeScript check' },
          { label: 'pnpm run lint --fix', value: 'Lint and autofix' },
        ],
        rules: [
          'Run the tests before every commit — CI runs the full suite regardless.',
          'Never commit .env, credentials or generated artefacts.',
          'Conventional commits; branches named type/short-description; squash-merge into main.',
        ],
      },
    ],
  },
  {
    id: 'testing',
    title: 'Acceptance testing',
    blurb:
      'Walk the whole system the way a user would, before a demo or a release. Every step names where it starts and what the screen must show if it worked.',
    sections: [
      {
        id: 'test-setup',
        title: 'Before you start',
        tagline: 'Get a clean system up, and know what you are signing in as',
        icon: ICON.terminal,
        body: [
          'The walkthrough below takes about twenty minutes and touches every module a client would ask about. Do it in order — the sales run creates the records the finance and operations runs depend on.',
          'Run `pnpm run dev` from the repository root. It frees the ports, starts the database in Docker, applies migrations, then brings up the API on 3002 and this admin UI on 3003. Wait until both report ready before signing in.',
          'If you want to start from nothing, `pnpm run db:seed:dev` reloads the demo tenant. `pnpm run db:seed:document-content` reloads the standing document text on its own, which is the faster fix if only the boilerplate looks wrong.',
        ],
        facts: [
          { label: 'Admin UI', value: 'http://localhost:3003' },
          { label: 'API', value: 'http://localhost:3002' },
          { label: 'Workspace', value: 'demo' },
          { label: 'Sign in as', value: 'ceo@demo.example.com' },
        ],
        rules: [
          'The CEO and ADMIN roles pass every permission check, so sign in as one of them for the happy path and switch to a narrower role only for the permissions test at the end.',
          'Amounts are always ETB and always carry thousands separators. A number without them is a bug worth reporting.',
          'A step that fails is worth stopping on. Later steps usually depend on the record the failed one was supposed to create.',
        ],
      },
      {
        id: 'test-sales',
        title: 'Test 1 — Quote to proforma',
        tagline: 'The main path, and the one to demo first',
        icon: ICON.doc,
        body: [
          'This is the run that matters most: it is how a sales manager actually spends their day, and it exercises the calculator, the negotiated price, the line items and the customer-facing document in one pass.',
          'The price step is the heart of it. The calculator proposes a figure; the sales manager types the round number they actually agreed with the customer, and the system works the VAT split backwards from it so the three figures on the page always add up to the cent.',
        ],
        checks: [
          {
            action: 'Sign in at /login with the demo workspace and the CEO account.',
            expect: 'The dashboard loads with charts and the sidebar shows your name and role at the bottom.',
          },
          {
            action: 'Open Projects. Pick any project at Lead and press → Site survey.',
            expect: 'The stage cell changes immediately and the available transition buttons change with it.',
          },
          {
            action: 'Open Quotations → New quotation, choose a project, press Start the offer.',
            expect: 'A DRAFT quotation is created and you land on its edit page with one lift already on it.',
          },
          {
            action: 'On the first lift, set the capacity, speed and floors, then press Save & price this lift.',
            expect: 'The lift row shows a price and a one-line description built from the fields you typed.',
          },
          {
            action: 'Type the floor labels as B,G,M,1,2,3,4,5,6,7,8,9,10.',
            expect: 'The stop count and the floors/stops/doors summary fill themselves in — you never type 13/13/13 by hand.',
          },
          {
            action: 'Press + Add lift and change something on the copy, then save it.',
            expect: 'Two lifts are listed, the reorder arrows become usable, and the total covers both.',
          },
          {
            action: 'In the Price box, type the round figure the customer pays — try 7,835,000 — and press Apply this price.',
            expect: 'Subtotal, VAT and Grand total appear beneath it and add up exactly. The discount against the calculator is shown, labelled Internal — not printed.',
          },
          {
            action: 'Fill in the commercial terms: reference, delivery days, validity, parts warranty, free service.',
            expect: 'Each accepts a value and the form saves without complaint.',
          },
          {
            action: 'Set the payment milestones so the percentages total 100, then save.',
            expect: 'The running total reads 100%. Saving a schedule that totals anything else is refused with a clear message.',
          },
          {
            action: 'Submit the quotation, then approve it, then convert it to a proforma.',
            expect: 'The status moves DRAFT → PENDING_APPROVAL → APPROVED → CONVERTED, and a proforma appears under the Proformas tab with a gapless number.',
          },
        ],
      },
      {
        id: 'test-documents',
        title: 'Test 2 — The offer document',
        tagline: 'What the customer actually receives',
        icon: ICON.stamp,
        body: [
          'The document is the deliverable. It is modelled directly on the client’s own eight-page proforma, so the fastest way to check it is to hold the two side by side.',
          'The single most important check is that page one adds up. The line table and the totals block sit on the same page; if the line total and the "Total price" line differ, the customer can subtract them and read the company’s margin.',
        ],
        checks: [
          {
            action: 'From the Quotations list, use Download… on your quotation and pick PDF.',
            expect: 'A PDF downloads and opens.',
          },
          {
            action: 'On page 1, add up the line table and compare it to the Total price line above the VAT.',
            expect: 'They are identical. Total price + VAT = Grand total, to the cent.',
          },
          {
            action: 'Look for the words margin, discount, or the calculator’s original figure anywhere on the document.',
            expect: 'None of them appear. The customer never sees what the price was before negotiation.',
          },
          {
            action: 'Check the letterhead and the footer on every page, including the last.',
            expect: 'Both appear on every page in the same position, with page numbers reading 1 / n.',
          },
          {
            action: 'Read page 2 against the client’s own spec sheet.',
            expect: 'The rows match theirs: capacity, speed, travel height, floors/stops/doors, pit, overhead, shaft, car, door, roping, traction machine, control system.',
          },
          {
            action: 'Scroll to the appendix pages.',
            expect: 'The standing text and the numbered component/brand table are there, in the order set under Settings.',
          },
          {
            action: 'Select text in the PDF and copy it — try the company name and the document title.',
            expect: 'Words copy as words. Letters separated by spaces mean the text layer has broken and the document is no longer searchable.',
          },
          {
            action: 'Download the same quotation as Word, and download the proforma as PDF.',
            expect: 'Both open, both show the line items, and neither discloses the margin.',
          },
        ],
      },
      {
        id: 'test-finance',
        title: 'Test 3 — Invoice, payment, receivables',
        tagline: 'Money in, and what is still owed',
        icon: ICON.money,
        body: [
          'The finance run starts from the proforma the sales run produced. Invoices and payments are an append-only ledger: nothing is ever edited or deleted, and a mistake is corrected by a reversing entry, so expect to be refused if you try to delete something.',
        ],
        checks: [
          {
            action: 'Open Invoices → New invoice and raise one against your proforma.',
            expect: 'The invoice carries the proforma’s figures and claims its own gapless number.',
          },
          {
            action: 'Download the invoice PDF.',
            expect: 'It prints, and it carries the NOT A FISCAL RECEIPT notice while the fiscal fields are empty.',
          },
          {
            action: 'Record a part payment against it from Payments → New payment.',
            expect: 'The invoice moves to partly paid and the outstanding figure drops by exactly what you entered.',
          },
          {
            action: 'Record a second payment that settles the remainder.',
            expect: 'The invoice reads settled and the outstanding figure is zero.',
          },
          {
            action: 'Open Receivables.',
            expect: 'The ageing buckets reflect what is genuinely outstanding, and your settled invoice has left them.',
          },
          {
            action: 'Download the customer statement and the ageing report.',
            expect: 'Both render, and the statement’s closing balance matches what Receivables shows.',
          },
        ],
      },
      {
        id: 'test-operations',
        title: 'Test 4 — Contracts, maintenance, assets',
        tagline: 'After the sale',
        icon: ICON.wrench,
        body: [
          'The contract is the record that unlocks the warranty certificate, the completion certificate and the payment schedule — all three read their dates from it, so test it before them.',
        ],
        checks: [
          {
            action: 'Open Contracts and issue one from your accepted proforma.',
            expect: 'A DRAFT contract appears with its own number and the proforma’s value copied onto it.',
          },
          {
            action: 'Download the contract while it is still a draft.',
            expect: 'It prints as CONTRACT DRAFT, with no signature date and a line saying it is not binding until signed.',
          },
          {
            action: 'Sign the contract, then download it again.',
            expect: 'It now prints as CONTRACT, carries the signature date, and has a two-column signature block.',
          },
          {
            action: 'Open the contract’s payment schedule and agree the instalments.',
            expect: 'The instalments save as a set and the schedule totals the contract value.',
          },
          {
            action: 'Record the handover, naming who accepted it.',
            expect: 'The completion certificate and the warranty certificate both become downloadable, and the warranty expiry is counted from the handover date.',
          },
          {
            action: 'Open Assets, add a lift, then Maintenance → New contract against it.',
            expect: 'The asset saves and the maintenance contract schedules its first visit.',
          },
          {
            action: 'Log a service visit, filling in what was inspected, what was replaced and what you recommend.',
            expect: 'The maintenance report prints those three as separate sections, not as one block of prose.',
          },
          {
            action: 'Raise a breakdown at EMERGENCY severity.',
            expect: 'It appears with a 30-minute SLA and, if a technician with a phone and consent is assigned, an SMS is queued in Messages.',
          },
        ],
      },
      {
        id: 'test-settings',
        title: 'Test 5 — Standing document text',
        tagline: 'Edited once, printed on everything',
        icon: ICON.sliders,
        body: [
          'These are the pages of the offer that used to be pasted in by hand for every quote. Editing them here is the whole point: change a paragraph once and every document issued afterwards carries the change.',
        ],
        checks: [
          {
            action: 'Open Settings → Document text.',
            expect: 'The standing sections are listed in print order, each showing the first line of its text.',
          },
          {
            action: 'Edit one section, change a sentence, and save.',
            expect: 'The list shows the new opening line.',
          },
          {
            action: 'Download any quotation PDF again.',
            expect: 'The appendix carries your edit. Nothing else on the document moved.',
          },
          {
            action: 'Move a section up or down the print order.',
            expect: 'The next document you download prints the sections in the new order.',
          },
          {
            action: 'Stop a section printing, then download again.',
            expect: 'The section is gone from the document but its text is still on the settings screen, ready to switch back on.',
          },
          {
            action: 'Open Settings → Components & brands and change a brand.',
            expect: 'The numbered component table on the appendix pages shows the change.',
          },
        ],
      },
      {
        id: 'test-permissions',
        title: 'Test 6 — Permissions and tenant isolation',
        tagline: 'The checks that matter most and are tested least',
        icon: ICON.shield,
        body: [
          'Everything above was done as a CEO, which passes every permission check. This last run is the one that proves the system is safe to give to a whole company rather than to one trusted person.',
          'Tenant isolation is enforced by the database itself, not only by the application, so the strongest version of this test is to sign in as a second workspace and confirm the first one’s records are simply not there.',
        ],
        checks: [
          {
            action: 'Sign out and sign back in as a technician or a finance user rather than the CEO.',
            expect: 'The sidebar shows fewer sections. Nothing they cannot use is offered to them.',
          },
          {
            action: 'As a non-sales user, try to reach a quotation edit page by typing its URL directly.',
            expect: 'The request is refused. Hiding the button is not the control; the API is.',
          },
          {
            action: 'As a finance user, try to sign a contract or approve a quotation.',
            expect: 'Refused, with a message naming the role that is allowed to.',
          },
          {
            action: 'Set a discount approval threshold under Settings, then quote a discount larger than it.',
            expect: 'The quotation cannot be submitted until someone signs the discount off.',
          },
          {
            action: 'Re-price that quotation to a much larger discount after it has been approved.',
            expect: 'The old approval no longer counts and the discount must be signed off again.',
          },
          {
            action: 'Sign in to a second workspace and look for the first workspace’s customers and quotations.',
            expect: 'None of them exist. Not hidden — absent.',
          },
        ],
      },
    ],
  },
];
