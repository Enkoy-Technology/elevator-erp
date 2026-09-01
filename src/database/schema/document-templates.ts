import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { tenants } from './tenants';

/**
 * Pages 3-6 of the client's proforma: standard scope, exclusions, terms —
 * prose that is identical on every quote and is today pasted per document,
 * which is why their copies have drifted out of sync with page 2 (page 2
 * says Control System "Simplex", the pasted page 3 says "Duplex";
 * page 2 says 380V/240V, page 3 says "400/230V").
 *
 * Owned by the tenant, edited once, rendered from here. `section_key` is the
 * slot in the document layout ('scope_of_supply', 'exclusions',
 * 'general_conditions', ...) — one row per slot, which is what the unique
 * constraint below enforces.
 */
export const documentBoilerplate = pgTable(
  'document_boilerplate',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    sectionKey: text('section_key').notNull(),
    title: text('title'),
    body: text('body'),
    sortOrder: integer('sort_order').notNull().default(0),
    /**
     * Soft switch rather than a delete, so a tenant can drop a section from
     * the printed document for a while without losing the text they wrote.
     * DELETE is still granted (see the RLS migration) — this is tenant
     * content, not a ledger.
     */
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique('document_boilerplate_tenant_section_key_uk').on(
      table.tenantId,
      table.sectionKey,
    ),
  ],
);

/**
 * The 20-row component/brand table on their page 5 ("Traction machine —
 * Montanari — Italy", ...). Tenant-level, not per-quotation: it is the same
 * table on every document until they change supplier, and keeping one copy
 * is the whole point — the pasted-per-quote version is what drifted.
 *
 * A quote that genuinely needs a different component list overrides it on
 * the line's `technical_spec` jsonb; that is not a schema problem yet.
 */
export const componentSpecifications = pgTable(
  'component_specifications',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    /** 1-based print order within the table. */
    sequence: integer('sequence').notNull(),
    componentName: text('component_name').notNull(),
    brand: text('brand'),
    remark: text('remark'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique('component_specifications_tenant_sequence_uk').on(
      table.tenantId,
      table.sequence,
    ),
  ],
);
