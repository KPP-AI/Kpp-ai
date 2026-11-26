import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Crosshair,
  LogIn,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import {AppTheme, HeaderQuickControls} from './HeaderQuickControls';

interface LandingPageProps {
  theme: AppTheme;
  onChangeTheme: (next: AppTheme) => void;
  totalActiveLeaks: number;
  criticalCount: number;
  isAdmin: boolean;
  adminUsername: string | null;
  onEnterMain: () => void;
  onEnterAndPin: () => void;
  onOpenAdminLogin: () => void;
}

const APP_LOGO_SRC = '/assets/aistudio/_________________________2e00b14d.png';

export const LandingPage: React.FC<LandingPageProps> = ({
  theme,
  onChangeTheme,
  totalActiveLeaks,
  criticalCount,
  isAdmin,
  adminUsername,
  onEnterMain,
  onEnterAndPin,
  onOpenAdminLogin,
}) => {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#EFF6FF] via-[#F5F9FF] to-[#E6F0FC] dark:from-[#060D1A] dark:via-[#0B1528] dark:to-[#0F1E36] text-slate-900 dark:text-slate-100 relative overflow-hidden">
      {/* Subtle architectural water-engineering background accents */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-32 -right-24 w-[420px] h-[420px] rounded-full bg-sky-400/20 dark:bg-sky-500/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 w-[380px] h-[380px] rounded-full bg-blue-500/15 dark:bg-blue-600/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.35] dark:opacity-[0.14]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(14, 116, 210, 0.22) 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />
      </div>

      {/* Top Navigation Bar */}
      <header className="relative z-20 h-14 sm:h-16 bg-gradient-to-r from-[#0A4DA2] via-[#1267C9] to-[#1A7FE2] dark:from-[#0B1D3A] dark:via-[#0F2A54] dark:to-[#13386E] text-white px-3 sm:px-6 flex items-center justify-between gap-2 shadow-sm border-b border-white/10">
        <div className="inline-flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-white p-0.5 flex items-center justify-center shadow-sm shrink-0">
            <img
              src={APP_LOGO_SRC}
              alt="โลโก้ระบบรายการจุดแตกรั่ว"
              className="w-full h-full object-contain"
            />
          </span>
          <div className="min-w-0">
            <div className="text-sm sm:text-base font-bold tracking-tight truncate">
              รายการจุดแตกรั่ว
            </div>
            <div className="hidden sm:block text-[11px] text-sky-100/90 truncate">
              ระบบแผนที่ติดตามและซ่อมบำรุงท่อประปา · DMA-01 – DMA-20
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <HeaderQuickControls
            theme={theme}
            onChangeTheme={onChangeTheme}
            compactOnMobile
          />

          {/* Admin shortcut kept desktop-only per mobile rules */}
          {isAdmin ? (
            <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-300/40 text-xs font-medium text-white">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-200" />
              <span>{adminUsername || 'admin'}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={onOpenAdminLogin}
              className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/25 text-white text-xs font-medium transition-colors whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>เข้าสู่ระบบ Admin</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Centered Hero Section */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-6 py-6 sm:py-10">
        <div className="max-w-5xl w-full mx-auto grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-10 items-center">
          {/* Visual Illustration Frame (Left on Desktop, Top on Mobile) */}
          <div className="md:col-span-5 flex justify-center">
            <div className="relative w-full max-w-[300px] sm:max-w-[340px] aspect-square rounded-3xl bg-gradient-to-br from-white via-[#F0F7FF] to-[#DBEAFE] dark:from-[#0F213E] dark:via-[#122A4E] dark:to-[#0A182E] border border-sky-200/80 dark:border-sky-700/40 shadow-2xl shadow-sky-900/10 dark:shadow-black/50 p-6 sm:p-8 flex items-center justify-center">
              {/* Studio Concentric Rings framing the pin artwork */}
              <div
                aria-hidden="true"
                className="absolute inset-4 rounded-2xl border border-sky-300/40 dark:border-sky-400/15"
              />
              <div
                aria-hidden="true"
                className="absolute w-52 h-52 sm:w-60 sm:h-60 rounded-full bg-sky-400/15 dark:bg-sky-400/15 blur-xl"
              />
              <div
                aria-hidden="true"
                className="absolute w-48 h-48 sm:w-56 sm:h-56 rounded-full border-2 border-dashed border-sky-300/60 dark:border-sky-400/25"
              />

              <img
                src={APP_LOGO_SRC}
                alt="ภาพประกอบช่างประปาซ่อมจุดท่อแตกรั่วบนหมุดแผนที่"
                className="relative z-10 w-full h-full object-contain drop-shadow-[0_14px_24px_rgba(10,77,162,0.22)] dark:drop-shadow-[0_16px_28px_rgba(0,0,0,0.6)] select-none"
              />

              {/* Live Status Corner Tag */}
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-md text-[11px] font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="tabular-nums">
                  กำลังติดตาม {totalActiveLeaks} จุด
                </span>
                {criticalCount > 0 && (
                  <>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 tabular-nums">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      วิกฤต {criticalCount}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Copy & Entry Actions (Right on Desktop, Bottom on Mobile) */}
          <div className="md:col-span-7 text-center md:text-left space-y-5 pt-2 md:pt-0">
            <div className="space-y-2.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-100/90 dark:bg-sky-900/50 border border-sky-200 dark:border-sky-700/60 text-[#0A4DA2] dark:text-sky-300 text-xs font-semibold">
                <MapPin className="w-3.5 h-3.5" />
                <span>ระบบบริหารจัดการงานซ่อมท่อประปา · DMA-01 ถึง DMA-20</span>
              </div>

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
                ระบบแผนที่บันทึกและติดตาม
                <span className="block text-[#0A4DA2] dark:text-sky-400 mt-1">
                  จุดแตกรั่วท่อประปาหน้างาน
                </span>
              </h1>

              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl mx-auto md:mx-0">
                ปักหมุดพิกัด GPS แยกระดับความเร่งด่วน ระบุชนิดและขนาดท่อ
                พร้อมถ่ายภาพหน้างานจากมือถือได้ทันทีในหน้าจอเดียว
              </p>
            </div>

            {/* Primary & Secondary Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center md:justify-start gap-3">
              <button
                type="button"
                onClick={onEnterMain}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#0A4DA2] to-[#1673D6] hover:from-[#083E84] hover:to-[#1162BA] text-white text-sm font-semibold shadow-lg shadow-blue-900/20 transition-all cursor-pointer"
              >
                <span>เข้าสู่หน้าจอหลัก</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onEnterAndPin}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-sm font-semibold shadow-xs transition-all cursor-pointer"
              >
                <Crosshair className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span>แจ้ง / ปักหมุดจุดรั่วทันที</span>
              </button>
            </div>

            {/* Compact 3-Item Capability Strip */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-2 max-w-xl mx-auto md:mx-0">
              <div className="rounded-xl bg-white/80 dark:bg-slate-900/75 border border-slate-200/80 dark:border-slate-800 px-3 py-2.5 text-center md:text-left">
                <MapPin className="w-4 h-4 text-[#0A4DA2] dark:text-sky-400 mx-auto md:mx-0 mb-1" />
                <div className="text-[11px] sm:text-xs font-semibold text-slate-800 dark:text-slate-100">
                  พิกัด GPS แม่นยำ
                </div>
                <div className="hidden sm:block text-[11px] text-slate-500 dark:text-slate-400">
                  ระบุตำแหน่งบนแผนที่
                </div>
              </div>

              <div className="rounded-xl bg-white/80 dark:bg-slate-900/75 border border-slate-200/80 dark:border-slate-800 px-3 py-2.5 text-center md:text-left">
                <Camera className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mx-auto md:mx-0 mb-1" />
                <div className="text-[11px] sm:text-xs font-semibold text-slate-800 dark:text-slate-100">
                  ถ่ายภาพหน้างาน
                </div>
                <div className="hidden sm:block text-[11px] text-slate-500 dark:text-slate-400">
                  ถ่ายจากกล้องมือถือทันที
                </div>
              </div>

              <div className="rounded-xl bg-white/80 dark:bg-slate-900/75 border border-slate-200/80 dark:border-slate-800 px-3 py-2.5 text-center md:text-left">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mx-auto md:mx-0 mb-1" />
                <div className="text-[11px] sm:text-xs font-semibold text-slate-800 dark:text-slate-100">
                  จัดลำดับความเร่งด่วน
                </div>
                <div className="hidden sm:block text-[11px] text-slate-500 dark:text-slate-400">
                  แยกสีชัดเจนตามระดับ
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
