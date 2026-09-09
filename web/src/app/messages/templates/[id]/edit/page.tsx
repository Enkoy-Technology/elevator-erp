'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Sidebar } from '@/components/sidebar';
import { ApiError, getAccessToken, listMessageTemplates, type MessageTemplate } from '@/lib/api';
import { TemplateForm } from '../../template-form';

export default function EditMessageTemplatePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [template, setTemplate] = useState<MessageTemplate | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void listMessageTemplates()
      .then((result) => {
        const found = result.saved.find((t) => t.id === params.id);
        if (!found) {
          setLoadError('That template no longer exists.');
          return;
        }
        setTemplate(found);
      })
      .catch((err: unknown) =>
        setLoadError(err instanceof ApiError ? err.message : 'That template could not be loaded.'),
      );
  }, [router, params.id]);

  if (!template) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1 p-6 sm:p-8">
          {loadError ? (
            <p role="alert" className="max-w-2xl rounded-xl border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">
              {loadError}{' '}
              <a href="/messages/templates" className="font-semibold underline underline-offset-2">
                Back to templates
              </a>
            </p>
          ) : (
            <p className="text-sm text-slate-500">Loading template…</p>
          )}
        </div>
      </div>
    );
  }

  return <TemplateForm editId={template.id} initialName={template.name} initialBody={template.body} />;
}
