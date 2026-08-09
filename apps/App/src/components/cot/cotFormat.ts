import type { CotCategoryDTO, CotTableDTO } from '@tradepilot/shared';

export function formatContracts(value: number) {
  return value.toLocaleString('en-US');
}

export function formatSigned(value: number) {
  if (value === 0) {
    return '0';
  }

  return `${value > 0 ? '+' : '-'}${Math.abs(value).toLocaleString('en-US')}`;
}

export function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

/** Axis labels need to stay short; contract counts run into the millions. */
export function compactContracts(value: number) {
  const magnitude = Math.abs(value);

  if (magnitude >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (magnitude >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }

  return String(Math.round(value));
}

/** Report dates are calendar Tuesdays, so they must not shift with the viewer's timezone. */
export function formatReportDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function findCategory(table: CotTableDTO, key: string): CotCategoryDTO | undefined {
  return table.categories.find((category) => category.key === key);
}
