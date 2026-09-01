'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import {
  ApiError,
  createBoilerplateSection,
  getAccessToken,
  getCurrentRole,
  type UserRole,
} from '@/lib/api';

import {
  BOILERPLATE_SEED_KEYS,
  SECTION_KEY_PATTERN,
  canEditDocumentContent,
} from '../../document-content';

export default function NewBoilerplateSectionPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  const [sectionKey, setSectionKey] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setRole(getCurrentRole());
  }, [router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createBoilerplateSection({
        sectionKey: sectionKey.trim(),
        title: title.trim() || undefined,
        body: body || undefined,
      });
      router.push('/settings/boilerplate');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to save the section',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormPage
      eyebrow="Settings"
      title="Add boilerplate section"
      description="Standing text for every quotation and proforma. Written once here rather than pasted per document, which is what let the client's own pages drift out of sync with each other."
      backHref="/settings/boilerplate"
      backLabel="Document boilerplate"
      error={error}
      submitting={submitting}
      submitDisabled={!canEditDocumentContent(role)}
      submitLabel="Add section"
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection
        title="Section"
        description="New sections print last. Use the arrows on the list to move this one."
      >
        <Field
          label="Key"
          htmlFor="sectionKey"
          hint="Lowercase identifier, e.g. standards. Permanent — renaming it later is not possible."
        >
          <input
            id="sectionKey"
            className={fieldClass}
            required
            autoFocus
            list="boilerplate-seed-keys"
            pattern={SECTION_KEY_PATTERN}
            placeholder="standards"
            value={sectionKey}
            onChange={(e) => setSectionKey(e.target.value)}
          />
          {/* Native datalist: suggests the eight seeded keys so a second
              section for the same thing doesn't get invented under a
              near-miss spelling. */}
          <datalist id="boilerplate-seed-keys">
            {BOILERPLATE_SEED_KEYS.map((key) => (
              <option key={key} value={key} />
            ))}
          </datalist>
        </Field>

        <Field label="Heading" htmlFor="title" hint="Prints above the text.">
          <input
            id="title"
            className={fieldClass}
            maxLength={200}
            placeholder="Standards"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <Field
          label="Text"
          htmlFor="body"
          wide
          hint="Plain text. A line starting with “- ” prints as a bullet; every other line prints as a paragraph line."
        >
          <textarea
            id="body"
            className={`${fieldClass} font-mono text-[13px] leading-relaxed`}
            rows={14}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
      </FormSection>
    </FormPage>
  );
}
