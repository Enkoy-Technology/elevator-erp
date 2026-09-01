'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  getAccessToken,
  getCurrentRole,
  listBoilerplateSections,
  updateBoilerplateSection,
  type UserRole,
} from '@/lib/api';

import { canEditDocumentContent } from '../../../document-content';

export default function EditBoilerplateSectionPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [role, setRole] = useState<UserRole | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    void (async () => {
      try {
        // There is no GET /settings/boilerplate/:id — the list endpoint
        // returns the whole (eight-row) set in one call, so read that and
        // pick the row rather than adding a client function for a route the
        // API does not have.
        const result = await listBoilerplateSections();
        const section = result.items.find((item) => item.id === id);
        if (!section) {
          setLoadError('That section no longer exists.');
          return;
        }
        setSectionKey(section.sectionKey);
        setTitle(section.title ?? '');
        setBody(section.body ?? '');
        setLoaded(true);
      } catch (err) {
        setLoadError(
          err instanceof ApiError
            ? err.message
            : 'That section could not be loaded.',
        );
      }
    })();
  }, [router, id]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // `sectionKey` is not sent: the API has no field for it, because
      // renaming a key would orphan the text rather than move it.
      await updateBoilerplateSection(id, { title: title.trim(), body });
      router.push('/settings/boilerplate');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to save the section',
      );
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
              <a
                href="/settings/boilerplate"
                className="font-semibold underline underline-offset-2"
              >
                Back to document boilerplate
              </a>
            </p>
          ) : (
            <p className="text-sm text-slate-500">Loading section…</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <FormPage
      eyebrow="Settings"
      title={title || sectionKey}
      description="Edit this once and every quotation and proforma prints the new text. Nothing is pasted per document, so the pages cannot drift apart."
      backHref="/settings/boilerplate"
      backLabel="Document boilerplate"
      error={error}
      submitting={submitting}
      submitDisabled={!canEditDocumentContent(role)}
      submitLabel="Save changes"
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection
        title="Section"
        description="Print order is set with the arrows on the list, not here."
      >
        <Field
          label="Key"
          htmlFor="sectionKey"
          hint="Permanent identifier for this section."
        >
          <input
            id="sectionKey"
            className={`${fieldClass} bg-slate-50 text-slate-500`}
            value={sectionKey}
            readOnly
            disabled
          />
        </Field>

        <Field label="Heading" htmlFor="title" hint="Prints above the text.">
          <input
            id="title"
            className={fieldClass}
            maxLength={200}
            autoFocus
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
            rows={18}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
      </FormSection>
    </FormPage>
  );
}
