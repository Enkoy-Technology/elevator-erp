'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  apiFetch,
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  getAccessToken,
  updateAsset,
  type Asset,
  type AssetCategory,
  type AssetStatus,
} from '@/lib/api';
import { ASSET_CATEGORY_LABEL, ASSET_STATUS_LABEL } from '../../labels';

export default function EditAssetPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState<AssetCategory>('ELEVATOR');
  const [name, setName] = useState('');
  const [buildingName, setBuildingName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [locationNotes, setLocationNotes] = useState('');
  const [status, setStatus] = useState<AssetStatus>('ACTIVE');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void (async () => {
      try {
        const asset = await apiFetch<Asset>(`/assets/${id}`);
        setCategory(asset.category);
        setName(asset.name);
        setBuildingName(asset.buildingName ?? '');
        setSerialNumber(asset.serialNumber ?? '');
        setLocationNotes(asset.locationNotes ?? '');
        setStatus(asset.status);
        setNotes(asset.notes ?? '');
        setLoaded(true);
      } catch (err) {
        setLoadError(
          err instanceof ApiError
            ? err.message
            : 'That asset could not be loaded. It may have been deleted.',
        );
      }
    })();
  }, [router, id]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await updateAsset(id, {
        category,
        name,
        buildingName: buildingName || null,
        serialNumber: serialNumber || null,
        locationNotes: locationNotes || null,
        status,
        notes: notes || null,
      });
      router.push('/assets');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save asset');
    } finally {
      setSubmitting(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1 p-6 sm:p-8">
          {loadError ? (
            <p
              role="alert"
              className="max-w-2xl rounded-xl border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {loadError}{' '}
              <a href="/assets" className="font-semibold underline underline-offset-2">
                Back to assets
              </a>
            </p>
          ) : (
            <p className="text-sm text-slate-500">Loading asset…</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <FormPage
      eyebrow="Operations"
      title="Edit asset"
      description="Link equipment to a customer. Categories: elevator, stairs, or other."
      backHref="/assets"
      backLabel="Assets"
      error={error}
      submitting={submitting}
      submitLabel="Save changes"
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection title="Equipment">
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

        <Field label="Status" htmlFor="status">
          <select
            id="status"
            className={fieldClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as AssetStatus)}
          >
            {ASSET_STATUSES.map((value) => (
              <option key={value} value={value}>
                {ASSET_STATUS_LABEL[value]}
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
