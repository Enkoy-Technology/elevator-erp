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
  const [deliveryWorkingDays, setDeliveryWorkingDays] = useState('');
  const [installationWorkingDays, setInstallationWorkingDays] = useState('');
  const [delayPenaltyPercentPerDay, setDelayPenaltyPercentPerDay] = useState('');
  const [delayPenaltyCapPercent, setDelayPenaltyCapPercent] = useState('');
  const [advanceGuaranteeRequired, setAdvanceGuaranteeRequired] = useState(false);
  const [freeMaintenanceMonths, setFreeMaintenanceMonths] = useState('');
  const [disputeForum, setDisputeForum] = useState('');
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
        setDeliveryWorkingDays(contract.deliveryWorkingDays?.toString() ?? '');
        setInstallationWorkingDays(contract.installationWorkingDays?.toString() ?? '');
        setDelayPenaltyPercentPerDay(contract.delayPenaltyPercentPerDay ?? '');
        setDelayPenaltyCapPercent(contract.delayPenaltyCapPercent ?? '');
        setAdvanceGuaranteeRequired(contract.advanceGuaranteeRequired);
        setFreeMaintenanceMonths(contract.freeMaintenanceMonths?.toString() ?? '');
        setDisputeForum(contract.disputeForum ?? '');
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
        deliveryWorkingDays: deliveryWorkingDays.trim() ? Number(deliveryWorkingDays) : null,
        installationWorkingDays: installationWorkingDays.trim()
          ? Number(installationWorkingDays)
          : null,
        delayPenaltyPercentPerDay: delayPenaltyPercentPerDay.trim() || null,
        delayPenaltyCapPercent: delayPenaltyCapPercent.trim() || null,
        advanceGuaranteeRequired,
        freeMaintenanceMonths: freeMaintenanceMonths.trim() ? Number(freeMaintenanceMonths) : null,
        disputeForum: disputeForum.trim() || null,
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
      description="The clauses of the printed agreement. The contract value, equipment and payment schedule come from the proforma and the payment schedule page."
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
        <Field
          label="Equipment notes"
          htmlFor="scopeOfWork"
          hint="Printed under the equipment table in Article 2: brand, rescue device, anything the proforma lines do not say."
          wide
        >
          <textarea
            id="scopeOfWork"
            className={fieldClass}
            rows={6}
            disabled={!editable}
            value={scopeOfWork}
            onChange={(e) => setScopeOfWork(e.target.value)}
          />
        </Field>

        <Field
          label="Additional terms"
          htmlFor="termsAndConditions"
          hint="Printed as Article 9. Leave blank to omit the article."
          wide
        >
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

        <Field
          label="Free maintenance (months)"
          htmlFor="freeMaintenanceMonths"
          hint="Article 6.2: monthly preventive service and repairs at no charge after handover."
        >
          <input
            id="freeMaintenanceMonths"
            type="number"
            inputMode="numeric"
            min={0}
            max={600}
            step={1}
            className={fieldClass}
            disabled={!editable}
            value={freeMaintenanceMonths}
            onChange={(e) => setFreeMaintenanceMonths(e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Delivery and penalties"
        description="Articles 3, 5 and 7 of the printed agreement. A blank field prints neutral wording."
      >
        <Field label="Delivery (working days)" htmlFor="deliveryWorkingDays" hint="From the effective date.">
          <input
            id="deliveryWorkingDays"
            type="number"
            inputMode="numeric"
            min={0}
            max={1000}
            step={1}
            className={fieldClass}
            disabled={!editable}
            value={deliveryWorkingDays}
            onChange={(e) => setDeliveryWorkingDays(e.target.value)}
          />
        </Field>
        <Field
          label="Installation (working days)"
          htmlFor="installationWorkingDays"
          hint="From the signed notice of site readiness."
        >
          <input
            id="installationWorkingDays"
            type="number"
            inputMode="numeric"
            min={0}
            max={1000}
            step={1}
            className={fieldClass}
            disabled={!editable}
            value={installationWorkingDays}
            onChange={(e) => setInstallationWorkingDays(e.target.value)}
          />
        </Field>
        <Field
          label="Delay penalty (% per day)"
          htmlFor="delayPenaltyPercentPerDay"
          hint="Of the contract price, e.g. 0.02."
        >
          <input
            id="delayPenaltyPercentPerDay"
            inputMode="decimal"
            pattern="(100(\.0{1,3})?|\d{1,2}(\.\d{1,3})?)"
            className={fieldClass}
            disabled={!editable}
            value={delayPenaltyPercentPerDay}
            onChange={(e) => setDelayPenaltyPercentPerDay(e.target.value)}
          />
        </Field>
        <Field label="Penalty cap (%)" htmlFor="delayPenaltyCapPercent" hint="Of the contract price, e.g. 5.">
          <input
            id="delayPenaltyCapPercent"
            inputMode="decimal"
            pattern="(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)"
            className={fieldClass}
            disabled={!editable}
            value={delayPenaltyCapPercent}
            onChange={(e) => setDelayPenaltyCapPercent(e.target.value)}
          />
        </Field>
        <Field label="Advance guarantee" htmlFor="advanceGuaranteeRequired" wide>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              id="advanceGuaranteeRequired"
              type="checkbox"
              disabled={!editable}
              checked={advanceGuaranteeRequired}
              onChange={(e) => setAdvanceGuaranteeRequired(e.target.checked)}
            />
            The advance is released only against a guarantee cheque of equal value
          </label>
        </Field>
        <Field
          label="Dispute forum"
          htmlFor="disputeForum"
          hint="Article 8.2: where an unsettled dispute is referred."
          wide
        >
          <input
            id="disputeForum"
            className={fieldClass}
            maxLength={500}
            placeholder="the Addis Ababa Chamber of Commerce and Sectoral Associations"
            disabled={!editable}
            value={disputeForum}
            onChange={(e) => setDisputeForum(e.target.value)}
          />
        </Field>
      </FormSection>
    </FormPage>
  );
}
