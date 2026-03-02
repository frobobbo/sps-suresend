import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/hooks/use-auth';
import { Nav } from '@/components/nav';

export const metadata: Metadata = {
  title: 'StrategyPlus SureSend',
  description: 'Subscription platform for email, SMTP, DNS and website reputation monitoring.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <div className="flex min-h-screen">
            <Nav />
            <main className="flex-1 bg-[var(--sp-ice)]">{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
