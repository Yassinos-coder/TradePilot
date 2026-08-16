import type { SeoRoute } from '../interfaces/seo';
import { SEO_ROUTES, SITE_NAME, SITE_URL, SOCIAL_IMAGE } from './routes';

export const SEO_START = '<!--seo:start-->';
export const SEO_END = '<!--seo:end-->';

export function canonicalUrl(path: string) {
  return path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function renderSeoTags(route: SeoRoute) {
  const canonical = canonicalUrl(route.path);
  const tags = [
    `<title>${escapeAttribute(route.title)}</title>`,
    `<meta name="description" content="${escapeAttribute(route.description)}" />`,
    route.keywords.length
      ? `<meta name="keywords" content="${escapeAttribute(route.keywords.join(', '))}" />`
      : '',
    `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:title" content="${escapeAttribute(route.title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(route.description)}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${SOCIAL_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${escapeAttribute(route.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttribute(route.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttribute(route.description)}" />`,
    `<meta name="twitter:image" content="${SOCIAL_IMAGE}" />`,
    `<meta name="twitter:image:alt" content="${escapeAttribute(route.imageAlt)}" />`,
    ...route.structuredData.map(
      (entry) => `<script type="application/ld+json">${escapeJsonLd(entry)}</script>`,
    ),
  ].filter(Boolean);

  return `${SEO_START}\n    ${tags.join('\n    ')}\n    ${SEO_END}`;
}

export function injectSeoTags(html: string, route: SeoRoute) {
  const pattern = new RegExp(`${SEO_START}[\\s\\S]*?${SEO_END}`);
  return html.replace(pattern, renderSeoTags(route));
}

export function renderSitemap(lastModified: string) {
  const entries = SEO_ROUTES.map(
    (route) =>
      `  <url><loc>${canonicalUrl(route.path)}</loc><lastmod>${lastModified}</lastmod><changefreq>${route.changefreq}</changefreq><priority>${route.priority}</priority></url>`,
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}
