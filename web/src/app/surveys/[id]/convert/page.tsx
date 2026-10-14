'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { btnSecondary, fieldClass } from '@/components/form-styles';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  checkCustomerDuplicate,
  convertSiteSurvey,
  getAccessToken,
  getCurrentRole,
  getSiteSurvey,
  listCustomers,
  listProductTypes,
  optional,
  type Customer,
  type ProductTypeRow,
  type SimilarCustomer,
  type SiteSurvey,
} from '@/lib/api';

/**
 * A site survey enters the sales flow here: the customer it belongs to
 * (one already on file, or a new one from the sheet's contact), and the
 * project it opens. Then straight on to the quotation, pre-filled from the
 * sheet. The same steps as customer → project → quotation on the web, with
 * the typing already done.
 */

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

export default function ConvertSiteSurveyPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [survey, setSurvey] = useState<SiteSurvey | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [similar, setSimilar] = useState<SimilarCustomer[]>([]);
  const [products, setProducts] = useState<ProductTypeRow[]>([]);

  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('Addis Ababa');

  const [projectName, setProjectName] = useState('');
  const [productType, setProductType] = useState('');
  const [siteAddress, setSiteAddress] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    // Mirrors @Roles on POST /site-surveys/:id/convert; CEO and ADMIN bypass.
    const role = getCurrentRole();
    if (
      role !== 'GENERAL_MANAGER' &&
      role !== 'SALES_MANAGER' &&
      role !== 'CEO' &&
      role !== 'ADMIN'
    ) {
      router.replace(`/surveys/${id}`);
      return;
    }
    let cancelled = false;
    let redirecting = false;
    const load = async () => {
      try {
        const [record, customerPage, rows] = await Promise.all([
          getSiteSurvey(id),
          optional(listCustomers({ page: 1, pageSize: 100 })),
          listProductTypes().catch(() => [] as ProductTypeRow[]),
        ]);
        if (cancelled) return;
        // Already converted: nothing to do here but quote it.
        if (record.projectId) {
          redirecting = true;
          router.replace(
            `/quotations/new?projectId=${record.projectId}&surveyId=${record.id}`,
          );
          return;
        }
        setSurvey(record);
        setCustomers(customerPage.items);
        setProducts(rows);
        setCustomerName(record.contactName ?? record.projectName);
        setPhone(record.contactPhone ?? '');
        setProjectName(record.projectName);
        setSiteAddress((record.address ?? '').slice(0, 200));
        // A product retired since the survey falls back to the first one,
        // so what is submitted is what the select shows.
        setProductType(
          rows.some((p) => p.code === record.productType)
            ? record.productType!
            : (rows[0]?.code ?? ''),
        );
        setCustomerId(customerPage.items[0]?.id ?? '');
        // The contact may already be a customer: say so, and list them
        // first under "Already a customer". The check is fuzzy, so the
        // choice stays the manager's. No contact name, no check — the
        // project's name would match the wrong people.
        if (record.contactName) {
          const hits = await checkCustomerDuplicate({
            name: record.contactName,
            phone: record.contactPhone ?? undefined,
          }).catch(() => [] as SimilarCustomer[]);
          if (!cancelled && hits.length > 0) {
            setSimilar(hits);
            setCustomerId(hits[0].id);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof ApiError
              ? err.message
              : 'Failed to load this site survey',
          );
        }
      } finally {
        if (!cancelled && !redirecting) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [router, id]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!survey) return;
    setSubmitting(true);
    setError(null);
    try {
      const { projectId } = await convertSiteSurvey(survey.id, {
        ...(mode === 'existing'
          ? { customerId }
          : {
              customer: {
                name: customerName.trim(),
                phone: phone.trim(),
                city: city.trim() || undefined,
              },
            }),
        project: {
          name: projectName.trim(),
          productType: productType || undefined,
          siteAddressLine1: siteAddress.trim() || undefined,
          siteCity: city.trim() || undefined,
        },
      });
      router.push(
        `/quotations/new?projectId=${projectId}&surveyId=${survey.id}`,
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to convert the survey',
      );
      setSubmitting(false);
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
      <LoadMessage
        message={loadError ?? 'That site survey no longer exists.'}
      />
    );
  }

  // Look-alikes first, then everyone else, each once.
  const customerOptions = [
    ...similar.map((c) => ({ id: c.id, name: c.name, phone: c.phone })),
    ...customers.filter((c) => !similar.some((s) => s.id === c.id)),
  ];

  return (
    <FormPage
      eyebrow="Sales"
      title={`Convert ${survey.projectName}`}
      description="Opens the customer and the project from this survey, then the quotation with its measurements filled in."
      backHref={`/surveys/${survey.id}`}
      backLabel="Site survey"
      error={error}
      submitting={submitting}
      submitDisabled={mode === 'existing' && !customerId}
      submitLabel="Continue to quotation"
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection
        title="Customer"
        description={
          similar.length > 0
            ? `${similar.map((c) => c.name).join(', ')} ${similar.length === 1 ? 'looks' : 'look'} like this contact. If it is the same customer, choose "Already a customer".`
            : undefined
        }
      >
        <Field label="Customer is" htmlFor="mode-new" wide>
          <div className="flex gap-6 text-sm text-slate-800">
            <label className="flex items-center gap-2">
              <input
                id="mode-new"
                type="radio"
                name="mode"
                checked={mode === 'new'}
                onChange={() => setMode('new')}
              />
              New customer
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                checked={mode === 'existing'}
                disabled={customerOptions.length === 0}
                onChange={() => setMode('existing')}
              />
              Already a customer
            </label>
          </div>
        </Field>

        {mode === 'existing' ? (
          <Field label="Customer" htmlFor="customerId" wide>
            <select
              id="customerId"
              className={fieldClass}
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              {customerOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` · ${c.phone}` : ''}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <>
            <Field label="Name" htmlFor="customerName">
              <input
                id="customerName"
                className={fieldClass}
                required
                minLength={2}
                maxLength={200}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </Field>
            <Field
              label="Telephone"
              htmlFor="phone"
              hint={
                survey.contactPhone
                  ? undefined
                  : 'The survey has no telephone; a customer needs one.'
              }
            >
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                className={fieldClass}
                required
                placeholder="0911234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
          </>
        )}
      </FormSection>

      <FormSection title="Project">
        <Field label="Project name" htmlFor="projectName" wide>
          <input
            id="projectName"
            className={fieldClass}
            required
            minLength={2}
            maxLength={200}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />
        </Field>
        <Field
          label="Product"
          htmlFor="productType"
          hint="The quotation starts from this product's base price and formula."
        >
          <select
            id="productType"
            className={fieldClass}
            value={productType}
            onChange={(e) => setProductType(e.target.value)}
          >
            {products.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="City" htmlFor="city">
          <input
            id="city"
            className={fieldClass}
            maxLength={100}
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </Field>
        <Field label="Site address" htmlFor="siteAddress" wide>
          <input
            id="siteAddress"
            className={fieldClass}
            maxLength={200}
            value={siteAddress}
            onChange={(e) => setSiteAddress(e.target.value)}
          />
        </Field>
      </FormSection>
    </FormPage>
  );
}
