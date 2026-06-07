export default function PlanBadge({ plan }) {
  const cls = { free: 'badge-free', standard: 'badge-standard', premium: 'badge-premium' };
  const label = { free: 'Free', standard: 'Standard', premium: 'Premium ✦' };
  return <span className={cls[plan] || 'badge-free'}>{label[plan] || plan}</span>;
}
