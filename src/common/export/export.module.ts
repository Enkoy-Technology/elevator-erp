import { Module } from '@nestjs/common';

import { DocumentDocxService } from './document-docx.service';
import { DocumentPdfService } from './document-pdf.service';
import { TenantBrandingProvider } from './tenant-branding.provider';

/**
 * /common has no shared module today (its other pieces — pagination,
 * business-time, guards — are plain functions/providers wired directly into
 * feature modules). DocumentPdfService is the exception: it owns the
 * Puppeteer browser's process lifecycle (lazy launch, onModuleDestroy
 * shutdown), so it needs Nest's module system to instantiate it once and
 * hook that lifecycle. DocumentDocxService has no such lifecycle (docx
 * builds a Document object in memory per call, nothing to launch or tear
 * down) but is registered alongside it for the same reason: it's the other
 * renderer over the same document-template contract. Phases 3/4 import this
 * module to get either service.
 *
 * TenantBrandingProvider lives here too (not in a feature module): it's the
 * one place tenant_branding + tenants.name become the TenantBranding shape
 * both renderers consume, shared by every module that generates a document.
 */
@Module({
  providers: [DocumentPdfService, DocumentDocxService, TenantBrandingProvider],
  exports: [DocumentPdfService, DocumentDocxService, TenantBrandingProvider],
})
export class ExportModule {}
