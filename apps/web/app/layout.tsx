import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'StrategyPlus SureSend',
  description: 'Subscription platform for email, SMTP, DNS and website reputation monitoring.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
