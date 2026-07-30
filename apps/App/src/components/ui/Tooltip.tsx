import { AnimatePresence, motion } from 'framer-motion';
import { ReactNode, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  side?: 'top' | 'bottom';
}

export function Tooltip({ content, children, className, side = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: side === 'top' ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: side === 'top' ? 4 : -4 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'border-line bg-surface text-content-secondary pointer-events-none absolute z-50 w-max max-w-xs rounded-lg border px-3 py-2 text-xs shadow-lg',
              side === 'top' ? 'bottom-full mb-2 left-1/2 -translate-x-1/2' : 'top-full mt-2 left-1/2 -translate-x-1/2',
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
