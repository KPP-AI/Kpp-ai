import React, {useEffect, useMemo, useState} from 'react';
import {
  AlertTriangle,
  Camera,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Edit3,
  FileSpreadsheet,
  MapPin,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  DMA_OPTIONS,
  LeakPhoto,
  LeakPoint,
  LeakSeverity,
  parsePipeSpec,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
} from '../types/leak';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const;

interface LeakTableViewProps {
  leaks: LeakPoint[];
  dmas: string[];
  searchQuery: string;
  selectedDma: string;
  severityFilter: LeakSeverity | 'all';
  hideToolbar?: boolean;
  onSearchChange: (q: string) => void;
  onDmaChange: (dma: string) => void;
  onSeverityChange: (severity: LeakSeverity | 'all') => void;
  onFocusOnMap: (leak: LeakPoint) => void;
  onPinOnMap: (leak: LeakPoint) => void;
  onEdit: (leak: LeakPoint) => void;
  onDelete: (id: string) => void;
  onAddNew: () => void;
  onOpenReport: () => void;
  onOpenLightbox: (photos: LeakPhoto[], index: number, title: string) => void;
}

export const LeakTableView: React.FC<LeakTableViewProps> = ({
  leaks,
  dmas,
  searchQuery,
  selectedDma,
  severityFilter,
  hideToolbar = false,
  onSearchChange,
  onDmaChange,
  onSeverityChange,
  onFocusOnMap,
  onPinOnMap,
  onEdit,
  onDelete,
  onAddNew,
  onOpenReport,
  onOpenLightbox,
}) => {
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const totalPages = Math.max(1, Math.ceil(leaks.length / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedDma, severityFilter, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedLeaks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return leaks.slice(start, start + pageSize);
  }, [leaks, currentPage, pageSize]);

  const startIndex = leaks.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, leaks.length);

  const dmaOptions = useMemo(
    () => Array.from(new Set([...DMA_OPTIONS, ...dmas])).sort(),
    [dmas]
  );

  return (
    <div
      className={
        hideToolbar
          ? 'space-y-4'
          : 'h-full overflow-y-auto bg-[#F0F5FA] dark:bg-slate-950 px-4 sm:px-6 py-6'
      }
    >
      <div className={hideToolbar ? 'space-y-4' : 'max-w-7xl mx-auto space-y-4'}>
        {/* Data Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 border-t-[3px] border-t-[#0284C7] rounded-2xl shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                ตารางรายการจุดแตกรั่วแยกตามเขต DMA ({leaks.length} รายการ)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                แสดงข้อมูลตามตัวกรอง DMA ระดับความเร่งด่วน และคำค้นหา พร้อมส่งออกรายงาน Excel / PDF
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onOpenReport}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>รายงานสรุป Excel / PDF</span>
              </button>
              <button
                type="button"
                onClick={onAddNew}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0D6EFD] text-white text-xs font-semibold hover:bg-[#0B5ED7] transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>ลงจุดรั่วท่อประปาใหม่</span>
              </button>
            </div>
          </div>

          {/* Integrated Search, Filter & Rows-per-Page Toolbar */}
          <div className="px-5 py-3 bg-slate-50/75 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
              <div className="relative flex-1 min-w-[210px] max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="ค้นหา DMA, NO, ตำแหน่ง, ชนิดท่อ, ช่าง..."
                  aria-label="ค้นหารายการในตาราง"
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-600"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => onSearchChange('')}
                    aria-label="ล้างคำค้นหา"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <select
                value={selectedDma}
                onChange={(e) => onDmaChange(e.target.value)}
                aria-label="กรองตามเขต DMA"
                className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none focus:border-sky-600 font-mono"
              >
                <option value="all">ทุกเขต DMA</option>
                {dmaOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-lg">
                <button
                  type="button"
                  onClick={() => onSeverityChange('all')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    severityFilter === 'all'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  ทั้งหมด
                </button>
                {SEVERITY_ORDER.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onSeverityChange(key)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      severityFilter === key
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {SEVERITY_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>

            {/* Rows per page selector: 5, 10, 25, 50 */}
            <div className="flex items-center gap-2 shrink-0">
              <label
                htmlFor="table-rows-per-page"
                className="text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap"
              >
                แสดงแถว:
              </label>
              <select
                id="table-rows-per-page"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-2.5 py-1.5 text-xs font-mono font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:border-sky-600"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size} รายการ
                  </option>
                ))}
              </select>
            </div>
          </div>

          {leaks.length === 0 ? (
            <div className="py-14 px-6 text-center space-y-3">
              <MapPin className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  ไม่พบรายการจุดแตกรั่วที่ตรงกับเงื่อนไข
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  ลองปรับตัวกรอง หรือลงจุดรั่วท่อประปาใหม่เข้าสู่ระบบ
                </p>
              </div>
              <button
                type="button"
                onClick={onAddNew}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                ลงจุดรั่วใหม่
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/70 text-[11px] font-semibold text-slate-500 dark:text-slate-300">
                    <th className="py-3 px-4 whitespace-nowrap">DMA</th>
                    <th className="py-3 px-3 whitespace-nowrap">NO</th>
                    <th className="py-3 px-3 whitespace-nowrap">วันที่</th>
                    <th className="py-3 px-3 whitespace-nowrap">ชนิดท่อ</th>
                    <th className="py-3 px-3 whitespace-nowrap">ขนาดท่อ</th>
                    <th className="py-3 px-3 min-w-[180px]">ตำแหน่ง</th>
                    <th className="py-3 px-3 min-w-[180px]">
                      ผู้รับผิดชอบ / วิธีแก้ไข
                    </th>
                    <th className="py-3 px-3 whitespace-nowrap">
                      ระดับความเร่งด่วน
                    </th>
                    <th className="py-3 px-3 whitespace-nowrap">ภาพถ่าย</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">
                      จัดการ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {paginatedLeaks.map((leak) => {
                    const sevStyle = SEVERITY_COLORS[leak.severity];
                    const hasCoords = leak.lat !== null && leak.lng !== null;
                    const {pipeType, pipeSize} = parsePipeSpec(
                      leak.pipeSpec,
                      leak.pipeType,
                      leak.pipeSize
                    );

                    return (
                      <tr
                        key={leak.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors align-top"
                      >
                        <td className="py-3 px-4 font-mono font-medium text-slate-900 dark:text-white whitespace-nowrap">
                          {leak.dma}
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {leak.no}
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {leak.reportDate || '-'}
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {pipeType || '-'}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {pipeSize || '-'}
                        </td>
                        <td className="py-3 px-3 space-y-0.5">
                          {leak.locationName && (
                            <div className="text-slate-800 dark:text-slate-200">
                              {leak.locationName}
                            </div>
                          )}
                          {hasCoords ? (
                            <button
                              type="button"
                              onClick={() => onFocusOnMap(leak)}
                              className="font-mono tabular-nums text-[11px] text-sky-700 dark:text-sky-400 hover:underline text-left block"
                            >
                              {leak.lat!.toFixed(5)}, {leak.lng!.toFixed(5)}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onPinOnMap(leak)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 hover:underline"
                            >
                              <Crosshair className="w-3 h-3" />
                              กำหนดพิกัดบนแผนที่
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-3 space-y-0.5">
                          <div className="font-medium text-slate-800 dark:text-slate-200">
                            {leak.technician || '-'}
                          </div>
                          {leak.repairMethod && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                              {leak.repairMethod}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${sevStyle.badge}`}
                          >
                            {leak.severity === 'critical' ? (
                              <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                            ) : (
                              <span
                                className={`w-2 h-2 rounded-full ${sevStyle.dot} shrink-0`}
                              />
                            )}
                            {SEVERITY_LABELS[leak.severity]}
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {leak.photos.length > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenLightbox(
                                  leak.photos,
                                  0,
                                  `${leak.dma} · #${leak.no}`
                                )
                              }
                              className="inline-flex items-center gap-2 group"
                            >
                              <img
                                src={leak.photos[0].url}
                                alt={leak.photos[0].caption || leak.no}
                                referrerPolicy="no-referrer"
                                className="w-9 h-7 rounded object-cover border border-slate-200 dark:border-slate-700 group-hover:ring-2 group-hover:ring-sky-500 transition-all"
                              />
                              <span className="text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                                {leak.photos.length} รูป
                              </span>
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                              <Camera className="w-3.5 h-3.5" />
                              ไม่มีภาพ
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {hasCoords && (
                              <button
                                type="button"
                                onClick={() => onFocusOnMap(leak)}
                                className="px-2 py-1 rounded text-[11px] font-medium text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/40 transition-colors"
                              >
                                ดูแผนที่
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onEdit(leak)}
                              className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              aria-label="แก้ไขรายการ"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDelete(leak.id)}
                              className="p-1.5 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                              aria-label="ลบรายการ"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination Footer */}
              <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="text-slate-600 dark:text-slate-300 tabular-nums">
                  แสดง <span className="font-semibold text-slate-900 dark:text-white">{startIndex}–{endIndex}</span> จากทั้งหมด{' '}
                  <span className="font-semibold text-slate-900 dark:text-white">{leaks.length}</span> รายการ
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>ก่อนหน้า</span>
                  </button>

                  <span className="px-2.5 py-1 text-slate-700 dark:text-slate-200 font-mono tabular-nums">
                    หน้า {currentPage} / {totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
                  >
                    <span>ถัดไป</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
