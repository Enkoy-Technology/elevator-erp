'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import {
  ApiError,
  BREAKDOWN_SEVERITIES,
  createBreakdown,
  getAccessToken,
  listAssets,
  listEmployees,
  optional,
  type Asset,
  type BreakdownSeverity,
  type Employee,
} from '@/lib/api';

export default function NewBreakdownPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assetId, setAssetId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<BreakdownSeverity>('MEDIUM');
  const [assignee, setAssignee] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void Promise.all([
      optional(listAssets({ page: 1, pageSize: 100 })),
      optional(listEmployees({ page: 1, pageSize: 100 })),
    ]).then(([assetPage, employeePage]) => {
      setAssets(assetPage.items);
      setEmployees(employeePage.items);
      setAssetId((prev) => prev || assetPage.items[0]?.id || '');
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
      await createBreakdown({
        assetId,
        title,
        description: description || undefined,
        severity,
        assignedUserId: assignee || undefined,
      });
      router.push('/maintenance#breakdowns');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to open breakdown',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormPage
      eyebrow="Operations"
      title="Open breakdown"
      description="Track a fault from open → assigned → done."
      backHref="/maintenance#breakdowns"
      backLabel="Maintenance"
      error={error}
      submitting={submitting}
      submitLabel="Open ticket"
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection title="Fault">
        <Field label="Asset" htmlFor="bdAssetId" wide>
          <select
            id="bdAssetId"
            className={fieldClass}
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
          >
            {assets.length === 0 ? (
              <option value="">No assets</option>
            ) : (
              assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))
            )}
          </select>
        </Field>
        <Field label="Title" htmlFor="bdTitle" wide>
          <input
            id="bdTitle"
            className={fieldClass}
            required
            minLength={2}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field
          label="Severity"
          htmlFor="bdSeverity"
          hint="Severity sets the response clock."
        >
          <select
            id="bdSeverity"
            className={fieldClass}
            value={severity}
            onChange={(e) => setSeverity(e.target.value as BreakdownSeverity)}
          >
            {BREAKDOWN_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Assign to (optional)" htmlFor="bdAssignee">
          <select
            id="bdAssignee"
            className={fieldClass}
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">Unassigned</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description" htmlFor="bdDescription" wide>
          <textarea
            id="bdDescription"
            className={fieldClass}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </FormSection>
    </FormPage>
  );
}
