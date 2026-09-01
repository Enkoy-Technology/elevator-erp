'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import {
  ApiError,
  downloadMaintenanceReport,
  getAccessToken,
  listAssets,
  listMaintenanceContracts,
  logServiceVisit,
  optional,
  type MaintenanceContract,
} from '@/lib/api';

/**
 * The API exposes no GET /maintenance/contracts/:id, so the one contract we
 * need is found by walking the list it does expose.
 * ponytail: linear scan, one 100-row request per page — replace with a
 * by-id fetch the moment the controller grows one.
 */
const findContract = async (
  id: string,
): Promise<MaintenanceContract | null> => {
  for (let page = 1; ; page += 1) {
    const result = await listMaintenanceContracts({ page, pageSize: 100 });
    const hit = result.items.find((c) => c.id === id);
    if (hit) {
      return hit;
    }
    if (page >= result.totalPages) {
      return null;
    }
  }
};

export default function LogServiceVisitPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const contractId = params.id;

  const [contract, setContract] = useState<MaintenanceContract | null>(null);
  const [assetName, setAssetName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inspectionResults, setInspectionResults] = useState('');
  const [partsReplaced, setPartsReplaced] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const [found, assetPage] = await Promise.all([
          findContract(contractId),
          optional(listAssets({ page: 1, pageSize: 100 })),
        ]);
        setContract(found);
        if (!found) {
          setError(
            'That maintenance contract no longer exists, or you cannot see it.',
          );
          return;
        }
        setAssetName(
          assetPage.items.find((a) => a.id === found.assetId)?.name ?? null,
        );
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load the contract',
        );
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router, contractId]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!contract) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { visit } = await logServiceVisit(contract.id, {
        notes: notes || undefined,
        inspectionResults: inspectionResults || undefined,
        partsReplaced: partsReplaced || undefined,
        recommendations: recommendations || undefined,
      });
      // The report is what the customer signs, so it is fetched right after
      // the visit is stored. A failed download must not look like a failed
      // visit — the visit is already committed — so it is swallowed here and
      // the report stays downloadable from the API.
      await downloadMaintenanceReport(visit.id).catch(() => undefined);
      router.push('/maintenance');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to log visit');
    } finally {
      setSubmitting(false);
    }
  };

  const description = contract
    ? `${assetName ?? contract.assetId.slice(0, 8)} — due ${contract.nextServiceAt}. Marks today as last service and advances the next date.`
    : 'Marks today as last service and advances the next date.';

  return (
    <FormPage
      eyebrow="Operations"
      title="Log service visit"
      description={description}
      backHref="/maintenance"
      backLabel="Maintenance"
      error={error}
      submitting={submitting}
      submitLabel="Log visit & download report"
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection title="Visit">
        {loading ? (
          <p className="text-sm text-slate-500 sm:col-span-2">Loading…</p>
        ) : contract ? (
          <>
            <Field label="Inspection results" htmlFor="inspectionResults" wide>
              <textarea
                id="inspectionResults"
                className={fieldClass}
                rows={4}
                value={inspectionResults}
                onChange={(e) => setInspectionResults(e.target.value)}
              />
            </Field>
            <Field label="Parts replaced" htmlFor="partsReplaced" wide>
              <textarea
                id="partsReplaced"
                className={fieldClass}
                rows={3}
                value={partsReplaced}
                onChange={(e) => setPartsReplaced(e.target.value)}
              />
            </Field>
            <Field label="Recommendations" htmlFor="recommendations" wide>
              <textarea
                id="recommendations"
                className={fieldClass}
                rows={3}
                value={recommendations}
                onChange={(e) => setRecommendations(e.target.value)}
              />
            </Field>
            <Field label="Notes" htmlFor="visitNotes" wide>
              <textarea
                id="visitNotes"
                className={fieldClass}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </>
        ) : (
          <p className="text-sm text-slate-500 sm:col-span-2">
            Nothing to log against. Go back to Maintenance and pick a contract
            from the list.
          </p>
        )}
      </FormSection>
    </FormPage>
  );
}
