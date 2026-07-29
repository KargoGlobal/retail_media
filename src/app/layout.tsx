import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Retail Media — WMC Campaign Manager',
  description:
    'Standalone POC: agency/advertiser campaign management for Walmart Connect (WMC) Display Ads.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f6f8fb] text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
