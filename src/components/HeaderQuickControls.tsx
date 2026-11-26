import React, {useState} from 'react';
import {
  Check,
  Copy,
  Download,
  Monitor,
  Moon,
  Share,
  Smartphone,
  Sun,
  X,
} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';

export type AppTheme = 'day' | 'night';

interface HeaderQuickControlsProps {
  theme: AppTheme;
  onChangeTheme: (next: AppTheme) => void;
  compactOnMobile?: boolean;
}

export const HeaderQuickControls: React.FC<HeaderQuickControlsProps> = ({
  theme,
  onChangeTheme,
  compactOnMobile = false,
}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [guideOpen, setGuideOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setGuideOpen(true);
      }
      return;
    }
    setGuideOpen(true);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors inside restricted frames
    }
  };

  return (
    <>
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {!isInstalled && (
          <button
            type="button"
            onClick={() => void handleInstallClick()}
            title="ติดตั้งแอปหรือสร้างทางลัดบนหน้าจอหลัก"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3.5 sm:py-1.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/30 text-white text-[11px] sm:text-xs font-medium backdrop-blur-xs transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span className={compactOnMobile ? 'hidden sm:inline' : ''}>
              ติดตั้ง / ทางลัด
            </span>
          </button>
        )}

        {/* Day / Night Segmented Toggle */}
        <div
          role="group"
          aria-label="โหมดแสดงผล กลางวัน หรือ กลางคืน"
          className="inline-flex items-center p-0.5 rounded-full bg-white/15 border border-white/30 backdrop-blur-xs shrink-0"
        >
          <button
            type="button"
            onClick={() => onChangeTheme('day')}
            aria-pressed={theme === 'day'}
            className={`inline-flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold transition-all whitespace-nowrap ${
              theme === 'day'
                ? 'bg-white text-[#0A4DA2] shadow-xs'
                : 'text-white/90 hover:text-white'
            }`}
          >
            <Sun className="w-3.5 h-3.5 shrink-0" />
            <span className={compactOnMobile ? 'hidden sm:inline' : ''}>
              กลางวัน
            </span>
          </button>

          <button
            type="button"
            onClick={() => onChangeTheme('night')}
            aria-pressed={theme === 'night'}
            className={`inline-flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold transition-all whitespace-nowrap ${
              theme === 'night'
                ? 'bg-slate-900 text-sky-300 shadow-xs'
                : 'text-white/90 hover:text-white'
            }`}
          >
            <Moon className="w-3.5 h-3.5 shrink-0" />
            <span className={compactOnMobile ? 'hidden sm:inline' : ''}>
              กลางคืน
            </span>
          </button>
        </div>
      </div>

      {/* Install / Shortcut Guide Modal */}
      {guideOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="ติดตั้งแอปและเพิ่มทางลัด"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100">
            <div className="px-5 py-4 bg-gradient-to-r from-[#0A4DA2] to-[#1A7FE2] text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <img
                  src="/assets/aistudio/_________________________2e00b14d.png"
                  alt="ไอคอนรายการจุดแตกรั่ว"
                  className="w-9 h-9 rounded-xl bg-white p-0.5 object-contain shrink-0"
                />
                <div>
                  <h3 className="text-sm font-bold">
                    ติดตั้งแอป / เพิ่มทางลัดหน้าจอหลัก
                  </h3>
                  <p className="text-[11px] text-sky-100">
                    เปิดใช้งานได้รวดเร็วเหมือนแอปบนมือถือและคอมพิวเตอร์
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                aria-label="ปิดหน้าต่าง"
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {isInstallable && (
                <button
                  type="button"
                  onClick={() => void install()}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0A4DA2] hover:bg-[#083F86] text-white font-semibold shadow-sm transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>ติดตั้งลงอุปกรณ์ทันที</span>
                </button>
              )}

              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-3.5 space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                    <Smartphone className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                    <span>
                      {isIOS
                        ? 'สำหรับ iPhone / iPad (Safari)'
                        : 'สำหรับมือถือ Android (Chrome)'}
                    </span>
                  </div>
                  {isIOS ? (
                    <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                      <li>
                        แตะปุ่ม{' '}
                        <span className="inline-flex items-center gap-0.5 font-semibold text-slate-800 dark:text-white">
                          <Share className="w-3.5 h-3.5" /> แชร์ (Share)
                        </span>{' '}
                        ที่แถบเมนูของ Safari
                      </li>
                      <li>
                        เลื่อนลงแล้วเลือก{' '}
                        <strong className="text-slate-800 dark:text-white">
                          เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)
                        </strong>
                      </li>
                    </ol>
                  ) : (
                    <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                      <li>
                        แตะปุ่มเมนู{' '}
                        <strong className="text-slate-800 dark:text-white">
                          ⋮ (มุมขวาบน)
                        </strong>{' '}
                        ในเบราว์เซอร์ Chrome
                      </li>
                      <li>
                        เลือก{' '}
                        <strong className="text-slate-800 dark:text-white">
                          ติดตั้งแอป (Install app)
                        </strong>{' '}
                        หรือ{' '}
                        <strong className="text-slate-800 dark:text-white">
                          เพิ่มลงในหน้าจอหลัก
                        </strong>
                      </li>
                    </ol>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-3.5 space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                    <Monitor className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>สำหรับคอมพิวเตอร์ (Chrome / Edge)</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    คลิกไอคอน{' '}
                    <strong className="text-slate-800 dark:text-white">
                      ติดตั้ง (Install)
                    </strong>{' '}
                    ที่ด้านขวาของแถบที่อยู่เว็บไซต์ หรือเปิดเมนูเบราว์เซอร์ →{' '}
                    <strong className="text-slate-800 dark:text-white">
                      บันทึกและแชร์ → สร้างทางลัด
                    </strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void handleCopyLink()}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>คัดลอกลิงก์แล้ว</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>คัดลอกลิงก์ทางลัด</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setGuideOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-sky-600 text-white font-semibold hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors"
                >
                  ตกลง
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
