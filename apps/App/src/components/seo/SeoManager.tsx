import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_URL = 'https://tradepilot.sidedevelopments.com';
const PUBLIC_META: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'TradePilot — MetaTrader Trade Copier & Risk Control',
    description: 'Copy trades across MT4 and MT5 accounts in real time with per-account sizing, execution controls, and professional risk guardrails.',
  },
  '/pricing': {
    title: 'Pricing — TradePilot',
    description: 'Choose the TradePilot plan that fits your MetaTrader trade-copying setup.',
  },
  '/terms': { title: 'Terms of Service — TradePilot', description: 'TradePilot terms of service.' },
  '/privacy': { title: 'Privacy Policy — TradePilot', description: 'How TradePilot handles and protects your information.' },
  '/refund': { title: 'Refund Policy — TradePilot', description: 'TradePilot subscription refund policy.' },
};

function setMeta(name: string, content: string) {
  const selector = `meta[name="${name}"]`;
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.name = name;
    document.head.appendChild(element);
  }
  element.content = content;
}

export function SeoManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = PUBLIC_META[pathname];
    const isPublic = Boolean(meta);
    const canonical = `${SITE_URL}${pathname === '/' ? '/' : pathname}`;
    document.title = meta?.title ?? 'TradePilot Workspace';
    setMeta('description', meta?.description ?? 'Secure TradePilot workspace.');
    setMeta('robots', isPublic ? 'index, follow, max-image-preview:large' : 'noindex, nofollow');

    const link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (link) link.href = canonical;
  }, [pathname]);

  return null;
}
