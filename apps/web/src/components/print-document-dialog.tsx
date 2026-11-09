import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatMoney,
  formatWeight,
  type ChallanDto,
  type PaymentDto,
  type PrintLanguage,
  type PrintLayout,
  type PrintTrackResultDto,
  type SaleInvoiceDto,
  type SaleReturnDto,
} from '@mini-erp/shared';
import { Button, Dialog, StatusBadge } from '@mini-erp/ui';
import { trackPrint } from '../lib/api';

export type PrintableDocument =
  | { type: 'SALE_INVOICE'; data: SaleInvoiceDto }
  | { type: 'CHALLAN'; data: ChallanDto }
  | { type: 'PAYMENT_IN'; data: PaymentDto }
  | { type: 'SALE_RETURN'; data: SaleReturnDto };

export interface PrintDocumentDialogProps {
  open: boolean;
  document: PrintableDocument | null;
  onClose: () => void;
  onPrinted?: () => void;
}

const LABELS = {
  SALE_INVOICE: {
    en: 'SALE INVOICE',
    ur: 'سیلز انوائس / بل',
    bilingual: 'SALE INVOICE / سیلز انوائس',
  },
  CHALLAN: {
    en: 'DELIVERY CHALLAN (GATE PASS)',
    ur: 'ڈیلیوری چالان / گیٹ پاس',
    bilingual: 'DELIVERY CHALLAN / ڈیلیوری چالان',
  },
  PAYMENT_IN: {
    en: 'PAYMENT RECEIPT',
    ur: 'وصولی رسید',
    bilingual: 'PAYMENT RECEIPT / وصولی رسید',
  },
  SALE_RETURN: {
    en: 'CREDIT NOTE (SALE RETURN)',
    ur: 'کریڈٹ نوٹ / مال واپسی',
    bilingual: 'CREDIT NOTE / کریڈٹ نوٹ',
  },
} as const;

export function PrintDocumentDialog({
  open,
  document: doc,
  onClose,
  onPrinted,
}: PrintDocumentDialogProps) {
  const { t, i18n } = useTranslation();
  const [layout, setLayout] = useState<PrintLayout>('A4');
  const [lang, setLang] = useState<PrintLanguage>(i18n.language === 'ur' ? 'UR' : 'BILINGUAL');
  const [showBatchOnInvoice, setShowBatchOnInvoice] = useState(true);
  const [trackInfo, setTrackInfo] = useState<PrintTrackResultDto | null>(null);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const printAreaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !doc) {
      setTrackInfo(null);
      return;
    }
    let active = true;
    setLoadingTrack(true);
    trackPrint({ docType: doc.type, docId: doc.data.id })
      .then((res) => {
        if (active) {
          setTrackInfo(res);
          onPrinted?.();
        }
      })
      .catch(() => {
        // Fallback if offline or preview-only
      })
      .finally(() => {
        if (active) setLoadingTrack(false);
      });
    return () => {
      active = false;
    };
  }, [open, doc, onPrinted]);

  const handleTriggerPrint = () => {
    const content = printAreaRef.current?.innerHTML;
    if (!content) return;
    const isRtl = lang === 'UR';
    const isThermal = layout === 'THERMAL_80MM';

    const iframe = window.document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    window.document.body.appendChild(iframe);

    const frameDoc = iframe.contentWindow?.document;
    if (!frameDoc) {
      window.document.body.removeChild(iframe);
      return;
    }

    frameDoc.open();
    frameDoc.write(`<!DOCTYPE html>
<html dir="${isRtl ? 'rtl' : 'ltr'}" lang="${isRtl ? 'ur' : 'en'}">
<head>
  <meta charset="utf-8" />
  <title>Print Document</title>
  <style>
    @page {
      size: ${isThermal ? '80mm auto' : 'A4 portrait'};
      margin: ${isThermal ? '4mm' : '12mm'};
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', Tahoma, sans-serif;
      font-size: ${isThermal ? '11px' : '13px'};
      color: #111827;
      background: #ffffff;
      line-height: 1.45;
    }
    .font-urdu {
      font-family: 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', Tahoma, serif;
      line-height: 1.8;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: ${isThermal ? '3px 4px' : '6px 8px'};
    }
    th {
      background: #f3f4f6;
      font-weight: 600;
    }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .text-center { text-align: center; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
  </style>
</head>
<body>
  ${content}
</body>
</html>`);
    frameDoc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (window.document.body.contains(iframe)) {
          window.document.body.removeChild(iframe);
        }
      }, 1000);
    }, 150);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        handleTriggerPrint();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!doc) return null;

  const isDuplicate = trackInfo?.isDuplicate ?? false;
  const orgName = trackInfo?.organization.name ?? 'Mini ERP Trading Co.';
  const orgNameUr = trackInfo?.organization.nameUr ?? null;
  const orgAddress = trackInfo?.organization.address ?? '';
  const orgPhone = trackInfo?.organization.phone ?? '';
  const orgTaxNo = trackInfo?.organization.taxNo ?? '';
  const isRtl = lang === 'UR';
  const isThermal = layout === 'THERMAL_80MM';

  const label = (en: string, ur: string) => {
    if (lang === 'EN') return en;
    if (lang === 'UR') return ur;
    return `${en} / ${ur}`;
  };

  const docHeading =
    lang === 'EN'
      ? LABELS[doc.type].en
      : lang === 'UR'
        ? LABELS[doc.type].ur
        : LABELS[doc.type].bilingual;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('print.previewTitle', 'Print Preview & Settings')}
      maxWidthClass="max-w-4xl"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div className="text-xs text-neutral-500">
            {loadingTrack
              ? t('common.loading', 'Loading...')
              : isDuplicate
                ? t('print.duplicateNotice', 'Reprint #{{count}} — Marked as DUPLICATE', {
                    count: trackInfo?.printCount ?? 2,
                  })
                : t('print.originalNotice', 'First Print — Marked as ORIGINAL')}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t('common.close', 'Close')}
            </Button>
            <Button variant="primary" onClick={handleTriggerPrint}>
              {t('print.printButton', 'Print (Ctrl+P)')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Print Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-700">{t('print.layout', 'Paper Size')}:</span>
            <button
              type="button"
              onClick={() => setLayout('A4')}
              className={`rounded px-2.5 py-1 font-medium ${
                layout === 'A4'
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 bg-white text-neutral-700'
              }`}
            >
              A4 Standard
            </button>
            <button
              type="button"
              onClick={() => setLayout('THERMAL_80MM')}
              className={`rounded px-2.5 py-1 font-medium ${
                layout === 'THERMAL_80MM'
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 bg-white text-neutral-700'
              }`}
            >
              80mm Thermal
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-700">
              {t('print.language', 'Print Language')}:
            </span>
            <button
              type="button"
              onClick={() => setLang('EN')}
              className={`rounded px-2.5 py-1 font-medium ${
                lang === 'EN'
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 bg-white text-neutral-700'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLang('BILINGUAL')}
              className={`rounded px-2.5 py-1 font-medium ${
                lang === 'BILINGUAL'
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 bg-white text-neutral-700'
              }`}
            >
              Bilingual (EN + اردو)
            </button>
            <button
              type="button"
              onClick={() => setLang('UR')}
              className={`rounded px-2.5 py-1 font-medium ${
                lang === 'UR'
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 bg-white text-neutral-700'
              }`}
            >
              اردو (Urdu RTL)
            </button>
          </div>

          {doc.type === 'SALE_INVOICE' && (
            <label className="flex items-center gap-1.5 font-medium text-neutral-700">
              <input
                type="checkbox"
                checked={showBatchOnInvoice}
                onChange={(e) => setShowBatchOnInvoice(e.target.checked)}
              />
              {t('print.showBatchNo', 'Show Batch No')}
            </label>
          )}
        </div>

        {/* Printable Document Sheet */}
        <div className="max-h-[65vh] overflow-y-auto rounded-md border border-neutral-300 bg-neutral-100 p-4">
          <div
            ref={printAreaRef}
            dir={isRtl ? 'rtl' : 'ltr'}
            className={`mx-auto bg-white p-6 text-neutral-900 shadow-sm ${
              isThermal ? 'max-w-[320px] text-xs' : 'max-w-[780px] text-sm'
            }`}
          >
            {/* Organization Header */}
            <div className="border-b-2 border-neutral-800 pb-3 text-center">
              <div className="text-lg font-bold tracking-tight">{orgName}</div>
              {orgNameUr && (
                <div className="font-urdu text-base font-semibold text-neutral-800">
                  {orgNameUr}
                </div>
              )}
              {(orgAddress || orgPhone) && (
                <div className="mt-1 text-xs text-neutral-600">
                  {orgAddress}
                  {orgAddress && orgPhone ? ' · ' : ''}
                  {orgPhone ? `Tel: ${orgPhone}` : ''}
                  {orgTaxNo ? ` · NTN/STRN: ${orgTaxNo}` : ''}
                </div>
              )}
              <div className="mt-2 flex items-center justify-center gap-2">
                <span className="rounded border border-neutral-800 px-3 py-0.5 text-xs font-bold uppercase tracking-wider">
                  {docHeading}
                </span>
                {isDuplicate ? (
                  <StatusBadge tone="warning">{label('DUPLICATE', 'ڈپلیکیٹ')}</StatusBadge>
                ) : (
                  <StatusBadge tone="neutral">{label('ORIGINAL', 'اصل')}</StatusBadge>
                )}
              </div>
            </div>

            {/* 1. SALE INVOICE TEMPLATE */}
            {doc.type === 'SALE_INVOICE' && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div>
                      <span className="font-semibold">{label('Invoice No', 'بل نمبر')}: </span>
                      <span className="font-mono font-bold">{doc.data.invoiceNo}</span>
                    </div>
                    <div>
                      <span className="font-semibold">{label('Date', 'تاریخ')}: </span>
                      <span className="font-mono">{doc.data.saleDate}</span>
                    </div>
                    {doc.data.routeName && (
                      <div>
                        <span className="font-semibold">{label('Route', 'روٹ')}: </span>
                        <span>{doc.data.routeName}</span>
                      </div>
                    )}
                  </div>
                  <div className={isRtl ? 'text-left' : 'text-right'}>
                    <div>
                      <span className="font-semibold">{label('Client', 'خریدار')}: </span>
                      <span className="font-bold">{doc.data.clientName}</span>
                    </div>
                    <div>
                      <span className="font-semibold">{label('Status', 'حالت')}: </span>
                      <span>{doc.data.status}</span>
                    </div>
                  </div>
                </div>

                <table className="w-full border-collapse border border-neutral-300 text-xs">
                  <thead>
                    <tr className="bg-neutral-100">
                      <th className="border border-neutral-300 px-2 py-1.5 text-center">#</th>
                      <th className="border border-neutral-300 px-2 py-1.5 text-left">
                        {label('Item', 'آئٹم')}
                      </th>
                      {showBatchOnInvoice && !isThermal && (
                        <th className="border border-neutral-300 px-2 py-1.5 text-left">
                          {label('Batch', 'بیچ')}
                        </th>
                      )}
                      {!isThermal && (
                        <th className="border border-neutral-300 px-2 py-1.5 text-right">
                          {label('Bags', 'بوری')}
                        </th>
                      )}
                      <th className="border border-neutral-300 px-2 py-1.5 text-right">
                        {label('Qty (KG)', 'وزن کلو')}
                      </th>
                      <th className="border border-neutral-300 px-2 py-1.5 text-right">
                        {label('Rate', 'ریٹ')}
                      </th>
                      <th className="border border-neutral-300 px-2 py-1.5 text-right">
                        {label('Amount', 'رقم')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.data.items.map((line, idx) => (
                      <tr key={line.id}>
                        <td className="border border-neutral-300 px-2 py-1 text-center font-mono">
                          {idx + 1}
                        </td>
                        <td className="border border-neutral-300 px-2 py-1 font-medium">
                          {line.itemName}
                          {line.enteredUnit !== 'KG' && (
                            <span className="ml-1 text-[11px] text-neutral-500">
                              ({formatWeight(line.enteredQty)} {line.enteredUnit})
                            </span>
                          )}
                        </td>
                        {showBatchOnInvoice && !isThermal && (
                          <td className="border border-neutral-300 px-2 py-1 font-mono text-[11px]">
                            {line.batchNo}
                          </td>
                        )}
                        {!isThermal && (
                          <td className="border border-neutral-300 px-2 py-1 text-right font-mono">
                            {line.bagCount ?? '—'}
                          </td>
                        )}
                        <td className="border border-neutral-300 px-2 py-1 text-right font-mono">
                          {formatWeight(line.qtyBase)}
                        </td>
                        <td className="border border-neutral-300 px-2 py-1 text-right font-mono">
                          {formatMoney(line.ratePerBase)}
                        </td>
                        <td className="border border-neutral-300 px-2 py-1 text-right font-mono font-semibold">
                          {formatMoney(line.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Invoice Totals + Previous Balance Summary */}
                <div className="flex justify-end">
                  <div className="w-full max-w-xs space-y-1 border border-neutral-300 bg-neutral-50 p-3 text-xs">
                    <div className="flex justify-between">
                      <span>{label('Subtotal', 'ذیلی کل')}:</span>
                      <span className="font-mono">{formatMoney(doc.data.subtotal)}</span>
                    </div>
                    {Number(doc.data.discount) > 0 && (
                      <div className="flex justify-between text-neutral-700">
                        <span>{label('Discount', 'رعایت')}:</span>
                        <span className="font-mono">-{formatMoney(doc.data.discount)}</span>
                      </div>
                    )}
                    {Number(doc.data.extraCharges) > 0 && (
                      <div className="flex justify-between text-neutral-700">
                        <span>{label('Extra Charges', 'اضافی اخراجات')}:</span>
                        <span className="font-mono">+{formatMoney(doc.data.extraCharges)}</span>
                      </div>
                    )}
                    {Number(doc.data.taxTotal) > 0 && (
                      <div className="flex justify-between text-neutral-700">
                        <span>{label('Tax', 'ٹیکس')}:</span>
                        <span className="font-mono">+{formatMoney(doc.data.taxTotal)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-neutral-300 pt-1 font-bold">
                      <span>{label('Invoice Total', 'موجودہ بل')}:</span>
                      <span className="font-mono">{formatMoney(doc.data.total)}</span>
                    </div>
                    <div className="flex justify-between text-neutral-700">
                      <span>{label('Paid on Invoice', 'وصول شدہ')}:</span>
                      <span className="font-mono">{formatMoney(doc.data.paidAmount)}</span>
                    </div>
                    {trackInfo && (
                      <>
                        <div className="flex justify-between border-t border-dashed border-neutral-300 pt-1 text-neutral-700">
                          <span>{label('Previous Balance', 'سابقہ بقایا')}:</span>
                          <span className="font-mono">
                            {formatMoney(trackInfo.previousBalance)}
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-neutral-800 pt-1 text-sm font-bold">
                          <span>{label('Total Balance Due', 'کل واجب الادا بقایا')}:</span>
                          <span className="font-mono">{formatMoney(trackInfo.currentBalance)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Signatures */}
                <div className="mt-8 grid grid-cols-2 gap-8 pt-6 text-center text-xs">
                  <div className="border-t border-neutral-400 pt-1">
                    {label('Prepared / Authorized By', 'دستخط دوکاندار')}
                  </div>
                  <div className="border-t border-neutral-400 pt-1">
                    {label('Client Signature', 'دستخط خریدار')}
                  </div>
                </div>
              </div>
            )}

            {/* 2. DELIVERY CHALLAN TEMPLATE (Quantities only, NO PRICES per §7) */}
            {doc.type === 'CHALLAN' && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div>
                      <span className="font-semibold">{label('Challan No', 'چالان نمبر')}: </span>
                      <span className="font-mono font-bold">{doc.data.challanNo}</span>
                    </div>
                    <div>
                      <span className="font-semibold">{label('Linked Invoice', 'بل نمبر')}: </span>
                      <span className="font-mono">{doc.data.invoiceNo}</span>
                    </div>
                    <div>
                      <span className="font-semibold">{label('Date', 'تاریخ')}: </span>
                      <span className="font-mono">{doc.data.challanDate}</span>
                    </div>
                  </div>
                  <div className={isRtl ? 'text-left' : 'text-right'}>
                    <div>
                      <span className="font-semibold">{label('Client', 'خریدار')}: </span>
                      <span className="font-bold">
                        {doc.data.clientName}
                        {doc.data.clientNameUr ? ` (${doc.data.clientNameUr})` : ''}
                      </span>
                    </div>
                    {doc.data.clientPhone && (
                      <div>
                        <span className="font-semibold">{label('Phone', 'فون')}: </span>
                        <span className="font-mono">{doc.data.clientPhone}</span>
                      </div>
                    )}
                    {doc.data.clientAddress && (
                      <div>
                        <span className="font-semibold">{label('Address', 'پتہ')}: </span>
                        <span>{doc.data.clientAddress}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 rounded border border-neutral-300 bg-neutral-50 p-2 text-xs">
                  <div>
                    <span className="font-semibold">{label('Rider / Driver', 'ڈرائیور')}: </span>
                    <span>{doc.data.riderName || '—'}</span>
                  </div>
                  <div>
                    <span className="font-semibold">{label('Vehicle No', 'گاڑی نمبر')}: </span>
                    <span className="font-mono">{doc.data.vehicleNo || '—'}</span>
                  </div>
                </div>

                {/* Challan Items: Quantities & KG only — NO RATES OR AMOUNTS */}
                <table className="w-full border-collapse border border-neutral-300 text-xs">
                  <thead>
                    <tr className="bg-neutral-100">
                      <th className="border border-neutral-300 px-2 py-1.5 text-center">#</th>
                      <th className="border border-neutral-300 px-2 py-1.5 text-left">
                        {label('Item Description', 'تفصیل مال')}
                      </th>
                      <th className="border border-neutral-300 px-2 py-1.5 text-left">
                        {label('Batch No', 'بیچ نمبر')}
                      </th>
                      <th className="border border-neutral-300 px-2 py-1.5 text-right">
                        {label('Bags', 'تھیلے / بوری')}
                      </th>
                      <th className="border border-neutral-300 px-2 py-1.5 text-right">
                        {label('Entered Qty', 'مقدار')}
                      </th>
                      <th className="border border-neutral-300 px-2 py-1.5 text-right">
                        {label('Net Weight (KG)', 'صافی وزن کلو')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.data.items.map((item, idx) => (
                      <tr key={item.id}>
                        <td className="border border-neutral-300 px-2 py-1 text-center font-mono">
                          {idx + 1}
                        </td>
                        <td className="border border-neutral-300 px-2 py-1 font-medium">
                          {item.itemName}
                          {item.itemNameUr ? ` (${item.itemNameUr})` : ''}
                        </td>
                        <td className="border border-neutral-300 px-2 py-1 font-mono">
                          {item.batchNo}
                        </td>
                        <td className="border border-neutral-300 px-2 py-1 text-right font-mono">
                          {item.bagCount ?? '—'}
                        </td>
                        <td className="border border-neutral-300 px-2 py-1 text-right font-mono">
                          {formatWeight(item.enteredQty)} {item.enteredUnit}
                        </td>
                        <td className="border border-neutral-300 px-2 py-1 text-right font-mono font-bold">
                          {formatWeight(item.qtyBase)} KG
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-neutral-100 font-bold">
                      <td colSpan={3} className="border border-neutral-300 px-2 py-1.5 text-right">
                        {label('Total Quantity', 'کل وزن')}:
                      </td>
                      <td className="border border-neutral-300 px-2 py-1.5 text-right font-mono">
                        {doc.data.items.reduce((acc, i) => acc + (i.bagCount ?? 0), 0)}
                      </td>
                      <td className="border border-neutral-300 px-2 py-1.5" />
                      <td className="border border-neutral-300 px-2 py-1.5 text-right font-mono">
                        {formatWeight(
                          doc.data.items.reduce((acc, i) => acc + Number(i.qtyBase), 0).toFixed(3),
                        )}{' '}
                        KG
                      </td>
                    </tr>
                  </tfoot>
                </table>

                {doc.data.notes && (
                  <div className="text-xs text-neutral-700">
                    <span className="font-semibold">{label('Notes', 'نوٹ')}: </span>
                    {doc.data.notes}
                  </div>
                )}

                <div className="mt-8 grid grid-cols-3 gap-6 pt-6 text-center text-xs">
                  <div className="border-t border-neutral-400 pt-1">
                    {label('Store / Dispatched By', 'گودام انچارج')}
                  </div>
                  <div className="border-t border-neutral-400 pt-1">
                    {label('Rider / Driver Signature', 'دستخط ڈرائیور')}
                  </div>
                  <div className="border-t border-neutral-400 pt-1">
                    {label('Received By (Sign & Stamp)', 'وصول کنندہ کے دستخط')}
                  </div>
                </div>
              </div>
            )}

            {/* 3. PAYMENT RECEIPT TEMPLATE */}
            {doc.type === 'PAYMENT_IN' && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div>
                      <span className="font-semibold">{label('Receipt No', 'رسید نمبر')}: </span>
                      <span className="font-mono font-bold">{doc.data.paymentNo}</span>
                    </div>
                    <div>
                      <span className="font-semibold">{label('Date', 'تاریخ')}: </span>
                      <span className="font-mono">{doc.data.paymentDate}</span>
                    </div>
                  </div>
                  <div className={isRtl ? 'text-left' : 'text-right'}>
                    <div>
                      <span className="font-semibold">
                        {label('Received From', 'وصول دہندہ')}:{' '}
                      </span>
                      <span className="font-bold">{doc.data.partyName}</span>
                    </div>
                    <div>
                      <span className="font-semibold">
                        {label('Payment Method', 'طریقہ ادائیگی')}:{' '}
                      </span>
                      <span className="font-semibold">{doc.data.method}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border-2 border-neutral-800 bg-neutral-50 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      {label('Amount Received', 'وصول شدہ رقم')}:
                    </span>
                    <span className="font-mono text-xl font-bold">
                      PKR {formatMoney(doc.data.amount)}
                    </span>
                  </div>
                  {(doc.data.bankName || doc.data.referenceNo) && (
                    <div className="mt-2 border-t border-neutral-300 pt-2 text-xs text-neutral-700">
                      {doc.data.bankName ? `Bank: ${doc.data.bankName} ` : ''}
                      {doc.data.referenceNo ? `· Ref / Cheque No: ${doc.data.referenceNo} ` : ''}
                      {doc.data.chequeDate ? `· Cheque Date: ${doc.data.chequeDate}` : ''}
                    </div>
                  )}
                  {trackInfo && (
                    <div className="mt-2 flex justify-between border-t border-neutral-300 pt-2 text-xs font-semibold">
                      <span>{label('Remaining Ledger Balance', 'بقایا کھاتہ بیلنس')}:</span>
                      <span className="font-mono">PKR {formatMoney(trackInfo.currentBalance)}</span>
                    </div>
                  )}
                </div>

                {doc.data.notes && (
                  <div className="text-xs text-neutral-700">
                    <span className="font-semibold">{label('Remarks', 'تفصیل')}: </span>
                    {doc.data.notes}
                  </div>
                )}

                <div className="mt-8 grid grid-cols-2 gap-8 pt-6 text-center text-xs">
                  <div className="border-t border-neutral-400 pt-1">
                    {label('Cashier / Recovery Officer', 'دستخط وصول کنندہ')}
                  </div>
                  <div className="border-t border-neutral-400 pt-1">
                    {label('Client Signature', 'دستخط پارٹی')}
                  </div>
                </div>
              </div>
            )}

            {/* 4. CREDIT NOTE (SALE RETURN) TEMPLATE */}
            {doc.type === 'SALE_RETURN' && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div>
                      <span className="font-semibold">
                        {label('Credit Note No', 'کریڈٹ نوٹ نمبر')}:{' '}
                      </span>
                      <span className="font-mono font-bold">{doc.data.returnNo}</span>
                    </div>
                    <div>
                      <span className="font-semibold">
                        {label('Original Invoice', 'اصل بل نمبر')}:{' '}
                      </span>
                      <span className="font-mono">{doc.data.invoiceNo}</span>
                    </div>
                    <div>
                      <span className="font-semibold">{label('Date', 'تاریخ')}: </span>
                      <span className="font-mono">{doc.data.returnDate}</span>
                    </div>
                  </div>
                  <div className={isRtl ? 'text-left' : 'text-right'}>
                    <div>
                      <span className="font-semibold">{label('Client', 'خریدار')}: </span>
                      <span className="font-bold">{doc.data.clientName}</span>
                    </div>
                    <div>
                      <span className="font-semibold">{label('Reason', 'وجہ واپسی')}: </span>
                      <span>{doc.data.reasonCode}</span>
                    </div>
                  </div>
                </div>

                <table className="w-full border-collapse border border-neutral-300 text-xs">
                  <thead>
                    <tr className="bg-neutral-100">
                      <th className="border border-neutral-300 px-2 py-1.5 text-left">
                        {label('Item', 'آئٹم')}
                      </th>
                      <th className="border border-neutral-300 px-2 py-1.5 text-left">
                        {label('Batch', 'بیچ')}
                      </th>
                      <th className="border border-neutral-300 px-2 py-1.5 text-left">
                        {label('Condition', 'حالت مال')}
                      </th>
                      <th className="border border-neutral-300 px-2 py-1.5 text-right">
                        {label('Qty (KG)', 'واپسی وزن')}
                      </th>
                      <th className="border border-neutral-300 px-2 py-1.5 text-right">
                        {label('Rate', 'ریٹ')}
                      </th>
                      <th className="border border-neutral-300 px-2 py-1.5 text-right">
                        {label('Total', 'رقم')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.data.items.map((item) => (
                      <tr key={item.id}>
                        <td className="border border-neutral-300 px-2 py-1 font-medium">
                          {item.itemName}
                        </td>
                        <td className="border border-neutral-300 px-2 py-1 font-mono">
                          {item.batchNo}
                        </td>
                        <td className="border border-neutral-300 px-2 py-1">{item.condition}</td>
                        <td className="border border-neutral-300 px-2 py-1 text-right font-mono">
                          {formatWeight(item.qtyBase)}
                        </td>
                        <td className="border border-neutral-300 px-2 py-1 text-right font-mono">
                          {formatMoney(item.ratePerBase)}
                        </td>
                        <td className="border border-neutral-300 px-2 py-1 text-right font-mono font-semibold">
                          {formatMoney(item.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex justify-end">
                  <div className="w-full max-w-xs space-y-1 border border-neutral-300 bg-neutral-50 p-3 text-xs">
                    <div className="flex justify-between">
                      <span>{label('Subtotal', 'ذیلی کل')}:</span>
                      <span className="font-mono">{formatMoney(doc.data.subtotal)}</span>
                    </div>
                    {Number(doc.data.deduction) > 0 && (
                      <div className="flex justify-between">
                        <span>{label('Deduction', 'کٹوتی')}:</span>
                        <span className="font-mono">-{formatMoney(doc.data.deduction)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-neutral-800 pt-1 text-sm font-bold">
                      <span>{label('Net Credit Amount', 'کل واپسی رقم')}:</span>
                      <span className="font-mono">{formatMoney(doc.data.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
