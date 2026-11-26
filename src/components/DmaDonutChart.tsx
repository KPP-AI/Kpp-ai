import React, {useMemo, useState} from 'react';
import {
  Camera,
  Filter,
  MapPin,
  RotateCcw,
  Wrench,
} from 'lucide-react';
import {
  ACTIVE_SEVERITY_ORDER,
  LeakPoint,
  LeakSeverity,
  parsePipeSpec,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
} from '../types/leak';

interface DmaDonutChartProps {
  leaks: LeakPoint[];
  selectedDma: string;
  severityFilter: LeakSeverity | 'all';
  searchQuery?: string;
  isAdmin: boolean;
  onSelectDma: (dma: string) => void;
  onSelectSeverity: (severity: LeakSeverity | 'all') => void;
  onClearSearch?: () => void;
}

type ChartMode = 'dma' | 'severity';

interface ChartSlice {
  key: string;
  label: string;
  count: number;
  pct: number;
  color: string;
  textColor: string;
}

const DMA_PALETTE: Array<{bg: string; text: string}> = [
  {bg: '#1976D2', text: '#FFFFFF'},
  {bg: '#C62828', text: '#FFFFFF'},
  {bg: '#F9A825', text: '#1E293B'},
  {bg: '#2E7D32', text: '#FFFFFF'},
  {bg: '#5C6BC0', text: '#FFFFFF'},
  {bg: '#00897B', text: '#FFFFFF'},
  {bg: '#EF6C00', text: '#FFFFFF'},
  {bg: '#8E24AA', text: '#FFFFFF'},
  {bg: '#0288D1', text: '#FFFFFF'},
  {bg: '#6D4C41', text: '#FFFFFF'},
];

const PIPE_BAR_COLORS: Record<string, string> = {
  PB: '#0284C7',
  PVC: '#2563EB',
  HDPE: '#0D9488',
  'A/C': '#D97706',
  SP: '#7C3AED',
  'G/S': '#475569',
};

const SEVERITY_SLICE_STYLE: Record<
  LeakSeverity,
  {color: string; textColor: string}
> = {
  low: {color: SEVERITY_COLORS.low.hex, textColor: '#1E293B'},
  moderate: {color: SEVERITY_COLORS.moderate.hex, textColor: '#FFFFFF'},
  critical: {color: SEVERITY_COLORS.critical.hex, textColor: '#FFFFFF'},
  resolved: {color: SEVERITY_COLORS.resolved.hex, textColor: '#FFFFFF'},
};

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeDonutArc(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number
): string {
  const outerStart = polarToCartesian(cx, cy, outerR, endAngle);
  const outerEnd = polarToCartesian(cx, cy, outerR, startAngle);
  const innerStart = polarToCartesian(cx, cy, innerR, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerR, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    'M',
    outerStart.x.toFixed(3),
    outerStart.y.toFixed(3),
    'A',
    outerR,
    outerR,
    0,
    largeArc,
    0,
    outerEnd.x.toFixed(3),
    outerEnd.y.toFixed(3),
    'L',
    innerEnd.x.toFixed(3),
    innerEnd.y.toFixed(3),
    'A',
    innerR,
    innerR,
    0,
    largeArc,
    1,
    innerStart.x.toFixed(3),
    innerStart.y.toFixed(3),
    'Z',
  ].join(' ');
}

export const DmaDonutChart: React.FC<DmaDonutChartProps> = ({
  leaks,
  selectedDma,
  severityFilter,
  searchQuery = '',
  isAdmin,
  onSelectDma,
  onSelectSeverity,
  onClearSearch,
}) => {
  const [mode, setMode] = useState<ChartMode>('dma');

  const slices = useMemo<ChartSlice[]>(() => {
    const total = leaks.length;
    if (total === 0) return [];

    if (mode === 'severity') {
      const counts: Record<LeakSeverity, number> = {
        low: 0,
        moderate: 0,
        critical: 0,
        resolved: 0,
      };
      for (const l of leaks) {
        counts[l.severity]++;
      }
      const keys = isAdmin ? SEVERITY_ORDER : ACTIVE_SEVERITY_ORDER;
      return keys
        .filter((k) => counts[k] > 0)
        .map((k) => ({
          key: k,
          label: k === 'critical' ? `! ${SEVERITY_LABELS[k]}` : SEVERITY_LABELS[k],
          count: counts[k],
          pct: (counts[k] / total) * 100,
          color: SEVERITY_SLICE_STYLE[k].color,
          textColor: SEVERITY_SLICE_STYLE[k].textColor,
        }));
    }

    const dmaCounts: Record<string, number> = {};
    for (const l of leaks) {
      const key = l.dma || 'ไม่ระบุ DMA';
      dmaCounts[key] = (dmaCounts[key] || 0) + 1;
    }

    const sorted = Object.entries(dmaCounts).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5);
    const combined: Array<[string, number]> = [...top];
    if (rest.length > 0) {
      const restSum = rest.reduce((acc, [, n]) => acc + n, 0);
      combined.push(['อื่นๆ', restSum]);
    }

    return combined.map(([key, count], idx) => {
      const palette = DMA_PALETTE[idx % DMA_PALETTE.length];
      return {
        key,
        label: key,
        count,
        pct: (count / total) * 100,
        color: palette.bg,
        textColor: palette.text,
      };
    });
  }, [leaks, mode, isAdmin]);

  const pipeBreakdown = useMemo(() => {
    const typeCounts: Record<string, number> = {};
    const sizeCounts: Record<string, number> = {};
    let pinnedCount = 0;
    let photoCount = 0;
    let assignedCount = 0;

    for (const l of leaks) {
      if (l.lat !== null && l.lng !== null) pinnedCount++;
      if (l.photos.length > 0) photoCount++;
      if (l.technician.trim()) assignedCount++;

      const {pipeType, pipeSize} = parsePipeSpec(
        l.pipeSpec,
        l.pipeType,
        l.pipeSize
      );
      const tKey = pipeType || 'ไม่ระบุชนิด';
      typeCounts[tKey] = (typeCounts[tKey] || 0) + 1;

      if (pipeSize) {
        sizeCounts[pipeSize] = (sizeCounts[pipeSize] || 0) + 1;
      }
    }

    const total = leaks.length || 1;
    const topTypes = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([type, count]) => ({
        type,
        count,
        pct: (count / total) * 100,
        color: PIPE_BAR_COLORS[type] || '#64748B',
      }));

    const topSizes = Object.entries(sizeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    return {
      topTypes,
      topSizes,
      pinnedCount,
      photoCount,
      assignedCount,
    };
  }, [leaks]);

  const activeKey =
    mode === 'dma'
      ? selectedDma !== 'all'
        ? selectedDma
        : null
      : severityFilter !== 'all'
        ? severityFilter
        : null;

  const handleSliceClick = (key: string) => {
    if (key === 'อื่นๆ') return;
    if (mode === 'dma') {
      onSelectDma(selectedDma === key ? 'all' : key);
    } else {
      onSelectSeverity(
        severityFilter === key ? 'all' : (key as LeakSeverity)
      );
    }
  };

  const segments = useMemo(() => {
    const cx = 80;
    const cy = 80;
    const outerR = 72;
    const innerR = 38;
    const midR = (outerR + innerR) / 2;
    let currentAngle = 0;

    return slices.map((slice) => {
      const sweep = (slice.pct / 100) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sweep;
      const midAngle = startAngle + sweep / 2;
      currentAngle = endAngle;

      const labelPos = polarToCartesian(cx, cy, midR, midAngle);
      const isFullCircle = sweep >= 359.99;

      return {
        ...slice,
        startAngle,
        endAngle,
        isFullCircle,
        path: isFullCircle
          ? ''
          : describeDonutArc(cx, cy, outerR, innerR, startAngle, endAngle),
        labelX: labelPos.x,
        labelY: labelPos.y,
      };
    });
  }, [slices]);

  const hasActiveFilter =
    selectedDma !== 'all' ||
    severityFilter !== 'all' ||
    searchQuery.trim().length > 0;

  const handleResetAllFilters = () => {
    onSelectDma('all');
    onSelectSeverity('all');
    onClearSearch?.();
  };

  const totalCount = leaks.length;
  const pinnedPct =
    totalCount > 0 ? Math.round((pipeBreakdown.pinnedCount / totalCount) * 100) : 0;
  const photoPct =
    totalCount > 0 ? Math.round((pipeBreakdown.photoCount / totalCount) * 100) : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
      {/* Panel 1: Donut Chart + Proportional Bar Legend */}
      <div className="lg:col-span-5 bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl p-4 flex flex-col justify-between gap-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100">
              {mode === 'dma'
                ? 'สัดส่วนจุดรั่วตามเขต DMA'
                : 'สัดส่วนตามระดับความเร่งด่วน'}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              คลิกกราฟหรือรายการเพื่อกรองข้อมูลทันที
            </p>
          </div>
          <div className="inline-flex items-center p-0.5 bg-slate-200/80 dark:bg-slate-900 rounded-lg text-[11px] shrink-0">
            <button
              type="button"
              onClick={() => setMode('dma')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                mode === 'dma'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              DMA
            </button>
            <button
              type="button"
              onClick={() => setMode('severity')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                mode === 'severity'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              ระดับความเร่งด่วน
            </button>
          </div>
        </div>

        {leaks.length === 0 ? (
          <div className="flex items-center justify-center h-[144px] text-xs text-slate-400">
            ยังไม่มีข้อมูลสำหรับแสดงกราฟ
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="relative shrink-0 w-[142px] h-[142px]">
              <svg
                viewBox="0 0 160 160"
                className="w-full h-full"
                role="img"
                aria-label="กราฟวงกลมสรุปสัดส่วนจุดแตกรั่ว"
              >
                {segments.map((seg) => {
                  const isSelected = activeKey === seg.key;
                  const dimmed = activeKey !== null && !isSelected;
                  const clickable = seg.key !== 'อื่นๆ';

                  return (
                    <g
                      key={seg.key}
                      onClick={() => clickable && handleSliceClick(seg.key)}
                      className={clickable ? 'cursor-pointer' : undefined}
                      style={{opacity: dimmed ? 0.45 : 1}}
                    >
                      <title>
                        {seg.label}: {seg.count} จุด ({seg.pct.toFixed(1)}%)
                      </title>
                      {seg.isFullCircle ? (
                        <circle
                          cx={80}
                          cy={80}
                          r={55}
                          fill="none"
                          stroke={seg.color}
                          strokeWidth={34}
                        />
                      ) : (
                        <path
                          d={seg.path}
                          fill={seg.color}
                          stroke="#ffffff"
                          strokeWidth={1.75}
                        />
                      )}
                      {seg.pct >= 10 && (
                        <text
                          x={seg.isFullCircle ? 80 : seg.labelX}
                          y={seg.isFullCircle ? 30 : seg.labelY}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill={seg.textColor}
                          fontSize="10"
                          fontWeight="600"
                          className="pointer-events-none select-none tabular-nums"
                        >
                          {seg.pct.toFixed(0)}%
                        </text>
                      )}
                    </g>
                  );
                })}

                <text
                  x="80"
                  y="75"
                  textAnchor="middle"
                  fontSize="17"
                  fontWeight="700"
                  className="tabular-nums pointer-events-none fill-slate-900 dark:fill-white"
                >
                  {leaks.length}
                </text>
                <text
                  x="80"
                  y="92"
                  textAnchor="middle"
                  fontSize="9.5"
                  className="pointer-events-none fill-slate-500 dark:fill-slate-400"
                >
                  จุดทั้งหมด
                </text>
              </svg>
            </div>

            <div className="flex-1 min-w-0 space-y-2">
              {segments.map((seg) => {
                const isSelected = activeKey === seg.key;
                const clickable = seg.key !== 'อื่นๆ';
                return (
                  <button
                    key={seg.key}
                    type="button"
                    disabled={!clickable}
                    onClick={() => handleSliceClick(seg.key)}
                    className={`w-full text-left px-2 py-1 rounded-lg transition-colors ${
                      isSelected
                        ? 'bg-sky-50 dark:bg-sky-900/40 ring-1 ring-sky-200 dark:ring-sky-700 text-sky-900 dark:text-sky-200'
                        : clickable
                          ? 'hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                          : 'text-slate-600 dark:text-slate-400 cursor-default'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 min-w-0 font-medium">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{backgroundColor: seg.color}}
                        />
                        <span className="truncate">{seg.label}</span>
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
                        {seg.count} ({seg.pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full bg-slate-200/80 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.max(4, seg.pct)}%`,
                          backgroundColor: seg.color,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Panel 2: Pipe Material & Diameter Breakdown */}
      <div className="lg:col-span-4 bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl p-4 flex flex-col justify-between gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0">
              <Wrench className="w-3.5 h-3.5" />
            </span>
            <div>
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                จำแนกตามชนิดท่อและขนาดท่อ
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                คำนวณจากข้อมูลตามตัวกรองปัจจุบัน
              </p>
            </div>
          </div>
        </div>

        {leaks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
            ยังไม่มีข้อมูลชนิดท่อ
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="space-y-2">
              {pipeBreakdown.topTypes.map((item) => (
                <div key={item.type} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      ท่อ {item.type}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
                      {item.count} จุด ({item.pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-200/80 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max(4, item.pct)}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {pipeBreakdown.topSizes.length > 0 && (
              <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-500 dark:text-slate-400 shrink-0">ขนาดที่พบบ่อย:</span>
                <div className="flex flex-wrap justify-end gap-1.5 font-mono text-slate-700 dark:text-slate-200">
                  {pipeBreakdown.topSizes.map(([size, count]) => (
                    <span
                      key={size}
                      className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 tabular-nums"
                    >
                      {size} ({count})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Panel 3: Active Filter Context & Field Data Completeness */}
      <div className="lg:col-span-3 bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl p-4 flex flex-col justify-between gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
              <Filter className="w-3.5 h-3.5" />
            </span>
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100">
              สรุปตัวกรองและข้อมูลหน้างาน
            </h3>
          </div>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={handleResetAllFilters}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 dark:text-sky-400 hover:text-sky-900 dark:hover:text-sky-300 transition-colors shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              <span>ล้างตัวกรอง</span>
            </button>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 rounded-lg p-2.5 space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 dark:text-slate-400">เขตพื้นที่:</span>
            <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">
              {selectedDma === 'all' ? 'ทุก DMA (01-20)' : selectedDma}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 dark:text-slate-400">ความเร่งด่วน:</span>
            <span className="font-medium text-slate-800 dark:text-slate-100 truncate">
              {severityFilter === 'all'
                ? 'ทั้งหมด'
                : SEVERITY_LABELS[severityFilter]}
            </span>
          </div>
          {searchQuery.trim() && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">คำค้นหา:</span>
              <span className="font-medium text-sky-700 dark:text-sky-400 truncate">
                “{searchQuery.trim()}”
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2 text-[11px]">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                ปักพิกัด GPS แล้ว
              </span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                {pipeBreakdown.pinnedCount}/{totalCount} ({pinnedPct}%)
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-200/80 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{width: `${pinnedPct}%`}}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1">
                <Camera className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                มีภาพถ่ายหน้างาน
              </span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                {pipeBreakdown.photoCount}/{totalCount} ({photoPct}%)
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-200/80 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-500 rounded-full transition-all duration-300"
                style={{width: `${photoPct}%`}}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
