"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Trash2 } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { btnPrimary } from "@/components/form-styles";
import { RowAction } from "@/components/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { Sidebar } from "@/components/sidebar";
import {
  ApiError,
  deleteProductType,
  getAccessToken,
  getCurrentRole,
  listProductTypes,
  type ProductTypeRow,
  type UserRole,
} from "@/lib/api";
import { formatEtb } from "@/lib/money";

/** Mirrors @Roles on the product-types write routes. */
const canEditProducts = (role: UserRole | null): boolean =>
  role === "SALES_MANAGER" ||
  role === "GENERAL_MANAGER" ||
  role === "CEO" ||
  role === "ADMIN";

export default function ProductTypesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ProductTypeRow[]>([]);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listProductTypes());
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load the products",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    setRole(getCurrentRole());
    void refresh();
  }, [router, refresh]);

  const canEdit = canEditProducts(role);

  const remove = async (row: ProductTypeRow) => {
    if (
      !window.confirm(
        `Retire "${row.name}"? Quotations that used it keep their prices.`,
      )
    ) {
      return;
    }
    try {
      await deleteProductType(row.id);
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to retire the product",
      );
    }
  };

  const columns: ColumnDef<ProductTypeRow, unknown>[] = [
    {
      accessorKey: "name",
      header: "Product",
      enableSorting: true,
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-medium text-slate-900">
            {row.original.name}
          </span>
          <span className="font-mono text-[11px] text-slate-500">
            {row.original.code}
          </span>
        </span>
      ),
    },
    {
      id: "base",
      header: "Base price",
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className="flex flex-col items-end">
          <span className="font-semibold text-slate-900">
            {formatEtb(row.original.basePriceEtb)}
          </span>
          <span className="text-[11px] text-slate-500">
            {row.original.refStops} stops ·{" "}
            {row.original.refCapacityKg.toLocaleString("en-ET")} kg
          </span>
        </span>
      ),
    },
    {
      id: "perStop",
      header: "Per extra stop",
      meta: { align: "right" },
      cell: ({ row }) =>
        Number(row.original.perStopEtb) === 0
          ? "—"
          : formatEtb(row.original.perStopEtb),
    },
    {
      id: "perKg",
      header: "Per extra kg",
      meta: { align: "right" },
      cell: ({ row }) =>
        Number(row.original.perKgEtb) === 0
          ? "—"
          : formatEtb(row.original.perKgEtb),
    },
    {
      id: "formula",
      header: "Formula",
      cell: ({ row }) =>
        row.original.formula ? (
          <span className="font-mono text-[11px] text-slate-700">
            {row.original.formula}
          </span>
        ) : (
          <span className="text-xs text-slate-400">Company formula</span>
        ),
    },
    {
      id: "geometry",
      header: "Lift geometry",
      cell: ({ row }) => (row.original.liftGeometry ? "Yes" : "No"),
    },
    ...(canEdit
      ? [
          {
            id: "actions",
            header: "",
            meta: { align: "right" },
            cell: ({ row }) => (
              <div className="flex items-center justify-end gap-0.5">
                <RowAction
                  icon={Pencil}
                  label={`Edit ${row.original.name}`}
                  onClick={() =>
                    router.push(
                      `/settings/product-types/${row.original.id}/edit`,
                    )
                  }
                />
                <RowAction
                  icon={Trash2}
                  tone="danger"
                  label={`Retire ${row.original.name}`}
                  onClick={() => void remove(row.original)}
                />
              </div>
            ),
          } satisfies ColumnDef<ProductTypeRow, unknown>,
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          eyebrow="Settings"
          title="Products & prices"
          description="What the company sells and what each starts at. The base price buys the base machine; the company formula under Settings adds the rate for every stop and kilogram above it, unless a product carries its own formula. Margin and VAT come after."
          actions={
            canEdit ? (
              <Link href="/settings/product-types/new" className={btnPrimary}>
                Add product
              </Link>
            ) : null
          }
        />
        <main className="flex-1 bg-slate-50 p-4 sm:p-8">
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(row) => row.id}
            loading={loading}
            caption="Products and prices"
            empty="No products yet. Add the first one to start quoting."
          />
        </main>
      </div>
    </div>
  );
}
