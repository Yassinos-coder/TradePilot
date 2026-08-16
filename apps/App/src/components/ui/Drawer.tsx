import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { ReactNode, useId } from 'react';

import { useOverlayBehavior } from '@/hooks/useOverlayBehavior';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
}

export function Drawer({ open, onClose, title, description, footer, children }: DrawerProps) {
  const panelRef = useOverlayBehavior<HTMLElement>(open, onClose);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="backdrop"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="bg-overlay fixed inset-0 z-40 backdrop-blur-sm"
          />
          <motion.aside
            key="drawer"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : 'Details'}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="border-line bg-surface fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l pb-[env(safe-area-inset-bottom)] shadow-2xl focus:outline-none"
          >
            <header className="border-line-subtle flex items-start justify-between gap-3 border-b px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <div className="min-w-0">
                {title ? (
                  <h2
                    id={titleId}
                    className="text-content-primary text-sm font-semibold text-balance"
                  >
                    {title}
                  </h2>
                ) : null}
                {description ? (
                  <p id={descriptionId} className="text-content-tertiary mt-0.5 text-xs leading-5">
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-content-tertiary hover:bg-surface-muted hover:text-content-primary focus-visible:ring-brand shrink-0 cursor-pointer rounded-lg p-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
            {footer ? (
              <footer className="border-line-subtle bg-surface-inset border-t px-5 py-4">
                {footer}
              </footer>
            ) : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
