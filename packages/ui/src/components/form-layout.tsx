import type { FormEvent, ReactNode } from 'react';
import { Button } from './button.js';

export interface FormLayoutLabels {
  readonly save: string;
  readonly saveAndNew?: string;
  readonly cancel: string;
}

export interface FormLayoutProps {
  readonly onSubmit: () => void;
  readonly onSaveAndNew?: () => void;
  readonly onCancel: () => void;
  readonly isSubmitting?: boolean;
  readonly labels: FormLayoutLabels;
  readonly children: ReactNode;
  readonly footerSlot?: ReactNode;
}

/**
 * Standard Form layout (Section 10):
 * 2-column grid + standard Save (Ctrl+S), Save & New, and Cancel (Esc) footer bar.
 */
export function FormLayout({
  onSubmit,
  onSaveAndNew,
  onCancel,
  isSubmitting = false,
  labels,
  children,
  footerSlot,
}: FormLayoutProps) {
  const handleFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleFormSubmit} noValidate className="flex flex-col bg-white">
      <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">{children}</div>
      {footerSlot && <div className="border-t border-[#e4e2da] px-5 py-4">{footerSlot}</div>}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#e4e2da] bg-[#faf9f5] px-5 py-3">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting} shortcutHint="Esc">
          {labels.cancel}
        </Button>
        {onSaveAndNew && labels.saveAndNew && (
          <Button variant="secondary" onClick={onSaveAndNew} disabled={isSubmitting}>
            {labels.saveAndNew}
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={isSubmitting} shortcutHint="Ctrl+S">
          {labels.save}
        </Button>
      </div>
    </form>
  );
}
