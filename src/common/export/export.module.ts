import { Module } from '@nestjs/common';

import { DocumentPdfService } from './document-pdf.service';

/**
 * /common has no shared module today (its other pieces — pagination,
 * business-time, guards — are plain functions/providers wired directly into
 * feature modules). DocumentPdfService is the exception: it owns the
 * Puppeteer browser's process lifecycle (lazy launch, onModuleDestroy
 * shutdown), so it needs Nest's module system to instantiate it once and
 * hook that lifecycle. Phases 3/4 import this module to get the service.
 */
@Module({
  providers: [DocumentPdfService],
  exports: [DocumentPdfService],
})
export class ExportModule {}
