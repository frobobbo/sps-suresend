'use client';

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
    <aside className="w-56 min-h-screen bg-white border-r border-slate-200 flex flex-col">
      <div className="p-5 border-b border-slate-200">
        <span className="font-bold text-[var(--sp-navy)] text-lg">SureSend</span>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {items.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}>
            <span
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                pathname.startsWith(href)
                  ? 'bg-[var(--sp-ice)] text-[var(--sp-blue)]'
                  : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              <Icon size={16} />
              {label}
            </span>
          </Link>
        ))}
      </nav>
      <div className="p-3 border-t border-slate-200">
        <div className="text-xs text-slate-500 px-3 mb-2 truncate">{user.email}</div>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-slate-600" onClick={logout}>
          <LogOut size={16} />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
