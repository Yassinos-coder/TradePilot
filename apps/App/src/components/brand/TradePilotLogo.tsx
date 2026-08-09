import { cn } from '../../lib/utils';

interface TradePilotLogoProps {
  className?: string;
  compact?: boolean;
  showTagline?: boolean;
  inverse?: boolean;
}

export function TradePilotLogo({
  className,
  compact = false,
  showTagline = true,
  inverse = false,
}: TradePilotLogoProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <img
        src="/tradepilot-mark.svg"
        alt="TradePilot logo"
        className={cn(
          'shrink-0 drop-shadow-[0_18px_30px_rgba(34,211,238,0.2)]',
          compact ? 'h-10 w-10' : 'h-12 w-12',
        )}
      />

      {!compact ? (
        <div className="min-w-0">
          <div className="flex items-baseline text-[1.4rem] font-bold tracking-[-0.045em]">
            <span className={inverse ? 'text-white' : 'text-content-primary'}>Trade</span>
            <span className="text-brand">Pilot</span>
          </div>
          {showTagline ? (
            <p className={cn('mt-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.22em]', inverse ? 'text-white/45' : 'text-content-tertiary')}>
              Copy · Control · Scale
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
