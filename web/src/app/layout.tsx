import type { Metadata } from 'next';
import { Barlow, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

import { LocaleProvider } from '@/components/locale-provider';

import './globals.css';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex',
  display: 'swap',
});

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-barlow',
  display: 'swap',
});

/** Dimension callouts and data readouts — tabular figures on technical drawings. */
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Shining Star Electromechanical — ERP',
  description:
    'Multi-tenant ERP for elevator & electromechanical companies',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${barlow.variable} ${ibmPlexMono.variable}`}
    >
      <body>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
