'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { getAccessToken } from '@/lib/api';
import { ProductTypeForm } from '../product-type-form';

export default function NewProductTypePage() {
  const router = useRouter();
  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
    }
  }, [router]);
  return <ProductTypeForm />;
}
