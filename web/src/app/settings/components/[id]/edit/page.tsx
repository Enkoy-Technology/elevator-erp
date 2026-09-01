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
  listComponentSpecifications,
  updateComponentSpecification,
  type UserRole,
} from '@/lib/api';

import { canEditDocumentContent } from '../../../document-content';

export default function EditComponentSpecificationPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [role, setRole] = useState<UserRole | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sequence, setSequence] = useState(0);
  const [componentName, setComponentName] = useState('');
  const [brand, setBrand] = useState('');
  const [remark, setRemark] = useState('');
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
        // No GET /settings/components/:id exists — the list endpoint returns
        // the whole (about twenty row) set in one call, so read that and pick
        // the row.
        const result = await listComponentSpecifications();
        const spec = result.items.find((item) => item.id === id);
        if (!spec) {
          setLoadError('That component row no longer exists.');
          return;
        }
        setSequence(spec.sequence);
        setComponentName(spec.componentName);
        setBrand(spec.brand ?? '');
        setRemark(spec.remark ?? '');
        setLoaded(true);
      } catch (err) {
        setLoadError(
          err instanceof ApiError
            ? err.message
            : 'That component row could not be loaded.',
        );
      }
    })();
  }, [router, id]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await updateComponentSpecification(id, {
        componentName: componentName.trim(),
        brand: brand.trim(),
        remark: remark.trim(),
      });
      router.push('/settings/components');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to save the component',
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
                href="/settings/components"
                className="font-semibold underline underline-offset-2"
              >
                Back to components
              </a>
            </p>
          ) : (
            <p className="text-sm text-slate-500">Loading component…</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <FormPage
      eyebrow="Settings"
      title={componentName || 'Component'}
      description={`Row ${sequence} of the brand appendix that prints on every quotation and proforma. Edited here once, it prints the same on every document.`}
      backHref="/settings/components"
      backLabel="Components & brands"
      error={error}
      submitting={submitting}
      submitDisabled={!canEditDocumentContent(role)}
      submitLabel="Save changes"
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection
        title="Appendix row"
        description="Print order is set with the arrows on the list, not here."
      >
        <Field label="Component" htmlFor="componentName" wide>
          <input
            id="componentName"
            className={fieldClass}
            required
            autoFocus
            value={componentName}
            onChange={(e) => setComponentName(e.target.value)}
          />
        </Field>

        <Field label="Brand" htmlFor="brand">
          <input
            id="brand"
            className={fieldClass}
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          />
        </Field>

        <Field
          label="Remark"
          htmlFor="remark"
          hint="Origin or part number — keep the Brand column to the brand alone."
        >
          <input
            id="remark"
            className={fieldClass}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
        </Field>
      </FormSection>
    </FormPage>
  );
}
