export type LeakStatus = 'pending' | 'in_progress' | 'resolved';

export type LeakSeverity = 'low' | 'moderate' | 'critical' | 'resolved';

export type PhotoStage = 'before' | 'during' | 'after';

export interface LeakPhoto {
  id: string;
  url: string;
  stage: PhotoStage;
  caption: string;
  addedAt: string;
  driveFileId?: string;
  driveUrl?: string;
}

export interface LeakPoint {
  id: string;
  dma: string;
  no: string;
  workDetails: string;
  pipeType?: string;
  pipeSize?: string;
  pipeSpec: string;
  repairMethod: string;
  locationName: string;
  lat: number | null;
  lng: number | null;
  status?: LeakStatus;
  severity: LeakSeverity;
  technician: string;
  photos: LeakPhoto[];
  reportDate: string;
  reportedAt: string;
  updatedAt: string;
}

export const DMA_OPTIONS: string[] = Array.from(
  {length: 20},
  (_, i) => `DMA-${String(i + 1).padStart(2, '0')}`
);

export const PIPE_TYPE_OPTIONS = [
  'PB',
  'A/C',
  'HDPE',
  'SP',
  'PVC',
  'G/S',
] as const;

export const PIPE_SIZE_OPTIONS = [
  '20 มม.',
  '25 มม.',
  '40 มม.',
  '50 มม.',
  '63 มม.',
  '100 มม.',
  '110 มม.',
  '150 มม.',
  '160 มม.',
  '200 มม.',
  '225 มม.',
  '250 มม.',
  '300 มม.',
  '315 มม.',
  '400 มม.',
  '450 มม.',
  '500 มม.',
  '560 มม.',
  '630 มม.',
  '710 มม.',
  '800 มม.',
] as const;

export const SEVERITY_ORDER: LeakSeverity[] = [
  'low',
  'moderate',
  'critical',
  'resolved',
];

export const ACTIVE_SEVERITY_ORDER: LeakSeverity[] = [
  'low',
  'moderate',
  'critical',
];

export const SEVERITY_LABELS: Record<LeakSeverity, string> = {
  low: 'ต่ำ (ซึมเล็กน้อย)',
  moderate: 'ปานกลาง (มีน้ำซึมขัง)',
  critical: 'วิกฤต (น้ำพุ่งแรง)',
  resolved: 'ซ่อมแล้วเสร็จ',
};

export const SEVERITY_SHORT_LABELS: Record<LeakSeverity, string> = {
  low: 'ต่ำ (ซึมเล็กน้อย)',
  moderate: 'ปานกลาง (มีน้ำซึมขัง)',
  critical: 'วิกฤต (น้ำพุ่งแรง)',
  resolved: 'ซ่อมแล้วเสร็จ',
};

export const PHOTO_STAGE_LABELS: Record<PhotoStage, string> = {
  before: 'ก่อนซ่อม',
  during: 'ระหว่างซ่อม',
  after: 'หลังซ่อม',
};

export const SEVERITY_COLORS: Record<
  LeakSeverity,
  {
    pinBg: string;
    pinBorder: string;
    pinGlyphColor: string;
    hex: string;
    text: string;
    dot: string;
    badge: string;
  }
> = {
  low: {
    pinBg: '#EAB308',
    pinBorder: '#A16207',
    pinGlyphColor: '#FFFFFF',
    hex: '#EAB308',
    text: 'text-yellow-700',
    dot: 'bg-yellow-500',
    badge: 'bg-yellow-50 border-yellow-300 text-yellow-800',
  },
  moderate: {
    pinBg: '#F97316',
    pinBorder: '#C2410C',
    pinGlyphColor: '#FFFFFF',
    hex: '#F97316',
    text: 'text-orange-700',
    dot: 'bg-orange-500',
    badge: 'bg-orange-50 border-orange-300 text-orange-800',
  },
  critical: {
    pinBg: '#DC2626',
    pinBorder: '#991B1B',
    pinGlyphColor: '#FFFFFF',
    hex: '#DC2626',
    text: 'text-red-700',
    dot: 'bg-red-600',
    badge: 'bg-red-50 border-red-300 text-red-700',
  },
  resolved: {
    pinBg: '#16A34A',
    pinBorder: '#166534',
    pinGlyphColor: '#FFFFFF',
    hex: '#16A34A',
    text: 'text-emerald-700',
    dot: 'bg-emerald-600',
    badge: 'bg-emerald-50 border-emerald-300 text-emerald-700',
  },
};

export function formatPipeSpec(pipeType?: string, pipeSize?: string): string {
  const t = (pipeType || '').trim();
  const s = (pipeSize || '').trim();
  if (t && s) return `${t} · ${s}`;
  return t || s || '';
}

export function parsePipeSpec(
  pipeSpec?: string,
  existingType?: string,
  existingSize?: string
): {pipeType: string; pipeSize: string} {
  let pipeType = (existingType || '').trim();
  let pipeSize = (existingSize || '').trim();
  const raw = (pipeSpec || '').trim();

  if (!pipeType && raw) {
    const upper = raw.toUpperCase();
    for (const candidate of PIPE_TYPE_OPTIONS) {
      if (upper.includes(candidate)) {
        pipeType = candidate;
        break;
      }
    }
  }

  if (!pipeSize && raw) {
    const numMatch = raw.match(/(\d{2,3})\s*(?:มม\.|mm)?/i);
    if (numMatch) {
      const candidateSize = `${numMatch[1]} มม.`;
      if ((PIPE_SIZE_OPTIONS as readonly string[]).includes(candidateSize)) {
        pipeSize = candidateSize;
      }
    }
  }

  return {pipeType, pipeSize};
}
