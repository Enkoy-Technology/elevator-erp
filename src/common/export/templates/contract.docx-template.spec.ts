import { Document } from 'docx';

import type { TenantBranding } from '../document-pdf.service';
import { buildContractDocx } from './contract.docx-template';
import {
  contractContent,
  type ContractTemplateData,
} from './contract.template';

const branding: TenantBranding = {
  name: 'Shining Star Electromechanical Works',
  slogan: 'Lifting Ethiopia',
  logoUrl: null,
  address: 'Bole Road, Addis Ababa',
  phones: ['+251 11 123 4567'],
  primaryColor: '#FB9D19',
  taxId: '0071116691',
};

const draft: ContractTemplateData = {
  contractNumber: 'CNT-FY2026-27-0001',
  status: 'DRAFT',
  issuedAt: '2026-08-01',
  signedAt: null,
  customerName: 'Acme Real Estate PLC',
  customer: { address: 'Lemi Kura, Addis Ababa', tin: '0067673517' },
  projectName: 'Bole Twin Towers',
  contractValueEtb: '4500000.00',
  equipment: [
    {
      quantity: 2,
      productType: 'PASSENGER',
      specSummary: '630KG - 8 persons / Speed 1.0m/s / G+7',
      machineRoomLabel: 'WITH MR',
      tractionMachineType: 'Gearless',
      controlSystem: 'Simplex',
      powerSupply: '380V AC 50HZ 3-phase',
    },
  ],
  instalments: [
    { label: 'Advance on signing', amountEtb: '3600000.00', dueDate: null },
    { label: 'On commissioning', amountEtb: '900000.00', dueDate: null },
  ],
  scopeOfWork: 'Brand: FUJI.\nAutomatic Rescue Device included.',
  termsAndConditions: 'Retention of 10% for twelve months.',
  warrantyMonths: 60,
  deliveryWorkingDays: 90,
  delayPenaltyPercentPerDay: '0.020',
  delayPenaltyCapPercent: '5.00',
  advanceGuaranteeRequired: true,
};

/** Every text run of the built document, as JSON: a run's text appears verbatim. */
const text = (d: ContractTemplateData): string =>
  JSON.stringify(buildContractDocx(d, branding));
/** A string as it sits inside that JSON. */
const json = (s: string): string => JSON.stringify(s).slice(1, -1);

describe('buildContractDocx', () => {
  it('returns a docx Document instance', () => {
    expect(buildContractDocx(draft, branding)).toBeInstanceOf(Document);
  });

  // The Word file is the one the client edits before signing: it must say
  // everything the PDF says, clause for clause.
  it('prints every article and every clause the PDF prints', () => {
    const word = text(draft);
    const content = contractContent(draft, branding);
    for (const article of content.articles) {
      expect(word).toContain(
        json(`Article ${article.number}: ${article.title}`.toUpperCase()),
      );
      for (const block of article.blocks) {
        if (block.kind === 'clause') {
          expect(word).toContain(json(block.text));
        }
        if (block.kind === 'price') {
          expect(word).toContain(json(block.value));
          expect(word).toContain(json(block.words));
        }
        if (block.kind === 'table') {
          for (const cell of block.rows.flat()) {
            expect(word).toContain(json(cell));
          }
        }
      }
    }
    expect(word).toContain(json(content.introduction));
  });

  it('heads a draft CONTRACT DRAFT and a signed one CONTRACT, dated as the PDF dates them', () => {
    const drafted = text(draft);
    expect(drafted).toContain('CONTRACT DRAFT');
    expect(drafted).toContain('DRAFTED'); // plate labels print uppercase, as in the PDF
    expect(drafted).toContain('not binding until signed by both parties');

    const signed = text({ ...draft, status: 'SIGNED', signedAt: '2026-08-14' });
    expect(signed).not.toContain('CONTRACT DRAFT');
    expect(signed).toContain('2026-08-14');
    expect(signed).toContain('One copy for the Client');
  });

  it('keeps the scope of work line for line', () => {
    const word = text(draft);
    expect(word).toContain('Brand: FUJI.');
    expect(word).toContain('Automatic Rescue Device included.');
  });

  it('does not throw when branding is absent', () => {
    expect(() => buildContractDocx(draft, null)).not.toThrow();
  });
});
