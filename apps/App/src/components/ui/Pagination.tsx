import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  onPageChange: (page: number) => void;
  className?: string;
}

function getPageNumbers(current: number, total: number): Array<number | '…'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  if (current <= 4) {
    return [1, 2, 3, 4, 5, '…', total];
  }

  if (current >= total - 3) {
    return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  }

  return [1, '…', current - 1, current, current + 1, '…', total];
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  onPageChange,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPageNumbers(page, totalPages);

  return (
    <div
      className={cn(
        'border-line-subtle flex items-center justify-between gap-4 border-t pt-4',
        className,
      )}
    >
      <p className="text-content-tertiary text-xs">
        {startIndex}–{endIndex} of {totalItems}
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          className="text-content-tertiary hover:bg-surface-muted hover:text-content-primary flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {pages.map((p, i) =>
          p === '…' ? (
            <span
              key={`ellipsis-${i}`}
              className="text-content-tertiary flex h-7 w-7 items-center justify-center text-xs"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={cn(
                'flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-xs font-semibold transition-colors',
                p === page
                  ? 'bg-brand text-brand-fg'
                  : 'text-content-secondary hover:bg-surface-muted hover:text-content-primary',
              )}
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          disabled={page === totalPages}
          onClick={() => onPageChange(page + 1)}
          className="text-content-tertiary hover:bg-surface-muted hover:text-content-primary flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
