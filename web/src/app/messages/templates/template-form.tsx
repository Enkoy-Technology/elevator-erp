'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import { ApiError, createMessageTemplate, updateMessageTemplate } from '@/lib/api';

const MAX_BODY = 335;

/** One form for create and edit: `editId` decides which call saves it. */
export function TemplateForm({
  editId,
  initialName,
  initialBody,
}: {
  editId?: string;
  initialName: string;
  initialBody: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (editId) {
        await updateMessageTemplate(editId, { name: name.trim(), body: body.trim() });
      } else {
        await createMessageTemplate({ name: name.trim(), body: body.trim() });
      }
      router.push('/messages/templates');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the template');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormPage
      eyebrow="Communication"
      title={editId ? 'Edit template' : 'New template'}
      description="Write it once; the composer fills {{name}} and {{company}} for each recipient."
      backHref="/messages/templates"
      backLabel="Templates"
      error={error}
      submitting={submitting}
      submitLabel={editId ? 'Save changes' : 'Save template'}
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection title="Template">
        <Field label="Name" htmlFor="name" wide>
          <input
            id="name"
            className={fieldClass}
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field
          label="Message"
          htmlFor="body"
          hint={`${body.length}/${MAX_BODY} characters. Placeholders: {{name}}, {{company}}.`}
          wide
        >
          <textarea
            id="body"
            className={fieldClass}
            rows={5}
            required
            minLength={2}
            maxLength={MAX_BODY}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
      </FormSection>
    </FormPage>
  );
}
