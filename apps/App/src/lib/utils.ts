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
