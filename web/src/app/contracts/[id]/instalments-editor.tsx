'use client';

import { useEffect, useState } from 'react';

import { btnGhost, btnSecondary, fieldClass, labelClass } from '@/components/form-styles';
import {
  ApiError,
  listContractInstalments,
  setContractInstalments,
  type ContractInstalment,
} from '@/lib/api';
import { formatEtb, isZeroEtb, subtractEtb, sumEtb } from '@/lib/money';

interface RowDraft {
  label: string;
  dueDate: string;
  amountEtb: string;
  /** Server-side state of a saved row; absent on a row typed in just now. */
  status?: ContractInstalment['status'];
}

const EMPTY_ROW: RowDraft = { label: '', dueDate: '', amountEtb: '0.00' };

const toDraft = (i: ContractInstalment): RowDraft => ({
  label: i.label,
  dueDate: i.dueDate ?? '',
  amountEtb: i.amountEtb,
  status: i.status,
});

/**
 * The payment schedule on a contract: numbered milestones with a due date
 * and an amount.
 *
 * Save is its own button, not the enclosing form's: the schedule is replaced
 * through its own endpoint (the whole list at once, because the rows are
 * numbered in agreed order and have to total the contract value as a set),
 * and it has its own rule about when that is allowed — DRAFT only. Once the
 * customer has signed, the rows render read-only, because the amounts are
 * something they hold a signed copy of.
 */
export const InstalmentsEditor = ({
  contractId,
  contractValueEtb,
  editable,
}: {
  contractId: string;
  contractValueEtb: string;
  /** True only while the contract is DRAFT — mirrors the API's own gate. */
  editable: boolean;
}) => {
  const [rows, setRows] = useState<RowDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setRows((await listContractInstalments(contractId)).map(toDraft));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load the schedule');
      } finally {
        setLoading(false);
      }
    })();
  }, [contractId]);

  const setField = (index: number, field: keyof RowDraft, value: string) => {
    setSaved(false);
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  };

  const total = sumEtb(rows.map((r) => (r.amountEtb.trim() ? r.amountEtb : '0')));
  const difference = subtractEtb(contractValueEtb, total);
  const balanced = rows.length === 0 || isZeroEtb(difference);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = rows
        .map((r) => ({
          label: r.label.trim(),
          dueDate: r.dueDate || undefined,
          amountEtb: r.amountEtb.trim(),
        }))
        .filter((r) => r.label.length > 0);
      setRows((await setContractInstalments(contractId, payload)).map(toDraft));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the schedule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className={labelClass}>Payment schedule</h2>
        {editable ? (
          <button
            type="button"
            onClick={() => {
              setSaved(false);
              setRows((prev) => [...prev, { ...EMPTY_ROW }]);
            }}
            className="text-xs font-semibold text-navy-800 hover:underline"
          >
            + Add instalment
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {editable
          ? 'The instalments must add up to the contract value. Amounts stop being editable once the contract is signed.'
          : 'The contract is signed — these are the amounts the customer agreed to, and they can no longer be changed here.'}
      </p>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="mt-4 space-y-2">
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">No instalments agreed yet.</p>
          ) : null}
          {rows.map((row, index) => (
            <div key={index} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-xs text-slate-400">{index + 1}</span>
                <input
                  className={fieldClass}
                  placeholder="Milestone, e.g. Advance on signing"
                  aria-label={`Instalment ${index + 1} milestone`}
                  disabled={!editable}
                  value={row.label}
                  onChange={(e) => setField(index, 'label', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="date"
                  className={fieldClass}
                  aria-label={`Instalment ${index + 1} due date`}
                  disabled={!editable}
                  value={row.dueDate}
                  onChange={(e) => setField(index, 'dueDate', e.target.value)}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={fieldClass}
                  placeholder="Amount (ETB)"
                  aria-label={`Instalment ${index + 1} amount`}
                  disabled={!editable}
                  value={row.amountEtb}
                  onChange={(e) => setField(index, 'amountEtb', e.target.value)}
                />
                {editable ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSaved(false);
                      setRows((prev) => prev.filter((_, i) => i !== index));
                    }}
                    className={`${btnGhost} justify-self-end px-2 text-xs`}
                  >
                    Remove
                  </button>
                ) : (
                  <span className="self-center justify-self-end font-mono text-[11px] uppercase tracking-wider text-slate-500">
                    {row.status === 'INVOICED' ? 'Invoiced' : (row.status ?? '')}
                  </span>
                )}
              </div>
            </div>
          ))}

          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Scheduled: <span className="font-semibold text-navy-800">{formatEtb(total)}</span>{' '}
            of {formatEtb(contractValueEtb)}
            {balanced ? null : (
              <>
                <br />
                <span className="text-xs text-red-700">
                  {formatEtb(difference)} unscheduled — the instalments must total the
                  contract value before this can be saved.
                </span>
              </>
            )}
          </p>

          {editable ? (
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                disabled={saving || !balanced}
                onClick={() => void save()}
                className={`${btnSecondary} disabled:opacity-40`}
              >
                {saving ? 'Saving…' : 'Save schedule'}
              </button>
              {saved ? <span className="text-xs text-slate-500">Schedule saved.</span> : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
};
