import type { Quotation, QuotationLine } from '../../../../lib/api';
import { calculatorFiguresEtb } from './price-figures';

const line = (subtotalWithMargin: string, quantity = 1) =>
  ({
    quantity,
    lineTotalEtb: subtotalWithMargin,
    pricingBreakdown: { subtotalWithMargin },
  }) as unknown as QuotationLine;

const quote = (totalPriceEtb: string, calculatedTotalEtb: string | null = null) =>
  ({ totalPriceEtb, calculatedTotalEtb, taxPercent: '15.00' }) as Quotation;

describe('calculatorFiguresEtb', () => {
  it("is the sheet's own figure, as the server totals it, not net + 15% of the net", () => {
    // 6,582,608.70 + 15% is 7,570,000.01; the client's sheet says 7,570,000.
    expect(
      calculatorFiguresEtb(quote('7570000.00'), [line('6582608.70')]),
    ).toEqual({
      netEtb: '6582608.70',
      taxEtb: '987391.30',
      grossEtb: '7570000.00',
    });
  });

  it('is the sheet figure times the units, VAT being what is left over', () => {
    expect(
      calculatorFiguresEtb(quote('12630000.00'), [line('3660869.57', 3)]),
    ).toEqual({
      netEtb: '10982608.71',
      taxEtb: '1647391.29',
      grossEtb: '12630000.00',
    });
  });

  it('measures a negotiated offer against what the calculator said, not the agreed total', () => {
    expect(
      calculatorFiguresEtb(quote('7000000.00', '7570000.00'), [
        line('6582608.70'),
      ]),
    ).toEqual({
      netEtb: '6582608.70',
      taxEtb: '987391.30',
      grossEtb: '7570000.00',
    });
  });
});
