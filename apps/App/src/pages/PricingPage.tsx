import { PricingPlanCard } from '@/components/pricing/PricingPlanCard';
import { PublicSiteLayout } from '@/components/layout/PublicSiteLayout';
import { PRICING_PLANS } from '@/lib/pricing';

export function PricingPage() {
  return (
    <PublicSiteLayout
      title="Simple SaaS pricing"
      subtitle="Choose a plan based on account scale and operational requirements. You can cancel subscriptions at any time from your billing settings."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        {PRICING_PLANS.map((plan) => (
          <PricingPlanCard key={plan.id} plan={plan} />
        ))}
      </div>

      <p className="text-content-tertiary mt-6 text-center text-xs">
        Prices in USD, billed monthly. Cancel at any time — your accounts stay connected until the
        end of the paid period.
      </p>
    </PublicSiteLayout>
  );
}
