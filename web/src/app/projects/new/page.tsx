'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import {
  ApiError,
  createProject,
  getAccessToken,
  listCustomers,
  listProductTypes,
  optional,
  type Customer,
  type ProductTypeRow,
} from '@/lib/api';

export default function NewProjectPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [name, setName] = useState('');
  const [siteCity, setSiteCity] = useState('Addis Ababa');
  const [products, setProducts] = useState<ProductTypeRow[]>([]);
  const [productType, setProductType] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    const load = async () => {
      const page = await optional(listCustomers({ page: 1, pageSize: 100 }));
      if (!cancelled) {
        setCustomers(page.items);
        // Arriving from a customer's page: that customer, not the first in the list.
        const preset =
          new URLSearchParams(window.location.search).get('customerId') ?? '';
        setCustomerId((prev) => prev || preset || page.items[0]?.id || '');
      }
    };
    void load();
    void listProductTypes()
      .then((rows) => {
        if (cancelled) return;
        setProducts(rows);
        setProductType((prev) => prev || rows[0]?.code || '');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!customerId) {
      setError('Create a customer first, then add a project.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createProject({
        customerId,
        name,
        productType: productType || undefined,
        siteCity: siteCity || undefined,
      });
      router.push(`/customers/${customerId}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to create project',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormPage
      eyebrow="Sales"
      title="New project"
      description="Starts at LEAD in the sales pipeline."
      backHref="/projects"
      backLabel="Project pipeline"
      error={error}
      submitting={submitting}
      submitLabel="Save lead"
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection title="Deal">
        <Field label="Customer" htmlFor="customer" wide>
          <select
            id="customer"
            className={fieldClass}
            required
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            {customers.length === 0 ? (
              <option value="">No customers yet</option>
            ) : (
              customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
        </Field>
        <Field label="Project name" htmlFor="pname" wide>
          <input
            id="pname"
            className={fieldClass}
            required
            minLength={2}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bole Twin Towers — Lift A"
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
        <Field label="Site city" htmlFor="city">
          <input
            id="city"
            className={fieldClass}
            value={siteCity}
            onChange={(e) => setSiteCity(e.target.value)}
          />
        </Field>
      </FormSection>
    </FormPage>
  );
}
