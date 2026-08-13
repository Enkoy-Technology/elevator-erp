'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

import { btnPrimary, btnSecondary, fieldClass, labelClass } from '@/components/form-styles';
import { Pagination } from '@/components/pagination';
import { SideDrawer } from '@/components/side-drawer';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  createEmployee,
  EMPLOYEE_ROLES,
  getAccessToken,
  listEmployees,
  updateEmployee,
  type Employee,
  type EmployeeRole,
} from '@/lib/api';

const PAGE_SIZE = 20;

const ROLE_LABELS: Record<EmployeeRole, string> = {
  CEO: 'CEO',
  SALES_MANAGER: 'Sales Manager',
  TECHNICAL_LEAD: 'Technical Lead',
  FIELD_ENGINEER: 'Field Engineer',
  FINANCE: 'Finance',
  WAREHOUSE_MANAGER: 'Warehouse Manager',
  DISPATCHER: 'Dispatcher',
  ADMIN: 'Admin',
};

export default function EmployeesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
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
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async (nextPage: number, q: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listEmployees({
        q,
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      setEmployees(result.items);
      setPage(result.page);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to load employees',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh(page, search);
  }, [router, refresh, page, search]);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const resetForm = () => {
    setEditId(null);
    setFullName('');
    setEmail('');
    setPhone('');
    setRole('SALES_MANAGER');
    setPassword('');
    setIsActive(true);
    setSmsConsentGiven(false);
    setInitialSmsConsentGiven(false);
    setSmsConsentAtDisplay(null);
    setSmsConsentRevokedAtDisplay(null);
    setFormError(null);
  };

  const openCreate = () => {
    resetForm();
    setDrawerOpen(true);
  };

  const openEdit = (employee: Employee) => {
    setEditId(employee.id);
    setFullName(employee.fullName);
    setEmail(employee.email);
    setPhone(employee.phone ?? '');
    setRole(employee.role);
    setPassword('');
    setIsActive(employee.isActive);
    // "Currently consented" is smsConsentAt set AND not (yet) revoked (I10)
    // — mirrors canSmsRecipient's own server-side predicate.
    const consented = employee.smsConsentAt !== null && employee.smsConsentRevokedAt === null;
    setSmsConsentGiven(consented);
    setInitialSmsConsentGiven(consented);
    setSmsConsentAtDisplay(employee.smsConsentAt);
    setSmsConsentRevokedAtDisplay(employee.smsConsentRevokedAt);
    setFormError(null);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setFormError(null);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (editId) {
        await updateEmployee(editId, {
          fullName,
          phone: phone || undefined,
          role,
          isActive,
          ...(password ? { password } : {}),
          // Omit unless the operator actually toggled it — this is a
          // regulatory consent record (ECA Directive 832/2021), not a
          // preference; an unrelated edit (e.g. a role change) must never
          // silently re-stamp smsConsentAt to "now".
          ...(smsConsentGiven !== initialSmsConsentGiven
            ? { smsConsentGiven }
            : {}),
        });
      } else {
        await createEmployee({
          fullName,
          email,
          phone: phone || undefined,
          role,
          password,
          // Matches CreateCustomerPayload: consent can be recorded at
          // creation, not only on a later edit (nit fix). Omit rather than
          // send false — there's nothing to revoke yet.
          smsConsentGiven: smsConsentGiven || undefined,
        });
      }
      closeDrawer();
      setPage(1);
      setSearch('');
      setSearchInput('');
      await refresh(1, '');
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Failed to save employee',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-8 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-semibold">Employees</h1>
              <p className="text-sm text-slate-500">
                Staff directory and role-based access
              </p>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className={btnPrimary}
            >
              Add employee
            </button>
          </div>
        </header>

        <main className="flex-1 bg-slate-50 p-8">
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <form
              onSubmit={onSearch}
              className="mb-4 flex flex-wrap items-end gap-3"
            >
              <div className="min-w-[220px] flex-1">
                <label className={labelClass} htmlFor="search">
                  Search
                </label>
                <input
                  id="search"
                  className={fieldClass}
                  placeholder="Name or email"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className={btnSecondary}
              >
                Search
              </button>
            </form>

            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : employees.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center">
                <p className="text-sm text-slate-500">No employees yet.</p>
                <button
                  type="button"
                  onClick={openCreate}
                  className="mt-3 text-sm font-semibold text-navy-800 hover:underline"
                >
                  Add your first employee
                </button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-4 font-semibold">Name</th>
                        <th className="py-2 pr-4 font-semibold">Email</th>
                        <th className="py-2 pr-4 font-semibold">Role</th>
                        <th className="py-2 pr-4 font-semibold">Status</th>
                        <th className="py-2 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((employee) => (
                        <tr
                          key={employee.id}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="py-3 pr-4 font-medium text-slate-900">
                            {employee.fullName}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {employee.email}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {ROLE_LABELS[employee.role] ?? employee.role}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={
                                employee.isActive
                                  ? 'text-emerald-700'
                                  : 'text-slate-400'
                              }
                            >
                              {employee.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="py-3">
                            <button
                              type="button"
                              onClick={() => openEdit(employee)}
                              className="text-sm font-semibold text-navy-800 hover:underline"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={total}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </>
            )}
          </section>
        </main>
      </div>

      <SideDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editId ? 'Edit employee' : 'Add employee'}
        description="Assign a role to control what they can access."
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeDrawer}
              className={`${btnSecondary} flex-1`}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="employee-form"
              disabled={submitting}
              className={`${btnPrimary} flex-1`}
            >
              {submitting ? 'Saving…' : editId ? 'Save changes' : 'Add employee'}
            </button>
          </div>
        }
      >
        <form
          id="employee-form"
          onSubmit={(e) => void onSubmit(e)}
          className="space-y-4"
        >
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}

          <div>
            <label className={labelClass} htmlFor="fullName">
              Full name
            </label>
            <input
              id="fullName"
              className={fieldClass}
              required
              minLength={2}
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className={fieldClass}
              required={!editId}
              disabled={!!editId}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="phone">
              Phone
            </label>
            <input
              id="phone"
              className={fieldClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="role">
              Role
            </label>
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
          </div>
          {!editId ? (
            <div>
              <label className={labelClass} htmlFor="password">
                Temporary password
              </label>
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
            </div>
          ) : (
            <>
              <div>
                <label className={labelClass} htmlFor="password">
                  New password
                </label>
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
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Active (can log in)
              </label>
            </>
          )}
          {/* Renders in both create and edit (nit fix) — matches the
              customer form, where consent can be recorded at creation
              instead of requiring a create-then-edit round trip. */}
          <div className="rounded-lg border border-slate-200 p-3">
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
                ? smsConsentAtDisplay
                  ? `Recorded ${new Date(smsConsentAtDisplay).toLocaleString()}`
                  : 'Will be recorded on save.'
                : smsConsentRevokedAtDisplay
                  ? `Revoked ${new Date(smsConsentRevokedAtDisplay).toLocaleString()}.`
                  : 'Not yet recorded. Required before this technician/staff member receives any SMS (ECA Directive 832/2021).'}
            </p>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
}
