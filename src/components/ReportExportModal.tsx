import React, {useEffect, useMemo, useRef, useState} from 'react';
import * as XLSX from 'xlsx';
import {jsPDF} from 'jspdf';
import {toPng} from 'html-to-image';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Droplets,
  FileSpreadsheet,
  FileText,
  Gauge,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import {
  DMA_OPTIONS,
  LeakPoint,
  LeakSeverity,
  parsePipeSpec,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
} from '../types/leak';

interface ReportExportModalProps {
  isOpen: boolean;
  leaks: LeakPoint[];
  initialDma: string;
  initialSeverity: LeakSeverity | 'all';
  initialSearchQuery: string;
  onClose: () => void;
}

interface DmaSummaryRow {
  dma: string;
  total: number;
  low: number;
  moderate: number;
  critical: number;
  resolved: number;
  completionPct: number;
}

const ROWS_PER_PDF_PAGE = 8;

function formatThaiDateTime(date: Date): string {
  try {
    return new Intl.DateTimeFormat('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toLocaleString('th-TH');
  }
}

function formatFileStamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function isSafeInlineImage(url: string): boolean {
  return url.startsWith('data:image/') || url.startsWith('/');
}

function buildSeverityDonutArc(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number
): string {
  const toXY = (r: number, deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return {x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad)};
  };
  const os = toXY(outerR, endAngle);
  const oe = toXY(outerR, startAngle);
  const is = toXY(innerR, endAngle);
  const ie = toXY(innerR, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    'M',
    os.x.toFixed(2),
    os.y.toFixed(2),
    'A',
    outerR,
    outerR,
    0,
    largeArc,
    0,
    oe.x.toFixed(2),
    oe.y.toFixed(2),
    'L',
    ie.x.toFixed(2),
    ie.y.toFixed(2),
    'A',
    innerR,
    innerR,
    0,
    largeArc,
    1,
    is.x.toFixed(2),
    is.y.toFixed(2),
    'Z',
  ].join(' ');
}

export const ReportExportModal: React.FC<ReportExportModalProps> = ({
  isOpen,
  leaks,
  initialDma,
  initialSeverity,
  initialSearchQuery,
  onClose,
}) => {
  const [reportDma, setReportDma] = useState<string>(initialDma);
  const [reportSeverity, setReportSeverity] = useState<LeakSeverity | 'all'>(
    initialSeverity
  );
  const [reportSearch, setReportSearch] = useState<string>(initialSearchQuery);
  const [includePhotosInPdf, setIncludePhotosInPdf] = useState(true);
  const [exportingType, setExportingType] = useState<'excel' | 'pdf' | null>(
    null
  );
  const [exportMessage, setExportMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const pagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setReportDma(initialDma);
      setReportSeverity(initialSeverity);
      setReportSearch(initialSearchQuery);
      setExportMessage(null);
    }
  }, [isOpen, initialDma, initialSeverity, initialSearchQuery]);

  const availableDmas = useMemo(() => {
    const set = new Set<string>(DMA_OPTIONS);
    for (const item of leaks) {
      if (item.dma) set.add(item.dma.trim());
    }
    return Array.from(set).sort();
  }, [leaks]);

  const scopedLeaks = useMemo(() => {
    const normDma = reportDma.trim().toUpperCase();
    const q = reportSearch.trim().toLowerCase();
    return leaks
      .filter((item) => {
        if (
          reportDma !== 'all' &&
          (item.dma || '').trim().toUpperCase() !== normDma
        ) {
          return false;
        }
        if (reportSeverity !== 'all' && item.severity !== reportSeverity) {
          return false;
        }
        if (q) {
          const {pipeType, pipeSize} = parsePipeSpec(
            item.pipeSpec,
            item.pipeType,
            item.pipeSize
          );
          const matched =
            item.dma.toLowerCase().includes(q) ||
            item.no.toLowerCase().includes(q) ||
            item.locationName.toLowerCase().includes(q) ||
            item.repairMethod.toLowerCase().includes(q) ||
            item.technician.toLowerCase().includes(q) ||
            pipeType.toLowerCase().includes(q) ||
            pipeSize.toLowerCase().includes(q) ||
            item.pipeSpec.toLowerCase().includes(q) ||
            (item.reportDate || '').toLowerCase().includes(q);
          if (!matched) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const dmaCmp = (a.dma || '').localeCompare(b.dma || '');
        if (dmaCmp !== 0) return dmaCmp;
        return (a.no || '').localeCompare(b.no || '', undefined, {
          numeric: true,
        });
      });
  }, [leaks, reportDma, reportSeverity, reportSearch]);

  const analytics = useMemo(() => {
    const severityCounts: Record<LeakSeverity, number> = {
      low: 0,
      moderate: 0,
      critical: 0,
      resolved: 0,
    };
    const pipeTypeCounts: Record<string, number> = {};
    const dmaMap = new Map<string, DmaSummaryRow>();

    for (const item of scopedLeaks) {
      severityCounts[item.severity]++;

      const {pipeType} = parsePipeSpec(
        item.pipeSpec,
        item.pipeType,
        item.pipeSize
      );
      const ptKey = pipeType || 'ไม่ระบุ';
      pipeTypeCounts[ptKey] = (pipeTypeCounts[ptKey] || 0) + 1;

      const dmaKey = (item.dma || 'ไม่ระบุ').trim().toUpperCase();
      const current = dmaMap.get(dmaKey) || {
        dma: dmaKey,
        total: 0,
        low: 0,
        moderate: 0,
        critical: 0,
        resolved: 0,
        completionPct: 0,
      };
      current.total++;
      current[item.severity]++;
      dmaMap.set(dmaKey, current);
    }

    const total = scopedLeaks.length;
    const completionPct =
      total > 0 ? (severityCounts.resolved / total) * 100 : 0;

    const dmaRows: DmaSummaryRow[] = Array.from(dmaMap.values())
      .map((row) => ({
        ...row,
        completionPct: row.total > 0 ? (row.resolved / row.total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total || a.dma.localeCompare(b.dma));

    const maxDmaCount = dmaRows.reduce((m, r) => Math.max(m, r.total), 1);
    const topPipeTypes = Object.entries(pipeTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    return {
      total,
      severityCounts,
      completionPct,
      dmaRows,
      maxDmaCount,
      topPipeTypes,
    };
  }, [scopedLeaks]);

  const severitySlices = useMemo(() => {
    if (analytics.total === 0) return [];
    let angle = 0;
    return SEVERITY_ORDER.filter((k) => analytics.severityCounts[k] > 0).map(
      (k) => {
        const count = analytics.severityCounts[k];
        const pct = (count / analytics.total) * 100;
        const sweep = (pct / 100) * 360;
        const startAngle = angle;
        const endAngle = angle + sweep;
        angle = endAngle;
        return {
          key: k,
          label: k === 'critical' ? `! ${SEVERITY_LABELS[k]}` : SEVERITY_LABELS[k],
          count,
          color: SEVERITY_COLORS[k].hex,
          pct,
          isFull: sweep >= 359.99,
          path:
            sweep >= 359.99
              ? ''
              : buildSeverityDonutArc(64, 64, 56, 32, startAngle, endAngle),
        };
      }
    );
  }, [analytics]);

  const detailPages = useMemo(() => {
    if (scopedLeaks.length === 0) return [] as LeakPoint[][];
    const chunks: LeakPoint[][] = [];
    for (let i = 0; i < scopedLeaks.length; i += ROWS_PER_PDF_PAGE) {
      chunks.push(scopedLeaks.slice(i, i + ROWS_PER_PDF_PAGE));
    }
    return chunks;
  }, [scopedLeaks]);

  const totalPages = 1 + detailPages.length;
  const generatedAtText = useMemo(() => formatThaiDateTime(new Date()), [isOpen]);
  const scopeLabel =
    reportDma === 'all' ? 'ทุกเขต DMA (01-20)' : `เฉพาะเขต ${reportDma}`;
  const severityScopeLabel =
    reportSeverity === 'all'
      ? 'ทุกระดับความเร่งด่วน'
      : SEVERITY_LABELS[reportSeverity];

  if (!isOpen) return null;

  const handleExportExcel = () => {
    setExportingType('excel');
    setExportMessage(null);
    try {
      const now = new Date();
      const wb = XLSX.utils.book_new();

      const summaryAoA: (string | number)[][] = [
        ['รายงานสรุปจำนวนจุดแตกรั่วท่อประปา (Executive Summary)'],
        ['วันที่ออกรายงาน', formatThaiDateTime(now)],
        ['ขอบเขตเขตพื้นที่', scopeLabel],
        ['ระดับความเร่งด่วนที่เลือก', severityScopeLabel],
        ['คำค้นหา', reportSearch.trim() || '-'],
        [],
        ['สรุปจำนวนจุดแตกรั่วท่อประปา', 'จำนวน (จุด)', 'สัดส่วน (%)'],
        ['จุดแตกรั่วทั้งหมด', analytics.total, analytics.total > 0 ? 100 : 0],
        ...SEVERITY_ORDER.map((k) => [
          SEVERITY_LABELS[k],
          analytics.severityCounts[k],
          analytics.total > 0
            ? Number(
                ((analytics.severityCounts[k] / analytics.total) * 100).toFixed(
                  1
                )
              )
            : 0,
        ]),
        [],
        [
          'เขต DMA',
          'ทั้งหมด (จุด)',
          SEVERITY_LABELS.low,
          SEVERITY_LABELS.moderate,
          SEVERITY_LABELS.critical,
          SEVERITY_LABELS.resolved,
          'อัตราซ่อมแล้วเสร็จ (%)',
        ],
        ...analytics.dmaRows.map((row) => [
          row.dma,
          row.total,
          row.low,
          row.moderate,
          row.critical,
          row.resolved,
          Number(row.completionPct.toFixed(1)),
        ]),
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoA);
      wsSummary['!cols'] = [
        {wch: 30},
        {wch: 16},
        {wch: 20},
        {wch: 22},
        {wch: 20},
        {wch: 18},
        {wch: 20},
      ];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'สรุปจำนวนจุดแตกรั่ว');

      const dmaAoA: (string | number)[][] = [
        [
          'เขต DMA',
          'ทั้งหมด',
          'ต่ำ (ซึมเล็กน้อย)',
          'ปานกลาง (มีน้ำซึมขัง)',
          'วิกฤต (น้ำพุ่งแรง)',
          'ซ่อมแล้วเสร็จ',
          'ความคืบหน้า (%)',
        ],
        ...analytics.dmaRows.map((row) => [
          row.dma,
          row.total,
          row.low,
          row.moderate,
          row.critical,
          row.resolved,
          Number(row.completionPct.toFixed(1)),
        ]),
        [
          'รวมทั้งหมด',
          analytics.total,
          analytics.severityCounts.low,
          analytics.severityCounts.moderate,
          analytics.severityCounts.critical,
          analytics.severityCounts.resolved,
          Number(analytics.completionPct.toFixed(1)),
        ],
      ];
      const wsDma = XLSX.utils.aoa_to_sheet(dmaAoA);
      wsDma['!cols'] = [
        {wch: 16},
        {wch: 12},
        {wch: 20},
        {wch: 22},
        {wch: 20},
        {wch: 16},
        {wch: 18},
      ];
      XLSX.utils.book_append_sheet(wb, wsDma, 'สรุปรายเขต DMA');

      const detailAoA: (string | number)[][] = [
        [
          'DMA',
          'NO',
          'วันที่',
          'ตำแหน่ง (สถานที่และพิกัดบนแผนที่)',
          'ตำแหน่ง / ชื่อถนน / ซอย / จุดสังเกต',
          'ชนิดท่อ',
          'ขนาดท่อ',
          'ผู้รับผิดชอบ / ทีมช่าง',
          'วิธีแก้ไข / ผลการซ่อมแซม',
          'ระดับความเร่งด่วน',
          'ภาพถ่ายหน้างาน',
        ],
        ...scopedLeaks.map((item) => {
          const coords =
            item.lat !== null && item.lng !== null
              ? `${item.lat.toFixed(6)}, ${item.lng.toFixed(6)}`
              : '';
          const combinedLoc =
            item.locationName && coords
              ? `${item.locationName} (${coords})`
              : coords || item.locationName || '-';
          const {pipeType, pipeSize} = parsePipeSpec(
            item.pipeSpec,
            item.pipeType,
            item.pipeSize
          );
          const photoLinks = item.photos
            .map((p) => p.driveUrl || '')
            .filter(Boolean)
            .join(' | ');
          return [
            item.dma,
            item.no,
            item.reportDate || '',
            combinedLoc,
            item.locationName || '',
            pipeType || '',
            pipeSize || '',
            item.technician || '',
            item.repairMethod || '',
            SEVERITY_LABELS[item.severity],
            photoLinks ||
              (item.photos.length > 0
                ? `แนบภาพ ${item.photos.length} รูป`
                : 'ไม่มีภาพ'),
          ];
        }),
      ];
      const wsDetails = XLSX.utils.aoa_to_sheet(detailAoA);
      wsDetails['!cols'] = [
        {wch: 12},
        {wch: 8},
        {wch: 13},
        {wch: 34},
        {wch: 30},
        {wch: 12},
        {wch: 12},
        {wch: 20},
        {wch: 34},
        {wch: 22},
        {wch: 36},
      ];
      XLSX.utils.book_append_sheet(wb, wsDetails, 'รายการจุดแตกรั่ว');

      const dmaTag = reportDma === 'all' ? 'ALL_DMA' : reportDma;
      XLSX.writeFile(
        wb,
        `รายงานจุดแตกรั่ว_${dmaTag}_${formatFileStamp(now)}.xlsx`
      );

      setExportMessage({
        type: 'success',
        text: `ส่งออกไฟล์ Excel (.xlsx) พร้อมสรุปจำนวนจุดแตกรั่วและรายการ ${scopedLeaks.length} รายการเรียบร้อยแล้ว`,
      });
    } catch (err) {
      setExportMessage({
        type: 'error',
        text:
          err instanceof Error
            ? `ไม่สามารถสร้างไฟล์ Excel ได้: ${err.message}`
            : 'เกิดข้อผิดพลาดในการสร้างไฟล์ Excel',
      });
    } finally {
      setExportingType(null);
    }
  };

  const handleExportPdf = async () => {
    const container = pagesContainerRef.current;
    if (!container) return;

    setExportingType('pdf');
    setExportMessage(null);
    try {
      const pageNodes = Array.from(
        container.querySelectorAll<HTMLElement>('[data-pdf-page]')
      );
      if (pageNodes.length === 0) {
        throw new Error('ไม่พบหน้าเอกสารสำหรับส่งออก');
      }

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidthMm = pdf.internal.pageSize.getWidth();
      const pageHeightMm = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < pageNodes.length; i++) {
        const node = pageNodes[i];
        const dataUrl = await toPng(node, {
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          cacheBust: false,
        });

        const imgProps = pdf.getImageProperties(dataUrl);
        const ratio = Math.min(
          pageWidthMm / imgProps.width,
          pageHeightMm / imgProps.height
        );
        const renderW = imgProps.width * ratio;
        const renderH = imgProps.height * ratio;

        if (i > 0) pdf.addPage();
        pdf.addImage(dataUrl, 'PNG', 0, 0, renderW, renderH, undefined, 'FAST');
      }

      const now = new Date();
      const dmaTag = reportDma === 'all' ? 'ALL_DMA' : reportDma;
      pdf.save(`รายงานสรุปจุดแตกรั่ว_${dmaTag}_${formatFileStamp(now)}.pdf`);

      setExportMessage({
        type: 'success',
        text: `ส่งออกไฟล์นำเสนอ PDF (${pageNodes.length} หน้า) พร้อมสรุปจำนวนจุดแตกรั่วเรียบร้อยแล้ว`,
      });
    } catch (err) {
      setExportMessage({
        type: 'error',
        text:
          err instanceof Error
            ? `ไม่สามารถสร้างไฟล์ PDF ได้: ${err.message}`
            : 'เกิดข้อผิดพลาดในการสร้างไฟล์ PDF',
      });
    } finally {
      setExportingType(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="รายงานสรุปและส่งออก Excel / PDF"
    >
      <div className="w-full max-w-5xl max-h-[94vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Top Modal Controls */}
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#0A4DA2] text-white flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                รายงานสรุปจำนวนจุดแตกรั่ว &amp; ส่งออก Excel / PDF
              </h2>
              <p className="text-xs text-slate-500">
                แสดงสรุปจำนวนจุดแตกรั่วท่อประปา กราฟรายเขต DMA และรายการตามตัวกรองที่เลือก
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter & Export Action Bar */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={reportSearch}
                onChange={(e) => setReportSearch(e.target.value)}
                placeholder="ค้นหาในรายงาน..."
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-sky-600 w-44"
              />
            </div>

            <select
              value={reportDma}
              onChange={(e) => setReportDma(e.target.value)}
              aria-label="เลือกเขต DMA สำหรับรายงาน"
              className="px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-sky-600"
            >
              <option value="all">ทุกเขต DMA (01-20)</option>
              {availableDmas.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              value={reportSeverity}
              onChange={(e) =>
                setReportSeverity(e.target.value as LeakSeverity | 'all')
              }
              aria-label="กรองระดับความเร่งด่วนสำหรับรายงาน"
              className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-sky-600"
            >
              <option value="all">ทุกระดับความเร่งด่วน</option>
              {SEVERITY_ORDER.map((k) => (
                <option key={k} value={k}>
                  {SEVERITY_LABELS[k]}
                </option>
              ))}
            </select>

            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none pl-1">
              <input
                type="checkbox"
                checked={includePhotosInPdf}
                onChange={(e) => setIncludePhotosInPdf(e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>แสดงภาพถ่ายหน้างาน</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={exportingType !== null || scopedLeaks.length === 0}
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
            >
              {exportingType === 'excel' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5" />
              )}
              <span>ดาวน์โหลด Excel (.xlsx)</span>
            </button>

            <button
              type="button"
              disabled={exportingType !== null || scopedLeaks.length === 0}
              onClick={() => void handleExportPdf()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0D6EFD] hover:bg-[#0B5ED7] text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
            >
              {exportingType === 'pdf' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              <span>ดาวน์โหลด PDF (.pdf)</span>
            </button>
          </div>
        </div>

        {exportMessage && (
          <div
            className={`px-5 py-2.5 text-xs border-b shrink-0 ${
              exportMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {exportMessage.text}
          </div>
        )}

        {/* Executive A4 Presentation Preview */}
        <div className="flex-1 overflow-y-auto thin-scrollbar bg-slate-200/75 p-4 sm:p-6">
          <div
            ref={pagesContainerRef}
            className="space-y-6 flex flex-col items-center"
          >
            {/* PAGE 1: Executive Dashboard Cover Page */}
            <div
              data-pdf-page="1"
              className="w-[794px] bg-white border border-slate-200 shadow-md p-8 space-y-5 text-slate-900"
            >
              {/* Executive Header */}
              <div className="rounded-xl bg-gradient-to-r from-[#0A4999] via-[#1267CC] to-[#1A84E2] text-white px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-white text-[#0A4999] flex items-center justify-center shrink-0">
                    <Droplets className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-sky-100 uppercase tracking-wider">
                      Executive Leak Summary Report
                    </div>
                    <h3 className="text-lg font-bold tracking-tight">
                      สรุปจำนวนจุดแตกรั่วท่อประปา
                    </h3>
                    <p className="text-xs text-sky-100 mt-0.5">
                      ขอบเขตข้อมูล: {scopeLabel} · ระดับ: {severityScopeLabel}
                      {reportSearch.trim() ? ` · ค้นหา: "${reportSearch.trim()}"` : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs text-sky-100 shrink-0">
                  <div className="font-semibold text-white">
                    ทั้งหมด {analytics.total} จุด
                  </div>
                  <div className="text-[11px] mt-0.5">
                    ออกรายงาน: {generatedAtText}
                  </div>
                </div>
              </div>

              {/* 5 Severity KPI Summary Cards */}
              <div className="grid grid-cols-5 gap-2.5">
                <div className="rounded-xl border border-slate-200 border-t-[3px] border-t-[#1976D2] bg-sky-50/40 p-3">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                    <span>ทั้งหมด</span>
                    <Droplets className="w-3.5 h-3.5 text-[#1565C0]" />
                  </div>
                  <div className="mt-1.5 text-xl font-bold text-slate-900 tabular-nums">
                    {analytics.total}{' '}
                    <span className="text-[11px] font-normal text-slate-500">
                      จุด
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 border-t-[3px] border-t-[#EAB308] bg-yellow-50/50 p-3">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-700">
                    <span>ต่ำ</span>
                    <Droplets className="w-3.5 h-3.5 text-[#CA8A04]" />
                  </div>
                  <div className="mt-1.5 text-xl font-bold text-slate-900 tabular-nums">
                    {analytics.severityCounts.low}{' '}
                    <span className="text-[11px] font-normal text-slate-500">
                      จุด
                    </span>
                  </div>
                  <div className="mt-0.5 text-[9.5px] text-yellow-800">
                    ซึมเล็กน้อย
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 border-t-[3px] border-t-[#F97316] bg-orange-50/50 p-3">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-700">
                    <span>ปานกลาง</span>
                    <Gauge className="w-3.5 h-3.5 text-[#EA580C]" />
                  </div>
                  <div className="mt-1.5 text-xl font-bold text-slate-900 tabular-nums">
                    {analytics.severityCounts.moderate}{' '}
                    <span className="text-[11px] font-normal text-slate-500">
                      จุด
                    </span>
                  </div>
                  <div className="mt-0.5 text-[9.5px] text-orange-800">
                    มีน้ำซึมขัง
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 border-t-[3px] border-t-[#DC2626] bg-red-50/50 p-3">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-700">
                    <span>วิกฤต (!)</span>
                    <AlertTriangle className="w-3.5 h-3.5 text-[#DC2626]" />
                  </div>
                  <div className="mt-1.5 text-xl font-bold text-slate-900 tabular-nums">
                    {analytics.severityCounts.critical}{' '}
                    <span className="text-[11px] font-normal text-slate-500">
                      จุด
                    </span>
                  </div>
                  <div className="mt-0.5 text-[9.5px] text-red-700">
                    น้ำพุ่งแรง
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 border-t-[3px] border-t-[#16A34A] bg-emerald-50/50 p-3">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-700">
                    <span>ซ่อมแล้วเสร็จ</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A]" />
                  </div>
                  <div className="mt-1.5 text-xl font-bold text-slate-900 tabular-nums">
                    {analytics.severityCounts.resolved}{' '}
                    <span className="text-[11px] font-normal text-slate-500">
                      จุด
                    </span>
                  </div>
                  <div className="mt-0.5 text-[9.5px] text-emerald-700">
                    {analytics.completionPct.toFixed(1)}% เสร็จแล้ว
                  </div>
                </div>
              </div>

              {/* Overall Progress Bar */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">
                    สัดส่วนระดับความเร่งด่วนและความคืบหน้าการซ่อมแซม
                  </span>
                  <span className="font-bold text-emerald-700 tabular-nums">
                    ซ่อมแล้วเสร็จ {analytics.completionPct.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden flex">
                  {analytics.total > 0 && (
                    <>
                      <div
                        className="bg-[#16A34A] h-full"
                        style={{
                          width: `${(analytics.severityCounts.resolved / analytics.total) * 100}%`,
                        }}
                      />
                      <div
                        className="bg-[#EAB308] h-full"
                        style={{
                          width: `${(analytics.severityCounts.low / analytics.total) * 100}%`,
                        }}
                      />
                      <div
                        className="bg-[#F97316] h-full"
                        style={{
                          width: `${(analytics.severityCounts.moderate / analytics.total) * 100}%`,
                        }}
                      />
                      <div
                        className="bg-[#DC2626] h-full"
                        style={{
                          width: `${(analytics.severityCounts.critical / analytics.total) * 100}%`,
                        }}
                      />
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-600 gap-2">
                  <div className="flex flex-wrap items-center gap-3.5">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#EAB308]" />
                      ต่ำ ({analytics.severityCounts.low})
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#F97316]" />
                      ปานกลาง ({analytics.severityCounts.moderate})
                    </span>
                    <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                      <span className="w-2 h-2 rounded-full bg-[#DC2626]" />
                      วิกฤต ! ({analytics.severityCounts.critical})
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
                      ซ่อมแล้วเสร็จ ({analytics.severityCounts.resolved})
                    </span>
                  </div>
                </div>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-7 rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800">
                      จำนวนจุดแตกรั่วแยกตามเขต DMA (สูงสุด 8 เขต)
                    </h4>
                    <span className="text-[10px] text-slate-500">
                      หน่วย: จุด
                    </span>
                  </div>

                  {analytics.dmaRows.length === 0 ? (
                    <div className="h-36 flex items-center justify-center text-xs text-slate-400">
                      ไม่มีข้อมูลในเงื่อนไขที่เลือก
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {analytics.dmaRows.slice(0, 8).map((row) => {
                        const resPct =
                          (row.resolved / analytics.maxDmaCount) * 100;
                        const lowPct = (row.low / analytics.maxDmaCount) * 100;
                        const modPct =
                          (row.moderate / analytics.maxDmaCount) * 100;
                        const critPct =
                          (row.critical / analytics.maxDmaCount) * 100;
                        return (
                          <div
                            key={row.dma}
                            className="flex items-center gap-2.5 text-[11px]"
                          >
                            <span className="w-16 font-mono font-semibold text-slate-700 shrink-0">
                              {row.dma}
                            </span>
                            <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden flex">
                              {row.resolved > 0 && (
                                <div
                                  className="bg-[#16A34A] h-full"
                                  style={{width: `${resPct}%`}}
                                />
                              )}
                              {row.low > 0 && (
                                <div
                                  className="bg-[#EAB308] h-full"
                                  style={{width: `${lowPct}%`}}
                                />
                              )}
                              {row.moderate > 0 && (
                                <div
                                  className="bg-[#F97316] h-full"
                                  style={{width: `${modPct}%`}}
                                />
                              )}
                              {row.critical > 0 && (
                                <div
                                  className="bg-[#DC2626] h-full"
                                  style={{width: `${critPct}%`}}
                                />
                              )}
                            </div>
                            <span className="w-14 text-right font-mono tabular-nums text-slate-700 shrink-0">
                              {row.total} จุด
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right: Severity Donut & Pipe Breakdown */}
                <div className="col-span-5 rounded-xl border border-slate-200 p-4 flex flex-col justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 mb-2">
                      สัดส่วนตามระดับความเร่งด่วน
                    </h4>
                    <div className="flex items-center gap-3">
                      <svg
                        viewBox="0 0 128 128"
                        className="w-24 h-24 shrink-0"
                        aria-label="กราฟสัดส่วนระดับความเร่งด่วน"
                      >
                        {severitySlices.length === 0 ? (
                          <circle
                            cx={64}
                            cy={64}
                            r={44}
                            fill="none"
                            stroke="#E2E8F0"
                            strokeWidth={24}
                          />
                        ) : (
                          severitySlices.map((s) =>
                            s.isFull ? (
                              <circle
                                key={s.key}
                                cx={64}
                                cy={64}
                                r={44}
                                fill="none"
                                stroke={s.color}
                                strokeWidth={24}
                              />
                            ) : (
                              <path
                                key={s.key}
                                d={s.path}
                                fill={s.color}
                                stroke="#ffffff"
                                strokeWidth={1.5}
                              />
                            )
                          )
                        )}
                        <text
                          x="64"
                          y="61"
                          textAnchor="middle"
                          fontSize="14"
                          fontWeight="700"
                          fill="#0F172A"
                        >
                          {analytics.total}
                        </text>
                        <text
                          x="64"
                          y="74"
                          textAnchor="middle"
                          fontSize="8.5"
                          fill="#64748B"
                        >
                          จุดทั้งหมด
                        </text>
                      </svg>

                      <div className="flex-1 space-y-1.5 text-[10.5px]">
                        {SEVERITY_ORDER.map((k) => (
                          <div
                            key={k}
                            className="flex items-center justify-between gap-1"
                          >
                            <span className="inline-flex items-center gap-1.5 text-slate-700 truncate">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{
                                  backgroundColor: SEVERITY_COLORS[k].hex,
                                }}
                              />
                              <span className="truncate">
                                {k === 'low'
                                  ? 'ต่ำ'
                                  : k === 'moderate'
                                    ? 'ปานกลาง'
                                    : k === 'critical'
                                      ? 'วิกฤต (!)'
                                      : 'ซ่อมแล้วเสร็จ'}
                              </span>
                            </span>
                            <span className="font-mono font-semibold tabular-nums shrink-0">
                              {analytics.severityCounts[k]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Pipe Type Breakdown */}
                  <div className="pt-2.5 border-t border-slate-200 space-y-1.5 text-[11px]">
                    <div className="text-[10px] font-semibold text-slate-500">
                      แยกตามชนิดท่อที่พบบ่อย
                    </div>
                    {analytics.topPipeTypes.length === 0 ? (
                      <div className="text-[10px] text-slate-400">
                        ไม่มีข้อมูลชนิดท่อ
                      </div>
                    ) : (
                      analytics.topPipeTypes.map(([pt, count]) => {
                        const pct =
                          analytics.total > 0
                            ? (count / analytics.total) * 100
                            : 0;
                        return (
                          <div key={pt} className="flex items-center gap-2">
                            <span className="w-14 text-slate-700 font-medium shrink-0 truncate">
                              {pt}
                            </span>
                            <div className="flex-1 h-2 rounded bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded bg-[#0284C7]"
                                style={{width: `${pct}%`}}
                              />
                            </div>
                            <span className="w-8 text-right font-mono tabular-nums text-slate-700">
                              {count}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* DMA Breakdown Table */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800">
                    ตารางสรุปผลการดำเนินงานรายเขต DMA
                  </h4>
                  <span className="text-[10px] text-slate-500">
                    จำนวน {analytics.dmaRows.length} เขตที่มีข้อมูล
                  </span>
                </div>
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100/70 text-slate-600 border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-semibold">
                        เขต DMA
                      </th>
                      <th className="text-right py-2 px-3 font-semibold">
                        ทั้งหมด
                      </th>
                      <th className="text-right py-2 px-3 font-semibold text-yellow-700">
                        ต่ำ
                      </th>
                      <th className="text-right py-2 px-3 font-semibold text-orange-700">
                        ปานกลาง
                      </th>
                      <th className="text-right py-2 px-3 font-semibold text-red-700">
                        วิกฤต (!)
                      </th>
                      <th className="text-right py-2 px-3 font-semibold text-emerald-700">
                        ซ่อมแล้วเสร็จ
                      </th>
                      <th className="text-right py-2 px-3 font-semibold">
                        ความคืบหน้า
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.dmaRows.slice(0, 12).map((row) => (
                      <tr
                        key={row.dma}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="py-1.5 px-3 font-mono font-semibold text-slate-800">
                          {row.dma}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono tabular-nums">
                          {row.total}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono tabular-nums text-yellow-700">
                          {row.low}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono tabular-nums text-orange-700">
                          {row.moderate}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono tabular-nums text-red-700 font-semibold">
                          {row.critical}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono tabular-nums text-emerald-700">
                          {row.resolved}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-800">
                          {row.completionPct.toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                    {analytics.dmaRows.length > 0 && (
                      <tr className="bg-slate-50 font-semibold border-t border-slate-200">
                        <td className="py-2 px-3 text-slate-900">รวมทั้งหมด</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {analytics.total}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-yellow-700">
                          {analytics.severityCounts.low}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-orange-700">
                          {analytics.severityCounts.moderate}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-red-700">
                          {analytics.severityCounts.critical}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-700">
                          {analytics.severityCounts.resolved}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-700">
                          {analytics.completionPct.toFixed(1)}%
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Page 1 Footer */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500">
                <span>
                  ระบบติดตามและจัดการจุดแตกรั่วท่อประปา · {scopeLabel}
                </span>
                <span className="font-mono">หน้า 1 / {totalPages}</span>
              </div>
            </div>

            {/* PAGE 2+: Paginated Detail Records */}
            {detailPages.map((pageItems, pageIdx) => {
              const pageNumber = pageIdx + 2;
              return (
                <div
                  key={pageNumber}
                  data-pdf-page={pageNumber}
                  className="w-[794px] bg-white border border-slate-200 shadow-md p-8 space-y-4 text-slate-900"
                >
                  <div className="flex items-center justify-between pb-3 border-b-2 border-[#0A4999]">
                    <div>
                      <h3 className="text-sm font-bold text-[#0A4999]">
                        รายการจุดแตกรั่วแยกตามเขต DMA ({scopeLabel})
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        แสดงข้อมูล DMA, NO, วันที่, ชนิด/ขนาดท่อ, ตำแหน่งพิกัด, ทีมช่าง และระดับความเร่งด่วน
                      </p>
                    </div>
                    <div className="text-right text-[10px] text-slate-500">
                      <div>ออกรายงาน: {generatedAtText}</div>
                      <div className="font-mono">
                        รายการที่ {pageIdx * ROWS_PER_PDF_PAGE + 1}–
                        {pageIdx * ROWS_PER_PDF_PAGE + pageItems.length} จาก{' '}
                        {scopedLeaks.length}
                      </div>
                    </div>
                  </div>

                  <table className="w-full text-[10.5px] border-collapse border border-slate-200">
                    <thead>
                      <tr className="bg-[#0A4999] text-white">
                        <th className="py-2 px-2 text-left font-semibold border border-slate-300 w-20">
                          DMA / NO
                        </th>
                        <th className="py-2 px-2 text-left font-semibold border border-slate-300 w-20">
                          วันที่
                        </th>
                        <th className="py-2 px-2 text-left font-semibold border border-slate-300 w-24">
                          ชนิด / ขนาดท่อ
                        </th>
                        <th className="py-2 px-2 text-left font-semibold border border-slate-300 w-36">
                          ตำแหน่ง / พิกัด
                        </th>
                        <th className="py-2 px-2 text-left font-semibold border border-slate-300">
                          ผู้รับผิดชอบ / วิธีแก้ไข
                        </th>
                        <th className="py-2 px-2 text-left font-semibold border border-slate-300 w-28">
                          ระดับความเร่งด่วน
                        </th>
                        {includePhotosInPdf && (
                          <th className="py-2 px-2 text-center font-semibold border border-slate-300 w-20">
                            ภาพถ่าย
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((item, rowIdx) => {
                        const cover = item.photos[0];
                        const canRenderInlineImg =
                          cover && isSafeInlineImage(cover.url);
                        const {pipeType, pipeSize} = parsePipeSpec(
                          item.pipeSpec,
                          item.pipeType,
                          item.pipeSize
                        );
                        return (
                          <tr
                            key={item.id}
                            className={
                              rowIdx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'
                            }
                          >
                            <td className="py-2 px-2 align-top border border-slate-200 font-mono">
                              <div className="font-bold text-slate-900">
                                {item.dma}
                              </div>
                              <div className="text-slate-600 tabular-nums">
                                NO.{item.no}
                              </div>
                            </td>
                            <td className="py-2 px-2 align-top border border-slate-200 font-mono tabular-nums text-slate-700">
                              {item.reportDate || '-'}
                            </td>
                            <td className="py-2 px-2 align-top border border-slate-200 space-y-0.5">
                              <div className="font-semibold text-slate-900">
                                {pipeType || '-'}
                              </div>
                              <div className="text-[10px] text-slate-600 font-mono">
                                {pipeSize || '-'}
                              </div>
                            </td>
                            <td className="py-2 px-2 align-top border border-slate-200 space-y-0.5">
                              <div className="text-slate-800 leading-snug">
                                {item.locationName || '-'}
                              </div>
                              {item.lat !== null && item.lng !== null && (
                                <div className="font-mono text-[9.5px] text-slate-500 tabular-nums">
                                  {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-2 align-top border border-slate-200 space-y-0.5">
                              <div className="font-medium text-slate-900">
                                {item.technician || '-'}
                              </div>
                              {item.repairMethod && (
                                <div className="text-[10px] text-slate-600 leading-snug">
                                  {item.repairMethod}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-2 align-top border border-slate-200">
                              <div
                                className={`font-semibold ${SEVERITY_COLORS[item.severity].text}`}
                              >
                                {item.severity === 'critical'
                                  ? `! ${SEVERITY_LABELS[item.severity]}`
                                  : SEVERITY_LABELS[item.severity]}
                              </div>
                            </td>
                            {includePhotosInPdf && (
                              <td className="py-1.5 px-1.5 align-middle text-center border border-slate-200">
                                {cover ? (
                                  canRenderInlineImg ? (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <img
                                        src={cover.url}
                                        alt={`${item.dma} #${item.no}`}
                                        className="w-16 h-11 object-cover rounded border border-slate-200"
                                      />
                                      {item.photos.length > 1 && (
                                        <span className="text-[9px] text-slate-500">
                                          +{item.photos.length - 1} รูป
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="inline-block px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-800 text-[9.5px] font-medium">
                                      Drive ({item.photos.length})
                                    </span>
                                  )
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500">
                    <span>
                      ระบบติดตามและจัดการจุดแตกรั่วท่อประปา · {scopeLabel}
                    </span>
                    <span className="font-mono">
                      หน้า {pageNumber} / {totalPages}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
