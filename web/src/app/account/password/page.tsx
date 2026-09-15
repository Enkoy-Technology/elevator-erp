'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import {
  ApiError,
  changePassword,
  getAccessToken,
  getProfile,
} from '@/lib/api';

/**
 * The one screen every login has: replace your own password. A person
 * given a temporary password by an admin lands here on their next sign-in
 * and cannot leave until it is replaced (the sidebar enforces that).
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const [forced, setForced] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void getProfile()
      .then((profile) => setForced(profile.mustChangePassword))
      .catch(() => undefined);
  }, [router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await changePassword(currentPassword, newPassword);
      router.replace('/');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to change the password',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormPage
      eyebrow="Account"
      title="Change password"
      description={
        forced
          ? 'You signed in with a temporary password. Choose your own before going on.'
          : 'Choose a new password. You stay signed in here; every other device is signed out.'
      }
      backHref="/"
      backLabel="Dashboard"
      error={error}
      submitting={submitting}
      submitLabel="Change password"
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection title="Password">
        <Field
          label={forced ? 'Temporary password' : 'Current password'}
          htmlFor="currentPassword"
          wide
        >
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            className={fieldClass}
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>
        <Field
          label="New password"
          htmlFor="newPassword"
          hint="At least 8 characters."
        >
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            className={fieldClass}
            required
            minLength={8}
            maxLength={72}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
        <Field label="New password again" htmlFor="confirm">
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            className={fieldClass}
            required
            minLength={8}
            maxLength={72}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
      </FormSection>
    </FormPage>
  );
}
