import type { PricingPlan } from '@/interfaces/pricing';

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'Forever',
    tagline: 'Connect a master and one slave, and watch the bridge work.',
    highlight: 'No card required',
    features: [
      '2 connected MetaTrader accounts',
      '1 master → 1 slave link',
      'Live copy feed and trade history',
      'Calculators, news and COT report',
      'Community support',
    ],
    cta: 'Start free',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$19',
    cadence: 'Per month',
    tagline: 'The full risk engine for a serious multi-account setup.',
    highlight: 'Most popular',
    featured: true,
    features: [
      'Up to 5 connected accounts',
      'Unlimited master → slave links',
      'Full per-link risk parameters',
      'Daily loss, drawdown and equity guardrails',
      'Advanced analytics and history import',
      'Email notifications',
    ],
    cta: 'Choose Pro',
  },
  {
    id: 'pro-plus',
    name: 'Pro+',
    price: '$39',
    cadence: 'Per month',
    tagline: 'Scale past a handful of accounts and drive TradePilot from your own stack.',
    highlight: 'For account managers',
    features: [
      'Unlimited connected accounts',
      'Priority copy dispatch queue',
      'REST trade API access',
      'API key rotation and request signing',
      'Priority support',
    ],
    cta: 'Choose Pro+',
  },
];
