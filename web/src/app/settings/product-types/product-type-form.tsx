"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Field, FormPage, FormSection } from "@/components/form-page";
import { fieldClass } from "@/components/form-styles";
import {
  ApiError,
  createProductType,
  updateProductType,
  type ProductTypeRow,
} from "@/lib/api";

const MONEY = "\\d{1,12}(\\.\\d{1,2})?";

/** One form for add and edit: `existing` decides which call saves it. */
export function ProductTypeForm({ existing }: { existing?: ProductTypeRow }) {
  const router = useRouter();
  const [name, setName] = useState(existing?.name ?? "");
  const [basePriceEtb, setBasePriceEtb] = useState(
    existing?.basePriceEtb ?? "",
  );
  const [perStopEtb, setPerStopEtb] = useState(
    existing?.perStopEtb ?? "80000.00",
  );
  const [perKgEtb, setPerKgEtb] = useState(existing?.perKgEtb ?? "1000.00");
  const [refStops, setRefStops] = useState(String(existing?.refStops ?? 10));
  const [refCapacityKg, setRefCapacityKg] = useState(
    String(existing?.refCapacityKg ?? 630),
  );
  const [formula, setFormula] = useState(existing?.formula ?? "");
  const [liftGeometry, setLiftGeometry] = useState(
    existing?.liftGeometry ?? true,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const payload = {
      name: name.trim(),
      basePriceEtb: basePriceEtb.trim(),
      perStopEtb: perStopEtb.trim() || "0",
      perKgEtb: perKgEtb.trim() || "0",
      refStops: Number(refStops) || 10,
      refCapacityKg: Number(refCapacityKg) || 630,
      // Blank means the company formula under Settings.
      formula: formula.trim() || null,
      liftGeometry,
    };
    try {
      if (existing) {
        await updateProductType(existing.id, payload);
      } else {
        await createProductType(payload);
      }
      router.push("/settings/product-types");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to save the product",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormPage
      eyebrow="Settings"
      title={existing ? `Edit ${existing.name}` : "Add product"}
      description="Prices are in ETB before margin and VAT. Quotations already issued keep the price they were given."
      backHref="/settings/product-types"
      backLabel="Products & prices"
      error={error}
      submitting={submitting}
      submitLabel={existing ? "Save changes" : "Add product"}
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection title="Product">
        <Field
          label="Name"
          htmlFor="name"
          hint={
            existing
              ? `Code ${existing.code} stays as it is.`
              : "The code is derived from the name and then fixed."
          }
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

      <FormSection
        title="Pricing"
        description="The base price buys the base machine (its stops and capacity); each stop and kilogram above that adds the rate. Set both rates to 0 for a flat price."
      >
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
        <Field
          label="Base stops (N)"
          htmlFor="refStops"
          hint="For a car stacking lift, the parking levels."
        >
          <input
            id="refStops"
            type="number"
            min={1}
            max={64}
            required
            className={fieldClass}
            value={refStops}
            onChange={(e) => setRefStops(e.target.value)}
          />
        </Field>
        <Field label="Base capacity (kg)" htmlFor="refCapacityKg">
          <input
            id="refCapacityKg"
            type="number"
            min={1}
            max={50000}
            required
            className={fieldClass}
            value={refCapacityKg}
            onChange={(e) => setRefCapacityKg(e.target.value)}
          />
        </Field>
        <Field label="Per stop above base (ETB)" htmlFor="perStopEtb">
          <input
            id="perStopEtb"
            inputMode="decimal"
            pattern={MONEY}
            className={fieldClass}
            value={perStopEtb}
            onChange={(e) => setPerStopEtb(e.target.value)}
          />
        </Field>
        <Field label="Per kg above base (ETB)" htmlFor="perKgEtb">
          <input
            id="perKgEtb"
            inputMode="decimal"
            pattern={MONEY}
            className={fieldClass}
            value={perKgEtb}
            onChange={(e) => setPerKgEtb(e.target.value)}
          />
        </Field>
        <Field
          label="Own formula"
          htmlFor="formula"
          wide
          hint="Leave blank to use the company formula under Settings. Names: Base price, N (stops), C (kg), rise (m), refN, refC, perStop, perKg. An escalator: Base price + (rise - 6) * 500,000."
        >
          <input
            id="formula"
            className={`${fieldClass} font-mono`}
            spellCheck={false}
            maxLength={500}
            placeholder="Company formula"
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
          />
        </Field>
      </FormSection>
    </FormPage>
  );
}
