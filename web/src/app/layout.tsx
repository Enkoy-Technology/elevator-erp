import type { Metadata } from 'next';
import { Barlow, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

import { DemoBanner } from '@/components/demo-banner';
import { isDemoMode } from '@/components/demo-mode';
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
  // Build-time constant (see demo-mode.ts). Off, the tree below is byte for
  // byte what the on-prem build has always rendered.
  const demo = isDemoMode(process.env.NEXT_PUBLIC_DEMO_MODE);

  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${barlow.variable} ${ibmPlexMono.variable}`}
    >
      <body className={demo ? 'demo-shell' : undefined}>
        {demo ? (
          <>
            <DemoBanner />
            {/* The scroll container the `.demo-shell` rules in globals.css
                need: the bar stays put, the app scrolls under it, and every
                page's `min-h-screen` still means "the space I can see". */}
            <div className="demo-main">
              <LocaleProvider>{children}</LocaleProvider>
            </div>
          </>
        ) : (
          <LocaleProvider>{children}</LocaleProvider>
        )}
      </body>
    </html>
  );
}
