export type AppLocale = 'en' | 'am';

export type MessageKey =
  | 'nav.dashboard'
  | 'nav.calculator'
  | 'nav.customers'
  | 'nav.projects'
  | 'nav.quotations'
  | 'nav.invoices'
  | 'nav.payments'
  | 'nav.receivables'
  | 'nav.employees'
  | 'nav.assets'
  | 'nav.notifications'
  | 'nav.maintenance'
  | 'nav.messages'
  | 'nav.settings'
  | 'nav.docs'
  | 'nav.collapse'
  | 'nav.expand'
  | 'nav.hide'
  | 'nav.show'
  | 'nav.signOut'
  | 'nav.group.overview'
  | 'nav.group.sales'
  | 'nav.group.finance'
  | 'nav.group.hr'
  | 'nav.group.admin'
  | 'nav.group.operations'

  | 'brand.subtitle'
  | 'settings.title'
  | 'settings.subtitle'
  | 'settings.branding'
  | 'settings.language'
  | 'settings.primaryColor'
  | 'settings.secondaryColor'
  | 'settings.companyName'
  | 'settings.slogan'
  | 'settings.logoUrl'
  | 'settings.stampUrl'
  | 'settings.address'
  | 'settings.email'
  | 'settings.phone'
  | 'settings.localeEn'
  | 'settings.localeAm'
  | 'settings.reminders'
  | 'settings.maintenanceReminderDays'
  | 'settings.maintenanceReminderDaysHelp'
  | 'settings.paymentReminderOffsetDays'
  | 'settings.paymentReminderOffsetDaysHelp'
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
  'nav.quotations': 'Quotations',
  'nav.invoices': 'Invoices',
  'nav.payments': 'Payments',
  'nav.receivables': 'Receivables',
  'nav.employees': 'Employees',
  'nav.assets': 'Assets',
  'nav.notifications': 'Notifications',
  'nav.maintenance': 'Maintenance',
  'nav.messages': 'Messages',
  'nav.settings': 'Settings',
  'nav.docs': 'Documentation',
  'nav.collapse': 'Collapse',
  'nav.expand': 'Expand sidebar',
  'nav.hide': 'Hide sidebar',
  'nav.show': 'Show sidebar',
  'nav.signOut': 'Sign out',
  'nav.group.overview': 'Overview',
  'nav.group.sales': 'Sales',
  'nav.group.finance': 'Finance',
  'nav.group.hr': 'People',
  'nav.group.admin': 'Administration',
  'nav.group.operations': 'Operations',
  'brand.subtitle': 'Electromechanical',
  'settings.title': 'Settings',
  'settings.subtitle': 'Branding and language',
  'settings.branding': 'Document branding',
  'settings.language': 'Default language',
  'settings.primaryColor': 'Primary colour',
  'settings.secondaryColor': 'Secondary colour',
  'settings.companyName': 'Company name',
  'settings.slogan': 'Slogan',
  'settings.logoUrl': 'Logo URL',
  'settings.stampUrl': 'Stamp URL',
  'settings.address': 'Official address',
  'settings.email': 'Contact email',
  'settings.phone': 'Contact phone',
  'settings.localeEn': 'English',
  'settings.localeAm': 'አማርኛ',
  'settings.reminders': 'Reminders',
  'settings.maintenanceReminderDays': 'Maintenance reminder window (days)',
  'settings.maintenanceReminderDaysHelp':
    'How many days ahead of a scheduled visit the reminder SMS goes out.',
  'settings.paymentReminderOffsetDays': 'Payment reminder days',
  'settings.paymentReminderOffsetDaysHelp':
    'Comma-separated days relative to the due date (0 = due date, 7 = a week after).',
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
  'nav.quotations': 'የዋጋ ማቅረቢያ',
  'nav.invoices': 'ደረሰኞች',
  'nav.payments': 'ክፍያዎች',
  'nav.receivables': 'ተቀባይ ሂሳቦች',
  'nav.employees': 'ሰራተኞች',
  'nav.assets': 'ንብረቶች',
  'nav.notifications': 'ማሳወቂያዎች',
  'nav.maintenance': 'ጥገና',
  'nav.messages': 'መልዕክቶች',
  'nav.settings': 'ቅንብሮች',
  'nav.docs': 'ሰነድ',
  'nav.collapse': 'ሰብስብ',
  'nav.expand': 'ሳይድባር አሳይ',
  'nav.hide': 'ሳይድባር ደብቅ',
  'nav.show': 'ሳይድባር አሳይ',
  'nav.signOut': 'ውጣ',
  'nav.group.overview': 'አጠቃላይ እይታ',
  'nav.group.sales': 'ሽያጭ',
  'nav.group.finance': 'ፋይናንስ',
  'nav.group.hr': 'ሰራተኞች',
  'nav.group.admin': 'አስተዳደር',
  'nav.group.operations': 'ኦፕሬሽን',
  'brand.subtitle': 'ኤሌክትሮሜካኒካል',
  'settings.title': 'ቅንብሮች',
  'settings.subtitle': 'ብራንዲንግ እና ቋንቋ',
  'settings.branding': 'የሰነድ ብራንዲንግ',
  'settings.language': 'ነባሪ ቋንቋ',
  'settings.primaryColor': 'ዋና ቀለም',
  'settings.secondaryColor': 'ሁለተኛ ቀለም',
  'settings.companyName': 'የድርጅት ስም',
  'settings.slogan': 'መፈክር',
  'settings.logoUrl': 'የሎጎ አድራሻ',
  'settings.stampUrl': 'የማህተም አድራሻ',
  'settings.address': 'ኦፊሴላዊ አድራሻ',
  'settings.email': 'ኢሜይል',
  'settings.phone': 'ስልክ',
  'settings.localeEn': 'English',
  'settings.localeAm': 'አማርኛ',
  'settings.reminders': 'ማስታወሻዎች',
  'settings.maintenanceReminderDays': 'የጥገና ማስታወሻ ጊዜ (ቀናት)',
  'settings.maintenanceReminderDaysHelp':
    'ከቀጠሮው ስንት ቀናት ቀደም ብሎ የማስታወሻ ኤስኤምኤስ እንደሚላክ።',
  'settings.paymentReminderOffsetDays': 'የክፍያ ማስታወሻ ቀናት',
  'settings.paymentReminderOffsetDaysHelp':
    'ከክፍያ ቀነ-ገደቡ አንጻር ያሉ ቀናት፣ በነጠላ ሰረዝ የተለያዩ (0 = የክፍያ ቀን፣ 7 = ከሳምንት በኋላ)።',
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
