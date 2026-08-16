import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { ReactNode, useId } from 'react';

import { useOverlayBehavior } from '@/hooks/useOverlayBehavior';

import { Button } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
}

export function Modal({ open, onClose, title, description, footer, children }: ModalProps) {
  const panelRef = useOverlayBehavior<HTMLDivElement>(open, onClose);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            key="backdrop"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="bg-overlay absolute inset-0 backdrop-blur-sm"
          />
          <motion.div
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="border-line bg-surface rounded-card relative z-10 flex max-h-[86vh] w-full max-w-lg flex-col border shadow-2xl focus:outline-none"
          >
            <header className="border-line-subtle flex items-start justify-between gap-3 border-b px-5 py-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-content-primary text-sm font-semibold text-balance">
                  {title}
                </h2>
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
              <footer className="border-line-subtle bg-surface-inset flex items-center justify-end gap-2 border-t px-5 py-4">
                {footer}
              </footer>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  isLoading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-content-secondary text-sm leading-6 text-pretty">{description}</p>
    </Modal>
  );
}
