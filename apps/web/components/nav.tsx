'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BarChart3, Globe, LogOut, Users } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/domains', label: 'Domains', icon: Globe },
];

const ADMIN_ITEMS = [
  { href: '/users', label: 'Users', icon: Users },
];

export function Nav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  if (!user) return null;

  const items = user.role === 'admin' ? [...NAV_ITEMS, ...ADMIN_ITEMS] : NAV_ITEMS;

  return (
    <aside className="w-56 h-screen sticky top-0 flex-shrink-0 flex flex-col" style={{ background: 'var(--sp-navy)' }}>
      {/* Logo */}
      <div className="px-4 py-5 border-b" style={{ borderColor: 'oklch(0.18 0.025 228)' }}>
        <Image
          src="/logo.png"
          alt="SureSend"
          width={160}
          height={107}
          priority
          className="w-full h-auto"
        />
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-3 space-y-1">
        {items.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}>
            <span
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                pathname.startsWith(href)
                  ? 'text-white'
                  : 'text-slate-400 hover:text-white',
              )}
              style={
                pathname.startsWith(href)
                  ? { background: 'var(--sp-sky)', color: '#fff' }
                  : undefined
              }
            >
              <Icon size={16} />
              {label}
            </span>
          </Link>
        ))}
      </nav>

      {/* User / sign out */}
      <div className="p-3 border-t" style={{ borderColor: 'oklch(0.18 0.025 228)' }}>
        <div className="text-xs px-3 mb-2 truncate" style={{ color: 'oklch(0.55 0.03 213)' }}>
          {user.email}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-slate-400 hover:text-white hover:bg-white/10"
          onClick={logout}
        >
          <LogOut size={16} />
          Sign out
        </Button>
        <div className="text-right px-1 mt-2 text-[10px]" style={{ color: 'oklch(0.38 0.02 228)' }}>
          v1.3.3
        </div>
      </div>
    </aside>
  );
}
