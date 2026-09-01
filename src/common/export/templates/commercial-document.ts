import type { TenantBranding } from '../document-pdf.service';
import {
  esc,
  renderParties,
  renderReferencePlate,
  renderSignatureBlock,
  type ReferenceField,
} from './layout';
import { formatAmount, formatEtb, formatQuantity } from './money-format';

/**
 * The client's real 8-page proforma, as a data contract.
 *
 * Their document is one shape used twice — the quotation and the proforma
 * differ only in the heading and the leading reference field — so it is
 * built once here and both templates hand it their own plate. Page 1 is the
 * commercial offer (line-item table + totals + terms), page 2 is the 19-row
 * specification table (one per line), pages 3+ are the tenant's boilerplate
 * prose and the component/brand table.
 *
 * Pure: every function in this file takes data and returns a string. Nothing
 * here queries — the appendix content arrives already loaded (see
 * DocumentContentProvider), which is what stops the two copies of the
 * boilerplate drifting apart the way the client's pasted pages did.
 */

/** What the customer sees instead of the raw enum. */
export const PRODUCT_LABELS: Record<string, string> = {
  PASSENGER: 'Passenger / hospital elevator',
  CAR_PLATFORM_LIFT: 'Car platform lift',
  ESCALATOR: 'Escalator',
};

const MACHINE_ROOM_LABELS: Record<string, string> = {
  MR: 'With machine room',
  MRL: 'Without machine room (MRL)',
};

const DOOR_TYPE_LABELS: Record<string, string> = {
  CENTER_OPEN: 'Center opening',
  TELESCOPIC: 'Telescopic',
  SWING: 'Swing',
};

/**
 * One row of page 1's line table, and the source of one page-2 spec table.
 *
 * Every field is optional because a line is legitimately incomplete: a
 * hand-entered allowance line has no calculator run behind it, and a
 * quotation written before line items existed is rendered as the single line
 * its header implies. A row whose value is absent is DROPPED from the spec
 * table rather than printed as an empty cell.
 */
export interface DocumentLineData {
  sequence?: number | null;
  productType?: string | null;
  /** Page 1's "Specifications" cell, verbatim as stored. */
  specSummary?: string | null;
  quantity?: number | null;
  unitPriceEtb?: string | null;
  lineTotalEtb?: string | null;

  // Spec-sheet fields a human types (see database/schema/document-lines.ts).
  machineRoomLabel?: string | null;
  /** "B+G+M+10". */
  floorDisplaySummary?: string | null;
  /** "13/13/13" — derived by the mapper, never re-derived here. */
  floorsStopsDoors?: string | null;
  doorHeightMm?: number | null;
  ropingRatio?: string | null;
  tractionMachineType?: string | null;
  controlSystem?: string | null;
  powerSupply?: string | null;
  lightSupply?: string | null;

  /** The calculator snapshots the rest of the spec table reads. */
  calcInput?: Record<string, unknown> | null;
  technicalSpec?: Record<string, unknown> | null;
}

export interface PaymentTermData {
  /** numeric(5,2) as a string, e.g. "50.00". */
  percent: string;
  label: string;
  triggerEvent?: string | null;
}

/** The commercial prose the client prints under the totals on page 1. */
export interface CommercialTermsData {
  /** Their own offer reference, e.g. "Rodas FUJIHD-E02". */
  referenceCode?: string | null;
  validityDays?: number | null;
  warrantyPartsMonths?: number | null;
  warrantyFreeServiceMonths?: number | null;
  deliveryDays?: number | null;
}

export interface BoilerplateSectionData {
  title?: string | null;
  body?: string | null;
}

export interface ComponentSpecData {
  sequence?: number | null;
  componentName: string;
  brand?: string | null;
  remark?: string | null;
}

/** The tenant-level appendix both documents append (pages 3+). */
export interface DocumentAppendixContent {
  boilerplate?: readonly BoilerplateSectionData[];
  components?: readonly ComponentSpecData[];
}

export interface CommercialDocumentOptions extends DocumentAppendixContent {
  branding: TenantBranding | null;
  /** The identity plate — the two documents label their number differently. */
  plate: readonly ReferenceField[];
  customerName: string;
  projectName: string;
  lines: readonly DocumentLineData[];
  /**
   * The three figures of the client's totals block. NOTHING about the
   * negotiation appears here: neither templates nor callers pass the
   * discount or the calculated-before-negotiation figure onto a customer
   * document.
   */
  exVatTotalEtb?: string | null;
  vatPercent?: string | null;
  vatEtb?: string | null;
  grandTotalEtb?: string | null;
  paymentTerms?: readonly PaymentTermData[];
  terms?: CommercialTermsData;
  notes?: string | null;
}

/**
 * The one coercion point, same trick layout.ts's `esc` relies on: String()
 * of an `unknown` is fine, but String() of a value already narrowed by a
 * null check is an object type as far as no-base-to-string is concerned.
 */
const asString = (value: unknown): string => String(value);

/** A spec value is printed only when it is really there — never as a blank cell. */
const text = (value: unknown): string | null => {
  const rendered = value == null ? '' : asString(value);
  return rendered === '' ? null : rendered;
};

const productLabel = (value: unknown): string | null => {
  const raw = text(value);
  // A product not listed falls back to its own value rather than
  // disappearing off the document.
  return raw === null ? null : (PRODUCT_LABELS[raw] ?? raw);
};

/** "1600 x 1400 mm", or null the moment any dimension is missing. */
const dims = (parts: readonly unknown[]): string | null => {
  const present = parts.map(text);
  return present.every((part): part is string => part !== null)
    ? `${present.join(' x ')} mm`
    : null;
};

/**
 * Months as the client states them: a whole number of years reads "5 years"
 * (their warranty line), anything else stays in months.
 */
export const monthsLabel = (months: number): string => {
  if (months > 0 && months % 12 === 0) {
    const years = months / 12;
    return `${years} ${years === 1 ? 'year' : 'years'}`;
  }
  return `${months} ${months === 1 ? 'month' : 'months'}`;
};

/**
 * Their page 1 table, with their column names. `specSummary` is the stored
 * sentence, not a re-derivation — an issued document must never re-render
 * differently after a formatting change.
 */
const renderLineTable = (lines: readonly DocumentLineData[]): string => {
  const rows = lines
    .map(
      (line) => `<tr>
        <td>${esc(productLabel(line.productType ?? line.technicalSpec?.productType) ?? '—')}</td>
        <td>${esc(line.specSummary ?? '—')}</td>
        <td class="num">${esc(formatQuantity(line.quantity))}</td>
        <td class="num">${formatAmount(line.unitPriceEtb)}</td>
        <td class="num">${formatAmount(line.lineTotalEtb)}</td>
      </tr>`,
    )
    .join('');
  return `<table class="lines">
    <thead><tr>
      <th>Elevator Type</th><th>Specifications</th>
      <th class="num">No of Units</th>
      <th class="num">Unit price /Birr</th>
      <th class="num">Total price /Birr</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
};

/** The grand total is the emphasised row, as it is on theirs. */
const renderTotals = (o: CommercialDocumentOptions): string => `
  <div class="sum-block">
  <table class="totals">
    <tbody>
      <tr><td>Total price</td><td class="num">${formatEtb(o.exVatTotalEtb)}</td></tr>
      <tr><td>VAT${o.vatPercent ? ` (${esc(o.vatPercent)}%)` : ''}</td><td class="num">${formatEtb(o.vatEtb)}</td></tr>
      <tr class="grand"><td>Grand total</td><td class="num">${formatEtb(o.grandTotalEtb)}</td></tr>
    </tbody>
  </table>
  </div>`;

const renderPaymentTerms = (terms: readonly PaymentTermData[]): string => {
  if (terms.length === 0) {
    return '';
  }
  const items = terms
    .map(
      (term) =>
        `<li><span class="term-pct">${esc(formatQuantity(term.percent))}%</span>` +
        `<span class="term-label">${esc(term.label)}</span>` +
        (term.triggerEvent ? `<span class="term-trigger">${esc(term.triggerEvent)}</span>` : '') +
        `</li>`,
    )
    .join('');
  return `<h2>Payment Terms</h2><ol class="terms-list">${items}</ol>`;
};

const renderCommercialTerms = (terms: CommercialTermsData | undefined): string => {
  if (!terms) {
    return '';
  }
  const rows: ReadonlyArray<readonly [string, string | null]> = [
    [
      'Offer validity',
      terms.validityDays == null
        ? null
        : `${terms.validityDays} ${terms.validityDays === 1 ? 'day' : 'days'}`,
    ],
    [
      'Warranty of main parts',
      terms.warrantyPartsMonths == null ? null : monthsLabel(terms.warrantyPartsMonths),
    ],
    [
      'Free manpower maintenance',
      terms.warrantyFreeServiceMonths == null
        ? null
        : `${terms.warrantyFreeServiceMonths} ${terms.warrantyFreeServiceMonths === 1 ? 'month' : 'months'}`,
    ],
    [
      'Delivery time',
      terms.deliveryDays == null ? null : `${terms.deliveryDays} working days`,
    ],
  ];
  const body = rows
    .filter((row): row is readonly [string, string] => row[1] !== null)
    .map(([label, value]) => `<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>`)
    .join('');
  return body ? `<h2>Terms</h2><table class="lines terms">${`<tbody>${body}</tbody>`}</table>` : '';
};

/**
 * Their page 2. Nineteen rows, in their order, each dropped when the value
 * is absent — the numbering is applied AFTER that filter so it always reads
 * 1..n with no holes.
 */
const renderSpecTable = (line: DocumentLineData): string => {
  const calc = line.calcInput ?? {};
  const tech = line.technicalSpec ?? {};
  const capacityKg = text(calc.capacityKg);
  const persons = text(tech.capacityPersons);
  const travelHeightM = calc.travelHeightM;

  const rows: ReadonlyArray<readonly [string, string | null]> = [
    ['Elevator Type', productLabel(line.productType ?? tech.productType)],
    ['Ordering quantity', text(line.quantity)],
    [
      'With or without machine room',
      line.machineRoomLabel ?? MACHINE_ROOM_LABELS[String(calc.machineRoomType)] ?? null,
    ],
    [
      'Load (Capacity)',
      capacityKg === null
        ? null
        : `${capacityKg} KG${persons === null ? '' : ` / ${persons} persons`}`,
    ],
    ['Speed', calc.speedMs == null ? null : `${text(calc.speedMs)} m/s`],
    // Stored in metres by the calculator, printed in millimetres as they
    // print it. Guarded on the type rather than coerced, so a string in the
    // snapshot drops the row instead of printing "NaN".
    [
      'Travel height (mm)',
      typeof travelHeightM === 'number' ? String(travelHeightM * 1000) : null,
    ],
    ['Floors/stops/doors', text(line.floorsStopsDoors)],
    ['Floor display', text(line.floorDisplaySummary)],
    ['Depth of Pit (mm)', text(tech.pitDepthMm)],
    ['O/H height of overhead (mm)', text(tech.overheadClearanceMm)],
    ['Shaft size (W x D)', dims([tech.shaftWidthMm, tech.shaftDepthMm])],
    ['Car size (W x D x H)', dims([tech.carWidthMm, tech.carDepthMm, tech.carHeightMm])],
    ['Door size (W x H)', dims([calc.doorWidthMm, line.doorHeightMm])],
    ['Car opening type', DOOR_TYPE_LABELS[String(calc.doorType)] ?? null],
    ['Power supply', text(line.powerSupply)],
    ['Light supply', text(line.lightSupply)],
    ['Roping', text(line.ropingRatio)],
    ['Traction Machine', text(line.tractionMachineType)],
    ['Control System', text(line.controlSystem)],
  ];

  const body = rows
    .filter((row): row is readonly [string, string] => row[1] !== null)
    .map(
      ([label, value], index) =>
        `<tr><td><span class="rowno">${index + 1}</span>${esc(label)}</td><td>${esc(value)}</td></tr>`,
    )
    .join('');
  return body
    ? `<table class="lines spec"><tbody>${body}</tbody></table>`
    : '<p class="fineprint">No specification recorded for this line.</p>';
};

/** Page 2 proper: one titled spec table per line. */
const renderSpecPage = (lines: readonly DocumentLineData[]): string => {
  const many = lines.length > 1;
  return lines
    .map((line, index) => {
      const heading = many
        ? `Specification — ${line.sequence ?? index + 1}. ${
            productLabel(line.productType ?? line.technicalSpec?.productType) ?? 'Item'
          }`
        : 'Specification';
      return `<h2>${esc(heading)}</h2>${renderSpecTable(line)}`;
    })
    .join('');
};

/**
 * Pages 3+. The boilerplate is the tenant's own prose, rendered from the one
 * row that owns it; `white-space: pre-line` keeps the paragraphing they typed
 * without letting any markup through (`esc` runs first).
 */
const renderAppendix = (o: CommercialDocumentOptions): string => {
  const sections = (o.boilerplate ?? [])
    .filter((section) => section.title || section.body)
    .map(
      (section) =>
        `${section.title ? `<h2>${esc(section.title)}</h2>` : ''}` +
        `${section.body ? `<div class="prose">${esc(section.body)}</div>` : ''}`,
    )
    .join('');

  const components = o.components ?? [];
  const componentTable =
    components.length === 0
      ? ''
      : `<h2>Component Specification</h2>
      <table class="lines compact">
        <thead><tr><th class="num">No.</th><th>Component Name</th><th>Brand</th><th>Remark</th></tr></thead>
        <tbody>${components
          .map(
            (component, index) =>
              `<tr><td class="num">${esc(component.sequence ?? index + 1)}</td>` +
              `<td>${esc(component.componentName)}</td>` +
              `<td>${esc(component.brand ?? '—')}</td>` +
              `<td>${esc(component.remark ?? '')}</td></tr>`,
          )
          .join('')}</tbody>
      </table>`;

  return sections || componentTable
    ? `<div class="page-break">${sections}${componentTable}</div>`
    : '';
};

/**
 * The whole body, pages 1..n, ready to hand to `renderLayout`. The letterhead
 * and footer are NOT here: they are page margin boxes drawn by Chromium on
 * every page (see layout.ts / DocumentPdfService).
 */
export const renderCommercialBody = (o: CommercialDocumentOptions): string => `
  ${renderReferencePlate(o.plate)}

  ${renderParties(o.branding, {
    label: 'Prepared For',
    lines: [o.customerName, `Project: ${o.projectName}`],
  })}

  <h2>Offer</h2>
  ${renderLineTable(o.lines)}
  ${renderTotals(o)}

  ${renderPaymentTerms(o.paymentTerms ?? [])}
  ${renderCommercialTerms(o.terms)}

  ${o.notes ? `<div class="notes">${esc(o.notes)}</div>` : ''}

  ${renderSignatureBlock(o.branding)}

  <div class="page-break">${renderSpecPage(o.lines)}</div>

  ${renderAppendix(o)}`;
