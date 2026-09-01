import type { DocumentTemplate, TenantBranding } from '../document-pdf.service';
import {
  esc,
  renderLayout,
  renderParties,
  renderReferencePlate,
  renderSignatureBlock,
} from './layout';
import { fmtDate } from './quotation.template';

export { fmtDate };

/**
 * Registry key for `buildTechnicalProposalHtml` in
 * DocumentPdfService's TEMPLATE_BUILDERS.
 *
 * Typed `string` (not the literal) on purpose: `DocumentTemplate` — the union
 * that file owns — does not name this template yet, and a literal-to-union
 * cast is not even legal until it does. Registering the builder there adds
 */
export const TECHNICAL_PROPOSAL_TEMPLATE: DocumentTemplate = 'technical-proposal';

/**
 * Shape `renderDocumentPdf(TECHNICAL_PROPOSAL_TEMPLATE, data, branding)`
 * expects. Both documents the client's proposal lists — "Technical Proposal"
 * and "Technical Specification" — are this one sheet: the machine being
 * quoted, described in full. Nothing priced appears on it, so it can be sent
 * to a consultant or a building owner without disclosing commercial terms.
 *
 * `technicalSpec` is the stored EN 81 calc OUTPUT (TechnicalSpecs) and
 * `calcInput` the duty parameters it was computed from (CalcInput) — both
 * already persisted on every quotation.
 */
export interface TechnicalProposalTemplateData {
  quoteNumber: string;
  status: string;
  createdAt?: Date | string | null;
  customerName: string;
  projectName: string;
  technicalSpec?: Record<string, unknown> | null;
  calcInput?: Record<string, unknown> | null;
}

interface SpecRow {
  key: string;
  label: string;
  unit?: string;
  format?: (value: unknown) => string;
}

/** Mirrors quotation.template.ts's labels — that file is not ours to export from. */
const PRODUCT_LABELS: Record<string, string> = {
  PASSENGER: 'Passenger / hospital elevator',
  CAR_PLATFORM_LIFT: 'Car platform lift',
  ESCALATOR: 'Escalator',
};

/** `CENTER_OPEN` -> `Center open`. Enough for every enum printed here. */
const humanize = (value: unknown): string => {
  const words = String(value).toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** What was asked for (CalcInput) — the duty the geometry below is derived from. */
const DUTY_ROWS: readonly SpecRow[] = [
  { key: 'capacityKg', label: 'Rated load', unit: 'kg' },
  { key: 'stops', label: 'Number of stops' },
  { key: 'travelHeightM', label: 'Travel height', unit: 'm' },
  { key: 'speedMs', label: 'Rated speed', unit: 'm/s' },
  // MR / MRL are the terms an elevator engineer writes — left uppercase.
  { key: 'machineRoomType', label: 'Machine room type' },
  { key: 'doorType', label: 'Door type', format: humanize },
  { key: 'doorWidthMm', label: 'Door width', unit: 'mm' },
  { key: 'buildingUsage', label: 'Building usage', format: humanize },
];

/**
 * The computed geometry (TechnicalSpecs), in the order an engineer reads a
 * spec sheet: car, then shaft, then the machine. This is a SUPERSET of the
 * quotation PDF's TECH_ROWS — car height, overhead clearance and
 * counterweight mass are stored but have never been printed anywhere; this
 * is the document they belong on.
 *
 * Every key except productType is null for a flat-priced product, which is
 * what `renderRows` returning '' below detects.
 */
const SPEC_ROWS: readonly SpecRow[] = [
  { key: 'capacityPersons', label: 'Rated capacity', unit: 'persons' },
  { key: 'carWidthMm', label: 'Car width', unit: 'mm' },
  { key: 'carDepthMm', label: 'Car depth', unit: 'mm' },
  { key: 'carHeightMm', label: 'Car height', unit: 'mm' },
  { key: 'shaftWidthMm', label: 'Shaft width', unit: 'mm' },
  { key: 'shaftDepthMm', label: 'Shaft depth', unit: 'mm' },
  { key: 'pitDepthMm', label: 'Pit depth', unit: 'mm' },
  { key: 'overheadClearanceMm', label: 'Overhead clearance', unit: 'mm' },
  { key: 'counterweightMassKg', label: 'Counterweight mass', unit: 'kg' },
  { key: 'motorPowerKw', label: 'Motor power', unit: 'kW' },
  { key: 'guideRailSpec', label: 'Guide rail' },
  // Null on an MRL machine, so the `!= null` filter drops these three there.
  { key: 'machineRoomWidthMm', label: 'Machine room width', unit: 'mm' },
  { key: 'machineRoomDepthMm', label: 'Machine room depth', unit: 'mm' },
  { key: 'machineRoomHeightMm', label: 'Machine room height', unit: 'mm' },
];

/** Labels are literals; only the values come from stored data, so only they are escaped. */
const renderRows = (source: Record<string, unknown>, rows: readonly SpecRow[]): string =>
  rows
    .filter((r) => source[r.key] != null)
    .map((r) => {
      const value = r.format ? r.format(source[r.key]) : source[r.key];
      return `<tr><td>${r.label}</td><td class="num">${esc(value)}${r.unit ? ` ${r.unit}` : ''}</td></tr>`;
    })
    .join('');

const specTable = (rows: string): string => `
  <table class="lines">
    <thead><tr><th>Item</th><th class="num">Specification</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

/**
 * Build the branded technical specification sheet. Pure — no I/O — so it is
 * unit testable and Puppeteer just renders whatever string this returns.
 * Every interpolated data/branding field is HTML-escaped.
 */
export const buildTechnicalProposalHtml = (
  data: object,
  branding: TenantBranding | null,
): string => {
  const d = data as TechnicalProposalTemplateData;
  const tech = d.technicalSpec ?? {};
  const input = d.calcInput ?? {};

  const product = tech.productType ?? input.productType;
  // Anything that is not a stored enum string (missing, or a malformed jsonb
  // payload) prints as an em dash rather than "[object Object]".
  const productLabel = typeof product === 'string' ? (PRODUCT_LABELS[product] ?? product) : '—';

  const dutyRows = renderRows(input, DUTY_ROWS);
  const geometryRows = renderRows(tech, SPEC_ROWS);

  // A flat-priced product (escalator, car platform lift) has EVERY geometry
  // field null by definition — see TechnicalSpecs. Say so in one line instead
  // of printing a table with nothing but a header in it.
  const geometryHtml = geometryRows
    ? specTable(geometryRows)
    : `<div class="notes">This product is quoted as a flat-priced ${esc(productLabel.toLowerCase())} and carries no EN 81 lift geometry: there is no car, shaft, counterweight or guide rail to specify. Site dimensions are confirmed by survey before manufacture.</div>`;

  const bodyHtml = `
  ${renderReferencePlate([
    { label: 'Quotation', value: d.quoteNumber },
    { label: 'Project', value: d.projectName },
    { label: 'Issued', value: fmtDate(d.createdAt) },
    { label: 'Status', value: d.status },
  ])}

  ${renderParties(branding, {
    label: 'Prepared For',
    lines: [d.customerName],
  })}

  <h2>Equipment</h2>
  ${specTable(`<tr><td>Product</td><td class="num">${esc(productLabel)}</td></tr>${dutyRows}`)}

  <h2>Technical Specification</h2>
  ${geometryHtml}

  ${renderSignatureBlock(branding)}`;

  return renderLayout({
    branding,
    documentTitle: 'TECHNICAL PROPOSAL',
    bodyHtml,
    footerNote: `Specification for quotation ${d.quoteNumber}, computed to EN 81-20/50. Dimensions are nominal and confirmed by site survey.`,
  });
};
