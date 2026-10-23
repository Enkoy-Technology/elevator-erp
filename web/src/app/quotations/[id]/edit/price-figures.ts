import type { Quotation, QuotationLine } from '../../../../lib/api';
import { lineTotalEtb, subtractEtb, sumEtb } from '../../../../lib/money';

/**
 * What the frozen calculator says the lifts are worth, ex VAT — the same
 * basis the server measures the discount against (`listTotalEtb`), so the
 * running figure here and the saved one agree. Exact string arithmetic; no
 * money value is ever passed through `Number`.
 */
export const calculatorSubtotalEtb = (lines: readonly QuotationLine[]): string =>
  sumEtb(
    lines.map((line) =>
      line.pricingBreakdown?.subtotalWithMargin
        ? lineTotalEtb(
            String(line.quantity),
            line.pricingBreakdown.subtotalWithMargin,
          )
        : (line.lineTotalEtb ?? '0.00'),
    ),
  );

/**
 * The calculator's figure for the offer, as the server totals it: the
 * calculator total it stored when a price was agreed, otherwise the offer's
 * own total, which is then the list. Not net + VAT × rate recomputed here:
 * on a VAT-inclusive sheet the server's total is the sheet figure itself
 * (7,570,000.00 where net + 15% gives 7,570,000.01), and a discount typed
 * against the recomputed figure would print that stray cent.
 */
export const calculatorFiguresEtb = (
  quotation: Pick<Quotation, 'totalPriceEtb' | 'calculatedTotalEtb'>,
  lines: readonly QuotationLine[],
): { netEtb: string; taxEtb: string; grossEtb: string } => {
  const netEtb = calculatorSubtotalEtb(lines);
  const grossEtb = quotation.calculatedTotalEtb ?? quotation.totalPriceEtb;
  return { netEtb, taxEtb: subtractEtb(grossEtb, netEtb), grossEtb };
};
