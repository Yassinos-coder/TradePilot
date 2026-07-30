import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export interface TabItem<T extends string> {
  key: T;
  label: string;
  disabled?: boolean;
}

interface TabsProps<T extends string> {
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Underlined tab strip with an indicator that slides to the active tab.
 * Scrolls horizontally on narrow viewports without the page overflowing.
 */
export function Tabs<T extends string>({ items, value, onChange, className }: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }

    const activeTab = list.querySelector<HTMLElement>(`[data-tab-key="${value}"]`);
    if (!activeTab) {
      return;
    }

    setIndicator({ left: activeTab.offsetLeft, width: activeTab.offsetWidth });
  }, [value, items]);

  return (
    <div
      ref={listRef}
      role="tablist"
      className={cn(
        'border-line relative flex items-center gap-4 overflow-x-auto border-b pb-2.5',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {items.map((item) => {
        const isActive = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-tab-key={item.key}
            disabled={item.disabled}
            onClick={() => onChange(item.key)}
            className={cn(
              'shrink-0 cursor-pointer rounded-md px-2 py-1 text-sm font-semibold whitespace-nowrap transition-colors',
              'focus-visible:ring-brand focus-visible:ring-2 focus-visible:outline-none',
              isActive
                ? 'text-content-primary'
                : 'text-content-tertiary hover:bg-surface-muted hover:text-content-secondary',
              item.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
            )}
          >
            {item.label}
          </button>
        );
      })}
      {indicator ? (
        <span
          aria-hidden
          className="bg-content-primary absolute bottom-0 h-0.5 rounded-full transition-[left,width] duration-200 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
        />
      ) : null}
    </div>
  );
}
