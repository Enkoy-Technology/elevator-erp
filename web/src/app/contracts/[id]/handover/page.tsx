'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { btnSecondary, fieldClass } from '@/components/form-styles';
import {
  ApiError,
  downloadCompletionCertificate,
  downloadWarrantyCertificate,
  getAccessToken,
  handoverContract,
} from '@/lib/api';

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/**
 * Recording the handover of a signed contract — the event that closes the
 * contract, closes the project, and starts the warranty clock.
 *
 * The two certificates live on this page rather than the contract list
 * because both are consequences of the handover: the completion certificate
 * is only issuable once one is recorded, and the warranty certificate's
 * period is dated from it.
 */
export default function ContractHandoverPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const contractId = params.id;

  const [handedOverAt, setHandedOverAt] = useState(todayIso());
  const [handedOverToName, setHandedOverToName] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('');
  const [contractNumber, setContractNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
    }
  }, [router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const contract = await handoverContract(contractId, {
        handedOverAt,
        handedOverToName,
        handoverNotes: handoverNotes || undefined,
      });
      // Stays on the page instead of navigating: the certificates below are
      // the reason someone came here, and they are issuable the moment this
      // succeeds.
      setContractNumber(contract.contractNumber);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to record the handover',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Only used to name the saved file. Before the handover response is in
  // hand, fall back to the id prefix — same scheme as the maintenance
  // report's own download.
  const fileLabel = contractNumber ?? contractId.slice(0, 8);

  const download = async (
    fn: (id: string, label: string) => Promise<void>,
  ): Promise<void> => {
    setError(null);
    try {
      await fn(contractId, fileLabel);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to download the document',
      );
    }
  };

  return (
    <FormPage
      eyebrow="Contracts"
      title="Record handover"
      description="Closes the contract and the project, and starts the warranty period."
      backHref="/contracts"
      backLabel="Contracts"
      error={error}
      submitting={submitting}
      submitLabel={contractNumber ? 'Handover recorded' : 'Record handover'}
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection
        title="Handover"
        description="Only a signed contract can be handed over."
      >
        <Field label="Handover date" htmlFor="handedOverAt">
          <input
            id="handedOverAt"
            type="date"
            className={fieldClass}
            required
            value={handedOverAt}
            onChange={(e) => setHandedOverAt(e.target.value)}
          />
        </Field>
        <Field
          label="Accepted by"
          htmlFor="handedOverToName"
          hint="Who signed for the works on the customer's behalf."
        >
          <input
            id="handedOverToName"
            type="text"
            className={fieldClass}
            required
            minLength={2}
            maxLength={200}
            value={handedOverToName}
            onChange={(e) => setHandedOverToName(e.target.value)}
          />
        </Field>
        <Field label="Handover notes" htmlFor="handoverNotes" wide>
          <textarea
            id="handoverNotes"
            rows={3}
            className={fieldClass}
            maxLength={2000}
            value={handoverNotes}
            onChange={(e) => setHandoverNotes(e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Certificates"
        description="Printed for wet signing. The completion certificate needs a recorded handover; the warranty certificate needs a warranty period on the contract."
      >
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <button
            type="button"
            className={btnSecondary}
            onClick={() => void download(downloadCompletionCertificate)}
          >
            Completion certificate
          </button>
          <button
            type="button"
            className={btnSecondary}
            onClick={() => void download(downloadWarrantyCertificate)}
          >
            Warranty certificate
          </button>
        </div>
      </FormSection>
    </FormPage>
  );
}
