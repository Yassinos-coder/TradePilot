import { CalendarDays } from 'lucide-react';

import { Card } from '@/components/ui/Card';

export function NewsCalendarPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md p-10 text-center">
        <div className="bg-brand-subtle mx-auto flex h-14 w-14 items-center justify-center rounded-2xl">
          <CalendarDays className="text-brand h-7 w-7" aria-hidden="true" />
        </div>

        <h1 className="text-content-primary mt-6 text-2xl font-semibold tracking-tight">
          Economic Calendar
        </h1>

        <p className="text-brand mt-2 text-xs font-semibold tracking-[0.14em] uppercase">
          Coming soon
        </p>

        <p className="text-content-secondary mt-4 text-sm leading-relaxed">
          We&rsquo;re rebuilding the calendar on a data source that reports released figures, not
          just the schedule. It will be back once the numbers can be trusted.
        </p>
      </Card>
    </div>
  );
}
