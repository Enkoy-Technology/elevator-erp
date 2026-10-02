'use client';

import { useState } from 'react';
import Link from 'next/link';

import { Dialog } from '@/components/dialog';
import {
  btnPrimary,
  btnSecondary,
  fieldClass,
  labelClass,
} from '@/components/form-styles';
import { StatusPill } from '@/components/list-toolbar';
import {
  ApiError,
  simulateMaintenanceReminders,
  type ReminderTestOutcome,
  type ReminderTestResult,
} from '@/lib/api';

const OUTCOME: Record<
  ReminderTestOutcome,
  { label: string; tone: 'neutral' | 'good' | 'warn' | 'danger' }
> = {
  WOULD_SEND: { label: 'SMS will be sent', tone: 'neutral' },
  SENT: { label: 'SMS queued', tone: 'good' },
  NO_TECHNICIAN: { label: 'No technician assigned', tone: 'warn' },
  NO_PHONE: { label: 'Technician has no phone', tone: 'warn' },
  NO_CONSENT: { label: 'Technician has not agreed to SMS', tone: 'warn' },
  INVALID_PHONE: { label: 'Phone number is not valid', tone: 'danger' },
  FAILED: { label: 'Could not queue the SMS', tone: 'danger' },
};

/**
 * Test the maintenance reminders without waiting for a service date: pick a
 * date, see which contracts the daily run would remind about on that day,
 * then send a marked test message to each assigned technician.
 */
export const ReminderTestDialog = ({ onClose }: { onClose: () => void }) => {
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<ReminderTestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (send: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setResult(await simulateMaintenanceReminders(asOf, send));
    } catch (err) {
      // A send that failed on the way back may still have gone out; make
      // the next send a deliberate one, after a fresh preview.
      setResult(null);
      setError(err instanceof ApiError ? err.message : 'The test failed');
    } finally {
      setBusy(false);
    }
  };

  // Sending is only offered for the date just previewed, and only when
  // there is a technician to send to. One reminder per contract: a
  // technician on three due contracts gets three.
  const previewed = result !== null && result.asOf === asOf && !result.sent;
  const reminders = previewed
    ? result.reminders.filter((r) => r.technicianName !== null).length
    : 0;

  return (
    <Dialog
      open
      wide
      title="Test maintenance reminders"
      description="Pretend it is another date and see which technicians the daily reminder would message. Customers are never messaged by a test."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className={btnSecondary}
            disabled={busy || !asOf}
            onClick={() => void run(false)}
          >
            Preview
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={busy || reminders === 0}
            onClick={() => void run(true)}
          >
            {reminders > 0
              ? `Send ${reminders} test reminder${reminders === 1 ? '' : 's'}`
              : 'Send test'}
          </button>
        </>
      }
    >
      <label className={labelClass} htmlFor="reminderTestDate">
        Pretend today is
      </label>
      <input
        id="reminderTestDate"
        type="date"
        className={fieldClass}
        value={asOf}
        onChange={(e) => setAsOf(e.target.value)}
      />

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4">
          <p className="text-sm text-slate-600">
            {result.reminders.length === 0
              ? `No active contract has a service due between ${result.asOf} and ${result.windowDays} days after, so the reminder would send nothing that day.`
              : result.sent
                ? `Test sent for ${result.asOf}. Each technician also got an in-app notification.`
                : `On ${result.asOf} the reminder covers services due within ${result.windowDays} days:`}
          </p>
          {result.reminders.length > 0 ? (
            <ul className="mt-3 max-h-72 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200">
              {result.reminders.map((r) => (
                <li
                  key={r.contractId}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                >
                  <span>
                    <span className="font-medium text-slate-900">
                      {r.assetName}
                    </span>{' '}
                    <span className="text-slate-500">
                      · {r.customerName} · due {r.nextServiceAt} ·{' '}
                      {r.technicianName ?? 'unassigned'}
                    </span>
                  </span>
                  <StatusPill
                    label={OUTCOME[r.sms].label}
                    tone={OUTCOME[r.sms].tone}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {result.sent ? (
            <p className="mt-3 text-sm text-slate-600">
              Whether each SMS was delivered shows under{' '}
              <Link href="/messages" className="font-medium underline">
                Messages
              </Link>
              .
            </p>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
};
