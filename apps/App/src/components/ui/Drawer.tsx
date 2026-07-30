import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { ReactNode, useEffect } from 'react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
}

export function Drawer({ open, onClose, title, description, footer, children }: DrawerProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="bg-overlay fixed inset-0 z-40 backdrop-blur-sm"
          />
          <motion.aside
            key="drawer"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="border-line bg-surface fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l shadow-2xl"
          >
            <header className="border-line-subtle flex items-start justify-between gap-3 border-b px-5 py-4">
              <div className="min-w-0">
                {title ? (
                  <h2 className="text-content-primary text-sm font-semibold">{title}</h2>
                ) : null}
                {description ? (
                  <p className="text-content-tertiary mt-0.5 text-xs leading-5">{description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-content-tertiary hover:bg-surface-muted hover:text-content-primary shrink-0 cursor-pointer rounded-lg p-1.5 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
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
