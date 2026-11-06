'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import {
  ApiError,
  ASSET_CATEGORIES,
  createAsset,
  getAccessToken,
  getCurrentRole,
  listCustomers,
  optional,
  type AssetCategory,
  type CreateAssetPayload,
  type Customer,
} from '@/lib/api';
import { ASSET_CATEGORY_LABEL } from '../labels';

export default function NewAssetPage() {
  const router = useRouter();
  const [startingPoint, setStartingPoint] =
    useState<CreateAssetPayload['startingPoint']>('FROM_FACTORY');
  const [usePackingList, setUsePackingList] = useState(true);
  /** Store Keeper cannot read customers, so cannot register an installed lift. */
  const [canChooseStart, setCanChooseStart] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [category, setCategory] = useState<AssetCategory>('ELEVATOR');
  const [name, setName] = useState('');
  const [buildingName, setBuildingName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [specSummary, setSpecSummary] = useState('');
  const [locationNotes, setLocationNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setCanChooseStart(getCurrentRole() !== 'STORE_KEEPER');
    void optional(listCustomers({ page: 1, pageSize: 100 })).then((result) => {
      setCustomers(result.items);
      setCustomerId((prev) => prev || result.items[0]?.id || '');
    });
  }, [router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const fromFactory = startingPoint === 'FROM_FACTORY';
    if (!fromFactory && !customerId) {
      setError('Create a customer first, then register an installed lift.');
      return;
    }
    const hasChecklist =
      fromFactory && category === 'ELEVATOR' && usePackingList;
    setSubmitting(true);
    setError(null);
    try {
      const asset = await createAsset({
        startingPoint,
        usePackingList: fromFactory ? hasChecklist : undefined,
        customerId: fromFactory ? undefined : customerId,
        category,
        name,
        buildingName: buildingName || undefined,
        serialNumber: serialNumber || undefined,
        specSummary: specSummary || undefined,
        locationNotes: locationNotes || undefined,
        notes: notes || undefined,
      });
      router.push(hasChecklist ? `/assets/${asset.id}/checklist` : '/assets');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save asset');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormPage
      eyebrow="Operations"
      title="Register asset"
      description="Register a lift arriving from the factory, or one already installed."
      backHref="/assets"
      backLabel="Assets"
      error={error}
      submitting={submitting}
      submitLabel="Register"
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection title="Equipment">
        {canChooseStart ? (
          <Field label="Where is it now?" htmlFor="startingPoint">
            <select
              id="startingPoint"
              className={fieldClass}
              value={startingPoint}
              onChange={(e) =>
                setStartingPoint(
                  e.target.value as CreateAssetPayload['startingPoint'],
                )
              }
            >
              <option value="FROM_FACTORY">New from the factory</option>
              <option value="INSTALLED">Already installed</option>
            </select>
          </Field>
        ) : null}

        {startingPoint === 'INSTALLED' ? (
          <Field label="Customer" htmlFor="customerId" wide>
            <select
              id="customerId"
              className={fieldClass}
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              {customers.length === 0 ? (
                <option value="">No customers yet</option>
              ) : (
                customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </Field>
        ) : null}

        <Field label="Category" htmlFor="category">
          <select
            id="category"
            className={fieldClass}
            value={category}
            onChange={(e) => setCategory(e.target.value as AssetCategory)}
          >
            {ASSET_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {ASSET_CATEGORY_LABEL[value]}
              </option>
            ))}
          </select>
        </Field>

        {startingPoint === 'FROM_FACTORY' && category === 'ELEVATOR' ? (
          <Field
            label="Packing list"
            htmlFor="usePackingList"
            hint="Untick for a car lift, car platform or stacking lift."
          >
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                id="usePackingList"
                type="checkbox"
                className="h-4 w-4 accent-gold-500"
                checked={usePackingList}
                onChange={(e) => setUsePackingList(e.target.checked)}
              />
              Use the packing list
            </label>
          </Field>
        ) : null}

        <Field label="Name" htmlFor="name">
          <input
            id="name"
            className={fieldClass}
            required
            minLength={2}
            autoFocus
            placeholder="Lift A — Lobby"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="Factory or serial number" htmlFor="serialNumber">
          <input
            id="serialNumber"
            className={fieldClass}
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="Location">
        <Field
          label="Specification"
          htmlFor="specSummary"
          hint="One attribute per line. Printed on the maintenance agreement."
          wide
        >
          <textarea
            id="specSummary"
            className={fieldClass}
            rows={5}
            placeholder={'Brand: Sigma\nDrive: Gearless traction\nCapacity: 630 kg\nStops: 12 (2B+G+9)\nSpeed: 1.5 m/s'}
            value={specSummary}
            onChange={(e) => setSpecSummary(e.target.value)}
          />
        </Field>
        <Field label="Building" htmlFor="buildingName">
          <input
            id="buildingName"
            className={fieldClass}
            value={buildingName}
            onChange={(e) => setBuildingName(e.target.value)}
          />
        </Field>

        <Field label="Location notes" htmlFor="locationNotes">
          <input
            id="locationNotes"
            className={fieldClass}
            value={locationNotes}
            onChange={(e) => setLocationNotes(e.target.value)}
          />
        </Field>

        <Field label="Notes" htmlFor="notes" wide>
          <textarea
            id="notes"
            className={fieldClass}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </FormSection>
    </FormPage>
  );
}
