import type { Document } from 'docx';

import type { TenantBranding } from '../document-pdf.service';
import { commercialDocxBody } from './commercial-document.docx';
import { buildDocxDocument } from './docx-layout';
import { formatEtb } from './money-format';
import {
  proformaBody,
  proformaFrame,
  type ProformaTemplateData,
} from './proforma.template';

export { formatEtb };

/**
 * The proforma invoice in Word, page for page the PDF, read from the same
 * proformaBody (see buildQuotationDocx). No margin, no cost itemisation, no
 * negotiation — proformaBody carries none of them.
 */
export const buildProformaDocx = (
  data: object,
  branding: TenantBranding | null,
): Document => {
  const d = data as ProformaTemplateData;
  return buildDocxDocument({
    branding,
    ...proformaFrame(d),
    children: commercialDocxBody(proformaBody(d, branding)),
  });
};
