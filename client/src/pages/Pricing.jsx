import { Link } from 'react-router-dom';

const plans = [
  {
    name: 'Free',
    price: '$0',
    color: 'border-gray-200',
    badge: 'badge-free',
    features: ['10 photos per session', '1 active session', 'ZIP download', 'Guest join (no login required)'],
    missing: ['QR code join', 'RSVP link', 'Invite poster', 'Google Drive export'],
  },
  {
    name: 'Standard',
    price: '$9.99/mo',
    color: 'border-brand-500 ring-2 ring-brand-200',
    badge: 'badge-standard',
    highlight: true,
    features: ['200 photos per session', '5 active sessions', 'ZIP download', 'QR code join link', 'Guest join (no login required)'],
    missing: ['RSVP link', 'Invite poster', 'Google Drive export'],
  },
  {
    name: 'Premium',
    price: '$24.99/mo',
    color: 'border-amber-400 ring-2 ring-amber-100',
    badge: 'badge-premium',
    features: ['Unlimited photos', 'Unlimited sessions', 'ZIP download', 'QR code join link', 'RSVP link + guest list', 'Invite poster (PNG download)', 'Google Drive export', 'Guest join (no login required)'],
    missing: [],
  },
];

export default function Pricing() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-16">
      <h1 className="text-4xl font-bold text-center mb-3">Simple Pricing</h1>
      <p className="text-center text-gray-500 mb-12">Start free, upgrade when you need more.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div key={plan.name} className={`card border-2 ${plan.color} relative`}>
            {plan.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-xs px-3 py-1 rounded-full">
                Most Popular
              </span>
            )}
            <span className={`${plan.badge} mb-3 inline-block`}>{plan.name}</span>
            <div className="text-3xl font-bold mb-4">{plan.price}</div>
            <ul className="space-y-2 mb-6">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-green-500 mt-0.5">✓</span> {f}
                </li>
              ))}
              {plan.missing.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-gray-400">
                  <span className="mt-0.5">✗</span> {f}
                </li>
              ))}
            </ul>
            <Link to="/register" className={`block text-center py-2 rounded-lg font-medium text-sm transition-colors ${plan.highlight ? 'btn-primary' : 'btn-secondary'}`}>
              Get Started
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
