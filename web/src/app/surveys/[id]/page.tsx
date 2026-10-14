'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { btnDanger, btnPrimary, btnSecondary } from '@/components/form-styles';
import { PageHeader } from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import { useConfirm } from '@/components/use-confirm';
import { formatDate, formatDateTime } from '@/lib/datetime';
import {
  ApiError,
  deleteSiteSurvey,
  getAccessToken,
  getCurrentRole,
  getSiteSurvey,
  listProductTypes,
  type ProductTypeRow,
  type SiteSurvey,
  type UserRole,
} from '@/lib/api';

/**
 * One site collection form, as filled. Read-only: this is what a manager
 * opens on a phone, so it is a plain definition list of every column —
 * including the ones that came back blank, because a blank OH is itself
 * information about how the sheet was collected.
 *
 * No permission check here: GET /site-surveys/:id is already scoped, so a
 * salesperson can only ever load their own sheet, and anything that loads
 * is theirs to edit.
 *
 * A manager converts the sheet into a customer and a project; from then on
 * the page offers the quotation, pre-filled from the sheet.
 */

/** Mirrors @Roles on POST /site-surveys/:id/convert; CEO and ADMIN bypass. */
const canConvert = (role: UserRole | null): boolean =>
  role === 'GENERAL_MANAGER' ||
  role === 'SALES_MANAGER' ||
  role === 'CEO' ||
  role === 'ADMIN';

const dash = (value: string | number | null): string =>
  value === null || value === '' ? '—' : String(value);

/** 'YYYY-MM-DD' is a plain date: pin it to local midnight so the day never
 *  slips a square west of Addis. */
const surveyDay = (iso: string): string => formatDate(`${iso}T00:00:00`);

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="border-b border-slate-100 py-3 last:border-0">
    <dt className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
      {label}
    </dt>
    <dd className="mt-1 text-sm text-slate-900">{children}</dd>
  </div>
);

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

export default function SiteSurveyPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { confirm, confirmDialog } = useConfirm();
  const [survey, setSurvey] = useState<SiteSurvey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [products, setProducts] = useState<ProductTypeRow[]>([]);
  const [role, setRole] = useState<UserRole | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    setRole(getCurrentRole());
    void listProductTypes()
      .then((rows) => !cancelled && setProducts(rows))
      .catch(() => undefined);
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

  const onDelete = async () => {
    if (!survey) {
      return;
    }
    if (
      (await confirm({
        title: `Delete the survey for ${survey.projectName}?`,
        description: survey.projectId
          ? 'The sheet is removed for good. Its customer and project stay.'
          : 'The sheet is removed for good. Nothing else uses it.',
        confirmLabel: 'Delete',
        tone: 'danger',
      })) === null
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteSiteSurvey(survey.id);
      router.push('/surveys');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to delete the survey',
      );
      setDeleting(false);
    }
  };

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

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      {confirmDialog}
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          eyebrow="Sales"
          title={survey.projectName}
          backHref="/surveys"
          backLabel="Site surveys"
          actions={
            <>
              {survey.projectId ? (
                <>
                  <Link
                    href={`/customers/${survey.customerId}`}
                    className={btnSecondary}
                  >
                    Customer
                  </Link>
                  <Link
                    href={`/quotations/new?projectId=${survey.projectId}&surveyId=${survey.id}`}
                    className={btnPrimary}
                  >
                    New quotation
                  </Link>
                </>
              ) : canConvert(role) ? (
                <Link
                  href={`/surveys/${survey.id}/convert`}
                  className={btnPrimary}
                >
                  Convert to quotation
                </Link>
              ) : null}
              <Link
                href={`/surveys/${survey.id}/edit`}
                className={btnSecondary}
              >
                Edit
              </Link>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void onDelete()}
                className={btnDanger}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        />

        <main className="flex-1 bg-slate-50 p-4 sm:p-8">
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <dl className="max-w-2xl rounded-xl border border-slate-200 bg-white px-4 py-1">
            <Row label="Date">{surveyDay(survey.surveyDate)}</Row>
            <Row label="Project name">{survey.projectName}</Row>
            <Row label="Address">{dash(survey.address)}</Row>
            <Row label="Contact person">{dash(survey.contactName)}</Row>
            <Row label="Contact telephone">
              {survey.contactPhone ? (
                <a
                  href={`tel:${survey.contactPhone}`}
                  className="font-mono underline-offset-2 hover:underline"
                >
                  {survey.contactPhone}
                </a>
              ) : (
                '—'
              )}
            </Row>
            <Row label="Shaft width (mm)">{dash(survey.shaftWidthMm)}</Row>
            <Row label="Shaft depth (mm)">{dash(survey.shaftDepthMm)}</Row>
            <Row label="Floors">{dash(survey.floors)}</Row>
            <Row label="OH (mm)">{dash(survey.overheadMm)}</Row>
            <Row label="Machine room">{dash(survey.machineRoom)}</Row>
            <Row label="Units">{dash(survey.units)}</Row>
            <Row label="Product">
              {survey.productType
                ? (products.find((p) => p.code === survey.productType)?.name ??
                  survey.productType)
                : '—'}
            </Row>
            <Row label="Capacity (kg)">{dash(survey.capacityKg)}</Row>
            <Row label="Collected by">{dash(survey.surveyedByName)}</Row>
            <Row label="Submitted">{formatDateTime(survey.createdAt)}</Row>
            <Row label="Last changed">{formatDateTime(survey.updatedAt)}</Row>
          </dl>
        </main>
      </div>
    </div>
  );
}
