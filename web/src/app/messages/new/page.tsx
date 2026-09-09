'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { btnSecondary, fieldClass } from '@/components/form-styles';
import { ROLE_LABELS } from '@/app/employees/labels';
import {
  ApiError,
  EMPLOYEE_ROLES,
  getAccessToken,
  listMessageTemplates,
  previewBroadcast,
  sendBroadcast,
  type BroadcastAudience,
  type BroadcastResult,
  type EmployeeRole,
  type MessageTemplate,
  type StarterTemplate,
} from '@/lib/api';

const MAX_BODY = 335;

/** What the recipient will read, with the placeholders filled by example. */
const example = (body: string): string =>
  body.replace(/\{\{\s*name\s*\}\}/gi, 'Abebe Kebede').replace(/\{\{\s*company\s*\}\}/gi, 'Shining Star');

/** `datetime-local` value -> ISO with the browser's offset, so 08:00 means 08:00 in Addis. */
const toIso = (local: string): string | undefined => (local ? new Date(local).toISOString() : undefined);

export default function ComposeMessagePage() {
  const router = useRouter();
  const [audience, setAudience] = useState<BroadcastAudience>('EMPLOYEES');
  const [roles, setRoles] = useState<EmployeeRole[]>([]);
  const [body, setBody] = useState('');
  const [sendAtLocal, setSendAtLocal] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [saved, setSaved] = useState<MessageTemplate[]>([]);
  const [starters, setStarters] = useState<StarterTemplate[]>([]);
  const [preview, setPreview] = useState<BroadcastResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void listMessageTemplates()
      .then((t) => {
        setSaved(t.saved);
        setStarters(t.starters);
      })
      .catch(() => undefined);
  }, [router]);

  const payload = useMemo(
    () => ({
      audience,
      roles: audience === 'EMPLOYEES' && roles.length > 0 ? roles : undefined,
      body: body.trim(),
      sendAt: toIso(sendAtLocal),
      templateId: templateId || undefined,
    }),
    [audience, roles, body, sendAtLocal, templateId],
  );

  // The counts refresh as the audience changes, so the sender always sees
  // who a message reaches before pressing Send.
  useEffect(() => {
    if (!getAccessToken()) {
      return;
    }
    setPreviewing(true);
    const handle = setTimeout(() => {
      previewBroadcast({ ...payload, body: payload.body || 'preview' })
        .then(setPreview)
        .catch(() => setPreview(null))
        .finally(() => setPreviewing(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [payload]);

  const applyTemplate = (value: string) => {
    if (value.startsWith('saved:')) {
      const t = saved.find((s) => s.id === value.slice(6));
      if (t) {
        setTemplateId(t.id);
        setBody(t.body);
      }
    } else if (value.startsWith('starter:')) {
      const t = starters[Number(value.slice(8))];
      if (t) {
        setTemplateId('');
        setBody(t.body);
      }
    }
  };

  const toggleRole = (role: EmployeeRole) =>
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!payload.body) {
      setError('Write the message first.');
      return;
    }
    if (preview && preview.queued === 0) {
      setError('Nobody would receive this: no recipient in this audience has a phone with consent on file.');
      return;
    }
    if (!window.confirm(`Send this message to ${preview?.queued ?? '?'} people${payload.sendAt ? ' at the scheduled time' : ' now'}?`)) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      setResult(await sendBroadcast(payload));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send the message');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <FormPage
        eyebrow="Communication"
        title="Message queued"
        description="Every recipient is a row on the Messages page; the dispatcher sends within a minute of the scheduled time."
        backHref="/messages"
        backLabel="Messages"
        submitLabel="Compose another"
        onSubmit={(event) => {
          event.preventDefault();
          setResult(null);
          setBody('');
          setSendAtLocal('');
        }}
      >
        <FormSection title="Result">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Queued</dt>
              <dd className="text-2xl font-bold text-slate-900">{result.queued}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Audience</dt>
              <dd className="text-2xl font-bold text-slate-900">{result.audienceSize}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Held, no consent</dt>
              <dd className="text-lg font-semibold text-amber-700">{result.skippedNoConsent}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Held, no phone</dt>
              <dd className="text-lg font-semibold text-amber-700">{result.skippedNoPhone}</dd>
            </div>
            {result.sendAt ? (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Scheduled for</dt>
                <dd className="text-sm text-slate-900">{new Date(result.sendAt).toLocaleString('en-GB')}</dd>
              </div>
            ) : null}
          </dl>
        </FormSection>
      </FormPage>
    );
  }

  return (
    <FormPage
      eyebrow="Communication"
      title="Compose message"
      description="A greeting or a notice, sent by SMS to every person in the audience. Only people with a phone and consent on file receive it; the rest are counted and held."
      backHref="/messages"
      backLabel="Messages"
      error={error}
      submitting={submitting}
      submitLabel={sendAtLocal ? 'Schedule' : 'Send now'}
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection title="Who" description="Employees by role, or every customer with a phone on file.">
        <Field label="Audience" htmlFor="audience">
          <select
            id="audience"
            className={fieldClass}
            value={audience}
            onChange={(e) => setAudience(e.target.value as BroadcastAudience)}
          >
            <option value="EMPLOYEES">Employees</option>
            <option value="CUSTOMERS">Customers</option>
          </select>
        </Field>
        {audience === 'EMPLOYEES' ? (
          <Field label="Roles" htmlFor="roles" hint="Leave all unticked for every active employee." wide>
            <div id="roles" className="flex flex-wrap gap-2">
              {EMPLOYEE_ROLES.map((role) => (
                <label
                  key={role}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium ${
                    roles.includes(role)
                      ? 'border-navy-800 bg-navy-800 text-white'
                      : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={roles.includes(role)}
                    onChange={() => toggleRole(role)}
                  />
                  {ROLE_LABELS[role]}
                </label>
              ))}
            </div>
          </Field>
        ) : null}
        <Field label="Reach" htmlFor="reach" wide>
          <p id="reach" className="text-sm text-slate-700">
            {previewing || !preview ? (
              'Counting…'
            ) : (
              <>
                <span className="font-semibold">{preview.queued}</span> will receive it
                {preview.skippedNoConsent + preview.skippedNoPhone > 0 ? (
                  <>
                    {' '}
                    · {preview.skippedNoConsent} held for no consent · {preview.skippedNoPhone} for no phone
                  </>
                ) : null}
                {' '}
                (of {preview.audienceSize})
              </>
            )}
          </p>
        </Field>
      </FormSection>

      <FormSection
        title="What"
        description="Start from a template or write your own. {{name}} becomes the recipient's name, {{company}} the company name."
      >
        <Field label="Template" htmlFor="template" wide>
          <select
            id="template"
            className={fieldClass}
            value=""
            onChange={(e) => applyTemplate(e.target.value)}
          >
            <option value="">Choose a template…</option>
            {saved.length > 0 ? (
              <optgroup label="Saved">
                {saved.map((t) => (
                  <option key={t.id} value={`saved:${t.id}`}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label="Starters">
              {starters.map((t, i) => (
                <option key={t.name} value={`starter:${i}`}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
        <Field
          label="Message"
          htmlFor="body"
          hint={`${body.length}/${MAX_BODY} characters. Over 160 (70 with Amharic) costs a second segment per recipient.`}
          wide
        >
          <textarea
            id="body"
            className={fieldClass}
            rows={5}
            maxLength={MAX_BODY}
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        {body.trim() ? (
          <Field label="Preview" htmlFor="previewText" wide>
            <p id="previewText" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
              {example(body)}
            </p>
          </Field>
        ) : null}
        <Field label="Save as template" htmlFor="saveTemplate" wide>
          <button
            id="saveTemplate"
            type="button"
            className={`${btnSecondary} px-3 py-1.5 text-sm`}
            disabled={!body.trim()}
            onClick={() => router.push(`/messages/templates/new?body=${encodeURIComponent(body)}`)}
          >
            Save this wording as a template
          </button>
        </Field>
      </FormSection>

      <FormSection title="When" description="Leave blank to send within the minute.">
        <Field label="Send at" htmlFor="sendAt" hint="Addis Ababa time. A New Year greeting can be scheduled the week before.">
          <input
            id="sendAt"
            type="datetime-local"
            className={fieldClass}
            value={sendAtLocal}
            onChange={(e) => setSendAtLocal(e.target.value)}
          />
        </Field>
      </FormSection>
    </FormPage>
  );
}
