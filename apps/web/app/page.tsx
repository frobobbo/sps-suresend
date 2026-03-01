import { MetricCard } from '@/components/metric-card';

const metrics = [
  { label: 'SMTP Deliverability', value: '98.6%', trend: '+1.4% this week' },
  { label: 'DNS Health', value: 'A-', trend: 'SPF aligned on 8 domains' },
  { label: 'Reputation Signals', value: '92/100', trend: '+5 after remediation' },
];

export default function HomePage() {
  return (
    <main>
      <section
        style={{
          maxWidth: 1120,
          margin: '0 auto',
          padding: '2rem 1rem 3rem',
          display: 'grid',
          gap: '1.5rem',
        }}
      >
        <header
          style={{
            borderRadius: 18,
            padding: '2rem',
            color: '#ffffff',
            background:
              'linear-gradient(132deg, rgba(15,39,72,1) 0%, rgba(31,95,159,1) 60%, rgba(47,158,143,1) 100%)',
            boxShadow: '0 16px 48px rgba(15, 39, 72, 0.25)',
          }}
        >
          <p style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, fontSize: 12 }}>
            StrategyPlus SureSend
          </p>
          <h1 style={{ margin: '0.8rem 0 0.6rem', fontSize: 'clamp(1.75rem, 3vw, 2.8rem)', lineHeight: 1.1 }}>
            Protect your sender reputation before revenue is impacted.
          </h1>
          <p style={{ margin: 0, maxWidth: 680, color: 'rgba(255,255,255,0.9)' }}>
            SureSend helps small businesses monitor SMTP, DNS posture, blocklist risk, and domain trust with clear remediation workflows.
          </p>
        </header>

        <section style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </section>

        <section
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid rgba(15, 39, 72, 0.12)',
            padding: '1.4rem',
          }}
        >
          <h2 style={{ margin: 0 }}>Subscription Tiers</h2>
          <p style={{ color: '#334155' }}>Starter, Growth, and Pro plans with tenant-based monitoring and reporting.</p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              style={{
                border: 'none',
                borderRadius: 10,
                background: '#1f5f9f',
                color: '#ffffff',
                padding: '0.7rem 1rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Start Free Trial
            </button>
            <button
              type="button"
              style={{
                border: '1px solid #1f5f9f',
                borderRadius: 10,
                background: '#ffffff',
                color: '#1f5f9f',
                padding: '0.7rem 1rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              View API Status
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
