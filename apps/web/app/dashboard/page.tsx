'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { domains as domainsApi, type Domain } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Globe, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';

function statusColor(status: string) {
  if (status === 'clean') return 'bg-emerald-100 text-emerald-700';
  if (status === 'warning') return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [domainList, setDomainList] = useState<Domain[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    domainsApi.list()
      .then(setDomainList)
      .finally(() => setFetching(false));
  }, [user]);

  if (isLoading || !user) return null;

  const latestStatuses = domainList.flatMap((d) => []).concat(); // placeholder
  const counts = { clean: 0, warning: 0, blacklisted: 0, unchecked: domainList.length };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-[var(--sp-navy)]">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Domains', value: domainList.length, icon: Globe, color: 'text-[var(--sp-blue)]' },
          { label: 'Clean', value: counts.clean, icon: ShieldCheck, color: 'text-emerald-600' },
          { label: 'Warning', value: counts.warning, icon: ShieldAlert, color: 'text-amber-600' },
          { label: 'Blacklisted', value: counts.blacklisted, icon: ShieldX, color: 'text-red-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">{label}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <Icon size={20} className={color} />
              <span className="text-3xl font-bold text-[var(--sp-ink)]">{value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Domains</CardTitle>
        </CardHeader>
        <CardContent>
          {fetching ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : domainList.length === 0 ? (
            <p className="text-sm text-slate-500">
              No domains yet.{' '}
              <Link href="/domains" className="text-[var(--sp-blue)] hover:underline">
                Add one
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {domainList.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-3">
                  <Link
                    href={`/domains/${d.id}`}
                    className="font-medium text-[var(--sp-blue)] hover:underline"
                  >
                    {d.name}
                  </Link>
                  <Badge variant="outline" className="text-slate-500">
                    Not checked
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
