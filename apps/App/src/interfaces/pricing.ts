export interface PricingPlan {
  id: string;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  highlight: string;
  features: string[];
  cta: string;
  featured?: boolean;
}
