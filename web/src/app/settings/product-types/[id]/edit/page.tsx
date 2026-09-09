'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Sidebar } from '@/components/sidebar';
import { ApiError, getAccessToken, listProductTypes, type ProductTypeRow } from '@/lib/api';
import { ProductTypeForm } from '../../product-type-form';

export default function EditProductTypePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [row, setRow] = useState<ProductTypeRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void listProductTypes()
      .then((rows) => {
        const found = rows.find((r) => r.id === params.id);
        if (!found) {
          setLoadError('That product no longer exists.');
          return;
        }
        setRow(found);
      })
      .catch((err: unknown) =>
        setLoadError(err instanceof ApiError ? err.message : 'That product could not be loaded.'),
      );
  }, [router, params.id]);

  if (!row) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1 p-6 sm:p-8">
          {loadError ? (
            <p role="alert" className="max-w-2xl rounded-xl border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">
              {loadError}{' '}
              <a href="/settings/product-types" className="font-semibold underline underline-offset-2">
                Back to products
              </a>
            </p>
          ) : (
            <p className="text-sm text-slate-500">Loading product…</p>
          )}
        </div>
      </div>
    );
  }

  return <ProductTypeForm existing={row} />;
}
