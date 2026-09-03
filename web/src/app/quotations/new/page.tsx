'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import {
  ApiError,
  createQuotationFromCalc,
  getAccessToken,
  getCurrentRole,
  listProjects,
  optional,
  type CreateQuotationPayload,
  type Project,
  type UserRole,
} from '@/lib/api';

/**
 * Starting a quotation asks for the customer's project and nothing else.
 *
 * A quotation is a table of lifts now, and a lift is nineteen fields — so
 * describing the first one HERE and the second one on the next screen would
 * be two different jobs wearing the same name. This creates the DRAFT with a
 * placeholder lift and hands over to the editor, which is the one place a
 * lift is ever described.
 */

/** The placeholder lift. Every value is overwritten on the next screen; it
 *  exists so the API has a priced line to create the quotation around. */
const PLACEHOLDER_LIFT: Omit<CreateQuotationPayload, 'validUntil' | 'notes'> = {
  productType: 'PASSENGER',
  capacityKg: 1000,
  stops: 12,
  travelHeightM: 45,
  speedMs: 1.6,
  machineRoomType: 'MRL',
  doorType: 'CENTER_OPEN',
  doorWidthMm: 900,
  buildingUsage: 'COMMERCIAL',
  marginPercent: 0,
};

/** Mirrors @Roles('SALES_MANAGER') on the quotations mutation routes;
 *  CEO and ADMIN bypass via RolesGuard's SUPER_ROLES. */
const canWrite = (role: UserRole | null): boolean =>
  role === 'SALES_MANAGER' || role === 'CEO' || role === 'GENERAL_MANAGER' || role === 'ADMIN';

export default function NewQuotationPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    // The list page only offers this action to a sales manager; the route
    // has to say the same thing rather than render a form the API will
    // reject.
    if (!canWrite(getCurrentRole())) {
      router.replace('/quotations');
      return;
    }
    void (async () => {
      const projectPage = await optional(listProjects({ page: 1, pageSize: 100 }));
      setProjects(projectPage.items);
      setProjectId((prev) => prev || projectPage.items[0]?.id || '');
    })();
  }, [router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!projectId) {
      setError('Create a project first, then draft a quote.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const quotation = await createQuotationFromCalc(projectId, {
        ...PLACEHOLDER_LIFT,
        validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
        notes: notes || undefined,
      });
      router.push(`/quotations/${quotation.id}/edit`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create quotation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormPage
      eyebrow="Sales"
      title="New quotation"
      description="Opens a DRAFT with one lift on it. You describe the lifts, agree the price and state the terms on the next screen."
      backHref="/quotations"
      backLabel="Quotations"
      error={error}
      submitting={submitting}
      submitLabel="Start the offer"
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection title="Project">
        <Field label="Project" htmlFor="project" wide>
          <select
            id="project"
            className={fieldClass}
            required
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects.length === 0 ? (
              <option value="">No projects yet</option>
            ) : (
              projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))
            )}
          </select>
        </Field>
      </FormSection>

      <FormSection
        title="Optional"
        description="Both can wait — the offer's stated validity is set with the rest of the terms on the next screen."
      >
        <Field label="Expires on" htmlFor="validUntil">
          <input
            id="validUntil"
            type="date"
            className={fieldClass}
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </Field>
        <Field label="Internal notes" htmlFor="notes" wide>
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
