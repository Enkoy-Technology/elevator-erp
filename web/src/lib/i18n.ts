export type AppLocale = 'en' | 'am';

export type MessageKey =
  | 'nav.dashboard'
  | 'nav.calculator'
  | 'nav.customers'
  | 'nav.projects'
  | 'nav.employees'
  | 'nav.assets'
  | 'nav.notifications'
  | 'nav.maintenance'
  | 'nav.settings'
  | 'nav.collapse'
  | 'nav.expand'
  | 'nav.hide'
  | 'nav.show'
  | 'brand.subtitle'
  | 'settings.title'
  | 'settings.subtitle'
  | 'settings.branding'
  | 'settings.language'
  | 'settings.primaryColor'
  | 'settings.secondaryColor'
  | 'settings.logoUrl'
  | 'settings.stampUrl'
  | 'settings.address'
  | 'settings.email'
  | 'settings.phone'
  | 'settings.localeEn'
  | 'settings.localeAm'
  | 'settings.save'
  | 'settings.saving'
  | 'settings.saved'
  | 'settings.loadError'
  | 'settings.saveError';

const en: Record<MessageKey, string> = {
  'nav.dashboard': 'Dashboard',
  'nav.calculator': 'Calculator',
  'nav.customers': 'Customers',
  'nav.projects': 'Projects',
  'nav.employees': 'Employees',
  'nav.assets': 'Assets',
  'nav.notifications': 'Notifications',
  'nav.maintenance': 'Maintenance',
  'nav.settings': 'Settings',
  'nav.collapse': 'Collapse',
  'nav.expand': 'Expand sidebar',
  'nav.hide': 'Hide sidebar',
  'nav.show': 'Show sidebar',
  'brand.subtitle': 'Electromechanical',
  'settings.title': 'Settings',
  'settings.subtitle': 'Branding and language',
  'settings.branding': 'Document branding',
  'settings.language': 'Default language',
  'settings.primaryColor': 'Primary colour',
  'settings.secondaryColor': 'Secondary colour',
  'settings.logoUrl': 'Logo URL',
  'settings.stampUrl': 'Stamp URL',
  'settings.address': 'Official address',
  'settings.email': 'Contact email',
  'settings.phone': 'Contact phone',
  'settings.localeEn': 'English',
  'settings.localeAm': 'አማርኛ',
  'settings.save': 'Save settings',
  'settings.saving': 'Saving…',
  'settings.saved': 'Settings saved.',
  'settings.loadError': 'Failed to load settings',
  'settings.saveError': 'Failed to save settings',
};

const am: Record<MessageKey, string> = {
  'nav.dashboard': 'ዳሽቦርድ',
  'nav.calculator': 'ካልኩሌተር',
  'nav.customers': 'ደንበኞች',
  'nav.projects': 'ፕሮጀክቶች',
  'nav.employees': 'ሰራተኞች',
  'nav.assets': 'ንብረቶች',
  'nav.notifications': 'ማሳወቂያዎች',
  'nav.maintenance': 'ጥገና',
  'nav.settings': 'ቅንብሮች',
  'nav.collapse': 'ሰብስብ',
  'nav.expand': 'ሳይድባር አሳይ',
  'nav.hide': 'ሳይድባር ደብቅ',
  'nav.show': 'ሳይድባር አሳይ',
  'brand.subtitle': 'ኤሌክትሮሜካኒካል',
  'settings.title': 'ቅንብሮች',
  'settings.subtitle': 'ብራንዲንግ እና ቋንቋ',
  'settings.branding': 'የሰነድ ብራንዲንግ',
  'settings.language': 'ነባሪ ቋንቋ',
  'settings.primaryColor': 'ዋና ቀለም',
  'settings.secondaryColor': 'ሁለተኛ ቀለም',
  'settings.logoUrl': 'የሎጎ አድራሻ',
  'settings.stampUrl': 'የማህተም አድራሻ',
  'settings.address': 'ኦፊሴላዊ አድራሻ',
  'settings.email': 'ኢሜይል',
  'settings.phone': 'ስልክ',
  'settings.localeEn': 'English',
  'settings.localeAm': 'አማርኛ',
  'settings.save': 'አስቀምጥ',
  'settings.saving': 'በመቀመጥ ላይ…',
  'settings.saved': 'ቅንብሮች ተቀምጠዋል።',
  'settings.loadError': 'ቅንብሮችን መጫን አልተሳካም',
  'settings.saveError': 'ቅንብሮችን ማስቀመጥ አልተሳካም',
};

const dictionaries: Record<AppLocale, Record<MessageKey, string>> = {
  en,
  am,
};

export const LOCALE_STORAGE_KEY = 'erp.locale';

export const translate = (
  locale: AppLocale,
  key: MessageKey,
): string => dictionaries[locale][key] ?? dictionaries.en[key] ?? key;

export const isAppLocale = (value: string | null | undefined): value is AppLocale =>
  value === 'en' || value === 'am';
