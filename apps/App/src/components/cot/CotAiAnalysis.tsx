import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  Gauge,
  Minus,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

import type { CotAiAnalysisDTO, CotAiBias, CotAiSignalDTO } from '@tradepilot/shared';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

const biasPresentation: Record<
  CotAiBias,
  { label: string; tone: BadgeTone; icon: typeof ArrowUpRight; accent: string }
> = {
  BULLISH: {
    label: 'Bullish',
    tone: 'positive',
    icon: ArrowUpRight,
    accent: 'border-l-positive',
  },
  BEARISH: {
    label: 'Bearish',
    tone: 'danger',
    icon: ArrowDownRight,
    accent: 'border-l-negative',
  },
  NEUTRAL: {
    label: 'Neutral',
    tone: 'neutral',
    icon: Minus,
    accent: 'border-l-content-tertiary',
  },
};

const categoryIcons: Record<CotAiSignalDTO['category'], typeof Gauge> = {
  POSITIONING: Gauge,
  MOMENTUM: ArrowUpRight,
  EXTREME: AlertTriangle,
  COMMERCIALS: ShieldAlert,
  RISK: AlertTriangle,
};

export function CotAiAnalysis({ analysis }: { analysis: CotAiAnalysisDTO }) {
  const overall = biasPresentation[analysis.overall.bias];
  const OverallIcon = overall.icon;

  return (
    <Card
      eyebrow="Claude AI analyst"
      title="Positioning interpretation"
      description={`Structured analysis for the ${analysis.reportDate} CFTC release`}
      actions={
        <Badge tone="brand">
          <Sparkles className="h-3 w-3" /> AI generated
        </Badge>
      }
      bodyClassName="space-y-4"
    >
      <div
        className={cn(
          'bg-surface-muted rounded-card grid gap-4 border-l-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center',
          overall.accent,
        )}
      >
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={overall.tone} dot>
              {overall.label}
            </Badge>
            <span className="text-content-tertiary text-xs font-medium">
              {analysis.overall.conviction}% conviction
            </span>
          </div>
          <h3 className="text-content-primary text-base font-semibold">{analysis.overall.title}</h3>
          <p className="text-content-secondary max-w-3xl text-sm leading-6">
            {analysis.overall.summary}
          </p>
        </div>
        <div className="bg-surface flex h-16 w-16 items-center justify-center rounded-full shadow-sm">
          <OverallIcon className="text-content-primary h-7 w-7" />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {analysis.signals.map((signal, index) => {
          const presentation = biasPresentation[signal.bias];
          const CategoryIcon = categoryIcons[signal.category];

          return (
            <article
              key={`${signal.category}-${index}`}
              className={cn(
                'border-line bg-surface rounded-card flex min-h-48 flex-col border border-l-4 p-4',
                presentation.accent,
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="bg-surface-muted rounded-lg p-2">
                  <CategoryIcon className="text-content-secondary h-4 w-4" />
                </div>
                <Badge tone={presentation.tone}>{presentation.label}</Badge>
              </div>
              <p className="text-content-tertiary mt-3 text-[10px] font-semibold tracking-widest uppercase">
                {signal.category} · {signal.strength} strength
              </p>
              <h4 className="text-content-primary mt-1 text-sm font-semibold">{signal.title}</h4>
              <div className="bg-surface-muted text-content-primary mt-3 rounded-lg px-3 py-2 text-xs font-semibold">
                {signal.metric}
              </div>
              <p className="text-content-secondary mt-3 text-xs leading-5">{signal.insight}</p>
            </article>
          );
        })}
      </div>

      <div className="text-content-tertiary flex items-start gap-2 text-[11px] leading-5">
        <BrainCircuit className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{analysis.disclaimer}</span>
      </div>
    </Card>
  );
}
