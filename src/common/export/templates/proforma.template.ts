import type { TenantBranding } from '../document-pdf.service';
import {
  renderCommercialBody,
  type CommercialTermsData,
  type DocumentAppendixContent,
  type DocumentLineData,
  type PaymentTermData,
} from './commercial-document';
import { renderLayout } from './layout';
import { formatEtb } from './money-format';
import { fmtDate, impliedLine, TECH_ROWS } from './quotation.template';

export { formatEtb, fmtDate, TECH_ROWS };

/**
 * Shape `DocumentPdfService.renderDocumentPdf('proforma', data, branding)`
 * expects. The proforma and the quotation are the SAME document in the
 * client's hands — same line table, same 19-row spec sheet, same appendix —
 * so both are rendered by `renderCommercialBody`; only the title and the
 * plate's leading field differ, plus this document's own money column names
 * (vatEtb/totalEtb, not the quotation's taxAmountEtb/totalPriceEtb — see the
 * proformas schema).
 *
 * Deliberately carries NO margin and no cost itemization: this goes to the
 * customer, and the quotation's pre-margin breakdown is the client's markup
 * (decision (a), finance-exports-sms phase-3 report). Nor does it carry the
 * negotiated discount — for the same reason it is absent from the quotation
 * document. taxPercent is not a stored field; proforma-document.mapper.ts
 * derives it from subtotalEtb/vatEtb.
 *
 * `subtotalEtb` IS the ex-VAT figure here (the taxable base copied at issue
 * time), so unlike the quotation it is printed as given rather than
 * recomputed as total - VAT.
 */
export interface ProformaTemplateData
  extends CommercialTermsData,
    DocumentAppendixContent {
  proformaNumber: string;
  status: string;
  issuedAt?: Date | string | null;
  validUntil?: Date | string | null;
  customerName: string;
  projectName: string;
  technicalSpec?: Record<string, unknown> | null;
  subtotalEtb?: string | null;
  taxPercent?: string | null;
  vatEtb?: string | null;
  totalEtb?: string | null;
  notes?: string | null;
  /**
   * The lines snapshotted onto the proforma at issue time. Absent until the
   * mapper passes `proforma_lines` through, and absent forever on a proforma
   * issued before they existed — the template then prints the single line
   * its header implies.
   */
  lines?: readonly DocumentLineData[];
  paymentTerms?: readonly PaymentTermData[];
}

/**
 * Build the branded proforma-invoice HTML document. Pure — no I/O. Same body
 * builder as the quotation (see the interface note above): the client's own
 * proforma is the document this whole layout was rebuilt from.
 */
export const buildProformaHtml = (data: object, branding: TenantBranding | null): string => {
  const d = data as ProformaTemplateData;
  const exVatTotalEtb = d.subtotalEtb ?? '0.00';
  const lines =
    d.lines && d.lines.length > 0
      ? d.lines
      : [impliedLine(d.technicalSpec, exVatTotalEtb)];

  const bodyHtml = renderCommercialBody({
    branding,
    plate: [
      { label: 'Proforma No.', value: d.proformaNumber },
      ...(d.referenceCode ? [{ label: 'Ref.', value: d.referenceCode }] : []),
      { label: 'Issued', value: fmtDate(d.issuedAt) },
      { label: 'Status', value: d.status },
    ],
    customerName: d.customerName,
    projectName: d.projectName,
    lines,
    exVatTotalEtb,
    vatPercent: d.taxPercent ?? null,
    vatEtb: d.vatEtb,
    grandTotalEtb: d.totalEtb,
    paymentTerms: d.paymentTerms,
    terms: d,
    boilerplate: d.boilerplate,
    components: d.components,
    notes: d.notes,
  });

  return renderLayout({
    branding,
    documentTitle: 'PROFORMA INVOICE',
    bodyHtml,
    footerNote: `This proforma invoice is valid until ${fmtDate(d.validUntil)}. Prices in ETB.`,
  });
};
