export type AppLocale = 'en' | 'am';

export type MessageKey =
  | 'nav.dashboard'
  | 'nav.calculator'
  | 'nav.customers'
  | 'nav.projects'
  | 'nav.quotations'
  | 'nav.contracts'
  | 'nav.invoices'
  | 'nav.payments'
  | 'nav.receivables'
  | 'nav.employees'
  | 'nav.assets'
  | 'nav.notifications'
  | 'nav.maintenance'
  | 'nav.messages'
  | 'nav.settings'
  | 'nav.boilerplate'
  | 'nav.components'
  | 'nav.productTypes'
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
  | 'settings.watermarkUrl'
  | 'settings.watermarkUrlHelp'
  | 'settings.websiteUrl'
  | 'settings.address'
  | 'settings.email'
  | 'settings.phone'
  | 'settings.localeEn'
  | 'settings.localeAm'
  | 'settings.reminders'
  | 'settings.pricing'
  | 'settings.pricingFormula'
  | 'settings.pricingFormulaHelp'
  | 'settings.maintenanceReminderDays'
  | 'settings.maintenanceReminderDaysHelp'
  | 'settings.paymentReminderOffsetDays'
  | 'settings.paymentReminderOffsetDaysHelp'
  | 'settings.save'
  | 'settings.saving'
  | 'settings.saved'
  | 'settings.loadError'
  | 'settings.saveError'
  | 'settings.documentContent'
  | 'settings.documentContentHelp'
  | 'settings.boilerplateLink'
  | 'settings.componentsLink';

const en: Record<MessageKey, string> = {
  'nav.dashboard': 'Dashboard',
  'nav.calculator': 'Calculator',
  'nav.customers': 'Customers',
  'nav.projects': 'Projects',
  'nav.quotations': 'Quotations',
  'nav.contracts': 'Contracts',
  'nav.invoices': 'Invoices',
  'nav.payments': 'Payments',
  'nav.receivables': 'Receivables',
  'nav.employees': 'Employees',
  'nav.assets': 'Assets',
  'nav.notifications': 'Notifications',
  'nav.maintenance': 'Maintenance',
  'nav.messages': 'Messages',
  'nav.settings': 'Settings',
  'nav.boilerplate': 'Document text',
  'nav.components': 'Components & brands',
  'nav.productTypes': 'Products & prices',
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
  'settings.logoUrl': 'Logo',
  'settings.stampUrl': 'Company stamp',
  'settings.watermarkUrl': 'Watermark',
  'settings.watermarkUrlHelp':
    'A light version of the brand mark. Printed faintly behind the text of every page of every document.',
  'settings.websiteUrl': 'Website',
  'settings.address': 'Official address',
  'settings.email': 'Contact email',
  'settings.phone': 'Contact phone',
  'settings.localeEn': 'English',
  'settings.localeAm': 'አማርኛ',
  'settings.reminders': 'Reminders',
  'settings.pricing': 'Pricing',
  'settings.pricingFormula': 'List-price formula',
  'settings.pricingFormulaHelp':
    'Evaluated exactly, per quotation line, before margin and VAT, for every product that has no formula of its own. Names: Base price, N (stops), C (capacity in kg), rise (travel in m), refN and refC (the stops and kg the base price includes), perStop and perKg (the product’s rates). Use + − × ÷, brackets, and max(), min(), round(). Starter: Base price + (N - refN) * perStop + (C - refC) * perKg. Leave blank to go back to it.',
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
  'settings.documentContent': 'Document content',
  'settings.documentContentHelp':
    'The standing text and the component/brand appendix that print on every quotation and proforma. Edited here once instead of pasted into each document — which is how a proforma ends up saying one thing on page 2 and another on page 3.',
  'settings.boilerplateLink': 'Document boilerplate',
  'settings.componentsLink': 'Components & brands',
};

const am: Record<MessageKey, string> = {
  'nav.dashboard': 'ዳሽቦርድ',
  'nav.calculator': 'ካልኩሌተር',
  'nav.customers': 'ደንበኞች',
  'nav.projects': 'ፕሮጀክቶች',
  'nav.quotations': 'የዋጋ ማቅረቢያ',
  'nav.contracts': 'ውል',
  'nav.invoices': 'ደረሰኞች',
  'nav.payments': 'ክፍያዎች',
  'nav.receivables': 'ተቀባይ ሂሳቦች',
  'nav.employees': 'ሰራተኞች',
  'nav.assets': 'ንብረቶች',
  'nav.notifications': 'ማሳወቂያዎች',
  'nav.maintenance': 'ጥገና',
  'nav.messages': 'መልዕክቶች',
  'nav.settings': 'ቅንብሮች',
  'nav.boilerplate': 'የሰነድ ጽሑፍ',
  'nav.components': 'መለዋወጫዎች እና ብራንዶች',
  'nav.productTypes': 'ምርቶች እና ዋጋዎች',
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
  'settings.watermarkUrl': 'የውሃ ምልክት ምስል አድራሻ',
  'settings.watermarkUrlHelp': 'ቀላል የምርት ምልክት፣ በእያንዳንዱ ሰነድ ገጽ ጀርባ በደብዛዛ ይታተማል።',
  'settings.websiteUrl': 'ድረ-ገጽ',
  'settings.address': 'ኦፊሴላዊ አድራሻ',
  'settings.email': 'ኢሜይል',
  'settings.phone': 'ስልክ',
  'settings.localeEn': 'English',
  'settings.localeAm': 'አማርኛ',
  'settings.reminders': 'ማስታወሻዎች',
  'settings.pricing': 'የዋጋ አሰጣጥ',
  'settings.pricingFormula': 'የዝርዝር ዋጋ ቀመር',
  'settings.pricingFormulaHelp':
    'በእያንዳንዱ የዋጋ ማቅረቢያ መስመር ላይ ከትርፍ እና ከቫት በፊት በትክክል ይሰላል። ስሞች፦ Base price፣ N (ፎቆች)፣ C (የመሸከም አቅም በኪግ)፣ perStop፣ perKg።',
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
  'settings.documentContent': 'የሰነድ ይዘት',
  'settings.documentContentHelp':
    'በእያንዳንዱ የዋጋ ማቅረቢያና ፕሮፎርማ ላይ የሚታተመው ቋሚ ጽሑፍና የመለዋወጫ/ብራንድ ሠንጠረዥ። በየሰነዱ ከመቅዳት ይልቅ እዚህ አንድ ጊዜ ይስተካከላል።',
  'settings.boilerplateLink': 'የሰነድ ቋሚ ጽሑፍ',
  'settings.componentsLink': 'መለዋወጫዎች እና ብራንዶች',
};

const dictionaries: Record<AppLocale, Record<MessageKey, string>> = {
  en,
  am,
};

export const LOCALE_STORAGE_KEY = 'erp.locale';

export const translate = (locale: AppLocale, key: MessageKey): string =>
  dictionaries[locale][key] ?? dictionaries.en[key] ?? key;

export const isAppLocale = (
  value: string | null | undefined,
): value is AppLocale => value === 'en' || value === 'am';
