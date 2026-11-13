import { Download, FileText, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from './button.js';
import { Dialog } from './dialog.js';

function isPdfAttachment(fileUrl: string, mimeType?: string | null, fileName?: string): boolean {
  if (mimeType?.toLowerCase().includes('pdf')) return true;
  if (fileUrl.toLowerCase().startsWith('data:application/pdf')) return true;
  return Boolean(fileName?.toLowerCase().endsWith('.pdf'));
}

export interface ProofViewerLabels {
  readonly zoomIn?: string;
  readonly zoomOut?: string;
  readonly resetZoom?: string;
  readonly download?: string;
  readonly close?: string;
}

export interface ProofViewerDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly fileUrl: string | null;
  readonly fileName?: string;
  readonly mimeType?: string | null;
  readonly title?: string;
  readonly labels?: ProofViewerLabels;
}

/**
 * Full-screen/large lightbox modal for viewing uploaded payment proofs (images and PDFs).
 */
export function ProofViewerDialog({
  open,
  onClose,
  fileUrl,
  fileName = 'proof',
  mimeType,
  title,
  labels,
}: ProofViewerDialogProps) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (open) setZoom(1);
  }, [open, fileUrl]);

  if (!fileUrl) return null;

  const isPdf = isPdfAttachment(fileUrl, mimeType, fileName);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title ?? fileName}
      maxWidthClass="max-w-4xl"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {!isPdf && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                  icon={<ZoomOut className="h-3.5 w-3.5" />}
                  aria-label={labels?.zoomOut ?? 'Zoom out'}
                />
                <span className="erp-num min-w-[48px] text-center text-xs font-medium text-[#5c5a53]">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                  icon={<ZoomIn className="h-3.5 w-3.5" />}
                  aria-label={labels?.zoomIn ?? 'Zoom in'}
                />
                {zoom !== 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setZoom(1)}
                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                    aria-label={labels?.resetZoom ?? 'Reset zoom'}
                  />
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownload}
              icon={<Download className="h-3.5 w-3.5" />}
            >
              {labels?.download ?? 'Download'}
            </Button>
            <Button variant="primary" size="sm" onClick={onClose}>
              {labels?.close ?? 'Close'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex max-h-[75vh] min-h-[320px] items-center justify-center overflow-auto bg-[#f7f6f2] p-4">
        {isPdf ? (
          <iframe
            src={fileUrl}
            title={fileName}
            className="h-[70vh] w-full rounded border border-[#d6d3c9] bg-white"
          />
        ) : (
          <img
            src={fileUrl}
            alt={fileName}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
            className="max-h-[70vh] max-w-full rounded border border-[#d6d3c9] bg-white object-contain transition-transform duration-150"
          />
        )}
      </div>
    </Dialog>
  );
}

export interface ProofThumbnailCardProps {
  readonly fileUrl: string;
  readonly fileName: string;
  readonly mimeType?: string | null;
  readonly viewLabel?: string;
  readonly onClick: () => void;
}

/**
 * Clickable proof preview card for payment/receipt detail modals.
 */
export function ProofThumbnailCard({
  fileUrl,
  fileName,
  mimeType,
  viewLabel = 'View',
  onClick,
}: ProofThumbnailCardProps) {
  const isPdf = isPdfAttachment(fileUrl, mimeType, fileName);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col items-center gap-1.5 rounded border border-[#d6d3c9] bg-[#faf9f5] p-2 text-start transition-colors hover:border-[#2c2b28] hover:bg-[#f1efe9] cursor-pointer"
      title={fileName}
    >
      <div className="relative flex h-36 w-44 items-center justify-center overflow-hidden rounded bg-white">
        {isPdf ? (
          <div className="flex flex-col items-center gap-1.5 text-[#5c5a53]">
            <FileText className="h-9 w-9 text-[#9e3b33]" />
            <span className="text-[11px] font-medium">PDF</span>
          </div>
        ) : (
          <img src={fileUrl} alt={fileName} className="h-full w-full object-contain" />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
          <span className="inline-flex items-center gap-1 rounded bg-[#1f1e1b]/85 px-2 py-1 text-[11px] font-medium">
            <ZoomIn className="h-3.5 w-3.5" />
            {viewLabel}
          </span>
        </span>
      </div>
      <span className="max-w-[176px] truncate text-[11px] font-medium text-[#1f1e1b]">
        {fileName}
      </span>
    </button>
  );
}
