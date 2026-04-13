import { cn } from '../../lib/utils';

interface TradePilotLogoProps {
  className?: string;
  compact?: boolean;
  showTagline?: boolean;
}

export function TradePilotLogo({
  className,
  compact = false,
  showTagline = true,
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
          {showTagline ? (
            <p className="text-[0.62rem] uppercase tracking-[0.32em] text-cyan-300/70">
              Signal Execution
            </p>
          ) : null}
          <div className="mt-1 flex items-baseline text-[1.65rem] font-semibold tracking-[-0.045em]">
            <span className="text-white">Trade</span>
            <span className="text-cyan-300">Pilot</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
