'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { btnDanger, btnSecondary, fieldClass } from '@/components/form-styles';
import {
  ApiError,
  checkCustomerDuplicate,
  createCustomer,
  deleteCustomer,
  updateCustomer,
  type Customer,
  type CustomerType,
  type SimilarCustomer,
} from '@/lib/api';

/**
 * One form for both `/customers/new` and `/customers/[id]/edit` — the two
 * routes differ only in whether a record was loaded first, so they share
 * this rather than keeping two drifting copies of the same nine fields.
 */
export const CustomerForm = ({ customer }: { customer: Customer | null }) => {
  const router = useRouter();
  const editId = customer?.id ?? null;

  // "Currently consented" is smsConsentAt set AND not (yet) revoked (I10)
  // — mirrors canSmsRecipient's own server-side predicate.
  const consented =
    customer !== null &&
    customer.smsConsentAt !== null &&
    customer.smsConsentRevokedAt === null;

  const [name, setName] = useState(customer?.name ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [city, setCity] = useState(customer?.city ?? (customer ? '' : 'Addis Ababa'));
  const [customerType, setCustomerType] = useState<CustomerType>(
    customer?.customerType ?? 'COMMERCIAL',
  );
  const [smsConsentGiven, setSmsConsentGiven] = useState(consented);
  // What's actually on the record right now — the baseline the checkbox
  // started from, so onSubmit can tell "the operator toggled this" apart
  // from "unrelated edit, leave the consent timestamp alone".
  const initialSmsConsentGiven = consented;
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [similar, setSimilar] = useState<SimilarCustomer[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /**
   * Advisory look-alike lookup on blur. Never blocks the form — a failed
   * check just clears the warning. Create only: editing an existing
   * customer against itself isn't a duplicate.
   */
  const checkSimilar = async () => {
    if (editId || name.trim().length < 2) {
      setSimilar([]);
      return;
    }
    try {
      setSimilar(
        await checkCustomerDuplicate({ name, phone: phone || undefined }),
      );
    } catch {
      setSimilar([]);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name,
        email: email || undefined,
        phone: phone || undefined,
        city: city || undefined,
        customerType,
        // Omit unless the operator actually toggled it — this is a
        // regulatory consent record (ECA Directive 832/2021), not a
        // preference; an unrelated edit (e.g. fixing a typo in the phone
        // number) must never silently re-stamp smsConsentAt to "now".
        smsConsentGiven:
          smsConsentGiven !== initialSmsConsentGiven ? smsConsentGiven : undefined,
      };
      if (editId) {
        await updateCustomer(editId, payload);
      } else {
        await createCustomer(payload);
      }
      router.push('/customers');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `Failed to ${editId ? 'save' : 'create'} customer`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async () => {
    if (!editId) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteCustomer(editId);
      router.push('/customers');
    } catch (err) {
      // A 409 here is the server naming what still depends on this
      // customer — show it verbatim rather than a generic failure.
      setError(
        err instanceof ApiError ? err.message : 'Failed to delete customer',
      );
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <FormPage
      eyebrow="Sales"
      title={editId ? 'Edit customer' : 'New customer'}
      description={
        editId ? undefined : 'Look-alike customers are flagged as a warning.'
      }
      backHref="/customers"
      backLabel="Customers"
      error={error}
      submitting={submitting}
      submitLabel={
        editId
          ? 'Save changes'
          : similar.length > 0
            ? 'Create anyway'
            : 'Save customer'
      }
      onSubmit={(event) => void onSubmit(event)}
      secondaryAction={
        editId ? (
          confirmingDelete ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => void onDelete()}
                className={btnDanger}
              >
                {deleting ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmingDelete(false)}
                className={btnSecondary}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className={btnDanger}
            >
              Delete customer
            </button>
          )
        ) : undefined
      }
    >
      {similar.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Already in the system
          </p>
          <ul className="mt-2 space-y-1.5">
            {similar.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 text-sm text-amber-900"
              >
                <span className="truncate font-medium">{m.name}</span>
                <span className="shrink-0 text-xs text-amber-700">
                  {[m.phone, m.city].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-800">
            You can still save — this is only a heads-up.
          </p>
        </div>
      ) : null}

      <FormSection title="Identity">
        <Field label="Name" htmlFor="name" wide>
          <input
            id="name"
            className={fieldClass}
            required
            minLength={2}
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onBlur={() => void checkSimilar()}
          />
        </Field>
        <Field label="Type" htmlFor="type">
          <select
            id="type"
            className={fieldClass}
            value={customerType}
            onChange={(e) => setCustomerType(e.target.value as CustomerType)}
          >
            <option value="COMMERCIAL">Commercial</option>
            <option value="RESIDENTIAL">Residential</option>
            <option value="GOVERNMENT">Government</option>
          </select>
        </Field>
        <Field label="City" htmlFor="city">
          <input
            id="city"
            className={fieldClass}
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="Contact">
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            className={fieldClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <input
            id="phone"
            className={fieldClass}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setError(null);
            }}
            onBlur={() => void checkSimilar()}
          />
        </Field>
      </FormSection>

      <FormSection title="SMS consent">
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={smsConsentGiven}
              onChange={(e) => setSmsConsentGiven(e.target.checked)}
            />
            Consented to SMS notifications
          </label>
          <p className="mt-1 text-xs text-slate-400">
            {smsConsentGiven
              ? customer?.smsConsentAt
                ? `Recorded ${new Date(customer.smsConsentAt).toLocaleString()}`
                : 'Will be recorded on save.'
              : customer?.smsConsentRevokedAt
                ? `Revoked ${new Date(customer.smsConsentRevokedAt).toLocaleString()}.`
                : 'Not yet recorded. Required before this customer receives any SMS (ECA Directive 832/2021).'}
          </p>
        </div>
      </FormSection>
    </FormPage>
  );
};
