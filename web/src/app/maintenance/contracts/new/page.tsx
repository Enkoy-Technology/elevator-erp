'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import {
  ApiError,
  createMaintenanceContract,
  getAccessToken,
  listAssets,
  MAINTENANCE_RECURRENCES,
  optional,
  type Asset,
  type MaintenanceRecurrence,
} from '@/lib/api';

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** Mirrors the API's advanceServiceDate: clamp instead of overflowing a short
 *  month (Jan 31 + 1 month must be Feb 28, not Mar 3). */
const addMonthsIso = (iso: string, months: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, 1));
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(d, lastDay));
  return date.toISOString().slice(0, 10);
};

export default function NewMaintenanceContractPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState('');
  const [recurrence, setRecurrence] =
    useState<MaintenanceRecurrence>('MONTHLY');
  const [startDate, setStartDate] = useState(todayIso());
  const [nextServiceAt, setNextServiceAt] = useState(
    addMonthsIso(todayIso(), 1),
  );
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void optional(listAssets({ page: 1, pageSize: 100 })).then((result) => {
      setAssets(result.items);
      setAssetId((prev) => prev || result.items[0]?.id || '');
    });
  }, [router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!assetId) {
      setError('Register an asset first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createMaintenanceContract({
        assetId,
        recurrence,
        startDate,
        nextServiceAt,
        notes: notes || undefined,
      });
      router.push('/maintenance');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to create contract',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormPage
      eyebrow="Operations"
      title="New maintenance contract"
      description="Link a service schedule to a registered asset."
      backHref="/maintenance"
      backLabel="Maintenance"
      error={error}
      submitting={submitting}
      submitLabel="Create contract"
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection title="Schedule">
        <Field label="Asset" htmlFor="assetId" wide>
          <select
            id="assetId"
            className={fieldClass}
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
          >
            {assets.length === 0 ? (
              <option value="">No assets</option>
            ) : (
              assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.category})
                </option>
              ))
            )}
          </select>
        </Field>
        <Field label="Recurrence" htmlFor="recurrence">
          <select
            id="recurrence"
            className={fieldClass}
            value={recurrence}
            onChange={(e) =>
              setRecurrence(e.target.value as MaintenanceRecurrence)
            }
          >
            {MAINTENANCE_RECURRENCES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start date" htmlFor="startDate">
          <input
            id="startDate"
            type="date"
            className={fieldClass}
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field
          label="Next service"
          htmlFor="nextServiceAt"
          hint="Logging a visit rolls this forward by the recurrence."
        >
          <input
            id="nextServiceAt"
            type="date"
            className={fieldClass}
            required
            value={nextServiceAt}
            onChange={(e) => setNextServiceAt(e.target.value)}
          />
        </Field>
        <Field label="Notes" htmlFor="contractNotes" wide>
          <textarea
            id="contractNotes"
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
