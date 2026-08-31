import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { tenantBranding, tenants } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type { DocumentBranding } from './templates/layout';

/** Matches tenant_branding.primary_color_hex's own DB default (see schema/tenants.ts). */
const DEFAULT_PRIMARY = '#1B2A4A';

/**
 * The one place `tenant_branding` + `tenants.name` become the branding
 * the pdf/docx renderers consume (`DocumentBranding`, the renderer's
 * `TenantBranding` plus the stamp/email columns the templates read) — quotations/proformas document
 * endpoints both call this instead of each re-deriving the mapping.
 * Queries directly via TenantDbService (same tables SettingsRepository
 * reads) rather than importing SettingsModule, so ExportModule stays a
 * /common module with no dependency on a feature module.
 */
@Injectable()
export class TenantBrandingProvider {
  constructor(private readonly tenantDb: TenantDbService) {}

  async get(tenantId: string): Promise<DocumentBranding> {
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
        // renderLayout/docx both treat an empty slogan as "omit the line".
        slogan: branding?.slogan ?? '',
        logoUrl: branding?.logoUrl ?? null,
        // Rendered as the seal on the signature block of the customer-facing
        // documents; null simply omits that block's seal column.
        stampUrl: branding?.stampUrl ?? null,
        address: branding?.officialAddress ?? '',
        phones: branding?.contactPhone ? [branding.contactPhone] : [],
        email: branding?.contactEmail ?? null,
        primaryColor: branding?.primaryColorHex ?? DEFAULT_PRIMARY,
      };
    });
  }
}
