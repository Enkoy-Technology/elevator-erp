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
  listCustomers,
  optional,
  type AssetCategory,
  type Customer,
} from '@/lib/api';
import { ASSET_CATEGORY_LABEL } from '../labels';

export default function NewAssetPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [category, setCategory] = useState<AssetCategory>('ELEVATOR');
  const [name, setName] = useState('');
  const [buildingName, setBuildingName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [locationNotes, setLocationNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void optional(listCustomers({ page: 1, pageSize: 100 })).then((result) => {
      setCustomers(result.items);
      setCustomerId((prev) => prev || result.items[0]?.id || '');
    });
  }, [router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!customerId) {
      setError('Create a customer first, then register an asset.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createAsset({
        customerId,
        category,
        name,
        buildingName: buildingName || undefined,
        serialNumber: serialNumber || undefined,
        locationNotes: locationNotes || undefined,
        notes: notes || undefined,
      });
      router.push('/assets');
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
      description="Link equipment to a customer. Categories: elevator, stairs, or other."
      backHref="/assets"
      backLabel="Assets"
      error={error}
      submitting={submitting}
      submitLabel="Register"
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection title="Equipment">
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

        <Field label="Serial number" htmlFor="serialNumber">
          <input
            id="serialNumber"
            className={fieldClass}
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="Location">
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
