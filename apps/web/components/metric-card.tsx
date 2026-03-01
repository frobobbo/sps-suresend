type MetricCardProps = {
  label: string;
  value: string;
  trend: string;
};

export function MetricCard({ label, value, trend }: MetricCardProps) {
  return (
    <article
      style={{
        background: '#ffffff',
        borderRadius: 14,
        padding: '1rem',
        border: '1px solid rgba(15, 39, 72, 0.12)',
        boxShadow: '0 10px 35px rgba(15, 39, 72, 0.08)',
      }}
    >
      <p style={{ margin: 0, color: '#1f5f9f', fontWeight: 700, fontSize: 13 }}>{label}</p>
      <p style={{ margin: '0.35rem 0', fontSize: 28, fontWeight: 800 }}>{value}</p>
      <p style={{ margin: 0, color: '#2f9e8f', fontSize: 13 }}>{trend}</p>
    </article>
  );
}
