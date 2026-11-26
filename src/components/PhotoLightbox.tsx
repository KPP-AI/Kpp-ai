import React, {useEffect} from 'react';
import {ChevronLeft, ChevronRight, X} from 'lucide-react';
import {LeakPhoto, PHOTO_STAGE_LABELS} from '../types/leak';

interface PhotoLightboxProps {
  photos: LeakPhoto[];
  activeIndex: number;
  title: string;
  onClose: () => void;
  onChangeIndex: (idx: number) => void;
}

export const PhotoLightbox: React.FC<PhotoLightboxProps> = ({
  photos,
  activeIndex,
  title,
  onClose,
  onChangeIndex,
}) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && photos.length > 1) {
        onChangeIndex((activeIndex + 1) % photos.length);
      }
      if (e.key === 'ArrowLeft' && photos.length > 1) {
        onChangeIndex((activeIndex - 1 + photos.length) % photos.length);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, photos.length, onClose, onChangeIndex]);

  const current = photos[activeIndex];
  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xs flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="ดูภาพถ่ายหน้างานขนาดเต็ม"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 text-white">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-semibold truncate">{title}</span>
          <span className="text-slate-400 text-xs" aria-hidden="true">
            ·
          </span>
          <span className="text-xs text-slate-300 shrink-0">
            {PHOTO_STAGE_LABELS[current.stage]} ({activeIndex + 1}/{photos.length})
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="ปิดหน้าต่างดูภาพ"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center p-4 md:p-8 overflow-hidden">
        {photos.length > 1 && (
          <button
            type="button"
            onClick={() =>
              onChangeIndex((activeIndex - 1 + photos.length) % photos.length)
            }
            className="absolute left-4 z-10 p-2.5 rounded-full bg-slate-900/80 text-white hover:bg-slate-800 border border-white/15 transition-colors"
            aria-label="ภาพก่อนหน้า"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <img
          src={current.url}
          alt={current.caption || title}
          referrerPolicy="no-referrer"
          className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
        />

        {photos.length > 1 && (
          <button
            type="button"
            onClick={() => onChangeIndex((activeIndex + 1) % photos.length)}
            className="absolute right-4 z-10 p-2.5 rounded-full bg-slate-900/80 text-white hover:bg-slate-800 border border-white/15 transition-colors"
            aria-label="ภาพถัดไป"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {current.caption && (
        <div className="px-6 py-3 text-center text-sm text-slate-200 border-t border-white/10 bg-slate-950/60">
          {current.caption}
        </div>
      )}
    </div>
  );
};
