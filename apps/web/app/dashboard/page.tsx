'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { domains as domainsApi, reputation as repApi, type Domain, type ReputationCheck } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  const [latestRep, setLatestRep] = useState<Record<string, ReputationCheck | undefined>>({});
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    domainsApi.list().then((list) => {
      setDomainList(list);
      setFetching(false);
      Promise.all(
        list.map((d) => repApi.list(d.id).then((checks) => [d.id, checks[0]] as const)),
      ).then((entries) =>
        setLatestRep(Object.fromEntries(entries.filter(([, c]) => c !== undefined))),
      );
    });
  }, [user]);

  if (isLoading || !user) return null;

  const repValues = Object.values(latestRep);
  const unverifiedCount = domainList.filter((d) => !d.verifiedAt).length;
  const counts = {
    clean: repValues.filter((c) => c?.status === 'clean').length,
    warning: repValues.filter((c) => c?.status === 'warning').length,
    critical: repValues.filter((c) => c?.status === 'critical').length,
    unchecked: domainList.length - repValues.length,
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-[var(--sp-navy)]">Dashboard</h1>

      {unverifiedCount > 0 && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <AlertDescription>
            {unverifiedCount} {unverifiedCount === 1 ? 'domain is' : 'domains are'} waiting for ownership verification. Scans are blocked until you publish the TXT record shown on each domain page.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Domains', value: domainList.length, icon: Globe, color: 'text-[var(--sp-blue)]' },
          { label: 'Clean', value: counts.clean, icon: ShieldCheck, color: 'text-emerald-600' },
          { label: 'Warning', value: counts.warning, icon: ShieldAlert, color: 'text-amber-600' },
          { label: 'Critical', value: counts.critical, icon: ShieldX, color: 'text-red-600' },
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
                  <div>
                    <Link
                      href={`/domains/${d.id}`}
                      className="font-medium text-[var(--sp-blue)] hover:underline"
                    >
                      {d.name}
                    </Link>
                    {!d.verifiedAt && (
                      <p className="mt-1 text-xs text-amber-700">Verification required before scans can run.</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={d.verifiedAt ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-amber-100 text-amber-700 border-0'}>
                      {d.verifiedAt ? 'Verified' : 'Verify'}
                    </Badge>
                    {latestRep[d.id] ? (
                      <Badge className={`border-0 ${statusColor(latestRep[d.id]!.status)}`}>
                        {latestRep[d.id]!.status}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-400">Unchecked</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
