'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Field, FormPage, FormSection } from '@/components/form-page';
import { fieldClass } from '@/components/form-styles';
import {
  ApiError,
  createNotification,
  getAccessToken,
  listEmployees,
  NOTIFICATION_TYPES,
  optional,
  type Employee,
  type NotificationType,
} from '@/lib/api';

const TYPE_LABEL: Record<NotificationType, string> = {
  GENERAL: 'General',
  QUOTE: 'Quote',
  ASSIGNMENT: 'Assignment',
  MAINTENANCE: 'Maintenance',
};

export default function NewNotificationPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [userId, setUserId] = useState('');
  const [type, setType] = useState<NotificationType>('ASSIGNMENT');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkPath, setLinkPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void (async () => {
      const employeePage = await optional(listEmployees({ page: 1, pageSize: 100 }));
      setEmployees(employeePage.items);
      setUserId((prev) => prev || employeePage.items[0]?.id || '');
    })();
  }, [router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId) {
      setError('Add an employee first, then send a notice.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createNotification({
        userId,
        type,
        title,
        body: body || undefined,
        linkPath: linkPath || undefined,
      });
      router.push('/notifications');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send notice');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormPage
      eyebrow="Overview"
      title="Send notice"
      description="Ping a colleague — they will see it in their inbox."
      backHref="/notifications"
      backLabel="Notifications"
      error={error}
      submitting={submitting}
      submitLabel="Send"
      onSubmit={(event) => void onSubmit(event)}
    >
      <FormSection title="Recipient">
        <Field label="Recipient" htmlFor="userId">
          <select
            id="userId"
            className={fieldClass}
            required
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            {employees.length === 0 ? (
              <option value="">No employees yet</option>
            ) : (
              employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName} ({employee.role})
                </option>
              ))
            )}
          </select>
        </Field>
        <Field label="Type" htmlFor="type">
          <select
            id="type"
            className={fieldClass}
            value={type}
            onChange={(e) => setType(e.target.value as NotificationType)}
          >
            {NOTIFICATION_TYPES.map((value) => (
              <option key={value} value={value}>
                {TYPE_LABEL[value]}
              </option>
            ))}
          </select>
        </Field>
      </FormSection>

      <FormSection title="Notice">
        <Field label="Title" htmlFor="title" wide>
          <input
            id="title"
            className={fieldClass}
            required
            minLength={2}
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Message" htmlFor="body" wide>
          <textarea
            id="body"
            className={fieldClass}
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        <Field label="Link (optional)" htmlFor="linkPath" wide>
          <input
            id="linkPath"
            className={fieldClass}
            placeholder="/projects"
            value={linkPath}
            onChange={(e) => setLinkPath(e.target.value)}
          />
        </Field>
      </FormSection>
    </FormPage>
  );
}
