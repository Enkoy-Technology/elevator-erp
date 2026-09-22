'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import { NumberInput } from '@/app/quotations/number-input';
import {
  ApiError,
  createSiteSurvey,
  getAccessToken,
  type SiteSurveyPayload,
} from '@/lib/api';

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** '' stays out of the payload entirely; the column is nullable on purpose. */
const text = (value: string): string | undefined => value.trim() || undefined;

/** NumberInput keeps the raw digits as a string. '' means the person on site
 *  could not measure it, which is not the same as zero. */
const count = (value: string): number | undefined =>
  value.trim() === '' ? undefined : Number(value);

export default function NewSiteSurveyPage() {
  const router = useRouter();
  const [surveyDate, setSurveyDate] = useState(todayIso);
  const [projectName, setProjectName] = useState('');
  const [address, setAddress] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [shaftWidthCm, setShaftWidthCm] = useState('');
  const [shaftDepthCm, setShaftDepthCm] = useState('');
  const [floors, setFloors] = useState('');
  const [overheadCm, setOverheadCm] = useState('');
  const [machineRoom, setMachineRoom] = useState('');
  const [units, setUnits] = useState('');
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
    const payload: SiteSurveyPayload = {
      projectName: projectName.trim(),
      surveyDate: text(surveyDate),
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
      await createSiteSurvey(payload);
      router.push('/surveys');
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
      title="New site survey"
      description="The site collection form. Fill what you could measure; leave the rest blank."
      backHref="/surveys"
      backLabel="Site surveys"
      error={error}
      submitting={submitting}
      submitLabel="Submit"
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
}
