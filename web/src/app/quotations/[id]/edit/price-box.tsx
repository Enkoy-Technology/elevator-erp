'use client';

import { useRef, useState } from 'react';

import { labelClass } from '@/components/form-styles';
import {
  ApiError,
  priceQuotation,
  type Quotation,
  type QuotationLine,
} from '@/lib/api';
import { formatEtb, lineTotalEtb, sumEtb } from '@/lib/money';

import { NumberInput } from '../../number-input';

/**
 * How this client actually sells: they agree a round number with the
 * customer — 7,835,000 — and the offer's ex-VAT and VAT lines are derived
 * DOWN from it, never up from a subtotal. Their own document proves it,
 * 7,835,000 / 1.15 = 6,813,043.48 + 1,021,956.52 to the cent, against a
 * formula price of 8,521,500. So this box, not the line table, is the centre
 * of the screen: one field for the number they shook hands on, and the gap
 * against the calculator shown back as a discount so nobody gives away 8%
 * without seeing the 8%.
 *
 * The derived figures come from the server rather than being recomputed
 * here: the division and its rounding decide what gets printed, and there is
 * exactly one right place for that rule to live. So the field applies on
 * blur — type, tab out, read the answer.
 */

/**
 * What the frozen calculator says the lifts are worth, ex VAT — the same
 * basis the server measures the discount against (`listTotalEtb`), so the
 * running figure here and the saved one agree. Exact string arithmetic; no
 * money value is ever passed through `Number`.
 */
const calculatorSubtotalEtb = (lines: readonly QuotationLine[]): string =>
  sumEtb(
    lines.map((line) =>
      line.pricingBreakdown?.subtotalWithMargin
        ? lineTotalEtb(String(line.quantity), line.pricingBreakdown.subtotalWithMargin)
        : (line.lineTotalEtb ?? '0.00'),
    ),
  );

const Row = ({
  label,
  value,
  tone = 'normal',
}: {
  label: string;
  value: string;
  tone?: 'normal' | 'strong';
}) => (
  <div className="flex items-baseline justify-between gap-4 py-1">
    <span className="text-sm text-slate-600">{label}</span>
    <span
      className={
        tone === 'strong'
          ? 'font-display text-lg font-bold tabular-nums text-navy-900'
          : 'text-sm font-semibold tabular-nums text-slate-800'
      }
    >
      {value}
    </span>
  </div>
);

export const PriceBox = ({
  quotationId,
  quotation,
  lines,
  onQuotationChange,
  editable,
  staleAgainstLines,
}: {
  quotationId: string;
  quotation: Quotation;
  lines: readonly QuotationLine[];
  onQuotationChange: (quotation: Quotation) => void;
  /** DRAFT only — the API rejects re-pricing anything else. */
  editable: boolean;
  /** A lift changed after this price was applied, so the split across the
   *  lines and the discount on screen are both measured against lifts that
   *  no longer exist. */
  staleAgainstLines: boolean;
}) => {
  const negotiated = quotation.calculatedTotalEtb !== null;
  const [grandTotal, setGrandTotal] = useState(
    negotiated ? quotation.totalPriceEtb : '',
  );
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Blur and the button can both fire for one gesture (clicking the button
  // blurs the field first), and each would POST a price.
  const inFlight = useRef(false);

  const calcSubtotal = calculatorSubtotalEtb(lines);
  const applied = negotiated ? quotation.totalPriceEtb : null;
  const pending = grandTotal.trim() !== '' && grandTotal !== applied;

  const apply = async () => {
    const value = grandTotal.trim().replace(/\.$/, '');
    if (value === '' || value === applied || inFlight.current) {
      return;
    }
    inFlight.current = true;
    setApplying(true);
    setError(null);
    try {
      const saved = await priceQuotation(quotationId, value);
      onQuotationChange(saved);
      // Normalised ('7835000' -> '7835000.00'), which is also what makes
      // the "not applied yet" comparison below settle.
      setGrandTotal(saved.totalPriceEtb);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to apply that price',
      );
    } finally {
      inFlight.current = false;
      setApplying(false);
    }
  };

  return (
    <section className="rounded-xl border-2 border-gold-500/40 bg-white p-5">
      <h2 className={labelClass}>Price</h2>

      <Row label="Calculator, ex VAT" value={formatEtb(calcSubtotal)} />
      {quotation.calculatedTotalEtb ? (
        <Row
          label="Calculator, incl. VAT"
          value={formatEtb(quotation.calculatedTotalEtb)}
        />
      ) : null}

      <div className="mt-4 border-t border-slate-200 pt-4">
        <label
          htmlFor="grandTotal"
          className="mb-1 block text-xs font-semibold text-slate-600"
        >
          What the customer pays, incl. VAT (ETB)
        </label>
        <NumberInput
          id="grandTotal"
          disabled={!editable || applying}
          value={grandTotal}
          onValueChange={setGrandTotal}
          onBlur={() => void apply()}
          placeholder="7,835,000"
          className="w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-3 font-display text-2xl font-bold outline-none transition focus:border-gold-500 focus:ring-2 focus:ring-gold-500/25"
        />
        <p className="mt-1 text-xs text-slate-500">
          The round figure you agreed. Everything below is worked back from it —
          type it and tab out.
          {applying ? ' Applying…' : null}
          {!applying && pending ? ' Not applied yet.' : null}
        </p>
        {editable ? (
          <button
            type="button"
            // Blur applies it; this button is for the salesperson who hits
            // Enter or never leaves the field, and for touch, where "tab
            // out" is not a gesture anyone makes.
            disabled={applying || !pending}
            onClick={() => void apply()}
            className="mt-2 text-xs font-semibold text-navy-800 hover:underline disabled:opacity-40"
          >
            Apply this price
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {negotiated && staleAgainstLines ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          A lift changed after this price was agreed. Apply the price again so the
          split across the lifts and the discount below are measured against what
          is on the offer now.
        </p>
      ) : null}

      {negotiated ? (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <Row label="Subtotal, ex VAT" value={formatEtb(quotation.subtotalEtb)} />
          <Row
            label={`VAT (${quotation.taxPercent}%)`}
            value={formatEtb(quotation.taxAmountEtb)}
          />
          <Row label="Grand total" value={formatEtb(quotation.totalPriceEtb)} tone="strong" />

          {/* Internal: never printed. A negative one is a premium, which is
              why it is worded rather than assumed to be a discount. */}
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">
              Internal — not printed
            </p>
            <Row
              label={
                quotation.discountAmountEtb?.startsWith('-')
                  ? 'Premium over the calculator'
                  : 'Discount off the calculator'
              }
              value={`${formatEtb(quotation.discountAmountEtb ?? '0.00')} · ${
                quotation.discountPercent ?? '0.00'
              }%`}
            />
            {quotation.discountApprovedByUserId ? (
              <p className="text-xs text-emerald-700">Discount signed off.</p>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          No negotiated price yet — the offer will print the calculator&rsquo;s own
          figure.
        </p>
      )}
    </section>
  );
};
