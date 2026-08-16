import { AnimatePresence, motion } from 'framer-motion';
import { cloneElement, useId, useState, type ReactElement, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface TooltipProps {
  content: ReactNode;
  children: ReactElement<{ 'aria-describedby'?: string }>;
  className?: string;
  side?: 'top' | 'bottom';
}

export function Tooltip({ content, children, className, side = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();

  const show = () => setVisible(true);
  const hide = () => setVisible(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {cloneElement(children, { 'aria-describedby': visible ? tooltipId : undefined })}
      <AnimatePresence>
        {visible && (
          <motion.div
            id={tooltipId}
            role="tooltip"
            initial={{ opacity: 0, y: side === 'top' ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: side === 'top' ? 4 : -4 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'border-line bg-surface text-content-secondary pointer-events-none absolute z-50 w-max max-w-xs rounded-lg border px-3 py-2 text-xs shadow-lg',
              side === 'top'
                ? 'bottom-full left-1/2 mb-2 -translate-x-1/2'
                : 'top-full left-1/2 mt-2 -translate-x-1/2',
              className,
            )}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
