import type { Document } from 'docx';

import type { TenantBranding } from '../document-pdf.service';
import { commercialDocxBody } from './commercial-document.docx';
import { buildDocxDocument } from './docx-layout';
import { formatEtb } from './money-format';
import {
  quotationBody,
  quotationFrame,
  type QuotationTemplateData,
} from './quotation.template';

export { formatEtb };

/**
 * The quotation in Word, page for page the PDF: the same cover, offer,
 * specification and appendix, read from the same quotationBody the PDF
 * prints (client, 2026-10-30: the Word file was a one-page summary of a
 * five-page PDF). Like the PDF it never prints the margin or the
 * negotiation — quotationBody carries neither.
 */
export const buildQuotationDocx = (
  data: object,
  branding: TenantBranding | null,
): Document => {
  const d = data as QuotationTemplateData;
  return buildDocxDocument({
    branding,
    ...quotationFrame(d),
    children: commercialDocxBody(quotationBody(d, branding)),
  });
};
