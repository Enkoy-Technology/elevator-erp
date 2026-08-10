import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { tenantBranding, tenants } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type { TenantBranding } from './document-pdf.service';

/** Matches tenant_branding.primary_color_hex's own DB default (see schema/tenants.ts). */
const DEFAULT_PRIMARY = '#1B2A4A';

/**
 * The one place `tenant_branding` + `tenants.name` become the TenantBranding
 * shape the pdf/docx renderers consume — quotations/proformas document
 * endpoints both call this instead of each re-deriving the mapping.
 * Queries directly via TenantDbService (same tables SettingsRepository
 * reads) rather than importing SettingsModule, so ExportModule stays a
 * /common module with no dependency on a feature module.
 */
@Injectable()
export class TenantBrandingProvider {
  constructor(private readonly tenantDb: TenantDbService) {}

  async get(tenantId: string): Promise<TenantBranding> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      // The withTenant() RLS session GUC is the real defense; this explicit
      // filter is belt-and-suspenders, matching the pattern the new
      // findByIdForDocument joins use (see quotations/proformas
      // repositories) rather than relying on RLS alone.
      const [branding] = await tx
        .select()
        .from(tenantBranding)
        .where(eq(tenantBranding.tenantId, tenantId))
        .limit(1);
      const [tenant] = await tx
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      return {
        name: tenant?.name ?? '',
        // tenant_branding has no slogan column today — renderLayout/docx
        // both already treat an empty slogan as "omit the line".
        slogan: '',
        logoUrl: branding?.logoUrl ?? null,
        address: branding?.officialAddress ?? '',
        phones: branding?.contactPhone ? [branding.contactPhone] : [],
        primaryColor: branding?.primaryColorHex ?? DEFAULT_PRIMARY,
      };
    });
  }
}
