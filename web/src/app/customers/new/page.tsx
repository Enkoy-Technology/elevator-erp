'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getAccessToken } from '@/lib/api';

import { CustomerForm } from '../customer-form';

export default function NewCustomerPage() {
  const router = useRouter();
  const [authorised, setAuthorised] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setAuthorised(true);
  }, [router]);

  if (!authorised) {
    return null;
  }
  return <CustomerForm customer={null} />;
}
