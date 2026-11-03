import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Document, Packer } from 'docx';

import { TemplateNotImplementedError } from '../exceptions';
import {
  DocumentPdfService,
  type DocumentTemplate,
  type TenantBranding,
} from './document-pdf.service';
import type { DocumentBranding } from './templates/layout';
import { buildContractDocx } from './templates/contract.docx-template';
import { buildInvoiceDocx } from './templates/invoice.docx-template';
import { buildProformaDocx } from './templates/proforma.docx-template';
import { buildQuotationDocx } from './templates/quotation.docx-template';
import { buildReceiptDocx } from './templates/receipt.docx-template';

type DocxTemplateBuilder = (
  data: object,
  branding: TenantBranding | null,
) => Document;

/**
 * The documents the client edits before sending, each the PDF's twin:
 * quotation, proforma, invoice, receipt and contract. The reports
 * ('aging-report', 'customer-statement') are PDF-only by design — a report
 * is read, not edited — so asking for one as Word throws
 * TemplateNotImplementedError.
 */
const TEMPLATE_BUILDERS: Partial<
  Record<DocumentTemplate, DocxTemplateBuilder>
> = {
  contract: buildContractDocx,
  quotation: buildQuotationDocx,
  proforma: buildProformaDocx,
  invoice: buildInvoiceDocx,
  receipt: buildReceiptDocx,
};

/** The PDF's watermark opacity (layout.ts `.watermark`). */
const WATERMARK_OPACITY = 0.2;
/** What the re-encoded images may hold in memory, all tenants together. */
const CACHE_BYTES = 32 * 1024 * 1024;

/**
 * Word output for documents the client edits before sending (contracts
 * above all). Consumes the same `data`/`branding` shape as
 * DocumentPdfService.renderDocumentPdf for a given template name — a
 * different renderer over the same contract, not a second source of truth
 * for what a quotation contains.
 *
 * The tenant's watermark and seal reach the builder re-encoded by
 * DocumentPdfService.fadeImage: the watermark faded to the PDF's 20%, the
 * seal as it is. Each result is kept by the hash of the image it came from
 * (a tenant has one of each), up to CACHE_BYTES; a failure is not kept, so
 * the next download tries again.
 */
@Injectable()
export class DocumentDocxService {
  private readonly encoded = new Map<string, string>();
  private encodedBytes = 0;
  private readonly encoding = new Map<string, Promise<string | null>>();

  constructor(private readonly pdf: DocumentPdfService) {}

  async renderDocumentDocx(
    templateName: DocumentTemplate,
    data: object,
    branding: TenantBranding,
  ): Promise<Buffer> {
    const builder = TEMPLATE_BUILDERS[templateName];
    if (!builder) {
      throw new TemplateNotImplementedError(templateName, 'Word');
    }
    const b: DocumentBranding = branding;
    // None at all rather than full strength over the text when an image
    // cannot be re-encoded.
    const [watermarkUrl, stampUrl] = await Promise.all([
      b.watermarkUrl ? this.reencode(b.watermarkUrl, WATERMARK_OPACITY) : null,
      b.stampUrl ? this.reencode(b.stampUrl, 1) : null,
    ]);
    const reencoded: DocumentBranding = { ...b, watermarkUrl, stampUrl };
    return Packer.toBuffer(builder(data, reencoded));
  }

  private async reencode(
    dataUri: string,
    opacity: number,
  ): Promise<string | null> {
    const key = createHash('sha256')
      .update(`${opacity}:${dataUri}`)
      .digest('hex');
    const cached = this.encoded.get(key);
    if (cached) {
      return cached;
    }
    let pending = this.encoding.get(key);
    if (!pending) {
      pending = this.pdf
        .fadeImage(dataUri, opacity)
        .finally(() => this.encoding.delete(key));
      this.encoding.set(key, pending);
    }
    const result = await pending;
    if (result && !this.encoded.has(key) && result.length <= CACHE_BYTES) {
      this.encoded.set(key, result);
      this.encodedBytes += result.length;
      // Oldest first, until the cache is back inside its budget.
      for (const [oldKey, old] of this.encoded) {
        if (this.encodedBytes <= CACHE_BYTES) {
          break;
        }
        this.encoded.delete(oldKey);
        this.encodedBytes -= old.length;
      }
    }
    return result;
  }
}
