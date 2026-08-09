import { Module } from '@nestjs/common';

import { DocumentDocxService } from './document-docx.service';
import { DocumentPdfService } from './document-pdf.service';

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
 */
@Module({
  providers: [DocumentPdfService, DocumentDocxService],
  exports: [DocumentPdfService, DocumentDocxService],
})
export class ExportModule {}
