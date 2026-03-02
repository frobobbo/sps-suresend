import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/hooks/use-auth';
import { Nav } from '@/components/nav';

export const metadata: Metadata = {
  title: 'StrategyPlus SureSend',
  description: 'Subscription platform for email, SMTP, DNS and website reputation monitoring.',
  icons: { icon: '/favicon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <div className="flex min-h-screen">
            <Nav />
            <main className="flex-1" style={{ background: 'linear-gradient(145deg, #f5fbfe 0%, #eef8fd 100%)' }}>{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
