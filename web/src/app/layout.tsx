import type { Metadata } from 'next';
import { Barlow, IBM_Plex_Sans } from 'next/font/google';

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

export const metadata: Metadata = {
  title: 'Elevator ERP',
  description:
    'Multi-tenant ERP for elevator & electromechanical companies',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${ibmPlexSans.variable} ${barlow.variable}`}>
      <body>{children}</body>
    </html>
  );
}
