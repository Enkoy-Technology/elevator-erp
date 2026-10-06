import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { tenants } from './tenants';

/**
 * One row of the company's own SITE COLLECTION FORM — the sheet a
 * salesperson used to fill on site and send to the manager over Telegram
 * (client request, 2026-09-22). The columns ARE that sheet's columns and
 * nothing else; every one but the project name is nullable because the real
 * sheets come back mostly blank, filled with whatever the person standing in
 * the stairwell could measure.
 *
 * Deliberately standalone: it does NOT create a customer, a project or a
 * quotation, and nothing reads it back into the sales flow. It is captured
 * so managers can see it in the system instead of in a chat app.
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
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
