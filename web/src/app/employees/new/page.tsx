'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import {
  ApiError,
  createEmployee,
  EMPLOYEE_ROLES,
  getAccessToken,
  type EmployeeRole,
} from '@/lib/api';
import { ROLE_LABELS } from '../labels';

export default function NewEmployeePage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<EmployeeRole>('SALES_MANAGER');
  const [password, setPassword] = useState('');
  const [smsConsentGiven, setSmsConsentGiven] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
    }
  }, [router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createEmployee({
        fullName,
        email,
        phone: phone || undefined,
        role,
        password,
        // Matches CreateCustomerPayload: consent can be recorded at
        // creation, not only on a later edit. Omit rather than send false —
        // there's nothing to revoke yet.
        smsConsentGiven: smsConsentGiven || undefined,
      });
      router.push('/employees');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save employee');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormPage
      eyebrow="People"
      title="Add employee"
      description="Assign a role to control what they can access."
      backHref="/employees"
      backLabel="Employees"
      error={error}
      submitting={submitting}
      submitLabel="Add employee"
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
            required
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

        <Field label="Temporary password" htmlFor="password">
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className={fieldClass}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="Notifications">
        <Field
          label="SMS consent"
          htmlFor="smsConsentGiven"
          wide
          hint={
            smsConsentGiven
              ? 'Will be recorded on save.'
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
