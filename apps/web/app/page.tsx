import Image from 'next/image';
import Link from 'next/link';
import {
  CheckCircle2,
  Globe,
  Mail,
  Shield,
  ShieldCheck,
  Server,
  Lock,
  AlertTriangle,
  BarChart3,
} from 'lucide-react';

const FEATURE_GROUPS = [
  {
    icon: Mail,
    title: 'Email Authentication',
    color: '#00a0e0',
    checks: [
      { label: 'MX Records', desc: 'Confirms mail servers are reachable' },
      { label: 'SPF', desc: 'Validates authorised sending sources' },
      { label: 'DMARC', desc: 'Enforces policy and reports abuse' },
      { label: 'DKIM', desc: 'Cryptographic message signing' },
    ],
  },
  {
    icon: Lock,
    title: 'Email Transport Security',
    color: '#0070b0',
    checks: [
      { label: 'MTA-STS', desc: 'Enforces TLS for inbound delivery' },
      { label: 'TLS-RPT', desc: 'TLS failure reporting' },
      { label: 'BIMI', desc: 'Brand logo display in inboxes' },
    ],
  },
  {
    icon: Globe,
    title: 'Web Security',
    color: '#005a90',
    checks: [
      { label: 'HTTPS', desc: 'Checks site is reachable over TLS' },
      { label: 'HTTP→HTTPS Redirect', desc: 'Ensures all traffic is encrypted' },
      { label: 'SSL Expiry', desc: 'Alerts before certificates expire' },
      { label: 'HSTS', desc: 'Browser-enforced HTTPS' },
      { label: 'Security Headers', desc: 'X-Content-Type & X-Frame-Options' },
    ],
  },
  {
    icon: Server,
    title: 'DNS Health',
    color: '#003d60',
    checks: [
      { label: 'CAA Records', desc: 'Controls who can issue your certificates' },
      { label: 'NS Count', desc: 'Verifies redundant nameservers' },
      { label: 'PTR / rDNS', desc: 'Reverse DNS for MX servers' },
    ],
  },
  {
    icon: AlertTriangle,
    title: 'Blacklist Monitoring',
    color: '#c0392b',
    checks: [
      { label: 'Spamhaus ZEN', desc: 'Combined IP reputation list' },
      { label: 'SpamCop', desc: 'Community-reported spam sources' },
      { label: 'SORBS', desc: 'Spam and open-relay blacklist' },
      { label: 'CBL', desc: 'Composite Blocking List' },
      { label: 'Spamhaus DBL', desc: 'Domain-based blacklist' },
    ],
  },
];

const STATS = [
  { value: '20+', label: 'Security checks' },
  { value: '5', label: 'Blacklists monitored' },
  { value: '0–100', label: 'Reputation score' },
  { value: 'Real-time', label: 'Live DNS lookups' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#fff' }}>
      {/* ── Top bar ── */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-6 py-4"
        style={{ background: 'var(--sp-navy)' }}
      >
        <Image src="/logo.png" alt="SureSend" width={140} height={94} priority className="h-8 w-auto" />
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium px-4 py-2 rounded-md transition-colors text-slate-400 hover:text-white"
          >
            Sign in
          </Link>
          <Link
            href="/login?tab=register"
            className="text-sm font-semibold px-4 py-2 rounded-md text-white transition-colors"
            style={{ background: 'var(--sp-sky)' }}
          >
            Get started free
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden py-24 px-6 text-center"
        style={{
          background: 'linear-gradient(160deg, var(--sp-navy) 0%, #002840 60%, #004060 100%)',
        }}
      >
        {/* Subtle radial glow behind headline */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% 40%, rgba(0,160,224,0.12) 0%, transparent 70%)',
          }}
        />
        <div className="relative max-w-3xl mx-auto space-y-6">
          <div className="flex justify-center mb-4">
            <Image src="/logo.png" alt="SureSend" width={280} height={187} priority className="w-56 h-auto drop-shadow-xl" />
          </div>
          <div
            className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full mb-2"
            style={{ background: 'rgba(0,160,224,0.15)', color: 'var(--sp-sky)' }}
          >
            <ShieldCheck size={13} />
            Email &amp; Domain Reputation Platform
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold leading-tight text-white">
            Know your email reputation
            <br />
            <span style={{ color: 'var(--sp-sky)' }}>before your inbox does.</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
            SureSend runs 20+ live security checks across your email infrastructure — SPF, DMARC, DKIM,
            blacklists, SSL, and more — and turns the results into a single actionable reputation score.
          </p>
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <Link
              href="/login?tab=register"
              className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-lg text-white shadow-lg transition-transform hover:scale-[1.02]"
              style={{ background: 'var(--sp-sky)' }}
            >
              <BarChart3 size={16} />
              Start monitoring for free
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm font-medium px-6 py-3 rounded-lg transition-colors"
              style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              Sign in to your account
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <div
        className="py-5 border-b"
        style={{ background: 'var(--sp-navy)', borderColor: 'oklch(0.15 0.025 228)' }}
      >
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 px-6 text-center">
          {STATS.map(({ value, label }) => (
            <div key={label}>
              <p className="text-2xl font-extrabold" style={{ color: 'var(--sp-sky)' }}>{value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Features ── */}
      <section className="py-20 px-6" style={{ background: 'linear-gradient(145deg, #f5fbfe 0%, #eef8fd 100%)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold" style={{ color: 'var(--sp-navy)' }}>
              Every check that matters, in one place
            </h2>
            <p className="text-slate-500 mt-3 max-w-xl mx-auto">
              Checks run live against DNS and HTTP — no cached data, no stale results.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURE_GROUPS.map(({ icon: Icon, title, color, checks }) => (
              <div
                key={title}
                className="rounded-xl p-5 shadow-sm border"
                style={{ background: '#fff', borderColor: '#e0f0f8' }}
              >
                <div className="flex items-center gap-2.5 mb-4">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${color}18` }}
                  >
                    <Icon size={16} style={{ color }} />
                  </div>
                  <h3 className="font-semibold text-sm" style={{ color: 'var(--sp-navy)' }}>{title}</h3>
                </div>
                <ul className="space-y-2">
                  {checks.map(({ label, desc }) => (
                    <li key={label} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--sp-sky)' }} />
                      <span>
                        <span className="font-medium text-slate-700">{label}</span>
                        <span className="text-slate-400"> — {desc}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* Score card */}
            <div
              className="rounded-xl p-5 shadow-sm border flex flex-col justify-between"
              style={{ background: 'linear-gradient(135deg, var(--sp-navy) 0%, #003050 100%)', borderColor: 'transparent' }}
            >
              <div>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(0,160,224,0.2)' }}>
                    <Shield size={16} style={{ color: 'var(--sp-sky)' }} />
                  </div>
                  <h3 className="font-semibold text-sm text-white">Reputation Score</h3>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed mb-5">
                  Every check contributes to a single 0–100 score. Critical issues like missing MX or
                  blacklist listings carry the most weight.
                </p>
              </div>
              <div className="flex gap-3">
                {[
                  { label: 'Clean', range: '80–100', color: '#10b981' },
                  { label: 'Warning', range: '50–79', color: '#f59e0b' },
                  { label: 'Blacklisted', range: '0–49', color: '#ef4444' },
                ].map(({ label, range, color }) => (
                  <div
                    key={label}
                    className="flex-1 rounded-lg px-2 py-2 text-center"
                    style={{ background: `${color}22` }}
                  >
                    <p className="text-xs font-bold" style={{ color }}>{label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{range}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section
        className="py-20 px-6 text-center"
        style={{ background: 'linear-gradient(160deg, var(--sp-navy) 0%, #002030 100%)' }}
      >
        <div className="max-w-xl mx-auto space-y-5">
          <h2 className="text-3xl font-bold text-white">Ready to protect your deliverability?</h2>
          <p className="text-slate-400">
            Add your domain and get a full reputation report in seconds.
          </p>
          <Link
            href="/login?tab=register"
            className="inline-flex items-center gap-2 text-sm font-semibold px-7 py-3 rounded-lg text-white shadow-lg transition-transform hover:scale-[1.02]"
            style={{ background: 'var(--sp-sky)' }}
          >
            <BarChart3 size={16} />
            Get started free
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        className="py-6 px-6 text-center text-xs"
        style={{ background: 'var(--sp-navy)', color: 'oklch(0.4 0.03 213)', borderTop: '1px solid oklch(0.15 0.025 228)' }}
      >
        © {new Date().getFullYear()} StrategyPlus · SureSend
      </footer>
    </div>
  );
}
