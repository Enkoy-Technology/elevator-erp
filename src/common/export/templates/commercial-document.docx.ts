import {
  commercialTermRows,
  lineCells,
  specHeading,
  specRows,
  type CommercialDocumentOptions,
} from './commercial-document';
import {
  dataTable,
  fineprint,
  heading,
  notesBox,
  paletteOf,
  partiesTable,
  plateTable,
  prose,
  signatureBlock,
  specTable,
  termsList,
  totalsTable,
  type Block,
} from './docx-layout';
import { formatEtb, formatQuantity } from './money-format';

/**
 * renderCommercialBody, in Word: the same pages in the same order from the
 * same rows — page 1 the offer, then a page per specification, then the
 * appendix — so the quotation and proforma read the same in either format.
 * Every row comes from the functions the PDF prints (lineCells, specRows,
 * commercialTermRows); only the drawing is Word's.
 */
export const commercialDocxBody = (o: CommercialDocumentOptions): Block[] => {
  const palette = paletteOf(o.branding);
  const terms = commercialTermRows(o.terms);
  const payments = o.paymentTerms ?? [];
  const many = o.lines.length > 1;

  const specPages = o.lines.flatMap((line, index) => {
    const rows = specRows(line);
    return [
      heading(specHeading(line, index, many), palette, {
        pageBreakBefore: index === 0,
      }),
      rows.length > 0
        ? specTable(rows, palette)
        : fineprint('No specification recorded for this line.', 0),
    ];
  });

  // Pages 3+: the tenant's prose, then the component table, from a page of
  // their own.
  const sections = (o.boilerplate ?? []).filter((s) => s.title || s.body);
  const components = o.components ?? [];
  // The first block of the appendix opens its page.
  const appendix: Block[] = [
    ...sections.flatMap((section, i) => [
      ...(section.title
        ? [heading(section.title, palette, { pageBreakBefore: i === 0 })]
        : []),
      ...(section.body
        ? [prose(section.body, { pageBreakBefore: i === 0 && !section.title })]
        : []),
    ]),
    ...(components.length > 0
      ? [
          heading('Component Specification', palette, {
            pageBreakBefore: sections.length === 0,
          }),
          dataTable(
            [
              { header: 'No.', width: 7, num: true },
              { header: 'Component Name', width: 41 },
              { header: 'Brand', width: 20 },
              { header: 'Remark', width: 32 },
            ],
            components.map((c, i) => [
              String(c.sequence ?? i + 1),
              c.componentName,
              c.brand ?? '—',
              c.remark ?? '',
            ]),
            palette,
            { compact: true },
          ),
        ]
      : []),
  ];

  return [
    ...plateTable(o.plate, palette),
    ...partiesTable(o.branding, {
      label: 'To',
      lines: [o.projectName, ...(o.projectAddress ? [o.projectAddress] : [])],
    }),

    heading('Offer', palette),
    dataTable(
      [
        { header: 'Elevator Type', width: 15 },
        { header: 'Specifications', width: 33 },
        { header: 'No of Units', width: 14, num: true },
        { header: 'Unit price /Birr', width: 19, num: true },
        { header: 'Total price /Birr', width: 19, num: true },
      ],
      o.lines.map((line) => [...lineCells(line)]),
      palette,
    ),
    ...totalsTable(
      [
        { label: 'Total', value: formatEtb(o.exVatTotalEtb) },
        {
          label: `VAT${o.vatPercent ? ` (${o.vatPercent}%)` : ''}`,
          value: formatEtb(o.vatEtb),
        },
        {
          label: 'Grand Total',
          value: formatEtb(o.grandTotalEtb),
          grand: true,
        },
      ],
      palette,
    ),

    ...(payments.length > 0
      ? [
          heading('Payment Terms', palette),
          ...termsList(
            payments.map((t) => ({
              percent: formatQuantity(t.percent),
              label: t.label,
              trigger: t.triggerEvent,
            })),
          ),
        ]
      : []),
    ...(terms.length > 0
      ? [
          heading('Terms', palette),
          dataTable(
            [
              { header: '', width: 42 },
              { header: '', width: 58 },
            ],
            terms.map(([label, value]) => [label, value]),
            palette,
            { header: false, soft: [0] },
          ),
        ]
      : []),

    ...(o.notes
      ? [heading('Special notes', palette), ...notesBox(o.notes, palette)]
      : []),

    ...signatureBlock(o.branding),

    ...specPages,
    ...appendix,
  ];
};
