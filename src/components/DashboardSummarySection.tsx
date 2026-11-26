import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Droplets,
  Gauge,
  MapPin,
  Search,
} from 'lucide-react';
import {LeakPoint, LeakSeverity, SEVERITY_LABELS} from '../types/leak';
import {DmaDonutChart} from './DmaDonutChart';

interface DashboardSummarySectionProps {
  searchQuery: string;
  selectedDma: string;
  severityFilter: LeakSeverity | 'all';
  allDmaOptions: string[];
  isAdmin: boolean;
  stats: {
    total: number;
    low: number;
    moderate: number;
    critical: number;
    resolved: number;
  };
  filteredLeaks: LeakPoint[];
  onSearchChange: (q: string) => void;
  onDmaChange: (dma: string) => void;
  onSeverityChange: (severity: LeakSeverity | 'all') => void;
}

export const DashboardSummarySection: React.FC<DashboardSummarySectionProps> = ({
  searchQuery,
  selectedDma,
  severityFilter,
  allDmaOptions,
  isAdmin,
  stats,
  filteredLeaks,
  onSearchChange,
  onDmaChange,
  onSeverityChange,
}) => {
  const filterButtons: Array<{key: LeakSeverity | 'all'; label: string}> = [
    {key: 'all', label: 'ทั้งหมด'},
    {key: 'low', label: 'ต่ำ (ซึมเล็กน้อย)'},
    {key: 'moderate', label: 'ปานกลาง (มีน้ำซึมขัง)'},
    {key: 'critical', label: 'วิกฤต (น้ำพุ่งแรง)'},
    ...(isAdmin ? [{key: 'resolved' as const, label: 'ซ่อมแล้วเสร็จ'}] : []),
  ];

  return (
    <section
      aria-label="แดชบอร์ดภาพรวมจุดแตกรั่ว"
      className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 border-t-[3px] border-t-[#1976D2] rounded-2xl shadow-xs p-5 sm:p-6 space-y-5"
    >
      {/* Section Header + Search & DMA / Severity Filters */}
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1976D2] text-white flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                สรุปจำนวนจุดแตกรั่วท่อประปา
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ภาพรวมข้อมูลจุดแตกรั่วแยกตามระดับความเร่งด่วนและเขต DMA-01 ถึง DMA-20
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[210px] sm:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="ค้นหา DMA, NO, ตำแหน่ง, ชนิดท่อ..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-600"
              />
            </div>

            <select
              value={selectedDma}
              onChange={(e) => onDmaChange(e.target.value)}
              aria-label="เลือกเขต DMA"
              className="px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none focus:border-sky-600 font-mono"
            >
              <option value="all">ทุก DMA (01-20)</option>
              {allDmaOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit max-w-full">
          {filterButtons.map((btn) => (
            <button
              key={btn.key}
              type="button"
              onClick={() => onSeverityChange(btn.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                severityFilter === btn.key
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {btn.key === 'low' && (
                <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
              )}
              {btn.key === 'moderate' && (
                <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
              )}
              {btn.key === 'critical' && (
                <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
              )}
              {btn.key === 'resolved' && (
                <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
              )}
              <span>{btn.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Severity KPI Cards */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${
          isAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
        } gap-3.5`}
      >
        <button
          type="button"
          onClick={() => onSeverityChange('all')}
          className={`text-left rounded-2xl border border-slate-200/80 dark:border-slate-700/80 border-t-[3px] border-t-[#1976D2] bg-gradient-to-br from-white to-sky-50/80 dark:from-slate-800/90 dark:to-sky-950/40 p-4 transition-all hover:shadow-sm ${
            severityFilter === 'all' ? 'ring-1 ring-[#1976D2]/30' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                จุดแตกรั่วทั้งหมด
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {stats.total}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">จุด</span>
              </div>
            </div>
            <span className="w-10 h-10 rounded-xl bg-[#1565C0] text-white flex items-center justify-center shrink-0">
              <Droplets className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/70 text-[11px] text-slate-500 dark:text-slate-400">
            {severityFilter !== 'all'
              ? `กำลังแสดงเฉพาะ: ${SEVERITY_LABELS[severityFilter]}`
              : selectedDma === 'all'
                ? 'รายการจุดแตกรั่วตามตัวกรอง'
                : `รายการจุดแตกรั่วเฉพาะเขต ${selectedDma}`}
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            onSeverityChange(severityFilter === 'low' ? 'all' : 'low')
          }
          className={`text-left rounded-2xl border border-slate-200/80 dark:border-slate-700/80 border-t-[3px] border-t-[#EAB308] bg-gradient-to-br from-white to-yellow-50/90 dark:from-slate-800/90 dark:to-yellow-950/30 p-4 transition-all hover:shadow-sm ${
            severityFilter === 'low'
              ? 'ring-1 ring-[#EAB308]/50'
              : severityFilter !== 'all'
                ? 'opacity-65'
                : ''
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                ต่ำ (ซึมเล็กน้อย)
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {stats.low}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">จุด</span>
              </div>
            </div>
            <span className="w-10 h-10 rounded-xl bg-[#EAB308] text-white flex items-center justify-center shrink-0">
              <Droplets className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-yellow-200/60 dark:border-yellow-700/40 text-[11px] text-yellow-800 dark:text-yellow-300">
            ระดับต่ำ · สีเหลือง
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            onSeverityChange(severityFilter === 'moderate' ? 'all' : 'moderate')
          }
          className={`text-left rounded-2xl border border-slate-200/80 dark:border-slate-700/80 border-t-[3px] border-t-[#F97316] bg-gradient-to-br from-white to-orange-50/90 dark:from-slate-800/90 dark:to-orange-950/30 p-4 transition-all hover:shadow-sm ${
            severityFilter === 'moderate'
              ? 'ring-1 ring-[#F97316]/50'
              : severityFilter !== 'all'
                ? 'opacity-65'
                : ''
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                ปานกลาง (มีน้ำซึมขัง)
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {stats.moderate}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">จุด</span>
              </div>
            </div>
            <span className="w-10 h-10 rounded-xl bg-[#F97316] text-white flex items-center justify-center shrink-0">
              <Gauge className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-orange-200/60 dark:border-orange-700/40 text-[11px] text-orange-800 dark:text-orange-300">
            ระดับปานกลาง · สีส้ม
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            onSeverityChange(severityFilter === 'critical' ? 'all' : 'critical')
          }
          className={`text-left rounded-2xl border border-slate-200/80 dark:border-slate-700/80 border-t-[3px] border-t-[#DC2626] bg-gradient-to-br from-white to-red-50/90 dark:from-slate-800/90 dark:to-red-950/35 p-4 transition-all hover:shadow-sm ${
            severityFilter === 'critical'
              ? 'ring-1 ring-[#DC2626]/50'
              : severityFilter !== 'all'
                ? 'opacity-65'
                : ''
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                วิกฤต (น้ำพุ่งแรง)
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {stats.critical}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">จุด</span>
              </div>
            </div>
            <span className="w-10 h-10 rounded-xl bg-[#DC2626] text-white flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-red-200/60 dark:border-red-700/40 text-[11px] text-red-700 dark:text-red-300 font-medium">
            ระดับวิกฤต (!) · เร่งด่วนสีแดง
          </div>
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() =>
              onSeverityChange(
                severityFilter === 'resolved' ? 'all' : 'resolved'
              )
            }
            className={`text-left rounded-2xl border border-slate-200/80 dark:border-slate-700/80 border-t-[3px] border-t-[#16A34A] bg-gradient-to-br from-white to-emerald-50/90 dark:from-slate-800/90 dark:to-emerald-950/30 p-4 transition-all hover:shadow-sm ${
              severityFilter === 'resolved'
                ? 'ring-1 ring-[#16A34A]/50'
                : severityFilter !== 'all'
                  ? 'opacity-65'
                  : ''
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  ซ่อมแล้วเสร็จ
                </div>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {stats.resolved}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">จุด</span>
                </div>
              </div>
              <span className="w-10 h-10 rounded-xl bg-[#16A34A] text-white flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-3 pt-2.5 border-t border-emerald-200/60 dark:border-emerald-700/40 text-[11px] text-emerald-700 dark:text-emerald-300">
              ซ่อมแล้วเสร็จ · สีเขียว
            </div>
          </button>
        )}
      </div>

      {/* Donut Chart & Insights Band showing the active filtered leaks */}
      <div className="pt-1">
        <DmaDonutChart
          leaks={filteredLeaks}
          selectedDma={selectedDma}
          severityFilter={severityFilter}
          searchQuery={searchQuery}
          isAdmin={isAdmin}
          onSelectDma={onDmaChange}
          onSelectSeverity={onSeverityChange}
          onClearSearch={() => onSearchChange('')}
        />
      </div>
    </section>
  );
};
