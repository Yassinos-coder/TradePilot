import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { PRICING_PLANS } from '@/lib/pricing';
import { canonicalUrl } from '@/seo/head-tags';
import { APP_FALLBACK_ROUTE, SITE_NAME, SITE_URL, SOCIAL_IMAGE, findSeoRoute } from '@/seo/routes';

const MANAGED_LD_ID = 'tradepilot-structured-data';

function setMetaByName(name: string, content: string) {
  const selector = `meta[name="${name}"]`;
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement('meta');
    element.name = name;
    document.head.appendChild(element);
  }

  element.content = content;
}

function setMetaByProperty(property: string, content: string) {
  const selector = `meta[property="${property}"]`;
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('property', property);
    document.head.appendChild(element);
  }

  element.content = content;
}

function setCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!element) {
    element = document.createElement('link');
    element.rel = 'canonical';
    document.head.appendChild(element);
  }

  element.href = href;
}

function pricingStructuredData() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${SITE_NAME} trade copier`,
    description:
      'MetaTrader trade copier subscription plans with per-account risk control and copy analytics.',
    brand: { '@type': 'Brand', name: SITE_NAME },
    offers: PRICING_PLANS.map((plan) => ({
      '@type': 'Offer',
      name: plan.name,
      price: plan.price.replace('$', ''),
      priceCurrency: 'USD',
      url: `${SITE_URL}/pricing`,
      availability: 'https://schema.org/InStock',
      description: plan.tagline,
    })),
  };
}

function setStructuredData(entries: Record<string, unknown>[]) {
  document.head.querySelectorAll(`script[data-managed="${MANAGED_LD_ID}"]`).forEach((node) => {
    node.remove();
  });

  entries.forEach((entry) => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.managed = MANAGED_LD_ID;
    script.textContent = JSON.stringify(entry);
    document.head.appendChild(script);
  });
}

export function SeoManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    const route = findSeoRoute(pathname);
    const isPublic = Boolean(route);
    const active = route ?? APP_FALLBACK_ROUTE;

    document.title = active.title;
    setMetaByName('description', active.description);
    setMetaByName('robots', isPublic ? 'index, follow, max-image-preview:large' : 'noindex, nofollow');

    if (active.keywords.length) {
      setMetaByName('keywords', active.keywords.join(', '));
    }

    if (!isPublic) {
      setStructuredData([]);
      return;
    }

    const canonical = canonicalUrl(active.path);
    setCanonical(canonical);
    setMetaByProperty('og:type', 'website');
    setMetaByProperty('og:site_name', SITE_NAME);
    setMetaByProperty('og:title', active.title);
    setMetaByProperty('og:description', active.description);
    setMetaByProperty('og:url', canonical);
    setMetaByProperty('og:image', SOCIAL_IMAGE);
    setMetaByProperty('og:image:alt', active.imageAlt);
    setMetaByName('twitter:card', 'summary_large_image');
    setMetaByName('twitter:title', active.title);
    setMetaByName('twitter:description', active.description);
    setMetaByName('twitter:image', SOCIAL_IMAGE);

    const structuredData =
      active.path === '/pricing'
        ? [...active.structuredData, pricingStructuredData()]
        : active.structuredData;

    setStructuredData(structuredData);
  }, [pathname]);

  return null;
}
