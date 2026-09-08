'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  getAccessToken,
  getMaintenanceContract,
  MAINTENANCE_RECURRENCES,
  updateMaintenanceContract,
  type MaintenanceRecurrence,
} from '@/lib/api';

/**
 * The schedule and the agreement terms of a maintenance contract. The asset
 * and customer are fixed at creation — a contract on the wrong lift is a
 * new contract, not an edit. Ending a contract stays on the list page.
 */
export default function EditMaintenanceContractPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState<MaintenanceRecurrence>('MONTHLY');
  const [nextServiceAt, setNextServiceAt] = useState('');
  const [notes, setNotes] = useState('');
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
    void (async () => {
      try {
        const contract = await getMaintenanceContract(id);
        setRecurrence(contract.recurrence);
        setNextServiceAt(contract.nextServiceAt);
        setNotes(contract.notes ?? '');
        setMonthlyFeeEtb(contract.monthlyFeeEtb ?? '');
        setFeeIncludesVat(contract.feeIncludesVat);
        setTermMonths(String(contract.termMonths));
        setAutoRenews(contract.autoRenews);
        setNoticeDays(String(contract.noticeDays));
        setCureDays(String(contract.cureDays));
        setScopeOfWork(contract.scopeOfWork ?? '');
        setLoaded(true);
      } catch (err) {
        setLoadError(
          err instanceof ApiError
            ? err.message
            : 'That contract could not be loaded. It may have been ended.',
        );
      }
    })();
  }, [router, id]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await updateMaintenanceContract(id, {
        recurrence,
        nextServiceAt,
        notes: notes.trim() || null,
        monthlyFeeEtb: monthlyFeeEtb.trim() || null,
        feeIncludesVat,
        termMonths: Number(termMonths),
        autoRenews,
        noticeDays: Number(noticeDays),
        cureDays: Number(cureDays),
        scopeOfWork: scopeOfWork.trim() || null,
      });
      router.push('/maintenance');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the contract');
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
              <a href="/maintenance" className="font-semibold underline underline-offset-2">
                Back to maintenance
              </a>
            </p>
          ) : (
            <p className="text-sm text-slate-500">Loading contract…</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <FormPage
      eyebrow="Operations"
      title="Edit maintenance contract"
      description="The service schedule and the terms printed on the Maintenance & Service Agreement."
      backHref="/maintenance"
      backLabel="Maintenance"
      error={error}
      submitting={submitting}
      submitLabel="Save changes"
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection title="Schedule">
        <Field label="Recurrence" htmlFor="recurrence">
          <select
            id="recurrence"
            className={fieldClass}
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value as MaintenanceRecurrence)}
          >
            {MAINTENANCE_RECURRENCES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Next service" htmlFor="nextServiceAt">
          <input
            id="nextServiceAt"
            type="date"
            className={fieldClass}
            required
            value={nextServiceAt}
            onChange={(e) => setNextServiceAt(e.target.value)}
          />
        </Field>
        <Field label="Internal notes" htmlFor="notes" hint="Not printed on the agreement." wide>
          <textarea
            id="notes"
            className={fieldClass}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Agreement terms"
        description="Printed on the Maintenance & Service Agreement. Only management can change these."
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
