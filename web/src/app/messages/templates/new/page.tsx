'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { getAccessToken } from '@/lib/api';
import { TemplateForm } from '../template-form';

/** `?name=&body=` pre-fill it from a starter or from the composer's wording. */
function NewTemplate() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
    }
  }, [router]);
  return <TemplateForm initialName={params.get('name') ?? ''} initialBody={params.get('body') ?? ''} />;
}

export default function NewMessageTemplatePage() {
  return (
    <Suspense fallback={null}>
      <NewTemplate />
    </Suspense>
  );
}
