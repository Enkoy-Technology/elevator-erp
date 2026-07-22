import { sql } from 'drizzle-orm';
import {
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { crews } from './crews';
import {
  installPhaseKindEnum,
  installPhaseStatusEnum,
} from './enums';
import { projects } from './projects';
import { tenants } from './tenants';
import { users } from './users';

export interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
  completed: boolean;
  completedAt?: string | null;
  completedBy?: string | null;
  photoUrl?: string | null;
  notes?: string | null;
}

export const projectPhases = pgTable(
  'project_phases',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    projectId: uuid('project_id').notNull(),
    phaseKind: installPhaseKindEnum('phase_kind').notNull(),
    sortOrder: integer('sort_order').notNull(),
    status: installPhaseStatusEnum('status').notNull().default('PENDING'),
    checklistItems: jsonb('checklist_items')
      .$type<ChecklistItem[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    assignedCrewId: uuid('assigned_crew_id'),
    leadEngineerUserId: uuid('lead_engineer_user_id'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    signOffName: text('sign_off_name'),
    signOffSignatureUrl: text('sign_off_signature_url'),
    signOffStampUrl: text('sign_off_stamp_url'),
    signOffAt: timestamp('sign_off_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique('project_phases_project_kind_unique').on(
      table.tenantId,
      table.projectId,
      table.phaseKind,
    ),
    foreignKey({
      name: 'project_phases_project_fk',
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
    }),
    foreignKey({
      name: 'project_phases_crew_fk',
      columns: [table.tenantId, table.assignedCrewId],
      foreignColumns: [crews.tenantId, crews.id],
    }),
    foreignKey({
      name: 'project_phases_lead_fk',
      columns: [table.tenantId, table.leadEngineerUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
  ],
);

export type InstallPhaseKind =
  (typeof installPhaseKindEnum.enumValues)[number];
export type InstallPhaseStatus =
  (typeof installPhaseStatusEnum.enumValues)[number];
