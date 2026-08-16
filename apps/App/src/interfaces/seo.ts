export interface SeoRoute {
  path: string;
  title: string;
  description: string;
  keywords: string[];
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority: string;
  imageAlt: string;
  structuredData: Record<string, unknown>[];
}
