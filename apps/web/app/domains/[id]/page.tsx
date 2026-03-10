'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { ApiError, domains as domainsApi, reputation as repApi, type Domain, type ReputationCheck, type ScanJob } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle, CheckCircle2, ExternalLink, HelpCircle,
  Link2, Link2Off, Loader2, RefreshCw, Wrench, XCircle,
} from 'lucide-react';

const DOCS: Record<string, string> = {
  mx: 'https://www.cloudflare.com/learning/dns/dns-records/dns-mx-record/',
  spf: 'https://www.cloudflare.com/learning/email-security/dmarc-dkim-spf/',
  spfLookups: 'https://www.rfc-editor.org/rfc/rfc7208#section-4.6.4',
  dmarc: 'https://dmarc.org/overview/',
  dkim: 'https://www.cloudflare.com/learning/dns/dns-records/dns-dkim-record/',
  https: 'https://web.dev/articles/why-https-matters',
  httpsRedirect: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Redirections',
  wwwRedirect: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Redirections',
  ssl: 'https://www.ssl.com/article/what-is-an-ssl-tls-certificate/',
  tlsVersion: 'https://www.ssl.com/article/tls-1-3/',
  hsts: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security',
  xContentType: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options',
  xFrame: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options',
  csp: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP',
  referrerPolicy: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy',
  permissionsPolicy: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy',
  mtaSts: 'https://datatracker.ietf.org/doc/html/rfc8461',
  tlsRpt: 'https://datatracker.ietf.org/doc/html/rfc8460',
  bimi: 'https://bimigroup.org/',
  caa: 'https://www.cloudflare.com/learning/ssl/what-is-a-caa-record/',
  ns: 'https://www.cloudflare.com/learning/dns/glossary/dns-nameserver/',
  ptr: 'https://www.cloudflare.com/learning/dns/dns-records/dns-ptr-record/',
  dnssec: 'https://www.cloudflare.com/dns/dnssec/how-dnssec-works/',
  domainExpiry: 'https://www.icann.org/resources/pages/register-domain-name-2017-06-20-en',
  rbl: 'https://www.spamhaus.org/zen/',
  dbl: 'https://www.spamhaus.org/dbl/',
  observatory: 'https://observatory.mozilla.org/',
  safeBrowsing: 'https://safebrowsing.google.com/',
};

function observatoryReportUrl(domain: string): string {
  return `https://observatory.mozilla.org/analyze/${encodeURIComponent(domain)}`;
}

type CheckState = 'pass' | 'fail' | 'warn';

const HELP: Record<string, Partial<Record<CheckState | 'blocked', string>>> = {
  mx: {
    pass: 'MX records are configured correctly. Your domain can receive email.',
    fail: 'No MX records found. Without these your domain cannot receive email, and senders may flag it as suspicious.',
  },
  spf: {
    pass: 'SPF record uses a strict policy (-all). Unauthorised servers that try to send mail from your domain will be rejected.',
    warn: 'SPF exists but uses a permissive policy (soft fail ~all, +all, or no "all" mechanism). Spoofed email may still pass some filters — consider tightening to -all.',
    fail: 'No SPF record found. Anyone can send email claiming to be from your domain and most mail servers will accept it.',
  },
  dmarc: {
    pass: 'DMARC is fully configured with a strong policy (reject or quarantine) and aggregate reporting enabled.',
    warn: 'DMARC exists but is not fully effective — the policy is too weak (p=none) or aggregate reports (rua=) are missing. Tighten the policy to quarantine or reject.',
    fail: 'No DMARC record found. Email spoofing from your domain goes undetected and unreported.',
  },
  dkim: {
    pass: 'DKIM signing is configured. Emails are cryptographically signed so recipients can verify they were not tampered with.',
    fail: 'No DKIM record found. Receiving servers cannot cryptographically verify that your emails are genuine.',
  },
  https: {
    pass: 'Your website is reachable over HTTPS.',
    fail: 'HTTPS is not reachable. Your website may be down or not configured for encrypted connections.',
  },
  httpsRedirect: {
    pass: 'HTTP traffic is correctly redirected to HTTPS. Visitors using plain http:// get a secure connection.',
    fail: 'HTTP requests are not redirected to HTTPS. Visitors accessing http:// get an unencrypted connection.',
  },
  ssl: {
    pass: 'SSL/TLS certificate is valid with plenty of time before it expires.',
    warn: 'SSL certificate is expiring within 30 days. Renew it soon to avoid visitors seeing a browser security warning.',
    fail: 'SSL certificate is invalid, self-signed, or has expired. Visitors will see a security warning and many will leave.',
  },
  hsts: {
    pass: 'HSTS header is set. Browsers remember to always use HTTPS for this domain, protecting against downgrade attacks.',
    fail: 'HSTS header is missing. Browsers may allow insecure HTTP connections even when HTTPS is available.',
  },
  xContentType: {
    pass: 'X-Content-Type-Options: nosniff is set. Browsers are prevented from guessing file types, blocking a class of injection attacks.',
    fail: 'X-Content-Type-Options header is missing. Browsers may "sniff" content types, which can enable content-injection attacks.',
  },
  xFrame: {
    pass: 'X-Frame-Options is set. Your site cannot be silently embedded in another page for clickjacking attacks.',
    fail: 'X-Frame-Options header is missing. Attackers could embed your site in an invisible iframe to trick users into clicking things.',
  },
  mtaSts: {
    pass: 'MTA-STS policy is published. Mail servers are required to use TLS (encryption) when delivering mail to your domain.',
    fail: 'MTA-STS is not fully enforced. The check may have found no `_mta-sts` TXT record, an unreachable policy file, or a policy mode other than `enforce`.',
  },
  tlsRpt: {
    pass: 'TLS-RPT is configured. You will receive reports if TLS delivery to your domain fails, so you can fix problems quickly.',
    fail: 'No TLS-RPT record found. You have no visibility into TLS delivery failures for your domain.',
  },
  bimi: {
    pass: 'BIMI is configured. Your brand logo may appear next to your emails in supporting clients (e.g. Gmail).',
    fail: 'No BIMI record found. Your logo won\'t display in email clients that support brand indicators.',
  },
  caa: {
    pass: 'CAA records are set. Only the certificate authorities you listed can issue SSL certificates for your domain.',
    fail: 'No CAA records found. Any certificate authority in the world could issue an SSL certificate for your domain.',
  },
  ns: {
    pass: 'Your domain has 2 or more nameservers. If one goes down, DNS resolution continues via the others.',
    fail: 'Fewer than 2 nameservers found. A single nameserver going offline would make your domain unreachable.',
  },
  ptr: {
    pass: 'Reverse DNS (PTR) is configured. The MX server IP resolves to a hostname, which many mail servers require before accepting email.',
    fail: 'No PTR record found for the MX server IP. Some mail servers reject email from IPs without reverse DNS configured.',
  },
  spfLookups: {
    pass: 'SPF lookup count is within the RFC limit of 10. All senders can resolve your SPF record correctly.',
    warn: 'SPF is approaching the 10-lookup limit (8–10 mechanisms). Adding more includes could push it over and cause SPF to fail for all senders.',
    fail: 'SPF has more than 10 DNS lookups. This causes a permerror and SPF hard-fails for every sender — effectively breaking email authentication.',
  },
  dmarcPct: {
    warn: 'DMARC pct= is less than 100. Only that percentage of messages are subject to the DMARC policy — the rest are treated as if no policy existed. Set pct=100 for full enforcement.',
  },
  csp: {
    pass: 'Content Security Policy is set. Browsers are told which sources are allowed to load scripts, styles, and other resources, blocking most XSS attacks.',
    fail: 'No Content-Security-Policy header found. Injected scripts can run freely, making your site vulnerable to cross-site scripting (XSS) attacks.',
  },
  referrerPolicy: {
    pass: 'Referrer-Policy header is set. Your site controls what URL information browsers share when users navigate away.',
    fail: 'Referrer-Policy header is missing. Browsers may send the full page URL as a Referer header to third-party sites, leaking navigation paths and potential query parameters.',
  },
  permissionsPolicy: {
    pass: 'Permissions-Policy header is set. Browser APIs (camera, microphone, geolocation, etc.) are explicitly restricted for this site.',
    fail: 'Permissions-Policy header is missing. There are no declared restrictions on which browser APIs embedded content or third-party scripts can access.',
  },
  tlsVersion: {
    pass: 'TLS 1.3 is negotiated — the most secure and efficient version available.',
    warn: 'TLS 1.2 is negotiated. This is still secure, but upgrading server configuration to prefer TLS 1.3 improves performance and forward secrecy.',
    fail: 'TLS 1.1 or older is being negotiated. These versions are deprecated (RFC 8996) and no longer considered secure. Update your server to require TLS 1.2 or higher.',
  },
  wwwRedirect: {
    pass: 'http://www.yourdomain correctly redirects to HTTPS. Visitors using the www prefix get a secure connection.',
    fail: 'http://www.yourdomain does not redirect to HTTPS. Visitors using the www prefix may get an insecure or broken connection.',
  },
  dnssec: {
    pass: 'DNSSEC is enabled. DNS responses for your domain are cryptographically signed, preventing cache poisoning attacks that could redirect visitors or email to malicious servers.',
    fail: 'DNSSEC is not enabled. Attackers could poison DNS caches and redirect traffic intended for your domain without detection.',
  },
  domainExpiry: {
    pass: 'Domain registration is active with plenty of time remaining before renewal is needed.',
    warn: 'Domain registration expires within 90 days. Renewal should be arranged soon — an expired domain would take all email, web, and other services offline immediately.',
    fail: 'Domain registration expires very soon (within 30 days) or has already expired. This is a critical risk — renew immediately.',
  },
  rbl: {
    pass: 'Not listed on this IP blacklist.',
    fail: 'Your sending IP is listed on this blacklist. Many mail servers will reject or junk email from your domain until it is removed.',
    blocked: 'Unable to verify — this RBL blocked the public DNS resolver used for the check. Your IP may or may not be listed.',
  },
  dbl: {
    pass: 'Your domain is not on the Spamhaus Domain Block List.',
    fail: 'Your domain is on the Spamhaus Domain Block List. Email from your domain will be rejected or junked by servers that use this list.',
  },
  observatory: {
    pass: 'Mozilla Observatory rates your site\'s HTTP security header configuration as A or A+. Excellent.',
    warn: 'Mozilla Observatory grades your site B or C. Some security headers are missing or misconfigured. Review the Observatory report for specific recommendations.',
    fail: 'Mozilla Observatory grades your site D or F. Critical HTTP security headers are missing. Visit observatory.mozilla.org for a detailed remediation guide.',
  },
  safeBrowsing: {
    pass: 'Google Safe Browsing found no malware, phishing, or unwanted software associated with this domain.',
    fail: 'Google Safe Browsing has flagged this domain for malware, phishing, or unwanted software. Visitors using Chrome, Firefox, or Safari may see a warning page.',
  },
};

const FIXABLE = new Set(['spf', 'dmarc', 'mtaSts', 'tlsRpt', 'caa', 'dnssec']);

function statusFor(score: number): 'clean' | 'warning' | 'critical' {
  return score >= 80 ? 'clean' : score >= 50 ? 'warning' : 'critical';
}

function cardAccent(score: number): string {
  const s = statusFor(score);
  return s === 'clean' ? '#10b981' : s === 'warning' ? '#f59e0b' : '#ef4444';
}

function HelpPopover({ help, href }: { help: string; href?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  return (
    <div className="relative shrink-0 inline-flex" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="p-0.5 rounded text-slate-300 hover:text-slate-500 transition-colors"
        aria-label="What does this mean?"
      >
        <HelpCircle size={12} />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 z-50 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <p className="text-xs text-slate-600 leading-relaxed">{help}</p>
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-sky-600 hover:underline"
            >
              Learn more <ExternalLink size={10} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Check({
  state, label, href, checkKey, fixKey, onFix, fixing,
}: {
  state: CheckState;
  label: string;
  href?: string;
  checkKey?: string;
  fixKey?: string;
  onFix?: (key: string) => void;
  fixing?: boolean;
}) {
  const icon =
    state === 'pass' ? <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
    : state === 'warn' ? <AlertCircle size={15} className="text-amber-400 shrink-0" />
    : <XCircle size={15} className="text-red-400 shrink-0" />;

  const textClass =
    state === 'pass' ? 'text-slate-700'
    : state === 'warn' ? 'text-amber-700'
    : 'text-slate-500';

  const key = checkKey ?? fixKey;
  const help = key ? HELP[key]?.[state] : undefined;
  const showFix = fixKey && FIXABLE.has(fixKey) && state !== 'pass' && onFix;

  return (
    <div className="flex items-center gap-2 text-sm rounded-md px-1.5 -mx-1.5 hover:bg-slate-50 transition-colors">
      {icon}
      <span className={`flex-1 ${textClass}`}>{label}</span>
      {help && <HelpPopover help={help} href={href} />}
      {showFix && (
        <button
          onClick={() => onFix(fixKey!)}
          disabled={fixing}
          className="shrink-0 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-600 hover:bg-sky-100 font-medium transition-colors disabled:opacity-50"
        >
          {fixing ? <Loader2 size={10} className="animate-spin" /> : <Wrench size={10} />}
          Fix
        </button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">{title}</p>
        <div className="flex-1 h-px bg-slate-100" />
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ScoreGauge({
  score, status, size = 'md', label,
}: {
  score: number;
  status: 'clean' | 'warning' | 'critical';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}) {
  const color = status === 'clean' ? '#10b981' : status === 'warning' ? '#f59e0b' : '#ef4444';
  const circleClass = size === 'lg' ? 'w-24 h-24 text-3xl' : size === 'sm' ? 'w-14 h-14 text-xl' : 'w-20 h-20 text-2xl';
  const badgeClass =
    status === 'clean' ? 'bg-emerald-100 text-emerald-700'
    : status === 'warning' ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-700';
  return (
    <div className="flex flex-col items-center gap-1.5">
      {label && <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>}
      <div className={`${circleClass} rounded-full flex items-center justify-center font-bold text-white shadow shrink-0`}
        style={{ background: color }}>
        {score}
      </div>
      <Badge className={`${badgeClass} border-0 text-[11px]`}>{status}</Badge>
    </div>
  );
}

// Compact inline score badge used in card headers
function ScorePill({ score, status }: { score: number; status: 'clean' | 'warning' | 'critical' }) {
  const cls =
    status === 'clean' ? 'bg-emerald-100 text-emerald-700'
    : status === 'warning' ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-700';
  return (
    <span className={`ml-auto text-base font-bold px-3 py-0.5 rounded-full ${cls}`}>{score}</span>
  );
}

function DkimFixDialog({
  open, onClose, provider, domainName, onSubmit, submitting,
}: {
  open: boolean;
  onClose: () => void;
  provider: 'google' | 'microsoft';
  domainName: string;
  onSubmit: (payload: unknown) => Promise<void>;
  submitting: boolean;
}) {
  const [selector, setSelector] = useState('google');
  const [record, setRecord] = useState('');
  const [tenantDomain, setTenantDomain] = useState('');
  const [err, setErr] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      if (provider === 'google') {
        await onSubmit({ record: record.trim(), selector: selector.trim() || 'google' });
      } else {
        await onSubmit({ tenantDomain: tenantDomain.trim() });
      }
      onClose();
    } catch (ex: any) {
      setErr(ex.message ?? 'Failed to publish DKIM records');
    }
  }

  const msSubdomain = domainName.replace(/\./g, '-');
  const msCnames = tenantDomain.trim() ? [
    `selector1._domainkey.${domainName} → selector1-${msSubdomain}._domainkey.${tenantDomain.trim()}`,
    `selector2._domainkey.${domainName} → selector2-${msSubdomain}._domainkey.${tenantDomain.trim()}`,
  ] : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Set up DKIM — {provider === 'google' ? 'Google Workspace' : 'Microsoft 365'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {provider === 'google' ? (<>
            <div className="text-sm text-slate-600 space-y-2">
              <p>Generate your DKIM key in Google Admin, then paste the record value below.</p>
              <ol className="list-decimal list-inside space-y-0.5 text-xs text-slate-500">
                <li>Open <a href="https://admin.google.com" target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline">Google Admin Console</a></li>
                <li>Apps → Google Workspace → Gmail → Authenticate email</li>
                <li>Select <strong>{domainName}</strong> and generate or view the DKIM key</li>
                <li>Copy the full TXT record value shown by Google</li>
              </ol>
            </div>
            <div className="space-y-2">
              <Label>Selector</Label>
              <Input value={selector} onChange={(e) => setSelector(e.target.value)} placeholder="google" />
            </div>
            <div className="space-y-2">
              <Label>TXT Record Value</Label>
              <textarea
                value={record}
                onChange={(e) => setRecord(e.target.value)}
                placeholder="v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0B..."
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono text-slate-700 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[80px] resize-y"
              />
            </div>
          </>) : (<>
            <p className="text-sm text-slate-600">
              Microsoft 365 DKIM uses CNAME records pointing to Microsoft's signing infrastructure.
              Enter your tenant domain and we'll create both records automatically.
            </p>
            <div className="space-y-2">
              <Label>Microsoft 365 Tenant Domain</Label>
              <Input
                value={tenantDomain}
                onChange={(e) => setTenantDomain(e.target.value)}
                placeholder="contoso.onmicrosoft.com"
                required
              />
            </div>
            {msCnames && (
              <div className="rounded-md bg-slate-50 p-3 space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Records to be created</p>
                {msCnames.map((c) => (
                  <p key={c} className="text-[11px] font-mono text-slate-600 break-all">{c}</p>
                ))}
              </div>
            )}
          </>)}
          {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 size={14} className="mr-2 animate-spin" />}
            Publish to Cloudflare
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BimiFixDialog({
  open, onClose, domainName, onSubmit, submitting,
}: {
  open: boolean;
  onClose: () => void;
  domainName: string;
  onSubmit: (payload: unknown) => Promise<void>;
  submitting: boolean;
}) {
  const [logoUrl, setLogoUrl] = useState('');
  const [err, setErr] = useState('');

  const previewRecord = logoUrl.trim() ? `v=BIMI1; l=${logoUrl.trim()}` : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await onSubmit({ logoUrl: logoUrl.trim() });
      onClose();
    } catch (ex: any) {
      setErr(ex.message ?? 'Failed to publish BIMI record');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set up BIMI Brand Logo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="text-sm text-slate-600 space-y-1">
            <p>BIMI displays your brand logo next to emails in supporting clients (Gmail, Apple Mail).</p>
            <p className="text-xs text-slate-400">You need a square SVG logo hosted at a public HTTPS URL. The logo must meet the <a href="https://bimigroup.org/taking-bimi-one-step-further/" target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline">BIMI spec</a> (square, no embedded fonts).</p>
          </div>
          <div className="space-y-2">
            <Label>Logo URL (SVG)</Label>
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.svg"
              required
              type="url"
            />
          </div>
          {previewRecord && (
            <div className="rounded-md bg-slate-50 p-3 space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Record to be created</p>
              <p className="text-[11px] font-mono text-slate-500">default._bimi.{domainName}</p>
              <p className="text-[11px] font-mono text-slate-700 break-all">{previewRecord}</p>
            </div>
          )}
          {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
          <Button type="submit" className="w-full" disabled={submitting || !logoUrl.trim()}>
            {submitting && <Loader2 size={14} className="mr-2 animate-spin" />}
            Publish to Cloudflare
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SpfFixDialog({
  open, onClose, domainName, onSubmit, submitting,
}: {
  open: boolean;
  onClose: () => void;
  domainName: string;
  onSubmit: (payload: unknown) => Promise<void>;
  submitting: boolean;
}) {
  const [mode, setMode] = useState<'-all' | '~all'>('-all');
  const [err, setErr] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await onSubmit({ mode });
      onClose();
    } catch (ex: any) {
      setErr(ex.message ?? 'Failed to publish SPF record');
    }
  }

  const preview = `v=spf1 mx ${mode}`;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set up SPF Policy</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              Choose how strictly mail servers should treat messages sent from sources not listed in your SPF record.
            </p>
            <label className="block rounded-md border border-slate-200 p-3 cursor-pointer">
              <div className="flex items-start gap-3">
                <input type="radio" name="spf-mode" checked={mode === '-all'} onChange={() => setMode('-all')} className="mt-1" />
                <div>
                  <p className="text-sm font-medium text-slate-700">`-all` Recommended for mature setups</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Tells receivers to reject mail from senders not explicitly allowed. Best protection against spoofing, but only use it when you are confident all legitimate senders are included.
                  </p>
                </div>
              </div>
            </label>
            <label className="block rounded-md border border-slate-200 p-3 cursor-pointer">
              <div className="flex items-start gap-3">
                <input type="radio" name="spf-mode" checked={mode === '~all'} onChange={() => setMode('~all')} className="mt-1" />
                <div>
                  <p className="text-sm font-medium text-slate-700">`~all` Safer transition option</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Marks unexpected senders as suspicious instead of hard-failing them. Useful when you are still validating every service that sends mail for your domain.
                  </p>
                </div>
              </div>
            </label>
          </div>
          <div className="rounded-md bg-slate-50 p-3 space-y-1.5">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Record preview</p>
            <p className="text-[11px] font-mono text-slate-500">{domainName}</p>
            <p className="text-[11px] font-mono text-slate-700 break-all">{preview}</p>
            <p className="text-[11px] text-slate-400">
              SureSend will still auto-detect Google Workspace or Microsoft 365 and use the right include if those providers are found.
            </p>
          </div>
          {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 size={14} className="mr-2 animate-spin" />}
            Publish to Cloudflare
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DmarcFixDialog({
  open, onClose, domainName, onSubmit, submitting,
}: {
  open: boolean;
  onClose: () => void;
  domainName: string;
  onSubmit: (payload: unknown) => Promise<void>;
  submitting: boolean;
}) {
  const [policy, setPolicy] = useState<'reject' | 'quarantine'>('reject');
  const [err, setErr] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await onSubmit({ policy });
      onClose();
    } catch (ex: any) {
      setErr(ex.message ?? 'Failed to publish DMARC record');
    }
  }

  const preview = `v=DMARC1; p=${policy}; rua=mailto:dmarc@${domainName}`;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set up DMARC Policy</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              Choose what receivers should do when a message fails DMARC alignment checks.
            </p>
            <label className="block rounded-md border border-slate-200 p-3 cursor-pointer">
              <div className="flex items-start gap-3">
                <input type="radio" name="dmarc-policy" checked={policy === 'reject'} onChange={() => setPolicy('reject')} className="mt-1" />
                <div>
                  <p className="text-sm font-medium text-slate-700">`p=reject` Strongest protection</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Failing messages should be rejected outright. Best once SPF and DKIM are stable across all legitimate senders.
                  </p>
                </div>
              </div>
            </label>
            <label className="block rounded-md border border-slate-200 p-3 cursor-pointer">
              <div className="flex items-start gap-3">
                <input type="radio" name="dmarc-policy" checked={policy === 'quarantine'} onChange={() => setPolicy('quarantine')} className="mt-1" />
                <div>
                  <p className="text-sm font-medium text-slate-700">`p=quarantine` Recommended stepping stone</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Failing messages are usually sent to spam instead of rejected. Good when you want stronger protection without moving straight to hard rejection.
                  </p>
                </div>
              </div>
            </label>
          </div>
          <div className="rounded-md bg-slate-50 p-3 space-y-1.5">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Record preview</p>
            <p className="text-[11px] font-mono text-slate-500">_dmarc.{domainName}</p>
            <p className="text-[11px] font-mono text-slate-700 break-all">{preview}</p>
          </div>
          {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 size={14} className="mr-2 animate-spin" />}
            Publish to Cloudflare
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function spfLabel(spf: ReputationCheck['details']['spf']): string {
  if (!spf.pass) return 'SPF Record';
  const map: Record<string, string> = {
    hard_fail: '-all (strict)', soft_fail: '~all (soft fail)',
    pass_all: '+all (unsafe)', permissive: 'no all mechanism',
  };
  return `SPF — ${spf.policy ? map[spf.policy] ?? spf.policy : 'found'}`;
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
  if (dmarc.pct !== undefined && dmarc.pct < 100) parts.push(`pct=${dmarc.pct}%`);
  if (dmarc.hasRua === false) parts.push('no rua');
  return `DMARC${parts.length ? ` — ${parts.join(', ')}` : ''}`;
}
function dmarcState(dmarc: ReputationCheck['details']['dmarc']): CheckState {
  if (!dmarc.pass) return 'fail';
  if (dmarc.policy === 'none' || dmarc.policy === 'quarantine' || dmarc.hasRua === false ||
      (dmarc.pct !== undefined && dmarc.pct < 100)) return 'warn';
  return 'pass';
}
function spfLookupsState(spf: ReputationCheck['details']['spf']): CheckState {
  const n = spf.lookups ?? 0;
  if (n > 10) return 'fail';
  if (n >= 8) return 'warn';
  return 'pass';
}
function spfLookupsLabel(spf: ReputationCheck['details']['spf']): string {
  return `SPF Lookup Count (${spf.lookups ?? 0} / 10)`;
}
function tlsVersionState(tv: NonNullable<ReputationCheck['details']['tlsVersion']>): CheckState {
  if (!tv.pass) return 'fail';
  if (tv.protocol === 'TLSv1.2') return 'warn';
  return 'pass';
}
function tlsVersionLabel(tv: NonNullable<ReputationCheck['details']['tlsVersion']>): string {
  return `TLS Version${tv.protocol ? ` (${tv.protocol})` : ''}`;
}
function domainExpiryState(de: NonNullable<ReputationCheck['details']['domainExpiry']>): CheckState {
  if (de.daysUntilExpiry === null) return 'pass';
  if (de.daysUntilExpiry <= 30) return 'fail';
  if (de.daysUntilExpiry <= 90) return 'warn';
  return 'pass';
}
function domainExpiryLabel(de: NonNullable<ReputationCheck['details']['domainExpiry']>): string {
  if (de.daysUntilExpiry === null) return 'Domain Registration';
  if (de.daysUntilExpiry <= 0) return 'Domain Registration (EXPIRED)';
  return `Domain Registration (${de.daysUntilExpiry}d remaining)`;
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
function mtaStsLabel(mtaSts: NonNullable<ReputationCheck['details']['mtaSts']>): string {
  if (mtaSts.pass) return `MTA-STS${mtaSts.policy ? ` (${mtaSts.policy})` : ''}`;
  switch (mtaSts.reason) {
    case 'missing_txt':
      return 'MTA-STS (missing _mta-sts TXT record)';
    case 'policy_unreachable':
      return 'MTA-STS (policy file unreachable)';
    case 'policy_invalid':
      return 'MTA-STS (policy file invalid)';
    case 'mode_not_enforce':
      return `MTA-STS (${mtaSts.policy ?? 'policy'} mode is not enforce)`;
    default:
      return 'MTA-STS';
  }
}
function observatoryState(obs: NonNullable<ReputationCheck['details']['observatory']>): CheckState {
  if (obs.pending) return 'warn';
  if (!obs.grade) return 'fail';
  if (obs.grade.startsWith('A')) return 'pass';
  if (obs.grade.startsWith('B') || obs.grade.startsWith('C')) return 'warn';
  return 'fail';
}

export default function DomainDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [domain, setDomain] = useState<Domain | null>(null);
  const [checks, setChecks] = useState<ReputationCheck[]>([]);
  const [latestJob, setLatestJob] = useState<ScanJob | null>(null);
  const [verification, setVerification] = useState<{ host: string; value: string; verifiedAt: string | null } | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const [fixResult, setFixResult] = useState<{ record: string; action: string } | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);
  const [cfOpen, setCfOpen] = useState(false);
  const [cfToken, setCfToken] = useState('');
  const [cfSaving, setCfSaving] = useState(false);
  const [cfError, setCfError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [savingMonitoring, setSavingMonitoring] = useState(false);
  const [monitoringError, setMonitoringError] = useState<string | null>(null);
  const [monitoringDialogOpen, setMonitoringDialogOpen] = useState(false);
  const [spfDialogOpen, setSpfDialogOpen] = useState(false);
  const [dmarcDialogOpen, setDmarcDialogOpen] = useState(false);
  const [dkimDialogOpen, setDkimDialogOpen] = useState(false);
  const [bimiDialogOpen, setBimiDialogOpen] = useState(false);
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    domainsApi.get(id).then(setDomain).catch(() => {});
    domainsApi.verification(id).then(setVerification).catch(() => {});
    repApi.list(id).then(setChecks).catch(() => {});
    repApi.latestJob(id).then(setLatestJob).catch(() => {});
  }, [user, id]);

  useEffect(() => {
    if (!latestJob || latestJob.status === 'completed' || latestJob.status === 'failed') return;
    let consecutiveErrors = 0;
    const timer = window.setInterval(async () => {
      try {
        const next = await repApi.latestJob(id);
        consecutiveErrors = 0;
        setLatestJob(next);
        if (!next || next.status === 'completed') {
          setChecks(await repApi.list(id));
          setRunning(false);
          window.clearInterval(timer);
        } else if (next.status === 'failed') {
          setRunError(next.error ?? 'Scan failed');
          setRunning(false);
          window.clearInterval(timer);
        }
      } catch (err: any) {
        // Retry through transient backend errors (503, network blip during deploys, etc.)
        const isTransient = err instanceof ApiError && err.status === 503;
        if (isTransient || ++consecutiveErrors < 5) return;
        setRunError(err.message ?? 'Unable to refresh scan status');
        setRunning(false);
        window.clearInterval(timer);
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [latestJob, id]);

  async function handleRunCheck() {
    setRunError(null);
    setRunning(true);
    try {
      const result = await repApi.runCheck(id);
      setLatestJob(result);
      if (result.status === 'completed') {
        setChecks(await repApi.list(id));
        setRunning(false);
      } else if (result.status === 'failed') {
        setRunError(result.error ?? 'Scan failed');
        setRunning(false);
      }
    } catch (err: any) {
      setRunError(err.message ?? 'Unable to queue scan');
      setRunning(false);
    }
  }

  async function handleVerifyDomain() {
    setVerifying(true);
    setVerificationError(null);
    try {
      const result = await domainsApi.verify(id);
      setDomain(await domainsApi.get(id));
      setVerification(await domainsApi.verification(id));
      if (!result.verified) {
        setVerificationError('Verification record not found yet. DNS may still be propagating.');
      }
    } catch (err: any) {
      setVerificationError(err.message ?? 'Verification failed');
    } finally {
      setVerifying(false);
    }
  }

  async function handleSaveMonitoring(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMonitoringError(null);
    const form = new FormData(e.currentTarget);
    const intervalRaw = String(form.get('scanIntervalMinutes') ?? 'off');
    const alertsEnabled = form.get('alertsEnabled') === 'on';
    const scanIntervalMinutes = intervalRaw === 'off' ? null : Number(intervalRaw);
    setSavingMonitoring(true);
    try {
      const settings = await domainsApi.updateMonitoring(id, { scanIntervalMinutes, alertsEnabled });
      setDomain((prev) => prev ? { ...prev, ...settings } : prev);
      return true;
    } catch (err: any) {
      setMonitoringError(err.message ?? 'Unable to save monitoring settings');
      return false;
    } finally {
      setSavingMonitoring(false);
    }
  }

  async function handleFix(check: string, payload?: unknown) {
    setFixing(check);
    setFixResult(null);
    setFixError(null);
    try {
      const result = await domainsApi.fixCheck(id, check, payload);
      setFixResult(result);
      const job = await repApi.runCheck(id);
      setLatestJob(job);
      setRunning(job.status === 'queued' || job.status === 'running');
    } catch (err: any) {
      setFixError(err.message ?? 'Fix failed');
      throw err;
    } finally {
      setFixing(null);
    }
  }

  async function handleConnectCloudflare(e: React.FormEvent) {
    e.preventDefault();
    setCfError('');
    setCfSaving(true);
    try {
      await domainsApi.connectCloudflare(id, cfToken.trim());
      setDomain((prev) => prev ? { ...prev, cloudflareConnected: true } : prev);
      setCfOpen(false);
      setCfToken('');
    } catch (err: any) {
      setCfError(err.message ?? 'Connection failed');
    } finally {
      setCfSaving(false);
    }
  }

  async function handleDisconnectCloudflare() {
    if (!confirm('Disconnect Cloudflare? Auto-fix will be disabled for this domain.')) return;
    await domainsApi.disconnectCloudflare(id);
    setDomain((prev) => prev ? { ...prev, cloudflareConnected: false } : prev);
  }

  const canManage = domain && user && (user.role === 'admin' || domain.ownerId === user.id);
  const canFix = user && (user.role === 'admin' || (user.tier ?? 'free') !== 'free');
  if (isLoading || !user || !domain) return null;

  const latest = checks[0];
  const d = latest?.details;
  const activeJob = latestJob && (latestJob.status === 'queued' || latestJob.status === 'running')
    ? latestJob
    : null;
  const runButtonLabel = !domain.verifiedAt
    ? 'Verify Domain First'
    : activeJob?.status === 'running'
      ? 'Scan Running'
      : activeJob?.status === 'queued'
        ? 'Scan Queued'
        : 'Scan Now';
  // Free-tier users always see fix buttons (clicking opens upgrade dialog).
  // Plus/Pro users who manage the domain and have CF connected get the actual fix.
  const handleFixIntent = async (check: string) => {
    if (check === 'spf') {
      setSpfDialogOpen(true);
      return;
    }
    if (check === 'dmarc') {
      setDmarcDialogOpen(true);
      return;
    }
    await handleFix(check);
  };
  const onFix = canFix
    ? (canManage && domain.cloudflareConnected ? handleFixIntent : undefined)
    : () => setUpgradeDialogOpen(true);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--sp-navy)]">{domain.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <span>{domain.delegatedAccess?.length ?? 0} delegated users</span>
            <Badge className={domain.verifiedAt ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-amber-100 text-amber-700 border-0'}>
              {domain.verifiedAt ? 'Verified' : 'Verification required'}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            domain.cloudflareConnected ? (
              <Button variant="outline" size="sm"
                className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                onClick={handleDisconnectCloudflare}>
                <Link2 size={14} />Cloudflare connected
              </Button>
            ) : (
              <Dialog open={cfOpen} onOpenChange={setCfOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 text-slate-500">
                    <Link2Off size={14} />Connect Cloudflare
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Connect Cloudflare</DialogTitle></DialogHeader>
                  <p className="text-sm text-slate-500 mt-1">
                    Provide a scoped API token with <strong>Zone → DNS → Edit</strong> permission
                    for <strong>{domain.name}</strong>. SureSend will use it to create missing DNS
                    records when you click <em>Fix</em>.
                  </p>
                  <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline">
                    Create token in Cloudflare dashboard<ExternalLink size={11} />
                  </a>
                  <form onSubmit={handleConnectCloudflare} className="space-y-4 mt-2">
                    <div className="space-y-2">
                      <Label>API Token</Label>
                      <Input type="password" placeholder="Cloudflare API token"
                        value={cfToken} onChange={(e) => setCfToken(e.target.value)}
                        required autoComplete="off" />
                    </div>
                    {cfError && <Alert variant="destructive"><AlertDescription>{cfError}</AlertDescription></Alert>}
                    <Button type="submit" className="w-full" disabled={cfSaving || !cfToken.trim()}>
                      {cfSaving && <Loader2 size={14} className="mr-2 animate-spin" />}
                      {cfSaving ? 'Validating…' : 'Connect'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )
          )}
          {canManage && (
            <Dialog open={monitoringDialogOpen} onOpenChange={setMonitoringDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={!domain.verifiedAt}>
                  Schedule Scan
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Scheduled Monitoring</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    SureSend can queue recurring scans in the background and email the domain owner when the status changes or a verified domain first scans unhealthy.
                  </p>
                  <form
                    onSubmit={async (e) => {
                      const saved = await handleSaveMonitoring(e);
                      if (saved) setMonitoringDialogOpen(false);
                    }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="scanIntervalMinutes">Scan frequency</Label>
                      <select
                        id="scanIntervalMinutes"
                        name="scanIntervalMinutes"
                        defaultValue={domain.scanIntervalMinutes === null ? 'off' : String(domain.scanIntervalMinutes)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        disabled={!domain.verifiedAt || savingMonitoring}
                      >
                        <option value="off">Off</option>
                        <option value="15">Every 15 minutes</option>
                        <option value="60">Hourly</option>
                        <option value="360">Every 6 hours</option>
                        <option value="1440">Daily</option>
                      </select>
                    </div>
                    <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3">
                      <input
                        type="checkbox"
                        name="alertsEnabled"
                        defaultChecked={domain.alertsEnabled}
                        disabled={!domain.verifiedAt || savingMonitoring}
                        className="mt-1"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-700">Email alerts on status changes</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Sends the reputation report to the domain owner when a scheduled scan changes from clean to warning or critical, recovers, or the first scheduled result is unhealthy.
                        </p>
                      </div>
                    </label>
                    {monitoringError && <Alert variant="destructive"><AlertDescription>{monitoringError}</AlertDescription></Alert>}
                    {domain.lastScheduledScanAt && (
                      <p className="text-xs text-slate-500">
                        Last scheduled scan queued on {new Date(domain.lastScheduledScanAt).toLocaleString()}.
                      </p>
                    )}
                    <Button type="submit" disabled={savingMonitoring || !domain.verifiedAt} className="w-full">
                      {savingMonitoring && <Loader2 size={14} className="mr-2 animate-spin" />}
                      Save Monitoring Settings
                    </Button>
                  </form>
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Button onClick={handleRunCheck} disabled={running || !!activeJob || !domain.verifiedAt}>
            {(running || activeJob) ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
            {runButtonLabel}
          </Button>
        </div>
      </div>

      {/* Fix feedback */}
      {fixResult && (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
          <AlertDescription>
            <CheckCircle2 size={14} className="inline mr-2" />
            <strong>Fixed:</strong> {fixResult.action} — <code className="text-xs">{fixResult.record}</code>
          </AlertDescription>
        </Alert>
      )}
      {fixError && <Alert variant="destructive"><AlertDescription>{fixError}</AlertDescription></Alert>}
      {runError && <Alert variant="destructive"><AlertDescription>{runError}</AlertDescription></Alert>}
      {activeJob && (
        <Alert className="border-sky-200 bg-sky-50 text-sky-900">
          <AlertDescription className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin shrink-0" />
            {activeJob.trigger === 'scheduled' ? 'Scheduled scan' : 'Scan'} {activeJob.status === 'queued' ? 'queued' : 'running'} for {domain.name}.
          </AlertDescription>
        </Alert>
      )}

      {!domain.verifiedAt && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              Domain Verification
              <Badge className={domain.verifiedAt ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-amber-100 text-amber-700 border-0'}>
                {domain.verifiedAt ? 'Verified' : 'Pending'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              Publish this TXT record to prove you control the domain. Scheduled scans, alerts, and manual checks stay disabled until verification succeeds.
            </p>
            {verification && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">TXT host</p>
                  <p className="text-xs font-mono text-slate-700 break-all">{verification.host}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">TXT value</p>
                  <p className="text-xs font-mono text-slate-700 break-all">{verification.value}</p>
                </div>
              </div>
            )}
            <div className="text-xs text-slate-500 space-y-1">
              <p>1. Add the TXT record in your DNS provider.</p>
              <p>2. Wait for DNS propagation.</p>
              <p>3. Click verify below.</p>
            </div>
            {domain.verifiedAt && (
              <p className="text-xs text-emerald-700">
                Verified on {new Date(domain.verifiedAt).toLocaleString()}.
              </p>
            )}
            {verificationError && <Alert variant="destructive"><AlertDescription>{verificationError}</AlertDescription></Alert>}
            {canManage && (
              <Button onClick={handleVerifyDomain} disabled={verifying} className="w-full">
                {verifying && <Loader2 size={14} className="mr-2 animate-spin" />}
                {domain.verifiedAt ? 'Re-check Verification' : 'Verify Domain'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Prompt to connect Cloudflare when there are fixable failures */}
      {!domain.cloudflareConnected && canManage && d && (
        (!d.spf.pass || !d.dmarc.pass ||
          (d.mtaSts && !d.mtaSts.pass) || (d.tlsRpt && !d.tlsRpt.pass) ||
          (d.caa && !d.caa.pass) || (d.dnssec && !d.dnssec.pass) ||
          (d.mx.mailProvider && !d.dkim.pass) ||
          (d.bimi && !d.bimi.pass)) && (
          <Alert className="border-sky-200 bg-sky-50 text-sky-800">
            <AlertDescription className="flex items-center gap-2">
              <Wrench size={14} className="shrink-0" />
              Connect Cloudflare above to enable one-click DNS fixes for failing checks.
            </AlertDescription>
          </Alert>
        )
      )}

      {/* ── Score Overview ─────────────────────────────────────────────── */}
      {latest && (
        <Card className="border-t-[3px]" style={{ borderTopColor: cardAccent(latest.score) }}>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              Score Overview
              <span className="text-xs text-slate-400 font-normal">{new Date(latest.checkedAt).toLocaleString()}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-around py-2">
              <ScoreGauge score={latest.emailScore} status={statusFor(latest.emailScore)} size="md" label="Email" />
              <ScoreGauge score={latest.score} status={latest.status} size="lg" label="Overall" />
              <ScoreGauge score={latest.webScore} status={statusFor(latest.webScore)} size="md" label="Web" />
            </div>
            {/* Score key */}
            <div className="flex gap-2 pt-1 border-t border-slate-100">
              {([
                { label: 'Clean', range: '80–100', color: '#10b981', bg: '#10b98118' },
                { label: 'Warning', range: '50–79', color: '#f59e0b', bg: '#f59e0b18' },
                { label: 'Critical', range: '0–49', color: '#ef4444', bg: '#ef444418' },
              ] as const).map(({ label, range, color, bg }) => (
                <div key={label} className="flex-1 rounded-md px-2 py-1.5 text-center" style={{ background: bg }}>
                  <p className="text-[11px] font-bold" style={{ color }}>{label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{range}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Email & Web Reputation — side by side ──────────────────────── */}
      {latest && d ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* Email Reputation */}
          <Card className="border-t-[3px]" style={{ borderTopColor: cardAccent(latest.emailScore) }}>
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                Email Reputation
                <ScorePill score={latest.emailScore} status={statusFor(latest.emailScore)} />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">

              {d.mx.mailProvider && (
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <span className="text-xs text-slate-500">
                    Mail hosted by{' '}
                    <span className="font-semibold text-slate-700">
                      {d.mx.mailProvider === 'google' ? 'Google Workspace' : 'Microsoft 365'}
                    </span>
                  </span>
                  {!d.dkim.pass && !domain.cloudflareConnected && canManage && (
                    <span className="text-[11px] text-sky-600">Connect Cloudflare to auto-fix DKIM</span>
                  )}
                </div>
              )}

              <Section title="Authentication">
                <Check state={d.mx.pass ? 'pass' : 'fail'}
                  label={`MX Records${d.mx.records[0] ? ` (${d.mx.records[0]})` : ''}`}
                  href={DOCS.mx} checkKey="mx" />
                <Check state={spfState(d.spf)} label={spfLabel(d.spf)} href={DOCS.spf}
                  fixKey="spf" onFix={onFix} fixing={fixing === 'spf'} />
                <Check state={dmarcState(d.dmarc)} label={dmarcLabel(d.dmarc)} href={DOCS.dmarc}
                  fixKey="dmarc" onFix={onFix} fixing={fixing === 'dmarc'} />
                {!d.dkim.pass && d.mx.mailProvider && (!canFix || (canManage && domain.cloudflareConnected)) ? (
                  <div className="flex items-center gap-2 text-sm rounded-md px-1.5 -mx-1.5 hover:bg-slate-50 transition-colors">
                    <XCircle size={15} className="text-red-400 shrink-0" />
                    <span className="flex-1 text-slate-500">DKIM</span>
                    {HELP.dkim?.fail && <HelpPopover help={HELP.dkim.fail} href={DOCS.dkim} />}
                    <button
                      onClick={() => canFix ? setDkimDialogOpen(true) : setUpgradeDialogOpen(true)}
                      disabled={fixing === 'dkim-google' || fixing === 'dkim-microsoft'}
                      className="shrink-0 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-600 hover:bg-sky-100 font-medium transition-colors disabled:opacity-50"
                    >
                      {(fixing === 'dkim-google' || fixing === 'dkim-microsoft')
                        ? <Loader2 size={10} className="animate-spin" />
                        : <Wrench size={10} />}
                      Setup
                    </button>
                  </div>
                ) : (
                  <Check state={d.dkim.pass ? 'pass' : 'fail'}
                    label={`DKIM${d.dkim.selector ? ` (${d.dkim.selector})` : ''}`}
                    href={DOCS.dkim} checkKey="dkim" />
                )}
                {d.spf.lookups !== undefined && (
                  <Check state={spfLookupsState(d.spf)} label={spfLookupsLabel(d.spf)}
                    href={DOCS.spfLookups} checkKey="spfLookups" />
                )}
              </Section>

              <Section title="Transport Security">
                {d.mtaSts ? (
                  <Check state={d.mtaSts.pass ? 'pass' : 'fail'}
                    label={mtaStsLabel(d.mtaSts)}
                    href={DOCS.mtaSts} fixKey="mtaSts" onFix={onFix} fixing={fixing === 'mtaSts'} />
                ) : null}
                {d.tlsRpt ? (
                  <Check state={d.tlsRpt.pass ? 'pass' : 'fail'} label="TLS Reporting (TLS-RPT)"
                    href={DOCS.tlsRpt} fixKey="tlsRpt" onFix={onFix} fixing={fixing === 'tlsRpt'} />
                ) : null}
                {d.bimi ? (
                  !d.bimi.pass && (!canFix || (canManage && domain.cloudflareConnected)) ? (
                    <div className="flex items-center gap-2 text-sm rounded-md px-1.5 -mx-1.5 hover:bg-slate-50 transition-colors">
                      <XCircle size={15} className="text-red-400 shrink-0" />
                      <span className="flex-1 text-slate-500">BIMI (Brand Logo in Email)</span>
                      {HELP.bimi?.fail && <HelpPopover help={HELP.bimi.fail} href={DOCS.bimi} />}
                      <button
                        onClick={() => canFix ? setBimiDialogOpen(true) : setUpgradeDialogOpen(true)}
                        disabled={fixing === 'bimi'}
                        className="shrink-0 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-600 hover:bg-sky-100 font-medium transition-colors disabled:opacity-50"
                      >
                        {fixing === 'bimi' ? <Loader2 size={10} className="animate-spin" /> : <Wrench size={10} />}
                        Setup
                      </button>
                    </div>
                  ) : (
                    <Check state={d.bimi.pass ? 'pass' : 'fail'}
                      label="BIMI (Brand Logo in Email)" href={DOCS.bimi} checkKey="bimi" />
                  )
                ) : null}
                {!d.mtaSts && !d.tlsRpt && !d.bimi && (
                  <span className="text-xs text-slate-400 italic">Not checked</span>
                )}
              </Section>

              {d.ptr && (
                <Section title="Sending Infrastructure">
                  <Check state={d.ptr.pass ? 'pass' : 'fail'}
                    label={`PTR / rDNS${d.ptr.hostname ? ` (${d.ptr.hostname})` : ''}`}
                    href={DOCS.ptr} checkKey="ptr" />
                </Section>
              )}

              <Section title="IP Blacklists">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {d.blacklists.map((bl) =>
                    bl.blocked ? (
                      <div key={bl.list} className="flex items-center gap-2 text-sm">
                        <AlertCircle size={15} className="text-amber-400 shrink-0" />
                        <span className="flex-1 text-slate-400">{bl.list} (unverifiable)</span>
                        {HELP.rbl?.blocked && (
                          <HelpPopover help={HELP.rbl.blocked} href={DOCS.rbl} />
                        )}
                      </div>
                    ) : (
                      <Check key={bl.list} state={bl.listed ? 'fail' : 'pass'}
                        label={bl.list} href={DOCS.rbl} checkKey="rbl" />
                    )
                  )}
                  {d.dbl && (
                    <Check state={d.dbl.listed ? 'fail' : 'pass'}
                      label="Spamhaus DBL (domain blacklist)" href={DOCS.dbl} checkKey="dbl" />
                  )}
                </div>
              </Section>

            </CardContent>
          </Card>

          {/* Web Reputation */}
          <Card className="border-t-[3px]" style={{ borderTopColor: cardAccent(latest.webScore) }}>
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                Web Reputation
                <ScorePill score={latest.webScore} status={statusFor(latest.webScore)} />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">

              <Section title="Web Security">
                <Check state={d.https.pass ? 'pass' : 'fail'}
                  label={`HTTPS${d.https.statusCode ? ` (${d.https.statusCode})` : ''}`}
                  href={DOCS.https} checkKey="https" />
                {d.httpsRedirect && (
                  <Check state={d.httpsRedirect.pass ? 'pass' : 'fail'}
                    label="HTTP→HTTPS Redirect" href={DOCS.httpsRedirect} checkKey="httpsRedirect" />
                )}
                {d.ssl && (
                  <Check state={sslState(d.ssl)} label={sslLabel(d.ssl)}
                    href={DOCS.ssl} checkKey="ssl" />
                )}
                {d.securityHeaders && (<>
                  <Check state={d.securityHeaders.hsts ? 'pass' : 'fail'}
                    label="HSTS" href={DOCS.hsts} checkKey="hsts" />
                  <Check state={d.securityHeaders.xContentTypeOptions ? 'pass' : 'fail'}
                    label="X-Content-Type-Options" href={DOCS.xContentType} checkKey="xContentType" />
                  <Check state={d.securityHeaders.xFrameOptions ? 'pass' : 'fail'}
                    label="X-Frame-Options" href={DOCS.xFrame} checkKey="xFrame" />
                  <Check state={d.securityHeaders.csp ? 'pass' : 'fail'}
                    label="Content Security Policy (CSP)" href={DOCS.csp} checkKey="csp" />
                  <Check state={d.securityHeaders.referrerPolicy ? 'pass' : 'fail'}
                    label="Referrer-Policy" href={DOCS.referrerPolicy} checkKey="referrerPolicy" />
                  <Check state={d.securityHeaders.permissionsPolicy ? 'pass' : 'fail'}
                    label="Permissions-Policy" href={DOCS.permissionsPolicy} checkKey="permissionsPolicy" />
                </>)}
                {d.tlsVersion && (
                  <Check state={tlsVersionState(d.tlsVersion)} label={tlsVersionLabel(d.tlsVersion)}
                    href={DOCS.tlsVersion} checkKey="tlsVersion" />
                )}
                {d.wwwRedirect?.exists && (
                  <Check state={d.wwwRedirect.pass ? 'pass' : 'fail'}
                    label="www → HTTPS Redirect" href={DOCS.wwwRedirect} checkKey="wwwRedirect" />
                )}
              </Section>

              <Section title="DNS Health">
                {d.nsCount && (
                  <Check state={d.nsCount.pass ? 'pass' : 'fail'}
                    label={`Nameservers (${d.nsCount.count} found, need ≥2)`}
                    href={DOCS.ns} checkKey="ns" />
                )}
                {d.caa && (
                  <Check state={d.caa.pass ? 'pass' : 'fail'}
                    label={`CAA Records${d.caa.records[0] ? ` (${d.caa.records[0]})` : ''}`}
                    href={DOCS.caa} fixKey="caa" onFix={onFix} fixing={fixing === 'caa'} />
                )}
                {d.dnssec && (
                  <Check state={d.dnssec.pass ? 'pass' : 'fail'}
                    label="DNSSEC" href={DOCS.dnssec}
                    fixKey="dnssec" onFix={onFix} fixing={fixing === 'dnssec'} />
                )}
                {d.domainExpiry && (
                  <Check state={domainExpiryState(d.domainExpiry)} label={domainExpiryLabel(d.domainExpiry)}
                    href={DOCS.domainExpiry} checkKey="domainExpiry" />
                )}
                {!d.nsCount && !d.caa && !d.dnssec && !d.domainExpiry && (
                  <span className="text-xs text-slate-400 italic">Not checked</span>
                )}
              </Section>

              {(d.observatory || d.safeBrowsing) && (
                <Section title="External Assessments">
                  {d.observatory && (
                    <div className="space-y-1">
                      <Check
                        state={observatoryState(d.observatory)}
                        label={`Mozilla Observatory${d.observatory.grade ? ` (${d.observatory.grade})` : d.observatory.pending ? ' (scan in progress)' : ' (unavailable)'}`}
                        href={DOCS.observatory}
                        checkKey={d.observatory.pending ? undefined : 'observatory'}
                      />
                      <div className="pl-7">
                        <a
                          href={observatoryReportUrl(domain.name)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-sky-600 hover:underline"
                        >
                          View full Observatory report <ExternalLink size={10} />
                        </a>
                      </div>
                    </div>
                  )}
                  {d.safeBrowsing && (
                    <Check
                      state={d.safeBrowsing.pass ? 'pass' : 'fail'}
                      label={`Google Safe Browsing${!d.safeBrowsing.pass && d.safeBrowsing.threats.length ? ` (${d.safeBrowsing.threats.join(', ')})` : ''}`}
                      href={DOCS.safeBrowsing}
                      checkKey="safeBrowsing"
                    />
                  )}
                </Section>
              )}

            </CardContent>
          </Card>

        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-slate-500">
            No checks run yet. Click <strong>Run Check</strong> to get started.
          </CardContent>
        </Card>
      )}

      {/* Dialogs — rendered outside the grid so they can overlay correctly */}
      {latest && d && (
        <>
          <SpfFixDialog
            open={spfDialogOpen}
            onClose={() => setSpfDialogOpen(false)}
            domainName={domain.name}
            submitting={fixing === 'spf'}
            onSubmit={async (payload) => { await handleFix('spf', payload); }}
          />
          <DmarcFixDialog
            open={dmarcDialogOpen}
            onClose={() => setDmarcDialogOpen(false)}
            domainName={domain.name}
            submitting={fixing === 'dmarc'}
            onSubmit={async (payload) => { await handleFix('dmarc', payload); }}
          />
          {d.mx.mailProvider && (
            <DkimFixDialog
              open={dkimDialogOpen}
              onClose={() => setDkimDialogOpen(false)}
              provider={d.mx.mailProvider}
              domainName={domain.name}
              submitting={fixing === 'dkim-google' || fixing === 'dkim-microsoft'}
              onSubmit={async (payload) => {
                const check = d.mx.mailProvider === 'google' ? 'dkim-google' : 'dkim-microsoft';
                await handleFix(check, payload);
              }}
            />
          )}
          {d.bimi && !d.bimi.pass && domain.cloudflareConnected && canManage && (
            <BimiFixDialog
              open={bimiDialogOpen}
              onClose={() => setBimiDialogOpen(false)}
              domainName={domain.name}
              submitting={fixing === 'bimi'}
              onSubmit={async (payload) => { await handleFix('bimi', payload); }}
            />
          )}
        </>
      )}
      <Dialog open={upgradeDialogOpen} onOpenChange={(o) => !o && setUpgradeDialogOpen(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Plus Feature</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600 mt-1">
            Auto-fix is available on the <strong className="text-sky-600">Plus</strong> plan.
            Contact your administrator to upgrade your account.
          </p>
          <Button className="mt-4 w-full" onClick={() => setUpgradeDialogOpen(false)}>Close</Button>
        </DialogContent>
      </Dialog>

      {/* ── Check History ───────────────────────────────────────────────── */}
      {checks.length > 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Check History</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Overall</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Web</TableHead>
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
                    <TableCell className="text-sm text-slate-500">{new Date(c.checkedAt).toLocaleString()}</TableCell>
                    <TableCell className="font-bold">{c.score}</TableCell>
                    <TableCell className="font-semibold text-slate-600">{c.emailScore}</TableCell>
                    <TableCell className="font-semibold text-slate-600">{c.webScore}</TableCell>
                    <TableCell>
                      <Badge className={
                        c.status === 'clean' ? 'bg-emerald-100 text-emerald-700 border-0'
                        : c.status === 'warning' ? 'bg-amber-100 text-amber-700 border-0'
                        : 'bg-red-100 text-red-700 border-0'
                      }>{c.status}</Badge>
                    </TableCell>
                    <TableCell>{c.details.mx.pass ? '✓' : '✗'}</TableCell>
                    <TableCell>{c.details.spf.pass ? '✓' : '✗'}</TableCell>
                    <TableCell>{c.details.dmarc.pass ? '✓' : '✗'}</TableCell>
                    <TableCell>{c.details.dkim.pass ? '✓' : '✗'}</TableCell>
                    <TableCell>{c.details.https.pass ? '✓' : '✗'}</TableCell>
                    <TableCell>{c.details.ssl ? (c.details.ssl.pass ? '✓' : '✗') : '—'}</TableCell>
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
