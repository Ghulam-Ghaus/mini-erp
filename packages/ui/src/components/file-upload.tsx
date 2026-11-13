import { FileText, ImagePlus, Trash2, ZoomIn } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Button } from './button.js';
import { ProofViewerDialog } from './proof-viewer-dialog.js';

export interface FileUploadProps {
  readonly id?: string;
  readonly accept?: string;
  readonly chooseLabel: string;
  readonly removeLabel: string;
  readonly hintLabel?: string;
  readonly value?: File | null;
  readonly previewUrl?: string | null;
  readonly onChange: (file: File | null) => void;
  readonly hasError?: boolean;
}

/**
 * Standard FileUpload with image preview for cheque/transfer payment proofs and org logo.
 */
export function FileUpload({
  id,
  accept = 'image/*',
  chooseLabel,
  removeLabel,
  hintLabel,
  value,
  previewUrl: externalPreview,
  onChange,
  hasError = false,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (localPreview) URL.revokeObjectURL(localPreview);
    if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
      setLocalPreview(URL.createObjectURL(file));
    } else {
      setLocalPreview(null);
    }
    onChange(file);
  };

  const handleRemove = () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(null);
    if (inputRef.current) inputRef.current.value = '';
    onChange(null);
  };

  const preview = localPreview ?? externalPreview ?? null;
  const isPdf =
    value?.type === 'application/pdf' ||
    Boolean(value?.name.toLowerCase().endsWith('.pdf')) ||
    Boolean(preview?.toLowerCase().startsWith('data:application/pdf'));

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded border bg-[#faf9f5] p-2.5 ${
        hasError ? 'border-[#9e3b33]' : 'border-[#d6d3c9]'
      }`}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="sr-only"
      />
      <div className="flex items-center gap-3 overflow-hidden">
        {preview ? (
          <button
            type="button"
            onClick={() => setViewerOpen(true)}
            title={value?.name ?? 'View'}
            className="group relative h-10 w-10 shrink-0 overflow-hidden rounded border border-[#d6d3c9] bg-white cursor-pointer"
          >
            {isPdf ? (
              <div className="flex h-full w-full items-center justify-center text-[#9e3b33]">
                <FileText className="h-4 w-4" />
              </div>
            ) : (
              <img
                src={preview}
                alt={value?.name ?? 'Preview'}
                className="h-full w-full object-cover"
              />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <ZoomIn className="h-3.5 w-3.5" />
            </span>
          </button>
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-dashed border-[#d6d3c9] bg-white text-[#8c8980]">
            <ImagePlus className="h-4 w-4" />
          </div>
        )}
        <div className="truncate text-xs">
          {value ? (
            <p className="truncate font-medium text-[#1f1e1b]">{value.name}</p>
          ) : (
            <p className="text-[#5c5a53]">{hintLabel ?? chooseLabel}</p>
          )}
        </div>
      </div>

      <ProofViewerDialog
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        fileUrl={preview}
        fileName={value?.name ?? 'proof'}
        mimeType={value?.type}
      />

      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
          {chooseLabel}
        </Button>
        {(value || preview) && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={removeLabel}
            onClick={handleRemove}
            icon={<Trash2 className="h-3.5 w-3.5 text-[#9e3b33]" />}
          />
        )}
      </div>
    </div>
  );
}
