'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import {
  ApiError,
  createProductType,
  updateProductType,
  type ProductTypeRow,
} from '@/lib/api';

const MONEY = '\\d{1,12}(\\.\\d{1,2})?';

/** One form for add and edit: `existing` decides which call saves it. */
export function ProductTypeForm({ existing }: { existing?: ProductTypeRow }) {
  const router = useRouter();
  const [name, setName] = useState(existing?.name ?? '');
  const [basePriceEtb, setBasePriceEtb] = useState(existing?.basePriceEtb ?? '');
  const [perStopEtb, setPerStopEtb] = useState(existing?.perStopEtb ?? '80000.00');
  const [perKgEtb, setPerKgEtb] = useState(existing?.perKgEtb ?? '1000.00');
  const [liftGeometry, setLiftGeometry] = useState(existing?.liftGeometry ?? true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const payload = {
      name: name.trim(),
      basePriceEtb: basePriceEtb.trim(),
      perStopEtb: perStopEtb.trim() || '0',
      perKgEtb: perKgEtb.trim() || '0',
      liftGeometry,
    };
    try {
      if (existing) {
        await updateProductType(existing.id, payload);
      } else {
        await createProductType(payload);
      }
      router.push('/settings/product-types');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the product');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormPage
      eyebrow="Settings"
      title={existing ? `Edit ${existing.name}` : 'Add product'}
      description="Prices are in ETB before margin and VAT. Quotations already issued keep the price they were given."
      backHref="/settings/product-types"
      backLabel="Products & prices"
      error={error}
      submitting={submitting}
      submitLabel={existing ? 'Save changes' : 'Add product'}
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection title="Product">
        <Field
          label="Name"
          htmlFor="name"
          hint={existing ? `Code ${existing.code} stays as it is.` : 'The code is derived from the name and then fixed.'}
          wide
        >
          <input
            id="name"
            className={fieldClass}
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Lift geometry" htmlFor="liftGeometry" wide>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              id="liftGeometry"
              type="checkbox"
              checked={liftGeometry}
              onChange={(e) => setLiftGeometry(e.target.checked)}
            />
            Compute the car, shaft and pit dimensions (off for escalators)
          </label>
        </Field>
      </FormSection>

      <FormSection title="Pricing" description="Base price, then what a bigger machine adds. Set both rates to 0 for a flat price.">
        <Field label="Base price (ETB)" htmlFor="basePriceEtb">
          <input
            id="basePriceEtb"
            inputMode="decimal"
            pattern={MONEY}
            required
            placeholder="7000000.00"
            className={fieldClass}
            value={basePriceEtb}
            onChange={(e) => setBasePriceEtb(e.target.value)}
          />
        </Field>
        <Field label="Per stop above 10 (ETB)" htmlFor="perStopEtb">
          <input
            id="perStopEtb"
            inputMode="decimal"
            pattern={MONEY}
            className={fieldClass}
            value={perStopEtb}
            onChange={(e) => setPerStopEtb(e.target.value)}
          />
        </Field>
        <Field label="Per kg above 630 (ETB)" htmlFor="perKgEtb">
          <input
            id="perKgEtb"
            inputMode="decimal"
            pattern={MONEY}
            className={fieldClass}
            value={perKgEtb}
            onChange={(e) => setPerKgEtb(e.target.value)}
          />
        </Field>
      </FormSection>
    </FormPage>
  );
}
