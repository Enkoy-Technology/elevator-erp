'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { btnSecondary } from '@/components/form-styles';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  getAccessToken,
  getSiteSurvey,
  type SiteSurvey,
} from '@/lib/api';

import { SurveyForm } from '../../survey-form';

/** Load failure and "not found" both land here — never a blank form. A
 *  salesperson opening someone else's sheet gets the 404 message, which is
 *  the point: the API never confirms the row exists. */
const LoadMessage = ({ message }: { message: string }) => (
  <div className="flex min-h-screen">
    <Sidebar />
    <div className="min-w-0 flex-1 p-6 sm:p-8">
      <p className="max-w-2xl rounded-xl border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">
        {message}
      </p>
      <Link href="/surveys" className={`${btnSecondary} mt-4`}>
        Back to site surveys
      </Link>
    </div>
  </div>
);

export default function EditSiteSurveyPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [survey, setSurvey] = useState<SiteSurvey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const record = await getSiteSurvey(id);
        if (!cancelled) {
          setSurvey(record);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'Failed to load this site survey',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [router, id]);

  if (loading) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <p className="min-w-0 flex-1 p-6 text-sm text-slate-500 sm:p-8">
          Loading…
        </p>
      </div>
    );
  }
  if (!survey) {
    return (
      <LoadMessage message={error ?? 'That site survey no longer exists.'} />
    );
  }
  return <SurveyForm survey={survey} />;
}
