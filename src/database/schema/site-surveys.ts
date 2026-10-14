import { sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { customers } from './customers';
import { projects } from './projects';
import { tenants } from './tenants';

/**
 * One row of the company's own SITE COLLECTION FORM — the sheet a
 * salesperson used to fill on site and send to the manager over Telegram
 * (client request, 2026-09-22). The columns ARE that sheet's columns and
 * nothing else; every one but the project name is nullable because the real
 * sheets come back mostly blank, filled with whatever the person standing in
 * the stairwell could measure.
 *
 * A manager turns a sheet into the sales flow by converting it: that opens
 * (or picks) the customer and opens the project, both recorded here, and the
 * quotation then starts from the sheet's measurements (client, 2026-10-14).
 */
export const siteSurveys = pgTable(
  'site_surveys',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    /** Who submitted it — the signed-in user, or whoever uploaded the sheet. */
    surveyedByUserId: uuid('surveyed_by_user_id'),
    /**
     * Who collected it as the SHEET says, written by hand above the header
     * ("Betelhem tesfa and nafyad") — often two people, who need not be users
     * at all. Null on a typed submission, where the signed-in user is the
     * collector and their name is read off `surveyedByUserId` instead.
     */
    collectedByName: text('collected_by_name'),
    /** The sheet's DATE, in the business timezone; defaults to the day it is submitted. */
    surveyDate: text('survey_date').notNull(),
    projectName: text('project_name').notNull(),
    address: text('address'),
    contactName: text('contact_name'),
    contactPhone: text('contact_phone'),
    /**
     * Shaft width and depth in MILLIMETRES, as every other measurement in
     * the system (client, 2026-10-06). The paper form records centimetres
     * ("200 x 180"); the import converts those, see site-surveys-import.
     */
    shaftWidthMm: integer('shaft_width_mm'),
    shaftDepthMm: integer('shaft_depth_mm'),
    /** Free text, exactly as written: "B+G+11". Never parsed. */
    floors: text('floors'),
    /** Overhead, millimetres. The sheet's "OH" column. */
    overheadMm: integer('overhead_mm'),
    /** The sheet's words: "With MR", "MRL". Free text, not an enum. */
    machineRoom: text('machine_room'),
    /** As written on the form: "2", or a word. Never parsed. */
    units: text('units'),
    /**
     * The product, as a code from Settings → Products & prices (PASSENGER,
     * CAR_LIFT, …). Not a foreign key: products are rows a manager can
     * rename, and a sheet keeps what the salesperson picked.
     */
    productType: text('product_type'),
    /** Rated load, kilograms, if the customer said. */
    capacityKg: integer('capacity_kg'),
    /** Set by converting the sheet; both null until then. */
    customerId: uuid('customer_id'),
    projectId: uuid('project_id'),
    /**
     * When someone other than a salesperson first opened the sheet. Null is
     * "new": the admin list highlights it until a manager has looked.
     */
    seenAt: timestamp('seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    foreignKey({
      name: 'site_surveys_customer_fk',
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    foreignKey({
      name: 'site_surveys_project_fk',
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
    }),
    index('site_surveys_tenant_created_idx').on(
      table.tenantId,
      table.createdAt,
    ),
    index('site_surveys_tenant_surveyor_idx').on(
      table.tenantId,
      table.surveyedByUserId,
    ),
  ],
);
