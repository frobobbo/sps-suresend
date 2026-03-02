'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { domains as domainsApi, reputation as repApi, type Domain, type ReputationCheck } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';

function Check({ pass, label }: { pass: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {pass
        ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
        : <XCircle size={16} className="text-red-400 shrink-0" />}
      <span className={pass ? 'text-slate-700' : 'text-slate-500'}>{label}</span>
    </div>
  );
}

function ScoreGauge({ score, status }: { score: number; status: string }) {
  const color = status === 'clean' ? '#10b981' : status === 'warning' ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white"
        style={{ background: color }}
      >
        {score}
      </div>
      <Badge
        className={
          status === 'clean'
            ? 'bg-emerald-100 text-emerald-700 border-0'
            : status === 'warning'
            ? 'bg-amber-100 text-amber-700 border-0'
            : 'bg-red-100 text-red-700 border-0'
        }
      >
        {status}
      </Badge>
    </div>
  );
}

export default function DomainDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [domain, setDomain] = useState<Domain | null>(null);
  const [checks, setChecks] = useState<ReputationCheck[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    domainsApi.get(id).then(setDomain);
    repApi.list(id).then(setChecks);
  }, [user, id]);

  async function handleRunCheck() {
    setRunning(true);
    try {
      const result = await repApi.runCheck(id);
      setChecks((prev) => [result, ...prev]);
    } finally {
      setRunning(false);
    }
  }

  if (isLoading || !user || !domain) return null;

  const latest = checks[0];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--sp-navy)]">{domain.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {domain.delegatedAccess?.length ?? 0} delegated users
          </p>
        </div>
        <Button onClick={handleRunCheck} disabled={running}>
          {running ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
          Run Check
        </Button>
      </div>

      {latest && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              Latest Check
              <span className="text-xs text-slate-400 font-normal">
                {new Date(latest.checkedAt).toLocaleString()}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-8 items-start">
              <ScoreGauge score={latest.score} status={latest.status} />
              <div className="flex-1 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Check pass={latest.details.mx.pass} label={`MX Records ${latest.details.mx.records.length > 0 ? `(${latest.details.mx.records[0]})` : ''}`} />
                  <Check pass={latest.details.spf.pass} label="SPF Record" />
                  <Check pass={latest.details.dmarc.pass} label="DMARC Record" />
                  <Check pass={latest.details.dkim.pass} label={`DKIM ${latest.details.dkim.selector ? `(${latest.details.dkim.selector})` : ''}`} />
                  <Check pass={latest.details.https.pass} label={`HTTPS ${latest.details.https.statusCode ? `(${latest.details.https.statusCode})` : ''}`} />
                </div>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Blacklist Status</p>
                  <div className="grid grid-cols-2 gap-1">
                    {latest.details.blacklists.map((bl) => (
                      bl.blocked ? (
                        <div key={bl.list} className="flex items-center gap-2 text-sm" title="Unable to verify — public DNS resolver blocked by this RBL">
                          <AlertCircle size={16} className="text-amber-400 shrink-0" />
                          <span className="text-slate-400">{bl.list} (unverifiable)</span>
                        </div>
                      ) : (
                        <Check key={bl.list} pass={!bl.listed} label={bl.list} />
                      )
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!latest && (
        <Card>
          <CardContent className="py-8 text-center text-slate-500">
            No checks run yet. Click <strong>Run Check</strong> to get started.
          </CardContent>
        </Card>
      )}

      {checks.length > 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Check History</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>MX</TableHead>
                  <TableHead>SPF</TableHead>
                  <TableHead>DMARC</TableHead>
                  <TableHead>HTTPS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm text-slate-500">
                      {new Date(c.checkedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-bold">{c.score}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          c.status === 'clean'
                            ? 'bg-emerald-100 text-emerald-700 border-0'
                            : c.status === 'warning'
                            ? 'bg-amber-100 text-amber-700 border-0'
                            : 'bg-red-100 text-red-700 border-0'
                        }
                      >
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{c.details.mx.pass ? '✓' : '✗'}</TableCell>
                    <TableCell>{c.details.spf.pass ? '✓' : '✗'}</TableCell>
                    <TableCell>{c.details.dmarc.pass ? '✓' : '✗'}</TableCell>
                    <TableCell>{c.details.https.pass ? '✓' : '✗'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
