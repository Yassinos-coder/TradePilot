import { useState } from 'react';
import { ArrowUpRight, BadgeCheck, Check, Copy, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface PartnerOffer {
  id: string;
  name: string;
  mark: string;
  href: string;
  image: string;
  headline: string;
  body: string;
  cta: string;
  note: string;
  noteIcon: LucideIcon;
  code: string | null;
  scrim: string;
  markClass: string;
  eyebrowClass: string;
  buttonClass: string;
  noteIconClass: string;
}

const IC_MARKETS: PartnerOffer = {
  id: 'ic-markets',
  name: 'IC Markets Global',
  mark: 'IC',
  href: 'https://ic.com/trading-accounts/overview/?camp=93104',
  image: '/ic-trading-edge.png',
  headline: 'Your trading edge.',
  body: 'Explore IC Markets Global trading accounts and connect your MetaTrader setup with TradePilot.',
  cta: 'Explore IC accounts',
  note: 'FSA regulated · SD018',
  noteIcon: ShieldCheck,
  code: null,
  scrim: 'from-[#020b10] via-[#020b10]/92 to-[#020b10]/35',
  markClass: 'bg-[#19d38a] text-[#03120c]',
  eyebrowClass: 'text-emerald-300',
  buttonClass: 'bg-[#19d38a] text-[#03120c] hover:bg-[#36e5a0] focus-visible:outline-emerald-300',
  noteIconClass: 'text-emerald-400',
};

const ALPHA_CAPITAL: PartnerOffer = {
  id: 'alpha-capital',
  name: 'Alpha Capital Group',
  mark: 'ACG',
  href: 'https://app.alphacapitalgroup.uk/signup/KFOCU',
  image: '/alpha-capital-edge.svg',
  headline: 'Trade funded capital.',
  body: 'Pass an Alpha Capital Group challenge, then mirror your funded account across every terminal you run.',
  cta: 'Get funded with Alpha',
  note: 'Up to 90% profit split',
  noteIcon: BadgeCheck,
  code: 'KFOCU',
  scrim: 'from-[#04070f] via-[#04070f]/92 to-[#04070f]/35',
  markClass: 'bg-[#2f6bff] text-white',
  eyebrowClass: 'text-blue-300',
  buttonClass: 'bg-[#2f6bff] text-white hover:bg-[#5185ff] focus-visible:outline-blue-300',
  noteIconClass: 'text-blue-400',
};

function PartnerCodeChip({ code, accentClass }: { code: string; accentClass: string }) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return;
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={() => void copyCode()}
      aria-label={`Copy partner code ${code}`}
      className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10"
    >
      <span className={`text-[9px] font-medium tracking-[0.18em] uppercase ${accentClass}`}>
        Code
      </span>
      <span className="tabular tracking-[0.14em]">{code}</span>
      {copied ? (
        <Check className={`h-3.5 w-3.5 ${accentClass}`} />
      ) : (
        <Copy className="h-3.5 w-3.5 text-slate-400" />
      )}
    </button>
  );
}

function PartnerPanel({ partner }: { partner: PartnerOffer }) {
  const NoteIcon = partner.noteIcon;

  return (
    <div className="relative isolate flex min-h-52 flex-col justify-center overflow-hidden px-6 py-6 sm:px-7">
      <img
        src={partner.image}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 -z-10 h-full w-full object-cover object-center opacity-80"
      />
      <div className={`absolute inset-0 -z-10 bg-gradient-to-r ${partner.scrim}`} />

      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-black tracking-tight ${partner.markClass}`}
        >
          {partner.mark}
        </span>
        <div>
          <p className="text-sm font-semibold text-white">{partner.name}</p>
          <p
            className={`text-[10px] font-medium tracking-[0.18em] uppercase ${partner.eyebrowClass}`}
          >
            TradePilot partner
          </p>
        </div>
      </div>

      <h2 className="mt-4 text-xl font-semibold tracking-tight text-white sm:text-2xl">
        {partner.headline}
      </h2>
      <p className="mt-2 max-w-sm text-xs leading-5 text-slate-300">{partner.body}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <a
          href={partner.href}
          target="_blank"
          rel="sponsored noopener noreferrer"
          className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${partner.buttonClass}`}
        >
          {partner.cta}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>

        {partner.code ? (
          <PartnerCodeChip code={partner.code} accentClass={partner.eyebrowClass} />
        ) : null}
      </div>

      <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-slate-400">
        <NoteIcon className={`h-3.5 w-3.5 ${partner.noteIconClass}`} />
        {partner.note}
      </span>
    </div>
  );
}

function PartnerDivider() {
  return (
    <div
      aria-hidden="true"
      className="relative flex items-center justify-center overflow-hidden px-6 py-1 md:w-10 md:px-0 md:py-0"
    >
      <span className="h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent md:hidden" />
      <span className="absolute hidden h-[130%] w-px rotate-[16deg] bg-gradient-to-b from-transparent via-white/25 to-transparent md:block" />
    </div>
  );
}

export function PartnerOffersBanner() {
  return (
    <aside
      aria-label="TradePilot partner offers"
      className="overflow-hidden rounded-2xl border border-white/10 bg-[#04070f] shadow-sm"
    >
      <div className="grid md:grid-cols-[1fr_auto_1fr]">
        <PartnerPanel partner={IC_MARKETS} />
        <PartnerDivider />
        <PartnerPanel partner={ALPHA_CAPITAL} />
      </div>

      <p className="border-t border-white/10 bg-black/25 px-6 py-3 text-[10px] leading-4 text-slate-400 sm:px-8">
        Sponsored partner links. Trading securities and CFDs involves significant risk and may
        result in losses exceeding your deposit. Proprietary trading evaluations carry fees and are
        not investment products. Availability is subject to jurisdiction.
      </p>
    </aside>
  );
}
