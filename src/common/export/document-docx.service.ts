import { Injectable } from '@nestjs/common';
import { Document, Packer } from 'docx';

import { TemplateNotImplementedError } from '../exceptions';
import type { DocumentTemplate, TenantBranding } from './document-pdf.service';
import { buildInvoiceDocx } from './templates/invoice.docx-template';
import { buildProformaDocx } from './templates/proforma.docx-template';
import { buildQuotationDocx } from './templates/quotation.docx-template';
import { buildReceiptDocx } from './templates/receipt.docx-template';

type DocxTemplateBuilder = (data: object, branding: TenantBranding | null) => Document;

/**
 * 'quotation' (Phase 2), 'proforma' (Phase 3), and 'invoice'/'receipt'
 * (Phase 4, task 5) are wired up, mirroring DocumentPdfService's
 * TEMPLATE_BUILDERS — same reasoning: the rest of DocumentTemplate exists so
 * later phases can type against it, but nothing stubs a template ahead of
 * the data that would fill it.
 */
const TEMPLATE_BUILDERS: Partial<Record<DocumentTemplate, DocxTemplateBuilder>> = {
  quotation: buildQuotationDocx,
  proforma: buildProformaDocx,
  invoice: buildInvoiceDocx,
  receipt: buildReceiptDocx,
};

/**
 * Word output for documents the client edits before sending (contracts
 * above all). Consumes the same `data`/`branding` shape as
 * DocumentPdfService.renderDocumentPdf for a given template name — a
 * different renderer over the same contract, not a second source of truth
 * for what a quotation contains.
 */
@Injectable()
export class DocumentDocxService {
  async renderDocumentDocx(
    templateName: DocumentTemplate,
    data: object,
    branding: TenantBranding,
  ): Promise<Buffer> {
    const builder = TEMPLATE_BUILDERS[templateName];
    if (!builder) {
      throw new TemplateNotImplementedError(templateName);
    }
    const doc = builder(data, branding);
    return Packer.toBuffer(doc);
  }
}
