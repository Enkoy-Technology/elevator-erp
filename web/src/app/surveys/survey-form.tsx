'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import { NumberInput } from '@/app/quotations/number-input';
import {
  ApiError,
  createSiteSurvey,
  updateSiteSurvey,
  type SiteSurvey,
  type SiteSurveyUpdate,
} from '@/lib/api';

/**
 * One form for both `/surveys/new` and `/surveys/[id]/edit` — the two routes
 * differ only in whether a sheet was loaded first, so they share this rather
 * than keeping two drifting copies of the same eleven fields.
 */

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** null, not '' — a cleared cell means "not measured", and the column is
 *  nullable on purpose. On create the API treats null the same as absent. */
const text = (value: string): string | null => value.trim() || null;

/** NumberInput keeps the raw digits as a string. '' means the person on site
 *  could not measure it, which is not the same as zero. */
const count = (value: string): number | null =>
  value.trim() === '' ? null : Number(value);

/** A stored number back into the input's string state. */
const digits = (value: number | null): string =>
  value === null ? '' : String(value);

export const SurveyForm = ({ survey }: { survey: SiteSurvey | null }) => {
  const router = useRouter();
  const editId = survey?.id ?? null;

  const [surveyDate, setSurveyDate] = useState(survey?.surveyDate ?? todayIso);
  const [projectName, setProjectName] = useState(survey?.projectName ?? '');
  const [address, setAddress] = useState(survey?.address ?? '');
  const [contactName, setContactName] = useState(survey?.contactName ?? '');
  const [contactPhone, setContactPhone] = useState(survey?.contactPhone ?? '');
  const [shaftWidthCm, setShaftWidthCm] = useState(
    digits(survey?.shaftWidthCm ?? null),
  );
  const [shaftDepthCm, setShaftDepthCm] = useState(
    digits(survey?.shaftDepthCm ?? null),
  );
  const [floors, setFloors] = useState(survey?.floors ?? '');
  const [overheadCm, setOverheadCm] = useState(
    digits(survey?.overheadCm ?? null),
  );
  const [machineRoom, setMachineRoom] = useState(survey?.machineRoom ?? '');
  const [units, setUnits] = useState(digits(survey?.units ?? null));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const payload: SiteSurveyUpdate = {
      projectName: projectName.trim(),
      surveyDate: surveyDate || undefined,
      address: text(address),
      contactName: text(contactName),
      contactPhone: text(contactPhone),
      shaftWidthCm: count(shaftWidthCm),
      shaftDepthCm: count(shaftDepthCm),
      floors: text(floors),
      overheadCm: count(overheadCm),
      machineRoom: text(machineRoom),
      units: count(units),
    };
    try {
      if (editId) {
        await updateSiteSurvey(editId, payload);
        router.push(`/surveys/${editId}`);
      } else {
        await createSiteSurvey({ ...payload, projectName: projectName.trim() });
        router.push('/surveys');
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to save the survey',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormPage
      eyebrow="Sales"
      title={editId ? 'Edit site survey' : 'New site survey'}
      description={
        editId
          ? undefined
          : 'The site collection form. Fill what you could measure; leave the rest blank.'
      }
      backHref={editId ? `/surveys/${editId}` : '/surveys'}
      backLabel={editId ? 'Site survey' : 'Site surveys'}
      error={error}
      submitting={submitting}
      submitLabel={editId ? 'Save changes' : 'Submit'}
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection title="Site">
        <Field label="Date" htmlFor="surveyDate">
          <input
            id="surveyDate"
            type="date"
            className={fieldClass}
            value={surveyDate}
            onChange={(e) => setSurveyDate(e.target.value)}
          />
        </Field>

        <Field label="Project name" htmlFor="projectName">
          <input
            id="projectName"
            className={fieldClass}
            required
            maxLength={200}
            autoFocus
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />
        </Field>

        <Field label="Address" htmlFor="address" wide>
          <input
            id="address"
            className={fieldClass}
            maxLength={300}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>

        <Field label="Contact person" htmlFor="contactName">
          <input
            id="contactName"
            className={fieldClass}
            maxLength={200}
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </Field>

        <Field label="Contact telephone" htmlFor="contactPhone">
          <input
            id="contactPhone"
            type="tel"
            inputMode="tel"
            className={fieldClass}
            placeholder="+251911234567"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="Measurements">
        <Field label="Shaft width (cm)" htmlFor="shaftWidthCm">
          <NumberInput
            id="shaftWidthCm"
            value={shaftWidthCm}
            onValueChange={setShaftWidthCm}
          />
        </Field>

        <Field label="Shaft depth (cm)" htmlFor="shaftDepthCm">
          <NumberInput
            id="shaftDepthCm"
            value={shaftDepthCm}
            onValueChange={setShaftDepthCm}
          />
        </Field>

        <Field label="Floors" htmlFor="floors">
          <input
            id="floors"
            className={fieldClass}
            maxLength={100}
            placeholder="B+G+11"
            value={floors}
            onChange={(e) => setFloors(e.target.value)}
          />
        </Field>

        <Field label="OH (cm)" htmlFor="overheadCm">
          <NumberInput
            id="overheadCm"
            value={overheadCm}
            onValueChange={setOverheadCm}
          />
        </Field>

        <Field label="Machine room" htmlFor="machineRoom">
          <select
            id="machineRoom"
            className={fieldClass}
            value={machineRoom}
            onChange={(e) => setMachineRoom(e.target.value)}
          >
            <option value="">—</option>
            {/* An imported sheet can hold words neither option offers.
                Keep them selectable so saving never rewrites them away. */}
            {machineRoom &&
            machineRoom !== 'With MR' &&
            machineRoom !== 'MRL' ? (
              <option value={machineRoom}>{machineRoom}</option>
            ) : null}
            <option value="With MR">With MR</option>
            <option value="MRL">MRL</option>
          </select>
        </Field>

        <Field label="Units" htmlFor="units">
          <NumberInput id="units" value={units} onValueChange={setUnits} />
        </Field>
      </FormSection>
    </FormPage>
  );
};
