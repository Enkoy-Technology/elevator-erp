'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  getAccessToken,
  getContract,
  updateContract,
  type ContractStatus,
} from '@/lib/api';

/**
 * The negotiable terms of a contract — scope, conditions, warranty period.
 * Everything else on the record (value, customer, project) came from the
 * proforma and is not editable here by design.
 *
 * DRAFT only: the API rejects a PATCH once the customer has signed, so the
 * form goes read-only rather than letting someone type into fields whose
 * save is guaranteed to 409.
 */
export default function EditContractPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [contractNumber, setContractNumber] = useState('');
  const [status, setStatus] = useState<ContractStatus>('DRAFT');
  const [scopeOfWork, setScopeOfWork] = useState('');
  const [termsAndConditions, setTermsAndConditions] = useState('');
  const [warrantyMonths, setWarrantyMonths] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void (async () => {
      try {
        const contract = await getContract(id);
        setContractNumber(contract.contractNumber);
        setStatus(contract.status);
        setScopeOfWork(contract.scopeOfWork ?? '');
        setTermsAndConditions(contract.termsAndConditions ?? '');
        setWarrantyMonths(
          contract.warrantyMonths === null ? '' : String(contract.warrantyMonths),
        );
        setLoaded(true);
      } catch (err) {
        setLoadError(
          err instanceof ApiError
            ? err.message
            : 'That contract could not be loaded. It may have been deleted.',
        );
      }
    })();
  }, [router, id]);

  const editable = status === 'DRAFT';

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await updateContract(id, {
        scopeOfWork: scopeOfWork.trim() || null,
        termsAndConditions: termsAndConditions.trim() || null,
        warrantyMonths: warrantyMonths.trim() ? Number(warrantyMonths) : null,
      });
      router.push('/contracts');
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
              <a href="/contracts" className="font-semibold underline underline-offset-2">
                Back to contracts
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
      eyebrow="Sales"
      title={`Edit contract ${contractNumber}`}
      description="Scope, conditions and warranty period. The contract value comes from the proforma and cannot be changed here."
      backHref="/contracts"
      backLabel="Contracts"
      error={error}
      submitting={submitting}
      submitDisabled={!editable}
      submitLabel="Save changes"
      onSubmit={(event) => void onSubmit(event)}
    >
      {!editable ? (
        <p
          role="alert"
          className="max-w-2xl rounded-xl border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          This contract is {status.toLowerCase()}, so its terms are fixed. Only a
          draft contract can be edited — what the customer signed is what stands.
        </p>
      ) : null}

      <FormSection
        title="Terms"
        description="What the company has undertaken to deliver, and on what conditions."
      >
        <Field label="Scope of work" htmlFor="scopeOfWork" wide>
          <textarea
            id="scopeOfWork"
            className={fieldClass}
            rows={6}
            disabled={!editable}
            value={scopeOfWork}
            onChange={(e) => setScopeOfWork(e.target.value)}
          />
        </Field>

        <Field label="Terms and conditions" htmlFor="termsAndConditions" wide>
          <textarea
            id="termsAndConditions"
            className={fieldClass}
            rows={8}
            disabled={!editable}
            value={termsAndConditions}
            onChange={(e) => setTermsAndConditions(e.target.value)}
          />
        </Field>

        <Field
          label="Warranty (months)"
          htmlFor="warrantyMonths"
          hint="Leave blank for no warranty period. The warranty certificate is dated from the handover."
        >
          <input
            id="warrantyMonths"
            type="number"
            inputMode="numeric"
            min={0}
            max={240}
            step={1}
            className={fieldClass}
            disabled={!editable}
            value={warrantyMonths}
            onChange={(e) => setWarrantyMonths(e.target.value)}
          />
        </Field>
      </FormSection>
    </FormPage>
  );
}
