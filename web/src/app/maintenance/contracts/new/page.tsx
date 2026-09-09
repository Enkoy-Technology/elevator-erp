'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import {
  ApiError,
  createMaintenanceContract,
  getAccessToken,
  listTechnicians,
  listAssets,
  MAINTENANCE_RECURRENCES,
  optional,
  type Asset,
  type MaintenanceRecurrence,
  type Technician,
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
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [assignedUserId, setAssignedUserId] = useState('');
  const [monthlyFeeEtb, setMonthlyFeeEtb] = useState('');
  const [feeIncludesVat, setFeeIncludesVat] = useState(true);
  const [termMonths, setTermMonths] = useState('12');
  const [autoRenews, setAutoRenews] = useState(true);
  const [noticeDays, setNoticeDays] = useState('30');
  const [cureDays, setCureDays] = useState('7');
  const [scopeOfWork, setScopeOfWork] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void listTechnicians().then(setTechnicians).catch(() => setTechnicians([]));
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
        assignedUserId: assignedUserId || undefined,
        monthlyFeeEtb: monthlyFeeEtb.trim() || undefined,
        feeIncludesVat,
        termMonths: Number(termMonths),
        autoRenews,
        noticeDays: Number(noticeDays),
        cureDays: Number(cureDays),
        scopeOfWork: scopeOfWork.trim() || undefined,
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
        <Field
          label="Assigned technician"
          htmlFor="assignedUserId"
          hint="Gets the service-due SMS and an in-app reminder automatically, from the reminder window until the visit is logged."
        >
          <select
            id="assignedUserId"
            className={fieldClass}
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
          >
            <option value="">Not assigned</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
                {t.phone ? '' : ' (no phone on file)'}
              </option>
            ))}
          </select>
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

      <FormSection
        title="Agreement terms"
        description="Printed on the Maintenance & Service Agreement. The defaults are the company's standard terms."
      >
        <Field label="Monthly fee (ETB)" htmlFor="monthlyFeeEtb">
          <input
            id="monthlyFeeEtb"
            inputMode="decimal"
            pattern="\d{1,12}(\.\d{1,2})?"
            placeholder="6900.00"
            className={fieldClass}
            value={monthlyFeeEtb}
            onChange={(e) => setMonthlyFeeEtb(e.target.value)}
          />
        </Field>
        <Field label="VAT" htmlFor="feeIncludesVat">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              id="feeIncludesVat"
              type="checkbox"
              checked={feeIncludesVat}
              onChange={(e) => setFeeIncludesVat(e.target.checked)}
            />
            Fee includes VAT
          </label>
        </Field>
        <Field label="Initial term (months)" htmlFor="termMonths">
          <input
            id="termMonths"
            type="number"
            inputMode="numeric"
            min={1}
            max={120}
            step={1}
            required
            className={fieldClass}
            value={termMonths}
            onChange={(e) => setTermMonths(e.target.value)}
          />
        </Field>
        <Field label="Renewal" htmlFor="autoRenews">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              id="autoRenews"
              type="checkbox"
              checked={autoRenews}
              onChange={(e) => setAutoRenews(e.target.checked)}
            />
            Renews automatically unless notice is given
          </label>
        </Field>
        <Field label="Notice period (days)" htmlFor="noticeDays" hint="Written notice before the term ends.">
          <input
            id="noticeDays"
            type="number"
            inputMode="numeric"
            min={0}
            max={365}
            step={1}
            required
            className={fieldClass}
            value={noticeDays}
            onChange={(e) => setNoticeDays(e.target.value)}
          />
        </Field>
        <Field label="Cure period (days)" htmlFor="cureDays" hint="To remedy a material breach before termination.">
          <input
            id="cureDays"
            type="number"
            inputMode="numeric"
            min={0}
            max={365}
            step={1}
            required
            className={fieldClass}
            value={cureDays}
            onChange={(e) => setCureDays(e.target.value)}
          />
        </Field>
        <Field
          label="Scope of work"
          htmlFor="scopeOfWork"
          hint="Leave blank to print the standard scope: periodic inspection and lubrication, adjustments, safety device testing, 24/7 trouble calls."
          wide
        >
          <textarea
            id="scopeOfWork"
            className={fieldClass}
            rows={4}
            value={scopeOfWork}
            onChange={(e) => setScopeOfWork(e.target.value)}
          />
        </Field>
      </FormSection>
    </FormPage>
  );
}
