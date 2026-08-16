import type { SeoRoute } from '../interfaces/seo';
import { TRADE_COPIER_FAQ } from './faq';

export const SITE_URL = 'https://tradepilot.sidedevelopments.com';
export const SITE_NAME = 'TradePilot';
export const SOCIAL_IMAGE = `${SITE_URL}/social-card.png`;

const ORGANIZATION = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/tradepilot-mark.svg`,
};

function breadcrumb(name: string, path: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name, item: `${SITE_URL}${path}` },
    ],
  };
}

export const SEO_ROUTES: SeoRoute[] = [
  {
    path: '/',
    title: 'MT4 & MT5 Trade Copier — Copy Trades Across Accounts | TradePilot',
    description:
      'Copy trades between MT4 and MT5 accounts in real time. Mirror every entry, exit and SL/TP change from one master account, with independent risk on every slave.',
    keywords: [
      'trade copier',
      'metatrader trade copier',
      'mt4 trade copier',
      'mt5 trade copier',
      'copy trading software',
      'trade copying software',
      'forex trade copier',
      'copy trades between accounts',
      'multi account trade copier',
      'master slave trade copier',
    ],
    changefreq: 'weekly',
    priority: '1.0',
    imageAlt: 'TradePilot — copy trades, control risk, scale smarter.',
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Web, MetaTrader 4, MetaTrader 5',
        description:
          'MetaTrader trade copier that mirrors trades from a master account to unlimited slave accounts with per-account risk control.',
        featureList: [
          'Real-time MT4 and MT5 trade copying',
          'Per-account lot sizing and risk parameters',
          'Broker symbol remapping',
          'Daily loss, drawdown and equity guardrails',
          'Directional trading analytics',
        ],
        publisher: ORGANIZATION,
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'USD',
          lowPrice: '0',
          highPrice: '39',
          offerCount: '3',
          url: `${SITE_URL}/pricing`,
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        publisher: ORGANIZATION,
      },
    ],
  },
  {
    path: '/trade-copier',
    title: 'What Is a Trade Copier? MT4 & MT5 Copy Trading Explained',
    description:
      'How trade copying works between MetaTrader accounts: master and slave setup, lot sizing modes, broker symbol mapping, prop firm risk rules and VPS requirements.',
    keywords: [
      'what is a trade copier',
      'how does trade copying work',
      'copy trades mt4 to mt5',
      'trade copier for prop firms',
      'forex copy trading',
      'lot size multiplier trade copier',
      'trade copier symbol mapping',
      'best trade copier for metatrader',
    ],
    changefreq: 'monthly',
    priority: '0.9',
    imageAlt: 'How MetaTrader trade copying works with TradePilot.',
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: TRADE_COPIER_FAQ.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
      breadcrumb('Trade copier guide', '/trade-copier'),
    ],
  },
  {
    path: '/pricing',
    title: 'Trade Copier Pricing — Free, Pro & Pro+ | TradePilot',
    description:
      'TradePilot trade copier plans start free. Compare connected account limits, per-link risk controls, analytics and REST trade API access. Cancel any time.',
    keywords: [
      'trade copier pricing',
      'copy trading software cost',
      'metatrader trade copier price',
      'free trade copier',
      'trade copier subscription',
    ],
    changefreq: 'monthly',
    priority: '0.8',
    imageAlt: 'TradePilot pricing plans for MetaTrader trade copying.',
    structuredData: [breadcrumb('Pricing', '/pricing')],
  },
  {
    path: '/terms',
    title: 'Terms of Service — TradePilot',
    description: 'The terms that govern your use of the TradePilot trade copying platform.',
    keywords: ['tradepilot terms of service'],
    changefreq: 'yearly',
    priority: '0.3',
    imageAlt: 'TradePilot terms of service.',
    structuredData: [breadcrumb('Terms of Service', '/terms')],
  },
  {
    path: '/privacy',
    title: 'Privacy Policy — TradePilot',
    description:
      'How TradePilot collects, handles and protects your account information and trading data.',
    keywords: ['tradepilot privacy policy'],
    changefreq: 'yearly',
    priority: '0.3',
    imageAlt: 'TradePilot privacy policy.',
    structuredData: [breadcrumb('Privacy Policy', '/privacy')],
  },
  {
    path: '/refund',
    title: 'Refund Policy — TradePilot',
    description: 'The refund terms for TradePilot subscription plans.',
    keywords: ['tradepilot refund policy'],
    changefreq: 'yearly',
    priority: '0.3',
    imageAlt: 'TradePilot refund policy.',
    structuredData: [breadcrumb('Refund Policy', '/refund')],
  },
];

export const APP_FALLBACK_ROUTE: SeoRoute = {
  path: '/app',
  title: 'TradePilot Workspace',
  description: 'Secure TradePilot workspace.',
  keywords: [],
  changefreq: 'weekly',
  priority: '0.1',
  imageAlt: 'TradePilot workspace.',
  structuredData: [],
};

/*
  Static hosts serve the prerendered files from /pricing/ as well as /pricing, so
  the lookup has to ignore a trailing slash. Matching strictly would drop those
  requests onto the app fallback and mark a public page noindex.
*/
export function findSeoRoute(pathname: string) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname;
  return SEO_ROUTES.find((route) => route.path === normalized);
}
