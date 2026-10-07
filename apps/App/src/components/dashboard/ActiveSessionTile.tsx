import { Globe2 } from 'lucide-react';

import { ForexSessionUtils } from '@/lib/forexSessions';

interface ActiveSessionTileProps {
  now: Date;
}

export function ActiveSessionTile({ now }: ActiveSessionTileProps) {
  const openSessions = ForexSessionUtils.getOpenSessions(now);

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-content-tertiary">Active Session</p>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-muted">
          <Globe2 className="h-5 w-5 text-content-tertiary" />
        </div>
        <div className="flex flex-col gap-0.5">
          {openSessions.length === 0 ? (
            <p className="text-lg font-bold leading-tight tracking-tight text-content-tertiary">Market closed</p>
          ) : (
            openSessions.map((session) => (
              <p key={session.key} className={`text-lg font-bold leading-tight tracking-tight ${session.textClass}`}>
                {session.label}
              </p>
            ))
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-content-tertiary">
        {now.toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
      </p>
    </div>
  );
}
