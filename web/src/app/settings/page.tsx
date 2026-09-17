'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { btnSecondary, fieldClass, labelClass } from '@/components/form-styles';
import { useLocale } from '@/components/locale-provider';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  getAccessToken,
  getCurrentRole,
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

/** Up to ~1 MB, stored inline so the document renderer needs no file host. */
const MAX_IMAGE_BYTES = 1_000_000;

/**
 * A branding image: pick a file (stored as a data URI) or paste an https
 * URL, with a preview of what the documents will print.
 */
const ImageField = ({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  hint?: string;
}) => {
  const [problem, setProblem] = useState<string | null>(null);
  const pick = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setProblem('That image is over 1 MB. Use a smaller file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProblem(null);
      onChange(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.readAsDataURL(file);
  };
  return (
    <div>
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      <div className="flex items-start gap-3">
        {value ? (
          <img
            src={value}
            alt=""
            className="h-12 w-20 rounded border border-slate-200 bg-white object-contain p-1"
          />
        ) : (
          <div className="flex h-12 w-20 items-center justify-center rounded border border-dashed border-slate-300 text-[10px] text-slate-400">
            None
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <input
            id={id}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-2.5 file:py-1 file:text-xs file:font-medium"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <input
            className={`${fieldClass} font-mono text-[11px]`}
            value={value.startsWith('data:') ? '' : value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              value.startsWith('data:')
                ? 'Uploaded image'
                : 'or paste an https:// link'
            }
          />
          {value ? (
            <button
              type="button"
              onClick={() => onChange('')}
              className="text-xs text-red-700 hover:underline"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
      {problem ? (
        <p className="mt-1 text-xs text-red-700">{problem}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
};

export default function SettingsPage() {
  const router = useRouter();
  const { t, setLocale } = useLocale();
  const role = getCurrentRole();
  const canEdit = role === 'CEO' || role === 'ADMIN';
  const canOpen = canEdit || role === 'GENERAL_MANAGER';
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [name, setName] = useState('');
  const [slogan, setSlogan] = useState('');
  const [primaryColorHex, setPrimaryColorHex] = useState('#1B2A4A');
  const [secondaryColorHex, setSecondaryColorHex] = useState('#E8B54D');
  const [logoUrl, setLogoUrl] = useState('');
  const [stampUrl, setStampUrl] = useState('');
  const [watermarkUrl, setWatermarkUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [officialAddress, setOfficialAddress] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [defaultLocale, setDefaultLocale] = useState<AppLocale>('en');
  const [maintenanceReminderDays, setMaintenanceReminderDays] = useState(3);
  const [pricingFormula, setPricingFormula] = useState('');
  const [priceListVatPercent, setPriceListVatPercent] = useState('');
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
      setName(data.name);
      setSlogan(data.slogan ?? '');
      setPrimaryColorHex(data.primaryColorHex);
      setSecondaryColorHex(data.secondaryColorHex);
      setLogoUrl(data.logoUrl ?? '');
      setStampUrl(data.stampUrl ?? '');
      setWatermarkUrl(data.watermarkUrl ?? '');
      setWebsiteUrl(data.websiteUrl ?? '');
      setOfficialAddress(data.officialAddress ?? '');
      setContactEmail(data.contactEmail ?? '');
      setContactPhone(data.contactPhone ?? '');
      setDefaultLocale(data.defaultLocale);
      setLocale(data.defaultLocale);
      setMaintenanceReminderDays(data.maintenanceReminderDays);
      setPricingFormula(data.pricingFormula);
      setPriceListVatPercent(data.priceListVatPercent ?? '');
      setPaymentReminderOffsetDaysText(
        data.paymentReminderOffsetDays.join(', '),
      );
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
      setError(err instanceof ApiError ? err.message : t('settings.loadError'));
    } finally {
      setLoading(false);
    }
  }, [applySettings, t]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    if (!canOpen) {
      router.replace('/');
      return;
    }
    void refresh();
  }, [router, refresh, canOpen]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await updateSettings({
        name: name.trim(),
        slogan: slogan.trim() || null,
        primaryColorHex,
        secondaryColorHex,
        logoUrl: logoUrl || null,
        stampUrl: stampUrl || null,
        watermarkUrl: watermarkUrl || null,
        websiteUrl: websiteUrl.trim() || null,
        officialAddress: officialAddress || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        defaultLocale,
        maintenanceReminderDays,
        paymentReminderOffsetDays: parseOffsetDays(
          paymentReminderOffsetDaysText,
        ),
        // Blank means back to the starter formula.
        pricingFormula: pricingFormula.trim() || null,
        // Blank means the list is ex-VAT.
        priceListVatPercent: priceListVatPercent.trim() || null,
      });
      applySettings(data);
      setSuccess(t('settings.saved'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('settings.saveError'));
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

          {/* The two document-content screens live under this section but
              are their own routes: they are lists, not fields on this form.
              Sales managers reach them from the sidebar too — Settings
              itself is ADMIN-only, they are not. */}
          <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="font-display text-base font-semibold text-slate-900">
              {t('settings.documentContent')}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              {t('settings.documentContentHelp')}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/settings/boilerplate" className={btnSecondary}>
                {t('settings.boilerplateLink')}
              </Link>
              <Link href="/settings/components" className={btnSecondary}>
                {t('settings.componentsLink')}
              </Link>
            </div>
          </section>

          {loading || !settings ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <form
              onSubmit={(e) => void onSubmit(e)}
              className="mx-auto max-w-2xl space-y-8 rounded-2xl border border-slate-200 bg-white p-6"
            >
              {/* Every staff role may read the company settings; only the
                  CEO and admin may change them (PATCH /settings is ADMIN). */}
              <fieldset disabled={!canEdit} className="space-y-8">
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
                    <label className={labelClass} htmlFor="companyName">
                      {t('settings.companyName')}
                    </label>
                    <input
                      id="companyName"
                      className={fieldClass}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={200}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="slogan">
                      {t('settings.slogan')}
                    </label>
                    <input
                      id="slogan"
                      className={fieldClass}
                      value={slogan}
                      onChange={(e) => setSlogan(e.target.value)}
                      maxLength={200}
                      placeholder="Star of Elevation"
                    />
                  </div>
                  <ImageField
                    id="logoUrl"
                    label={t('settings.logoUrl')}
                    value={logoUrl}
                    onChange={setLogoUrl}
                  />
                  <ImageField
                    id="stampUrl"
                    label={t('settings.stampUrl')}
                    value={stampUrl}
                    onChange={setStampUrl}
                  />
                  <ImageField
                    id="watermarkUrl"
                    label={t('settings.watermarkUrl')}
                    value={watermarkUrl}
                    onChange={setWatermarkUrl}
                    hint={t('settings.watermarkUrlHelp')}
                  />
                  <div>
                    <label className={labelClass} htmlFor="websiteUrl">
                      {t('settings.websiteUrl')}
                    </label>
                    <input
                      id="websiteUrl"
                      className={fieldClass}
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      placeholder="www.shiningstar.et"
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
                      <label
                        className={labelClass}
                        htmlFor="maintenanceReminderDays"
                      >
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
                      <label
                        className={labelClass}
                        htmlFor="paymentReminderOffsetDays"
                      >
                        {t('settings.paymentReminderOffsetDays')}
                      </label>
                      <input
                        id="paymentReminderOffsetDays"
                        className={fieldClass}
                        placeholder="0, 7, 30"
                        value={paymentReminderOffsetDaysText}
                        onChange={(e) =>
                          setPaymentReminderOffsetDaysText(e.target.value)
                        }
                      />
                      <p className="mt-1 text-xs text-slate-400">
                        {t('settings.paymentReminderOffsetDaysHelp')}
                      </p>
                    </div>
                  </div>
                </section>

                <section className="space-y-4 border-t border-slate-100 pt-6">
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    {t('settings.pricing')}
                  </h2>
                  <div>
                    <label className={labelClass} htmlFor="pricingFormula">
                      {t('settings.pricingFormula')}
                    </label>
                    <input
                      id="pricingFormula"
                      className={`${fieldClass} font-mono`}
                      spellCheck={false}
                      maxLength={500}
                      placeholder="Base price + (N - 10) * perStop + (C - 630kg) * perKg"
                      value={pricingFormula}
                      onChange={(e) => setPricingFormula(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      {t('settings.pricingFormulaHelp')}
                    </p>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="priceListVatPercent">
                      {t('settings.priceListVatPercent')}
                    </label>
                    <input
                      id="priceListVatPercent"
                      className={`${fieldClass} max-w-[10rem]`}
                      inputMode="decimal"
                      placeholder="15"
                      value={priceListVatPercent}
                      onChange={(e) => setPriceListVatPercent(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      {t('settings.priceListVatPercentHelp')}
                    </p>
                  </div>
                </section>
              </fieldset>
              {canEdit ? (
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
                >
                  {submitting ? t('settings.saving') : t('settings.save')}
                </button>
              ) : (
                <p className="text-sm text-slate-500">
                  Read only. The CEO or an admin can change these settings.
                </p>
              )}
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
