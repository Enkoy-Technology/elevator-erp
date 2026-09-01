import { Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import { componentSpecifications, documentBoilerplate } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type { DocumentAppendixContent } from './templates/commercial-document';

/**
 * Pages 3+ of the client's proforma — their standard prose and the 20-row
 * component/brand table — loaded once per document render.
 *
 * Queries directly via TenantDbService (the same two tables
 * DocumentContentRepository serves the admin screen from) rather than
 * importing SettingsModule, exactly as TenantBrandingProvider does: this is
 * a /common module and must not depend on a feature module. Both lists are
 * bounded and short (8 sections, 20 components) and the renderer wants all
 * of them, so neither read paginates.
 *
 * Inactive sections are dropped HERE rather than in the template: the switch
 * means "not on the printed document", and a template that receives them
 * would have to know that.
 */
@Injectable()
export class DocumentContentProvider {
  constructor(private readonly tenantDb: TenantDbService) {}

  async get(tenantId: string): Promise<DocumentAppendixContent> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      // The withTenant() RLS session GUC is the real defense; the explicit
      // tenant filters are belt-and-suspenders, matching the pattern the
      // findByIdForDocument joins use.
      const boilerplate = await tx
        .select({
          title: documentBoilerplate.title,
          body: documentBoilerplate.body,
        })
        .from(documentBoilerplate)
        .where(
          and(
            eq(documentBoilerplate.tenantId, tenantId),
            eq(documentBoilerplate.isActive, true),
          ),
        )
        // sortOrder is not unique, so sectionKey breaks ties — without it two
        // sections sharing a sort order swap places between renders.
        .orderBy(asc(documentBoilerplate.sortOrder), asc(documentBoilerplate.sectionKey));

      const components = await tx
        .select({
          sequence: componentSpecifications.sequence,
          componentName: componentSpecifications.componentName,
          brand: componentSpecifications.brand,
          remark: componentSpecifications.remark,
        })
        .from(componentSpecifications)
        .where(eq(componentSpecifications.tenantId, tenantId))
        .orderBy(asc(componentSpecifications.sequence));

      return { boilerplate, components };
    });
  }
}
