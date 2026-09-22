'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getAccessToken } from '@/lib/api';

import { SurveyForm } from '../survey-form';

export default function NewSiteSurveyPage() {
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
  return <SurveyForm survey={null} />;
}
