import { ArrowDownRight, Crown, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/utils';

const SLAVES = [
  { name: 'Slave · IC Markets 88214', risk: 'Fixed 0.50x', status: 'Copied' },
  { name: 'Slave · Alpha Capital 40K', risk: 'Balance ratio', status: 'Copied' },
  { name: 'Slave · Pepperstone 71903', risk: 'Risk 1.0%', status: 'Sizing' },
];

export function AuthShowcase({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative isolate overflow-hidden rounded-[28px] border border-white/10 bg-[#07110f] p-7 shadow-[0_40px_120px_-50px_rgba(9,19,17,0.9)]',
        className,
      )}
    >
      <div className="absolute -top-24 -right-16 -z-10 h-72 w-72 rounded-full bg-[#25c7b7] opacity-20 blur-3xl" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/tradepilot-mark.svg" alt="" className="h-9 w-9" />
          <div>
            <p className="text-sm font-semibold text-white">Copier</p>
            <p className="text-[10px] font-medium tracking-[0.18em] text-emerald-300/80 uppercase">
              Master → 3 slaves
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-medium text-emerald-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Live
        </span>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] tracking-wide text-slate-400">Equity mirrored today</p>
            <p className="tabular mt-1 text-3xl font-semibold tracking-tight text-white">
              $18,420.65
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-400/15 px-2 py-1 text-xs font-semibold text-emerald-300">
            <TrendingUp className="h-3.5 w-3.5" />
            +4.82%
          </span>
        </div>

        <svg viewBox="0 0 320 96" className="mt-4 h-24 w-full" fill="none" preserveAspectRatio="none">
          <defs>
            <linearGradient id="auth-spark" x1="0" y1="0" x2="0" y2="96" gradientUnits="userSpaceOnUse">
              <stop stopColor="#25c7b7" stopOpacity=".35" />
              <stop offset="1" stopColor="#25c7b7" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 78 40 66 80 71 120 48 160 55 200 32 240 38 280 18 320 8V96H0z"
            fill="url(#auth-spark)"
          />
          <path
            d="M0 78 40 66 80 71 120 48 160 55 200 32 240 38 280 18 320 8"
            stroke="#5eead4"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="mt-5 space-y-2.5">
        <div className="flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3">
          <Crown className="h-4 w-4 shrink-0 text-emerald-300" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
            Master · FTMO 5218804
          </span>
          <span className="tabular text-xs text-emerald-300">XAUUSD 0.40</span>
        </div>

        {SLAVES.map((slave) => (
          <div
            key={slave.name}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
          >
            <ArrowDownRight className="h-4 w-4 shrink-0 text-slate-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-200">{slave.name}</p>
              <p className="text-[11px] text-slate-500">{slave.risk}</p>
            </div>
            <span
              className={cn(
                'shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold tracking-wide uppercase',
                slave.status === 'Copied'
                  ? 'bg-emerald-400/15 text-emerald-300'
                  : 'bg-amber-400/15 text-amber-300',
              )}
            >
              {slave.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
