export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatLatency(value: number | null | undefined) {
  if (typeof value !== 'number') {
    return 'Awaiting heartbeat';
  }

  return `${Math.round(value)} ms`;
}

export function formatCurrency(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, digits = 2) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }

  return `${value.toFixed(digits)}%`;
}
