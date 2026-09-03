'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { Stepper, type Step } from '@/components/stepper';
import { btnGhost, fieldClass, labelClass } from '@/components/form-styles';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  getAccessToken,
  getCurrentRole,
  getQuotation,
  listQuotationLines,
  listQuotationPaymentTerms,
  updateQuotationTerms,
  type PaymentTermInput,
  type Quotation,
  type QuotationLine,
  type UpdateQuotationTermsPayload,
  type UserRole,
} from '@/lib/api';
import { formatEtb, formatNumber, isZeroEtb, subtractEtb, sumEtb } from '@/lib/money';

import { NumberInput } from '../../number-input';
import { LinesEditor } from './lines-editor';
import { PriceBox } from './price-box';

/**
 * Where a quotation is actually built: the lifts, the price that was
 * negotiated, and the commercial terms printed as prose on page 1.
 *
 * Three save gestures rather than one, on purpose. Lines and the price each
 * round-trip on their own because the calculator and the VAT derivation live
 * on the server and there is nothing to look at until they answer. The form
 * submit owns what is pure typing — the terms and the payment schedule.
 */

/** Mirrors @Roles('SALES_MANAGER'); CEO and ADMIN bypass via SUPER_ROLES. */
const canWrite = (role: UserRole | null): boolean =>
  role === 'SALES_MANAGER' || role === 'CEO' || role === 'ADMIN';

interface TermRow {
  label: string;
  percent: string;
}

/**
 * The schedule this client puts on every offer. Seeded visibly into an empty
 * editor rather than left blank: it is the same four milestones every time,
 * and the salesperson can see and change all four before saving.
 */
const STANDARD_TERMS: TermRow[] = [
  { label: 'Advance payment upon signing of the contract', percent: '50' },
  { label: 'Payable upon submission of shipping documents', percent: '30' },
  { label: 'Payable upon arrival of the material at site', percent: '10' },
  { label: 'Payable upon completion of installation and handover', percent: '10' },
];

const numText = (value: number | null): string =>
  value === null ? '' : String(value);

/** '' means "not stated" — omit the key so a PATCH never blanks a term
 *  somebody else set. */
const optionalNumber = (value: string): number | undefined =>
  value.trim() === '' ? undefined : Number(value);

export default function EditQuotationPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [lines, setLines] = useState<QuotationLine[]>([]);
  /** A negotiated price is split across the lifts that existed when it was
   *  applied, so editing one leaves the price box showing an old answer. */
  const [linesDirty, setLinesDirty] = useState(false);
  const [terms, setTerms] = useState<TermRow[]>([]);
  const [referenceCode, setReferenceCode] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('');
  const [warrantyPartsMonths, setWarrantyPartsMonths] = useState('');
  const [warrantyFreeServiceMonths, setWarrantyFreeServiceMonths] = useState('');
  const [validityDays, setValidityDays] = useState('');
  const [step, setStep] = useState('lifts');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void (async () => {
      try {
        // Independent reads — the page is not usable until all three land,
        // so waiting for them one after another just makes it slower.
        const [quote, quoteLines, paymentTerms] = await Promise.all([
          getQuotation(id),
          listQuotationLines(id),
          listQuotationPaymentTerms(id),
        ]);
        setQuotation(quote);
        setLines(quoteLines);
        setTerms(
          paymentTerms.length > 0
            ? paymentTerms.map((t) => ({ label: t.label, percent: t.percent }))
            : STANDARD_TERMS.map((t) => ({ ...t })),
        );
        setReferenceCode(quote.referenceCode ?? '');
        setDeliveryDays(numText(quote.deliveryDays));
        setWarrantyPartsMonths(numText(quote.warrantyPartsMonths));
        setWarrantyFreeServiceMonths(numText(quote.warrantyFreeServiceMonths));
        setValidityDays(numText(quote.validityDays));
      } catch (err) {
        setLoadError(
          err instanceof ApiError
            ? err.message
            : 'That quotation could not be loaded. It may have been deleted.',
        );
      }
    })();
  }, [router, id]);

  const editable = quotation?.status === 'DRAFT' && canWrite(getCurrentRole());

  const filledTerms = terms.filter((t) => t.label.trim() !== '');
  const termsTotal = sumEtb(
    filledTerms.map((t) => (t.percent.trim() === '' ? '0' : t.percent)),
  );
  const termsBalanced =
    filledTerms.length === 0 || isZeroEtb(subtractEtb(termsTotal, '100'));

  // Each step's summary is what it currently holds, so the four of them read
  // together as a status line for the whole offer without opening anything.
  const unitCount = lines.reduce((sum, line) => sum + (line.quantity ?? 1), 0);
  const statedTerms = [
    referenceCode.trim(),
    deliveryDays.trim(),
    validityDays.trim(),
    warrantyPartsMonths.trim(),
    warrantyFreeServiceMonths.trim(),
  ].filter((value) => value !== '').length;

  const steps: Step[] = [
    {
      id: 'lifts',
      label: 'Lifts',
      summary:
        lines.length === 0
          ? 'Nothing on the offer yet'
          : `${formatNumber(lines.length)} lift${lines.length === 1 ? '' : 's'}, ${formatNumber(unitCount)} unit${unitCount === 1 ? '' : 's'}`,
      done: lines.length > 0,
    },
    {
      id: 'price',
      label: 'Price',
      summary: quotation ? `${formatEtb(quotation.totalPriceEtb)} incl. VAT` : null,
      // Done means someone AGREED a figure, not that the calculator ran.
      done: Boolean(quotation?.calculatedTotalEtb),
    },
    {
      id: 'terms',
      label: 'Terms',
      summary: statedTerms === 0 ? 'None stated' : `${statedTerms} of 5 stated`,
      done: statedTerms > 0,
    },
    {
      id: 'payment',
      label: 'Payment',
      summary:
        filledTerms.length === 0
          ? 'No schedule'
          : `${filledTerms.length} milestone${filledTerms.length === 1 ? '' : 's'}, ${termsTotal}%`,
      done: filledTerms.length > 0 && termsBalanced,
      invalid: !termsBalanced,
    },
  ];

  const setTerm = (index: number, field: keyof TermRow, value: string) =>
    setTerms((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: UpdateQuotationTermsPayload = {
        deliveryDays: optionalNumber(deliveryDays),
        warrantyPartsMonths: optionalNumber(warrantyPartsMonths),
        warrantyFreeServiceMonths: optionalNumber(warrantyFreeServiceMonths),
        validityDays: optionalNumber(validityDays),
        paymentTerms: filledTerms.map(
          (t): PaymentTermInput => ({
            label: t.label.trim(),
            percent: t.percent.trim() === '' ? '0' : t.percent.trim(),
          }),
        ),
      };
      if (referenceCode.trim() !== '') {
        payload.referenceCode = referenceCode.trim();
      }
      await updateQuotationTerms(id, payload);
      router.push('/quotations');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the terms');
    } finally {
      setSubmitting(false);
    }
  };

  if (!quotation) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-8">
          <p className={loadError ? 'text-sm text-red-700' : 'text-sm text-slate-500'}>
            {loadError ?? 'Loading…'}
          </p>
        </main>
      </div>
    );
  }

  return (
    <FormPage
      eyebrow="Sales"
      title={`Quotation ${quotation.quoteNumber}`}
      description={
        editable
          ? 'Add the lifts, agree the price, state the terms. Lifts and the price save as you go; this form saves the terms.'
          : 'This quotation has left DRAFT — it is shown here as it was offered and can no longer be changed.'
      }
      backHref="/quotations"
      backLabel="Quotations"
      error={error}
      submitting={submitting}
      submitDisabled={!editable || !termsBalanced}
      submitLabel="Save terms"
      onSubmit={(event) => void onSubmit(event)}
    >
      <Stepper steps={steps} currentId={step} onStepChange={setStep}>
        {step === 'lifts' ? (
        <LinesEditor
          quotationId={id}
          lines={lines}
          onLinesChange={(next) => {
            setLines(next);
            setLinesDirty(true);
          }}
          editable={editable}
        />
      ) : null}

      {step === 'price' ? (
        <PriceBox
          quotationId={id}
          quotation={quotation}
          lines={lines}
          onQuotationChange={(next) => {
            setQuotation(next);
            setLinesDirty(false);
          }}
          editable={editable}
          staleAgainstLines={linesDirty}
        />
      ) : null}

      {step === 'terms' ? (
        <FormSection
          title="Commercial terms"
          description="Printed as prose on page 1. Leave anything you do not want stated blank."
        >
          <Field
            label="Reference"
            htmlFor="referenceCode"
            wide
            hint="Your own offer reference, e.g. Rodas FUJIHD-E02."
          >
            <input
              id="referenceCode"
              className={fieldClass}
              disabled={!editable}
              value={referenceCode}
              onChange={(e) => setReferenceCode(e.target.value)}
            />
          </Field>
          <Field label="Delivery (days)" htmlFor="deliveryDays">
            <NumberInput
              id="deliveryDays"
              disabled={!editable}
              placeholder="120"
              value={deliveryDays}
              onValueChange={setDeliveryDays}
            />
          </Field>
          <Field label="Offer valid for (days)" htmlFor="validityDays">
            <NumberInput
              id="validityDays"
              disabled={!editable}
              placeholder="5"
              value={validityDays}
              onValueChange={setValidityDays}
            />
          </Field>
          <Field label="Parts warranty (months)" htmlFor="warrantyPartsMonths">
            <NumberInput
              id="warrantyPartsMonths"
              disabled={!editable}
              placeholder="12"
              value={warrantyPartsMonths}
              onValueChange={setWarrantyPartsMonths}
            />
          </Field>
          <Field label="Free service (months)" htmlFor="warrantyFreeServiceMonths">
            <NumberInput
              id="warrantyFreeServiceMonths"
              disabled={!editable}
              placeholder="12"
              value={warrantyFreeServiceMonths}
              onValueChange={setWarrantyFreeServiceMonths}
            />
          </Field>
        </FormSection>
      ) : null}

      {step === 'payment' ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className={labelClass}>Payment terms</h2>
            {editable ? (
              <button
                type="button"
                onClick={() => setTerms((prev) => [...prev, { label: '', percent: '' }])}
                className="text-xs font-semibold text-navy-800 hover:underline"
              >
                + Add milestone
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            A percentage against an event, not a dated instalment. Saved with this
            form.
          </p>

          <div className="mt-4 space-y-2">
            {terms.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="w-4 shrink-0 font-mono text-xs text-slate-400">
                  {index + 1}
                </span>
                <input
                  className={fieldClass}
                  placeholder="Payable upon submission of shipping documents"
                  aria-label={`Milestone ${index + 1}`}
                  disabled={!editable}
                  value={row.label}
                  onChange={(e) => setTerm(index, 'label', e.target.value)}
                />
                <span className="w-24 shrink-0">
                  <NumberInput
                    ariaLabel={`Milestone ${index + 1} percent`}
                    disabled={!editable}
                    placeholder="%"
                    value={row.percent}
                    onValueChange={(v) => setTerm(index, 'percent', v)}
                  />
                </span>
                {editable ? (
                  <button
                    type="button"
                    onClick={() => setTerms((prev) => prev.filter((_, i) => i !== index))}
                    className={`${btnGhost} shrink-0 px-2 text-xs`}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}

            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Scheduled:{' '}
              <span className="font-semibold tabular-nums text-navy-800">
                {termsTotal}%
              </span>
              {termsBalanced ? null : (
                <>
                  <br />
                  <span className="text-xs text-red-700">
                    A payment schedule must add up to exactly 100% before it can be
                    saved.
                  </span>
                </>
              )}
            </p>
          </div>
        </section>
        ) : null}
      </Stepper>
    </FormPage>
  );
}
