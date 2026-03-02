'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { domains as domainsApi, reputation as repApi, type Domain, type ReputationCheck } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw, XCircle } from 'lucide-react';

// Documentation links for each check
const DOCS: Record<string, string> = {
  mx: 'https://www.cloudflare.com/learning/dns/dns-records/dns-mx-record/',
  spf: 'https://www.cloudflare.com/learning/email-security/dmarc-dkim-spf/',
  dmarc: 'https://dmarc.org/overview/',
  dkim: 'https://www.cloudflare.com/learning/dns/dns-records/dns-dkim-record/',
  https: 'https://web.dev/articles/why-https-matters',
  httpsRedirect: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Redirections',
  ssl: 'https://www.ssl.com/article/what-is-an-ssl-tls-certificate/',
  hsts: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security',
  xContentType: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options',
  xFrame: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options',
  mtaSts: 'https://datatracker.ietf.org/doc/html/rfc8461',
  tlsRpt: 'https://datatracker.ietf.org/doc/html/rfc8460',
  bimi: 'https://bimigroup.org/',
  caa: 'https://www.cloudflare.com/learning/ssl/what-is-a-caa-record/',
  ns: 'https://www.cloudflare.com/learning/dns/glossary/dns-nameserver/',
  ptr: 'https://www.cloudflare.com/learning/dns/dns-records/dns-ptr-record/',
  rbl: 'https://www.spamhaus.org/zen/',
  dbl: 'https://www.spamhaus.org/dbl/',
};

type CheckState = 'pass' | 'fail' | 'warn';

function Check({
  state,
  label,
  href,
}: {
  state: CheckState;
  label: string;
  href?: string;
}) {
  const icon =
    state === 'pass' ? (
      <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
    ) : state === 'warn' ? (
      <AlertCircle size={15} className="text-amber-400 shrink-0" />
    ) : (
      <XCircle size={15} className="text-red-400 shrink-0" />
    );

  const textClass =
    state === 'pass' ? 'text-slate-700' : state === 'warn' ? 'text-amber-700' : 'text-slate-500';

  return (
    <div className="flex items-center gap-2 text-sm">
      {icon}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-1 hover:underline underline-offset-2 ${textClass}`}
        >
          {label}
          <ExternalLink size={11} className="shrink-0 opacity-50" />
        </a>
      ) : (
        <span className={textClass}>{label}</span>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ScoreGauge({ score, status }: { score: number; status: string }) {
  const color = status === 'clean' ? '#10b981' : status === 'warning' ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[80px]">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow"
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

function spfLabel(spf: ReputationCheck['details']['spf']): string {
  if (!spf.pass) return 'SPF Record';
  const policyLabel: Record<string, string> = {
    hard_fail: '-all (strict)',
    soft_fail: '~all (soft fail)',
    pass_all: '+all (unsafe)',
    permissive: 'no all mechanism',
  };
  return `SPF — ${spf.policy ? policyLabel[spf.policy] ?? spf.policy : 'found'}`;
}

function spfState(spf: ReputationCheck['details']['spf']): CheckState {
  if (!spf.pass) return 'fail';
  if (spf.policy === 'soft_fail' || spf.policy === 'permissive' || spf.policy === 'pass_all') return 'warn';
  return 'pass';
}

function dmarcLabel(dmarc: ReputationCheck['details']['dmarc']): string {
  if (!dmarc.pass) return 'DMARC Record';
  const parts: string[] = [];
  if (dmarc.policy) parts.push(`p=${dmarc.policy}`);
  if (dmarc.hasRua === false) parts.push('no rua');
  return `DMARC${parts.length ? ` — ${parts.join(', ')}` : ''}`;
}

function dmarcState(dmarc: ReputationCheck['details']['dmarc']): CheckState {
  if (!dmarc.pass) return 'fail';
  if (dmarc.policy === 'none') return 'warn';
  if (dmarc.policy === 'quarantine' || dmarc.hasRua === false) return 'warn';
  return 'pass';
}

function sslLabel(ssl: NonNullable<ReputationCheck['details']['ssl']>): string {
  if (!ssl.pass) return 'SSL Certificate (expired or invalid)';
  if (ssl.daysUntilExpiry === null) return 'SSL Certificate';
  if (ssl.daysUntilExpiry < 14) return `SSL Certificate (expires in ${ssl.daysUntilExpiry}d — renew now)`;
  if (ssl.daysUntilExpiry < 30) return `SSL Certificate (expires in ${ssl.daysUntilExpiry}d)`;
  return `SSL Certificate (${ssl.daysUntilExpiry}d remaining)`;
}

function sslState(ssl: NonNullable<ReputationCheck['details']['ssl']>): CheckState {
  if (!ssl.pass) return 'fail';
  if (ssl.daysUntilExpiry !== null && ssl.daysUntilExpiry < 30) return 'warn';
  return 'pass';
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
  const d = latest?.details;

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
          {running ? (
            <Loader2 size={16} className="mr-2 animate-spin" />
          ) : (
            <RefreshCw size={16} className="mr-2" />
          )}
          Run Check
        </Button>
      </div>

      {latest && d && (
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

              <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-5">
                {/* Email Authentication */}
                <Section title="Email Authentication">
                  <Check
                    state={d.mx.pass ? 'pass' : 'fail'}
                    label={`MX Records${d.mx.records[0] ? ` (${d.mx.records[0]})` : ''}`}
                    href={DOCS.mx}
                  />
                  <Check state={spfState(d.spf)} label={spfLabel(d.spf)} href={DOCS.spf} />
                  <Check state={dmarcState(d.dmarc)} label={dmarcLabel(d.dmarc)} href={DOCS.dmarc} />
                  <Check
                    state={d.dkim.pass ? 'pass' : 'fail'}
                    label={`DKIM${d.dkim.selector ? ` (${d.dkim.selector})` : ''}`}
                    href={DOCS.dkim}
                  />
                </Section>

                {/* Web Security */}
                <Section title="Web Security">
                  <Check
                    state={d.https.pass ? 'pass' : 'fail'}
                    label={`HTTPS${d.https.statusCode ? ` (${d.https.statusCode})` : ''}`}
                    href={DOCS.https}
                  />
                  {d.httpsRedirect && (
                    <Check
                      state={d.httpsRedirect.pass ? 'pass' : 'fail'}
                      label="HTTP→HTTPS Redirect"
                      href={DOCS.httpsRedirect}
                    />
                  )}
                  {d.ssl && (
                    <Check state={sslState(d.ssl)} label={sslLabel(d.ssl)} href={DOCS.ssl} />
                  )}
                  {d.securityHeaders && (
                    <>
                      <Check
                        state={d.securityHeaders.hsts ? 'pass' : 'fail'}
                        label="HSTS"
                        href={DOCS.hsts}
                      />
                      <Check
                        state={d.securityHeaders.xContentTypeOptions ? 'pass' : 'fail'}
                        label="X-Content-Type-Options"
                        href={DOCS.xContentType}
                      />
                      <Check
                        state={d.securityHeaders.xFrameOptions ? 'pass' : 'fail'}
                        label="X-Frame-Options"
                        href={DOCS.xFrame}
                      />
                    </>
                  )}
                </Section>

                {/* Email Transport Security */}
                <Section title="Email Transport Security">
                  {d.mtaSts && (
                    <Check
                      state={d.mtaSts.pass ? 'pass' : 'fail'}
                      label={`MTA-STS${d.mtaSts.policy ? ` (${d.mtaSts.policy})` : ''}`}
                      href={DOCS.mtaSts}
                    />
                  )}
                  {d.tlsRpt && (
                    <Check
                      state={d.tlsRpt.pass ? 'pass' : 'fail'}
                      label="TLS Reporting (TLS-RPT)"
                      href={DOCS.tlsRpt}
                    />
                  )}
                  {d.bimi && (
                    <Check
                      state={d.bimi.pass ? 'pass' : 'fail'}
                      label="BIMI (Brand Logo in Email)"
                      href={DOCS.bimi}
                    />
                  )}
                  {!d.mtaSts && !d.tlsRpt && !d.bimi && (
                    <span className="text-xs text-slate-400 italic">Not checked</span>
                  )}
                </Section>

                {/* DNS Health */}
                <Section title="DNS Health">
                  {d.nsCount && (
                    <Check
                      state={d.nsCount.pass ? 'pass' : 'fail'}
                      label={`Nameservers (${d.nsCount.count} found, need ≥2)`}
                      href={DOCS.ns}
                    />
                  )}
                  {d.caa && (
                    <Check
                      state={d.caa.pass ? 'pass' : 'fail'}
                      label={`CAA Records${d.caa.records[0] ? ` (${d.caa.records[0]})` : ''}`}
                      href={DOCS.caa}
                    />
                  )}
                  {d.ptr && (
                    <Check
                      state={d.ptr.pass ? 'pass' : 'fail'}
                      label={`PTR / rDNS${d.ptr.hostname ? ` (${d.ptr.hostname})` : ''}`}
                      href={DOCS.ptr}
                    />
                  )}
                  {!d.nsCount && !d.caa && !d.ptr && (
                    <span className="text-xs text-slate-400 italic">Not checked</span>
                  )}
                </Section>

                {/* Blacklists — full width */}
                <div className="col-span-2">
                  <Section title="IP Blacklists (RBL)">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
                      {d.blacklists.map((bl) =>
                        bl.blocked ? (
                          <div
                            key={bl.list}
                            className="flex items-center gap-2 text-sm"
                            title="Unable to verify — public DNS resolver blocked by this RBL"
                          >
                            <AlertCircle size={15} className="text-amber-400 shrink-0" />
                            <a
                              href={DOCS.rbl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-slate-400 hover:underline underline-offset-2"
                            >
                              {bl.list} (unverifiable)
                              <ExternalLink size={11} className="shrink-0 opacity-50" />
                            </a>
                          </div>
                        ) : (
                          <Check
                            key={bl.list}
                            state={bl.listed ? 'fail' : 'pass'}
                            label={bl.list}
                            href={DOCS.rbl}
                          />
                        ),
                      )}
                      {d.dbl && (
                        <Check
                          state={d.dbl.listed ? 'fail' : 'pass'}
                          label="Spamhaus DBL (domain blacklist)"
                          href={DOCS.dbl}
                        />
                      )}
                    </div>
                  </Section>
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
          <CardHeader>
            <CardTitle className="text-base">Check History</CardTitle>
          </CardHeader>
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
                  <TableHead>DKIM</TableHead>
                  <TableHead>HTTPS</TableHead>
                  <TableHead>SSL</TableHead>
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
                    <TableCell>{c.details.dkim.pass ? '✓' : '✗'}</TableCell>
                    <TableCell>{c.details.https.pass ? '✓' : '✗'}</TableCell>
                    <TableCell>
                      {c.details.ssl
                        ? c.details.ssl.pass
                          ? '✓'
                          : '✗'
                        : '—'}
                    </TableCell>
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
