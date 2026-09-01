'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import {
  ApiError,
  createComponentSpecification,
  getAccessToken,
  getCurrentRole,
  type UserRole,
} from '@/lib/api';

import { canEditDocumentContent } from '../../document-content';

export default function NewComponentSpecificationPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
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
  }, [router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // No `sequence`: omitting it appends to the end, and the list's arrows
      // are the only way to set order — so a row number can never collide.
      await createComponentSpecification({
        componentName: componentName.trim(),
        brand: brand.trim() || undefined,
        remark: remark.trim() || undefined,
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

  return (
    <FormPage
      eyebrow="Settings"
      title="Add component"
      description="One row of the brand appendix that prints on every quotation and proforma. Kept here rather than retyped per quote, which is how brands drift between documents."
      backHref="/settings/components"
      backLabel="Components & brands"
      error={error}
      submitting={submitting}
      submitDisabled={!canEditDocumentContent(role)}
      submitLabel="Add component"
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection
        title="Appendix row"
        description="New rows print last. Use the arrows on the list to move this one."
      >
        <Field label="Component" htmlFor="componentName" wide>
          <input
            id="componentName"
            className={fieldClass}
            required
            autoFocus
            placeholder="Traction machine (gearless motor)"
            value={componentName}
            onChange={(e) => setComponentName(e.target.value)}
          />
        </Field>

        <Field label="Brand" htmlFor="brand">
          <input
            id="brand"
            className={fieldClass}
            placeholder="FUJI"
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
            placeholder="Zhejiang (Sino-Japan Joint Venture)"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
        </Field>
      </FormSection>
    </FormPage>
  );
}
