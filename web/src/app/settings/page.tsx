'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { fieldClass, labelClass } from '@/components/form-styles';
import { useLocale } from '@/components/locale-provider';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  getAccessToken,
  getSettings,
  updateSettings,
  type AppLocale,
  type TenantSettings,
} from '@/lib/api';

/** "0, 7, 30" -> [0, 7, 30] — non-numeric junk is dropped rather than
 * blocking the field entirely; the API's own validation is the final say
 * (surfaced through the existing error banner on submit). */
const parseOffsetDays = (text: string): number[] =>
  text
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((n) => Number.isInteger(n));

export default function SettingsPage() {
  const router = useRouter();
  const { t, setLocale } = useLocale();
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [primaryColorHex, setPrimaryColorHex] = useState('#1B2A4A');
  const [secondaryColorHex, setSecondaryColorHex] = useState('#E8B54D');
  const [logoUrl, setLogoUrl] = useState('');
  const [stampUrl, setStampUrl] = useState('');
  const [officialAddress, setOfficialAddress] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [defaultLocale, setDefaultLocale] = useState<AppLocale>('en');
  const [maintenanceReminderDays, setMaintenanceReminderDays] = useState(3);
  // Comma-separated in the UI (e.g. "0, 7, 30") — parsed to number[] on
  // submit; simplest control for a short, small-cardinality list (I7).
  const [paymentReminderOffsetDaysText, setPaymentReminderOffsetDaysText] =
    useState('0, 7, 30');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const applySettings = useCallback(
    (data: TenantSettings) => {
      setSettings(data);
      setPrimaryColorHex(data.primaryColorHex);
      setSecondaryColorHex(data.secondaryColorHex);
      setLogoUrl(data.logoUrl ?? '');
      setStampUrl(data.stampUrl ?? '');
      setOfficialAddress(data.officialAddress ?? '');
      setContactEmail(data.contactEmail ?? '');
      setContactPhone(data.contactPhone ?? '');
      setDefaultLocale(data.defaultLocale);
      setLocale(data.defaultLocale);
      setMaintenanceReminderDays(data.maintenanceReminderDays);
      setPaymentReminderOffsetDaysText(data.paymentReminderOffsetDays.join(', '));
    },
    [setLocale],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSettings();
      applySettings(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t('settings.loadError'),
      );
    } finally {
      setLoading(false);
    }
  }, [applySettings, t]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh();
  }, [router, refresh]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await updateSettings({
        primaryColorHex,
        secondaryColorHex,
        logoUrl: logoUrl || null,
        stampUrl: stampUrl || null,
        officialAddress: officialAddress || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        defaultLocale,
        maintenanceReminderDays,
        paymentReminderOffsetDays: parseOffsetDays(paymentReminderOffsetDaysText),
      });
      applySettings(data);
      setSuccess(t('settings.saved'));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t('settings.saveError'),
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
          <h1 className="font-display text-lg font-semibold">
            {t('settings.title')}
          </h1>
          <p className="text-sm text-slate-500">{t('settings.subtitle')}</p>
        </header>

        <main className="flex-1 bg-slate-50 p-8">
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {success}
            </p>
          ) : null}

          {loading || !settings ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <form
              onSubmit={(e) => void onSubmit(e)}
              className="mx-auto max-w-2xl space-y-8 rounded-2xl border border-slate-200 bg-white p-6"
            >
              <section className="space-y-4">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  {t('settings.branding')}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="primary">
                      {t('settings.primaryColor')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="primary"
                        type="color"
                        className="h-10 w-14 cursor-pointer rounded border border-slate-200 bg-white p-1"
                        value={primaryColorHex}
                        onChange={(e) => setPrimaryColorHex(e.target.value)}
                      />
                      <input
                        className={fieldClass}
                        value={primaryColorHex}
                        onChange={(e) => setPrimaryColorHex(e.target.value)}
                        pattern="^#[0-9A-Fa-f]{6}$"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="secondary">
                      {t('settings.secondaryColor')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="secondary"
                        type="color"
                        className="h-10 w-14 cursor-pointer rounded border border-slate-200 bg-white p-1"
                        value={secondaryColorHex}
                        onChange={(e) => setSecondaryColorHex(e.target.value)}
                      />
                      <input
                        className={fieldClass}
                        value={secondaryColorHex}
                        onChange={(e) => setSecondaryColorHex(e.target.value)}
                        pattern="^#[0-9A-Fa-f]{6}$"
                        required
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className={labelClass} htmlFor="logoUrl">
                    {t('settings.logoUrl')}
                  </label>
                  <input
                    id="logoUrl"
                    className={fieldClass}
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="stampUrl">
                    {t('settings.stampUrl')}
                  </label>
                  <input
                    id="stampUrl"
                    className={fieldClass}
                    value={stampUrl}
                    onChange={(e) => setStampUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="address">
                    {t('settings.address')}
                  </label>
                  <textarea
                    id="address"
                    className={fieldClass}
                    rows={2}
                    value={officialAddress}
                    onChange={(e) => setOfficialAddress(e.target.value)}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="email">
                      {t('settings.email')}
                    </label>
                    <input
                      id="email"
                      type="email"
                      className={fieldClass}
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="phone">
                      {t('settings.phone')}
                    </label>
                    <input
                      id="phone"
                      className={fieldClass}
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-3 border-t border-slate-100 pt-6">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  {t('settings.language')}
                </h2>
                <div className="flex flex-wrap gap-3">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <input
                      type="radio"
                      name="locale"
                      checked={defaultLocale === 'en'}
                      onChange={() => setDefaultLocale('en')}
                    />
                    {t('settings.localeEn')}
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <input
                      type="radio"
                      name="locale"
                      checked={defaultLocale === 'am'}
                      onChange={() => setDefaultLocale('am')}
                    />
                    {t('settings.localeAm')}
                  </label>
                </div>
              </section>

              <section className="space-y-4 border-t border-slate-100 pt-6">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  {t('settings.reminders')}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="maintenanceReminderDays">
                      {t('settings.maintenanceReminderDays')}
                    </label>
                    <input
                      id="maintenanceReminderDays"
                      type="number"
                      min={0}
                      max={90}
                      className={fieldClass}
                      value={maintenanceReminderDays}
                      onChange={(e) =>
                        setMaintenanceReminderDays(Number(e.target.value))
                      }
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      {t('settings.maintenanceReminderDaysHelp')}
                    </p>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="paymentReminderOffsetDays">
                      {t('settings.paymentReminderOffsetDays')}
                    </label>
                    <input
                      id="paymentReminderOffsetDays"
                      className={fieldClass}
                      placeholder="0, 7, 30"
                      value={paymentReminderOffsetDaysText}
                      onChange={(e) => setPaymentReminderOffsetDaysText(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      {t('settings.paymentReminderOffsetDaysHelp')}
                    </p>
                  </div>
                </div>
              </section>

              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
              >
                {submitting ? t('settings.saving') : t('settings.save')}
              </button>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
