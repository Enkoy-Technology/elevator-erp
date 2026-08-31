'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  EMPLOYEE_ROLES,
  getAccessToken,
  listEmployees,
  updateEmployee,
  type Employee,
  type EmployeeRole,
} from '@/lib/api';
import { ROLE_LABELS } from '../../labels';

/**
 * There is no GET /employees/:id — the controller exposes list, create,
 * import and PATCH only. So the edit route walks the list to find its row.
 * ponytail: O(pages) scan at 100 rows a page; replace the whole function
 * with one fetch the day the controller grows a get-by-id.
 */
const findEmployee = async (id: string): Promise<Employee | null> => {
  let page = 1;
  for (;;) {
    const result = await listEmployees({ page, pageSize: 100 });
    const hit = result.items.find((employee) => employee.id === id);
    if (hit) {
      return hit;
    }
    if (page >= result.totalPages) {
      return null;
    }
    page += 1;
  }
};

export default function EditEmployeePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<EmployeeRole>('SALES_MANAGER');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [smsConsentGiven, setSmsConsentGiven] = useState(false);
  // What's actually on the record right now — the baseline the checkbox
  // started from, so onSubmit can tell "the operator toggled this" apart
  // from "unrelated edit, leave the consent timestamp alone" (see onSubmit).
  const [initialSmsConsentGiven, setInitialSmsConsentGiven] = useState(false);
  const [smsConsentAtDisplay, setSmsConsentAtDisplay] = useState<string | null>(null);
  const [smsConsentRevokedAtDisplay, setSmsConsentRevokedAtDisplay] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void (async () => {
      try {
        const employee = await findEmployee(id);
        if (!employee) {
          setLoadError(
            'No employee with that id is in the directory. It may have been removed.',
          );
          return;
        }
        setFullName(employee.fullName);
        setEmail(employee.email);
        setPhone(employee.phone ?? '');
        setRole(employee.role);
        setIsActive(employee.isActive);
        // "Currently consented" is smsConsentAt set AND not (yet) revoked
        // (I10) — mirrors canSmsRecipient's own server-side predicate.
        const consented =
          employee.smsConsentAt !== null && employee.smsConsentRevokedAt === null;
        setSmsConsentGiven(consented);
        setInitialSmsConsentGiven(consented);
        setSmsConsentAtDisplay(employee.smsConsentAt);
        setSmsConsentRevokedAtDisplay(employee.smsConsentRevokedAt);
        setLoaded(true);
      } catch (err) {
        setLoadError(
          err instanceof ApiError
            ? err.message
            : 'That employee could not be loaded.',
        );
      }
    })();
  }, [router, id]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await updateEmployee(id, {
        fullName,
        phone: phone || undefined,
        role,
        isActive,
        ...(password ? { password } : {}),
        // Omit unless the operator actually toggled it — this is a
        // regulatory consent record (ECA Directive 832/2021), not a
        // preference; an unrelated edit (e.g. a role change) must never
        // silently re-stamp smsConsentAt to "now".
        ...(smsConsentGiven !== initialSmsConsentGiven ? { smsConsentGiven } : {}),
      });
      router.push('/employees');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save employee');
    } finally {
      setSubmitting(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1 p-6 sm:p-8">
          {loadError ? (
            <p
              role="alert"
              className="max-w-2xl rounded-xl border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {loadError}{' '}
              <a
                href="/employees"
                className="font-semibold underline underline-offset-2"
              >
                Back to employees
              </a>
            </p>
          ) : (
            <p className="text-sm text-slate-500">Loading employee…</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <FormPage
      eyebrow="People"
      title="Edit employee"
      description="Assign a role to control what they can access."
      backHref="/employees"
      backLabel="Employees"
      error={error}
      submitting={submitting}
      submitLabel="Save changes"
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection title="Identity">
        <Field label="Full name" htmlFor="fullName" wide>
          <input
            id="fullName"
            className={fieldClass}
            required
            minLength={2}
            autoFocus
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </Field>

        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            className={fieldClass}
            disabled
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Phone" htmlFor="phone">
          <input
            id="phone"
            className={fieldClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="Access">
        <Field label="Role" htmlFor="role">
          <select
            id="role"
            className={fieldClass}
            value={role}
            onChange={(e) => setRole(e.target.value as EmployeeRole)}
          >
            {EMPLOYEE_ROLES.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="New password" htmlFor="password">
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className={fieldClass}
            minLength={8}
            placeholder="Leave blank to keep the current password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <Field label="Account" htmlFor="isActive" wide>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              id="isActive"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active (can log in)
          </label>
        </Field>
      </FormSection>

      <FormSection title="Notifications">
        <Field
          label="SMS consent"
          htmlFor="smsConsentGiven"
          wide
          hint={
            smsConsentGiven
              ? smsConsentAtDisplay
                ? `Recorded ${new Date(smsConsentAtDisplay).toLocaleString()}`
                : 'Will be recorded on save.'
              : smsConsentRevokedAtDisplay
                ? `Revoked ${new Date(smsConsentRevokedAtDisplay).toLocaleString()}.`
                : 'Not yet recorded. Required before this technician/staff member receives any SMS (ECA Directive 832/2021).'
          }
        >
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              id="smsConsentGiven"
              type="checkbox"
              checked={smsConsentGiven}
              onChange={(e) => setSmsConsentGiven(e.target.checked)}
            />
            Consented to SMS notifications
          </label>
        </Field>
      </FormSection>
    </FormPage>
  );
}
