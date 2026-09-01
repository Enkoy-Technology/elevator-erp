import { sql } from 'drizzle-orm';
import {
  foreignKey,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { proformas } from './proformas';
import { quotations } from './quotations';
import { tenants } from './tenants';

/**
 * The columns a quotation line and a proforma line share, built fresh per
 * table (drizzle column builders are stateful — they cannot be reused across
 * two `pgTable` calls).
 *
 * `parent` is spread in the middle so each table keeps its own foreign key
 * column in a readable position, right after the composite primary key.
 *
 * Shared on purpose: a proforma line is a verbatim snapshot of the quotation
 * line it was issued from. If the two shapes ever drift, the issued document
 * silently loses a field the quotation printed — which is the exact class of
 * bug the client already lives with in their pasted boilerplate (their page 2
 * says Simplex, page 3 says Duplex).
 */
const lineColumns = <TParent extends Record<string, unknown>>(
  parent: TParent,
) => ({
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  id: uuid('id')
    .notNull()
    .default(sql`gen_random_uuid()`),
  ...parent,

  /** 1-based print order of the line on page 1's table. */
  sequence: integer('sequence').notNull(),

  /**
   * PASSENGER | CAR_PLATFORM_LIFT | ESCALATOR today (see
   * `PRODUCT_TYPES` in the elevator-calc module). Deliberately `text`, not a
   * pg enum: the same value already travels un-enumerated inside
   * `quotations.calc_input`, and the product owner adding a fourth product
   * line should not require a migration on two tables.
   */
  productType: text('product_type').notNull(),

  /**
   * Per-line snapshots of the calculator run that produced it, mirroring the
   * three jsonb columns on `quotations`. NULLABLE, unlike there: a line can
   * be a hand-entered item (an extra entrance, a spare-parts allowance) that
   * no calculator run ever produced, and a draft line exists before it is
   * priced.
   */
  calcInput: jsonb('calc_input'),
  technicalSpec: jsonb('technical_spec'),
  pricingBreakdown: jsonb('pricing_breakdown'),

  /**
   * The human cell of page 1's table, rendered verbatim:
   * "800KG -10persons / Speed 1.5m/s / B+G+M+10 / 13 floors/13 doors".
   * Stored rather than derived so an issued document never re-renders
   * differently after a formatting change.
   */
  specSummary: text('spec_summary'),

  /** Their "No of Units" column. */
  quantity: integer('quantity').notNull().default(1),

  /**
   * EX-VAT unit price, and the line total. `line_total_etb` is NOT a
   * generated `quantity * unit_price_etb`: this client prices backward from
   * a round grand total, so a negotiated line total legitimately differs
   * from the arithmetic product by the rounding they absorbed.
   */
  unitPriceEtb: numeric('unit_price_etb', { precision: 14, scale: 2 }),
  lineTotalEtb: numeric('line_total_etb', { precision: 14, scale: 2 }),

  // ---------------------------------------------------------------------
  // Spec-sheet fields (their page 2's 19-row table). DISPLAY ONLY — none of
  // these feed the pricing formula, which is frozen. They live here as real
  // columns rather than in `technical_spec` because a human types them; the
  // values the calculator computes stay in the `technical_spec` jsonb above.
  // ---------------------------------------------------------------------
  /** "WITH MR" / "MRL" as printed — the label, not the calculator's enum. */
  machineRoomLabel: text('machine_room_label'),
  /**
   * Comma-separated floor names in print order: "B,G,M,1,2,3,...,10".
   * The count of these is what fills the EXISTING `calc_input.stops`; how
   * stops feed pricing is unchanged.
   */
  floorLabels: text('floor_labels'),
  /** The compressed form they print: "B+G+M+10". */
  floorDisplaySummary: text('floor_display_summary'),
  doorHeightMm: integer('door_height_mm'),
  ropingRatio: text('roping_ratio'),
  tractionMachineType: text('traction_machine_type'),
  /** "Simplex" / "Duplex" / "Triplex". */
  controlSystem: text('control_system'),
  /** "380V AC 50HZ 3-phase 4 lines". */
  powerSupply: text('power_supply'),
  /** "240V AC 50HZ Single phase". */
  lightSupply: text('light_supply'),
  entranceCount: integer('entrance_count'),

  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Page 1 of the client's proforma is a line-item table with a "No of Units"
 * column — one quotation can sell three lifts of two different specs. The
 * quotation's own money columns stay the document total; these are what it
 * is made of.
 */
export const quotationLines = pgTable(
  'quotation_lines',
  lineColumns({ quotationId: uuid('quotation_id').notNull() }),
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique('quotation_lines_tenant_quotation_sequence_uk').on(
      table.tenantId,
      table.quotationId,
      table.sequence,
    ),
    foreignKey({
      name: 'quotation_lines_quotation_fk',
      columns: [table.tenantId, table.quotationId],
      foreignColumns: [quotations.tenantId, quotations.id],
    }),
  ],
);

/**
 * The same lines, snapshotted onto the issued proforma — copied at issue
 * time exactly as `proformas` already copies the quotation's money and calc
 * snapshots, never joined back to `quotation_lines` (a quotation can be
 * revised after conversion).
 */
export const proformaLines = pgTable(
  'proforma_lines',
  lineColumns({ proformaId: uuid('proforma_id').notNull() }),
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique('proforma_lines_tenant_proforma_sequence_uk').on(
      table.tenantId,
      table.proformaId,
      table.sequence,
    ),
    foreignKey({
      name: 'proforma_lines_proforma_fk',
      columns: [table.tenantId, table.proformaId],
      foreignColumns: [proformas.tenantId, proformas.id],
    }),
  ],
);

/**
 * The payment schedule as the OFFER states it — percentages against events,
 * not dated instalments. The client's four: 50% on signing, 30% on shipping
 * documents, 10% on delivery to site, 10% after commissioning.
 *
 * Deliberately not `contract_instalments`: that table is the agreed schedule
 * of a signed contract, carries ETB amounts and due dates, and feeds
 * invoicing. This one is a paragraph on a quotation that may never be
 * accepted. On conversion, `label` here becomes `contract_instalments.label`
 * and `percent` is applied to the contract value.
 */
export const quotationPaymentTerms = pgTable(
  'quotation_payment_terms',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    quotationId: uuid('quotation_id').notNull(),
    /** 1-based print order. */
    sequence: integer('sequence').notNull(),
    /**
     * The sentence printed on the document: "Payable upon submission of
     * shipping documents". Same role as `contract_instalments.label`.
     */
    label: text('label').notNull(),
    percent: numeric('percent', { precision: 5, scale: 2 }).notNull(),
    /**
     * Optional short machine tag for the event the percentage is due on
     * (e.g. SIGNING, SHIPPING_DOCUMENTS, DELIVERY, COMMISSIONING). Free text
     * and nullable: nothing keys off it yet, and the client's own wording
     * varies per deal. The DB does not require the percentages to sum to
     * 100 — a deposit-only offer is a real offer.
     */
    triggerEvent: text('trigger_event'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique('quotation_payment_terms_tenant_quotation_sequence_uk').on(
      table.tenantId,
      table.quotationId,
      table.sequence,
    ),
    foreignKey({
      name: 'quotation_payment_terms_quotation_fk',
      columns: [table.tenantId, table.quotationId],
      foreignColumns: [quotations.tenantId, quotations.id],
    }),
  ],
);
