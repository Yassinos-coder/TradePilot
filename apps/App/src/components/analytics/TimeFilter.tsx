import { cn } from '@/lib/utils';

export type DateRange = 'today' | 'week' | 'month' | 'year' | 'all';

const OPTIONS: Array<{ label: string; value: DateRange }> = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'This Year', value: 'year' },
  { label: 'All History', value: 'all' },
];

export function dateRangeToParams(range: DateRange): { startDate?: string; endDate?: string } {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const today = `${yyyy}-${mm}-${dd}`;

  if (range === 'today') return { startDate: today, endDate: today };

  if (range === 'week') {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const ws = weekStart.toISOString().slice(0, 10);
    return { startDate: ws, endDate: today };
  }

  if (range === 'month') {
    return { startDate: `${yyyy}-${mm}-01`, endDate: today };
  }

  if (range === 'year') {
    return { startDate: `${yyyy}-01-01`, endDate: today };
  }

  return {};
}

interface TimeFilterProps {
  value: DateRange;
  onChange: (value: DateRange) => void;
}

export function TimeFilter({ value, onChange }: TimeFilterProps) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface-muted p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            value === opt.value
              ? 'bg-surface text-content-primary shadow-sm'
              : 'text-content-tertiary hover:text-content-secondary',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
