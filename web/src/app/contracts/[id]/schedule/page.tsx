'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import { btnSecondary } from '@/components/form-styles';
import {
  ApiError,
  apiFetch,
  downloadPaymentSchedule,
  getAccessToken,
  getCurrentRole,
} from '@/lib/api';

import { InstalmentsEditor } from '../instalments-editor';

/**
 * Only the fields this screen renders. Declared locally rather than in
 * lib/api.ts: the contracts module owns the shared `Contract` type, and this
 * page needs four of its columns to decide what to draw.
 */
interface ContractHeader {
  id: string;
  contractNumber: string;
  status: 'DRAFT' | 'SIGNED' | 'COMPLETED' | 'CANCELLED';
  contractValueEtb: string;
}

const canEditSchedule = (role: string | null): boolean =>
  role === 'SALES_MANAGER' || role === 'CEO' || role === 'ADMIN';

export default function ContractSchedulePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const contractId = params.id;
  const [contract, setContract] = useState<ContractHeader | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void (async () => {
      try {
        setContract(await apiFetch<ContractHeader>(`/contracts/${contractId}`));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load the contract');
      }
    })();
  }, [contractId, router]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <PageHeader
          eyebrow="Contracts"
          title={
            contract ? `Payment schedule — ${contract.contractNumber}` : 'Payment schedule'
          }
          description="What the customer has agreed to pay, and when. An instalment is a plan; the invoice is raised separately when the milestone is actually reached."
          actions={
            <>
              <Link href="/contracts" className={btnSecondary}>
                Back to contracts
              </Link>
              {contract ? (
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() =>
                    void downloadPaymentSchedule(contractId, contract.contractNumber)
                  }
                >
                  Download PDF
                </button>
              ) : null}
            </>
          }
        />
        <main className="px-4 py-6 sm:px-8">
          {error ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
          {contract ? (
            <InstalmentsEditor
              contractId={contract.id}
              contractValueEtb={contract.contractValueEtb}
              editable={contract.status === 'DRAFT' && canEditSchedule(getCurrentRole())}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}
