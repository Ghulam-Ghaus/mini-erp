import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Button } from './button.js';

export interface DialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly maxWidthClass?: string;
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  maxWidthClass = 'max-w-lg',
}: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex max-h-[90vh] w-full ${maxWidthClass} flex-col overflow-hidden rounded border border-[#d6d3c9] bg-white`}
      >
        <div className="flex items-center justify-between border-b border-[#e4e2da] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[#1f1e1b]">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-[#5c5a53]">{description}</p>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Close"
            onClick={onClose}
            icon={<X className="h-4 w-4" />}
          />
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-[#e4e2da] bg-[#faf9f5] px-4 py-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export interface DrawerProps {
  readonly open: boolean;
  readonly title: string;
  readonly subtitle?: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly widthClass?: string;
}

/**
 * Slide-over Drawer for quick-add forms and detail inspection (Section 10).
 */
export function Drawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  widthClass = 'max-w-2xl',
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex justify-end bg-black/25"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex h-full w-full ${widthClass} flex-col border-s border-[#d6d3c9] bg-white`}
      >
        <div className="flex items-center justify-between border-b border-[#e4e2da] px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[#1f1e1b]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-[#5c5a53]">{subtitle}</p>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Close"
            onClick={onClose}
            icon={<X className="h-4 w-4" />}
          />
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly variant?: 'primary' | 'danger';
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      maxWidthClass="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} shortcutHint="Esc">
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="p-4 text-xs text-[#5c5a53]">{message}</div>
    </Dialog>
  );
}
