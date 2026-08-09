import { ArrowUpRight, ShieldCheck } from 'lucide-react';

const IC_PARTNER_URL = 'https://ic.com/trading-accounts/overview/?camp=93104';

export function IcPartnerCard() {
  return (
    <aside
      aria-label="IC Markets Global partner offer"
      className="relative isolate overflow-hidden rounded-2xl border border-emerald-400/20 bg-[#041218] shadow-sm"
    >
      <img
        src="/ic-trading-edge.png"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 -z-10 h-full w-full object-cover object-center opacity-75"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#020b10] via-[#020b10]/95 to-[#020b10]/10" />

      <div className="flex min-h-52 max-w-2xl flex-col justify-center px-6 py-7 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-[#19d38a] px-2 text-sm font-black tracking-tight text-[#03120c]">
            IC
          </span>
          <div>
            <p className="text-sm font-semibold text-white">IC Markets Global</p>
            <p className="text-[10px] font-medium tracking-[0.18em] text-emerald-300 uppercase">
              TradePilot partner
            </p>
          </div>
        </div>

        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Your trading edge.
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
          Explore IC Markets Global trading accounts and connect your MetaTrader setup with TradePilot.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <a
            href={IC_PARTNER_URL}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#19d38a] px-4 py-2.5 text-sm font-semibold text-[#03120c] transition-colors hover:bg-[#36e5a0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
          >
            Explore IC accounts
            <ArrowUpRight className="h-4 w-4" />
          </a>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            FSA regulated · SD018
          </span>
        </div>
      </div>

      <p className="border-t border-white/10 bg-black/20 px-6 py-3 text-[10px] leading-4 text-slate-400 sm:px-8">
        Sponsored partner link. Trading securities and CFDs involves significant risk and may result in losses exceeding your deposit. Not suitable for all investors. Availability is subject to jurisdiction.
      </p>
    </aside>
  );
}
