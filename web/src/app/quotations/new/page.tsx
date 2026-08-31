'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import {
  ApiError,
  createQuotationFromCalc,
  getAccessToken,
  getCurrentRole,
  listProjects,
  optional,
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPES,
  type CreateQuotationPayload,
  type Project,
  type UserRole,
} from '@/lib/api';

const CALC_DEFAULTS: Omit<CreateQuotationPayload, 'validUntil' | 'notes'> = {
  productType: 'PASSENGER',
  capacityKg: 1000,
  stops: 12,
  travelHeightM: 45,
  speedMs: 1.6,
  machineRoomType: 'MRL',
  doorType: 'CENTER_OPEN',
  doorWidthMm: 900,
  buildingUsage: 'COMMERCIAL',
  marginPercent: 25,
};

/** Mirrors @Roles('SALES_MANAGER') on the quotations mutation routes;
 *  CEO and ADMIN bypass via RolesGuard's SUPER_ROLES. */
const canWrite = (role: UserRole | null): boolean =>
  role === 'SALES_MANAGER' || role === 'CEO' || role === 'ADMIN';

export default function NewQuotationPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [calc, setCalc] = useState(CALC_DEFAULTS);
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

  const setCalcField = (field: keyof typeof CALC_DEFAULTS, value: string) => {
    setCalc((prev) => ({
      ...prev,
      [field]: typeof CALC_DEFAULTS[field] === 'number' ? Number(value) : value,
    }));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!projectId) {
      setError('Create a project first, then draft a quote.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createQuotationFromCalc(projectId, {
        ...calc,
        validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
        notes: notes || undefined,
      });
      router.push('/quotations');
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
      description="Prices the elevator spec server-side (VAT from the statutory rate table) and saves a DRAFT."
      backHref="/quotations"
      backLabel="Quotations"
      error={error}
      submitting={submitting}
      submitLabel="Save draft"
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

      <FormSection title="Elevator spec">
        <Field
          label="Product"
          htmlFor="productType"
          wide
          hint={
            calc.productType !== 'PASSENGER'
              ? 'Flat price — stops and capacity do not change it.'
              : undefined
          }
        >
          <select
            id="productType"
            className={fieldClass}
            value={calc.productType}
            onChange={(e) => setCalcField('productType', e.target.value)}
          >
            {PRODUCT_TYPES.map((t) => (
              <option key={t} value={t}>
                {PRODUCT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Capacity (kg)" htmlFor="capacityKg">
          <input
            id="capacityKg"
            type="number"
            className={fieldClass}
            value={calc.capacityKg}
            onChange={(e) => setCalcField('capacityKg', e.target.value)}
          />
        </Field>
        <Field label="Stops" htmlFor="stops">
          <input
            id="stops"
            type="number"
            className={fieldClass}
            value={calc.stops}
            onChange={(e) => setCalcField('stops', e.target.value)}
          />
        </Field>
        <Field label="Travel height (m)" htmlFor="travelHeightM">
          <input
            id="travelHeightM"
            type="number"
            step="0.01"
            className={fieldClass}
            value={calc.travelHeightM}
            onChange={(e) => setCalcField('travelHeightM', e.target.value)}
          />
        </Field>
        <Field label="Speed (m/s)" htmlFor="speedMs">
          <input
            id="speedMs"
            type="number"
            step="0.01"
            className={fieldClass}
            value={calc.speedMs}
            onChange={(e) => setCalcField('speedMs', e.target.value)}
          />
        </Field>
        <Field label="Machine room" htmlFor="machineRoomType">
          <select
            id="machineRoomType"
            className={fieldClass}
            value={calc.machineRoomType}
            onChange={(e) => setCalcField('machineRoomType', e.target.value)}
          >
            <option value="MRL">MRL</option>
            <option value="MR">MR</option>
          </select>
        </Field>
        <Field label="Door type" htmlFor="doorType">
          <select
            id="doorType"
            className={fieldClass}
            value={calc.doorType}
            onChange={(e) => setCalcField('doorType', e.target.value)}
          >
            <option value="CENTER_OPEN">Center open</option>
            <option value="TELESCOPIC">Telescopic</option>
            <option value="SWING">Swing</option>
          </select>
        </Field>
        <Field label="Door width (mm)" htmlFor="doorWidthMm">
          <input
            id="doorWidthMm"
            type="number"
            className={fieldClass}
            value={calc.doorWidthMm}
            onChange={(e) => setCalcField('doorWidthMm', e.target.value)}
          />
        </Field>
        <Field label="Building usage" htmlFor="buildingUsage">
          <select
            id="buildingUsage"
            className={fieldClass}
            value={calc.buildingUsage}
            onChange={(e) => setCalcField('buildingUsage', e.target.value)}
          >
            <option value="RESIDENTIAL">Residential</option>
            <option value="COMMERCIAL">Commercial</option>
            <option value="HOSPITAL">Hospital</option>
            <option value="INDUSTRIAL">Industrial</option>
          </select>
        </Field>
        <Field label="Margin (%)" htmlFor="marginPercent">
          <input
            id="marginPercent"
            type="number"
            step="0.01"
            className={fieldClass}
            value={calc.marginPercent}
            onChange={(e) => setCalcField('marginPercent', e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="Terms">
        <Field label="Valid until (optional)" htmlFor="validUntil">
          <input
            id="validUntil"
            type="date"
            className={fieldClass}
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </Field>
        <Field label="Notes (optional)" htmlFor="notes" wide>
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
