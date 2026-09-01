import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';

import { isUniqueViolation } from '../../common/db-errors';
import {
  componentSpecifications,
  documentBoilerplate,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type {
  CreateBoilerplateSectionDto,
  CreateComponentSpecificationDto,
  UpdateBoilerplateSectionDto,
  UpdateComponentSpecificationDto,
} from './dto/document-content.dto';

export type BoilerplateSection = typeof documentBoilerplate.$inferSelect;
export type ComponentSpecification = typeof componentSpecifications.$inferSelect;

/**
 * Tenant-owned document content: the prose sections and the component/brand
 * table that today are pasted into every proforma by hand, which is why the
 * client's own copies contradict each other (their page 3 says the control
 * system is "Duplex" while their page 2 spec table says "Simplex"). One row
 * per section, edited once, rendered from here.
 *
 * Both lists are bounded and short (8 sections, 20 components) and every read
 * path — the admin screen and the PDF renderer alike — wants all of them, so
 * the list methods deliberately do not paginate in SQL; the controller wraps
 * the full set in the standard envelope.
 */
@Injectable()
export class DocumentContentRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  // ---------------------------------------------------------------- sections

  async listBoilerplate(tenantId: string): Promise<BoilerplateSection[]> {
    return this.tenantDb.withTenant(tenantId, async (tx) =>
      // sortOrder is not unique, so sectionKey breaks ties — without it two
      // sections sharing a sort order swap places between renders.
      tx
        .select()
        .from(documentBoilerplate)
        .orderBy(asc(documentBoilerplate.sortOrder), asc(documentBoilerplate.sectionKey)),
    );
  }

  async createBoilerplate(
    tenantId: string,
    dto: CreateBoilerplateSectionDto,
  ): Promise<BoilerplateSection> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [last] = await tx
        .select({ value: documentBoilerplate.sortOrder })
        .from(documentBoilerplate)
        .orderBy(desc(documentBoilerplate.sortOrder))
        .limit(1);
      // Omitted sortOrder appends to the end rather than colliding on 0.
      const sortOrder = dto.sortOrder ?? (last === undefined ? 0 : last.value + 1);
      try {
        const [row] = await tx
          .insert(documentBoilerplate)
          .values({
            tenantId,
            sectionKey: dto.sectionKey,
            title: dto.title ?? null,
            body: dto.body ?? null,
            sortOrder,
          })
          .returning();
        if (!row) {
          throw new NotFoundException('Failed to create boilerplate section');
        }
        return row;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            `Boilerplate section '${dto.sectionKey}' already exists`,
          );
        }
        throw error;
      }
    });
  }

  async updateBoilerplate(
    tenantId: string,
    id: string,
    dto: UpdateBoilerplateSectionDto,
  ): Promise<BoilerplateSection> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(documentBoilerplate)
        .set({
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.body !== undefined ? { body: dto.body } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(documentBoilerplate.tenantId, tenantId),
            eq(documentBoilerplate.id, id),
          ),
        )
        .returning();
      if (!row) {
        throw new NotFoundException('Boilerplate section not found');
      }
      return row;
    });
  }

  /**
   * Soft switch, not a delete: a tenant that drops a section from the printed
   * document for a while keeps the text it wrote.
   */
  async deactivateBoilerplate(
    tenantId: string,
    id: string,
  ): Promise<BoilerplateSection> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(documentBoilerplate)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(documentBoilerplate.tenantId, tenantId),
            eq(documentBoilerplate.id, id),
          ),
        )
        .returning();
      if (!row) {
        throw new NotFoundException('Boilerplate section not found');
      }
      return row;
    });
  }

  async reorderBoilerplate(
    tenantId: string,
    ids: string[],
  ): Promise<BoilerplateSection[]> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const existing = await tx
        .select({ id: documentBoilerplate.id })
        .from(documentBoilerplate);
      assertCompleteReorder(ids, existing);

      // sort_order carries no unique constraint, so one pass is enough.
      // ponytail: N updates, fine for a list that is 8 rows long.
      for (const [index, id] of ids.entries()) {
        await tx
          .update(documentBoilerplate)
          .set({ sortOrder: index + 1, updatedAt: new Date() })
          .where(
            and(
              eq(documentBoilerplate.tenantId, tenantId),
              eq(documentBoilerplate.id, id),
            ),
          );
      }

      return tx
        .select()
        .from(documentBoilerplate)
        .orderBy(asc(documentBoilerplate.sortOrder), asc(documentBoilerplate.sectionKey));
    });
  }

  // -------------------------------------------------------------- components

  async listComponents(tenantId: string): Promise<ComponentSpecification[]> {
    return this.tenantDb.withTenant(tenantId, async (tx) =>
      tx
        .select()
        .from(componentSpecifications)
        .orderBy(asc(componentSpecifications.sequence)),
    );
  }

  async createComponent(
    tenantId: string,
    dto: CreateComponentSpecificationDto,
  ): Promise<ComponentSpecification> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [last] = await tx
        .select({ value: componentSpecifications.sequence })
        .from(componentSpecifications)
        .orderBy(desc(componentSpecifications.sequence))
        .limit(1);
      const sequence = dto.sequence ?? (last === undefined ? 1 : last.value + 1);
      try {
        const [row] = await tx
          .insert(componentSpecifications)
          .values({
            tenantId,
            sequence,
            componentName: dto.componentName,
            brand: dto.brand ?? null,
            remark: dto.remark ?? null,
          })
          .returning();
        if (!row) {
          throw new NotFoundException('Failed to create component specification');
        }
        return row;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            `A component specification is already at row ${sequence}`,
          );
        }
        throw error;
      }
    });
  }

  async updateComponent(
    tenantId: string,
    id: string,
    dto: UpdateComponentSpecificationDto,
  ): Promise<ComponentSpecification> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(componentSpecifications)
        .set({
          ...(dto.componentName !== undefined
            ? { componentName: dto.componentName }
            : {}),
          ...(dto.brand !== undefined ? { brand: dto.brand } : {}),
          ...(dto.remark !== undefined ? { remark: dto.remark } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(componentSpecifications.tenantId, tenantId),
            eq(componentSpecifications.id, id),
          ),
        )
        .returning();
      if (!row) {
        throw new NotFoundException('Component specification not found');
      }
      return row;
    });
  }

  /**
   * A hard delete, unlike a boilerplate section: the table has no is_active
   * column and 0064's RLS grants DELETE here for exactly this case — "a
   * tenant that stops selling a component brand removes the row". Documents
   * already issued are unaffected; they carry their own snapshots.
   */
  async deleteComponent(tenantId: string, id: string): Promise<void> {
    await this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .delete(componentSpecifications)
        .where(
          and(
            eq(componentSpecifications.tenantId, tenantId),
            eq(componentSpecifications.id, id),
          ),
        )
        .returning({ id: componentSpecifications.id });
      if (!row) {
        throw new NotFoundException('Component specification not found');
      }
    });
  }

  async reorderComponents(
    tenantId: string,
    ids: string[],
  ): Promise<ComponentSpecification[]> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const existing = await tx
        .select({ id: componentSpecifications.id })
        .from(componentSpecifications);
      assertCompleteReorder(ids, existing);

      // Two passes, because UNIQUE (tenant_id, sequence) is checked per
      // statement: parking every row on a negative number first means no
      // intermediate state collides with a row not yet renumbered. Both
      // passes run inside withTenant's transaction, so a failure rolls the
      // whole reorder back rather than leaving negative sequences behind.
      // ponytail: 2N single-row updates, fine for a 20-row table.
      for (const pass of [-1, 1]) {
        for (const [index, id] of ids.entries()) {
          await tx
            .update(componentSpecifications)
            .set({ sequence: pass * (index + 1), updatedAt: new Date() })
            .where(
              and(
                eq(componentSpecifications.tenantId, tenantId),
                eq(componentSpecifications.id, id),
              ),
            );
        }
      }

      return tx
        .select()
        .from(componentSpecifications)
        .orderBy(asc(componentSpecifications.sequence));
    });
  }
}

/**
 * A reorder must name every row exactly once. Anything else is a client that
 * reordered a stale list — accepting it would renumber some rows and leave
 * the rest pointing at positions that no longer mean what they did.
 */
const assertCompleteReorder = (ids: string[], existing: { id: string }[]): void => {
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    throw new BadRequestException('ids contains duplicates');
  }
  const known = new Set(existing.map((row) => row.id));
  if (unique.size !== known.size || ids.some((id) => !known.has(id))) {
    throw new BadRequestException(
      `ids must list every row exactly once (expected ${known.size}, got ${ids.length})`,
    );
  }
};
