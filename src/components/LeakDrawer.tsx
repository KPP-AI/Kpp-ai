import React, {useEffect, useRef, useState} from 'react';
import {
  AlertTriangle,
  Camera,
  Crosshair,
  ExternalLink,
  ImagePlus,
  LocateFixed,
  Maximize2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  DMA_OPTIONS,
  formatPipeSpec,
  LeakPhoto,
  LeakPoint,
  LeakSeverity,
  parsePipeSpec,
  PHOTO_STAGE_LABELS,
  PhotoStage,
  PIPE_SIZE_OPTIONS,
  PIPE_TYPE_OPTIONS,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
} from '../types/leak';
import {compressImageFile} from '../utils/storage';

export function getNextNoForDma(targetDma: string, items: LeakPoint[]): string {
  const normTarget = targetDma.trim().toUpperCase();
  let maxNo = 0;
  let countInDma = 0;
  for (const item of items) {
    if ((item.dma || '').trim().toUpperCase() !== normTarget) continue;
    countInDma++;
    const match = String(item.no || '').match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (Number.isFinite(num) && num > maxNo) {
        maxNo = num;
      }
    }
  }
  const next = Math.max(maxNo, countInDma) + 1;
  return String(next).padStart(2, '0');
}

interface LeakDrawerProps {
  isOpen: boolean;
  initialLeak: LeakPoint | null;
  pickedCoords: {lat: number; lng: number} | null;
  existingDmas: string[];
  leaks: LeakPoint[];
  defaultDma?: string;
  isAdmin: boolean;
  onClose: () => void;
  onRequestMapPick: (currentDraft: LeakPoint) => void;
  onSave: (leak: LeakPoint) => void;
  onDelete?: (id: string) => void;
  onOpenLightbox: (photos: LeakPhoto[], index: number, title: string) => void;
}

export const LeakDrawer: React.FC<LeakDrawerProps> = ({
  isOpen,
  initialLeak,
  pickedCoords,
  existingDmas,
  leaks,
  defaultDma,
  isAdmin,
  onClose,
  onRequestMapPick,
  onSave,
  onDelete,
  onOpenLightbox,
}) => {
  const todayIso = new Date().toISOString().slice(0, 10);

  const [dma, setDma] = useState('DMA-01');
  const [no, setNo] = useState('01');
  const [noManuallyEdited, setNoManuallyEdited] = useState(false);
  const [reportDate, setReportDate] = useState(todayIso);
  const [locationName, setLocationName] = useState('');
  const [latStr, setLatStr] = useState('');
  const [lngStr, setLngStr] = useState('');
  const [pipeType, setPipeType] = useState('');
  const [pipeSize, setPipeSize] = useState('');
  const [repairMethod, setRepairMethod] = useState('');
  const [technician, setTechnician] = useState('');
  const [severity, setSeverity] = useState<LeakSeverity>('moderate');
  const [photos, setPhotos] = useState<LeakPhoto[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const isEditing = Boolean(
    initialLeak && leaks.some((l) => l.id === initialLeak.id)
  );

  useEffect(() => {
    if (!isOpen) return;
    setFormError(null);
    setUploadError(null);

    if (initialLeak) {
      const targetDma = initialLeak.dma || 'DMA-01';
      const autoNo = getNextNoForDma(targetDma, leaks);
      const isSavedRecord = leaks.some((l) => l.id === initialLeak.id);
      const parsedPipe = parsePipeSpec(
        initialLeak.pipeSpec,
        initialLeak.pipeType,
        initialLeak.pipeSize
      );

      setDma(targetDma);
      setNo(initialLeak.no || autoNo);
      setNoManuallyEdited(
        isSavedRecord || Boolean(initialLeak.no && initialLeak.no !== autoNo)
      );
      setReportDate(initialLeak.reportDate || todayIso);
      setLocationName(initialLeak.locationName);
      setLatStr(initialLeak.lat !== null ? initialLeak.lat.toFixed(6) : '');
      setLngStr(initialLeak.lng !== null ? initialLeak.lng.toFixed(6) : '');
      setPipeType(parsedPipe.pipeType);
      setPipeSize(parsedPipe.pipeSize);
      setRepairMethod(initialLeak.repairMethod);
      setTechnician(
        initialLeak.technician === 'ยังไม่ได้มอบหมาย'
          ? ''
          : initialLeak.technician
      );
      setSeverity(initialLeak.severity || 'moderate');
      setPhotos(initialLeak.photos || []);
    } else {
      const startDma =
        defaultDma && defaultDma !== 'all'
          ? defaultDma
          : existingDmas[0] || 'DMA-01';
      setDma(startDma);
      setNo(getNextNoForDma(startDma, leaks));
      setNoManuallyEdited(false);
      setReportDate(todayIso);
      setLocationName('');
      setLatStr(pickedCoords ? pickedCoords.lat.toFixed(6) : '');
      setLngStr(pickedCoords ? pickedCoords.lng.toFixed(6) : '');
      setPipeType('');
      setPipeSize('');
      setRepairMethod('');
      setTechnician('');
      setSeverity('moderate');
      setPhotos([]);
    }
  }, [isOpen, initialLeak]);

  useEffect(() => {
    if (!isOpen || isEditing || noManuallyEdited) return;
    setNo(getNextNoForDma(dma, leaks));
  }, [isOpen, isEditing, noManuallyEdited, dma, leaks]);

  useEffect(() => {
    if (pickedCoords && isOpen) {
      setLatStr(pickedCoords.lat.toFixed(6));
      setLngStr(pickedCoords.lng.toFixed(6));
    }
  }, [pickedCoords, isOpen]);

  if (!isOpen) return null;

  const buildDraftRecord = (): LeakPoint => {
    const parsedLat = parseFloat(latStr);
    const parsedLng = parseFloat(lngStr);
    const now = new Date().toISOString();
    const resolvedDma = dma.trim() || 'DMA-01';
    const combinedPipe = formatPipeSpec(pipeType, pipeSize);

    return {
      id: initialLeak?.id || `leak-${Date.now()}`,
      dma: resolvedDma,
      no: no.trim() || getNextNoForDma(resolvedDma, leaks),
      reportDate: reportDate || todayIso,
      workDetails: initialLeak?.workDetails || '',
      locationName: locationName.trim(),
      lat: Number.isFinite(parsedLat) ? parsedLat : null,
      lng: Number.isFinite(parsedLng) ? parsedLng : null,
      pipeType: pipeType.trim(),
      pipeSize: pipeSize.trim(),
      pipeSpec: combinedPipe,
      repairMethod: repairMethod.trim(),
      technician: technician.trim(),
      severity,
      photos,
      reportedAt: initialLeak?.reportedAt || now,
      updatedAt: now,
    };
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploadError(null);
    setIsCompressing(true);

    try {
      const added: LeakPhoto[] = [];
      for (const file of Array.from(fileList)) {
        if (!file.type.startsWith('image/')) continue;
        const compressedUrl = await compressImageFile(file);
        added.push({
          id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          url: compressedUrl,
          stage: severity === 'resolved' ? 'after' : 'before',
          caption: '',
          addedAt: new Date().toISOString(),
        });
      }
      if (added.length === 0) {
        setUploadError('กรุณาเลือกไฟล์รูปภาพ (.jpg, .png, .webp)');
      } else {
        setPhotos((prev) => [...prev, ...added]);
      }
    } catch {
      setUploadError('เกิดข้อผิดพลาดระหว่างประมวลผลรูปภาพ');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setFormError('เบราว์เซอร์นี้ไม่รองรับ GPS');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatStr(pos.coords.latitude.toFixed(6));
        setLngStr(pos.coords.longitude.toFixed(6));
        setFormError(null);
      },
      () => {
        setFormError('ไม่สามารถดึงพิกัด GPS ปัจจุบันได้');
      },
      {enableHighAccuracy: true, timeout: 8000}
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dma.trim() || !no.trim()) {
      setFormError('กรุณากรอกรหัส DMA และหมายเลขจุดรั่ว (NO)');
      return;
    }
    if (
      severity === 'resolved' &&
      (!technician.trim() || technician.trim() === 'ยังไม่ได้มอบหมาย')
    ) {
      setFormError(
        'เมื่อเปลี่ยนระดับความเร่งด่วนเป็น "ซ่อมแล้วเสร็จ" กรุณาระบุชื่อ ผู้รับผิดชอบ / ทีมช่าง ก่อนบันทึก'
      );
      return;
    }
    const latOk = latStr.trim() === '' || Number.isFinite(parseFloat(latStr));
    const lngOk = lngStr.trim() === '' || Number.isFinite(parseFloat(lngStr));
    if (!latOk || !lngOk) {
      setFormError('ค่าพิกัด Lat / Lng ไม่ถูกต้อง');
      return;
    }
    onSave(buildDraftRecord());
  };

  const resolvedPipeTypeOptions = Array.from(
    new Set([...PIPE_TYPE_OPTIONS, ...(pipeType ? [pipeType] : [])])
  );
  const resolvedPipeSizeOptions = Array.from(
    new Set([...PIPE_SIZE_OPTIONS, ...(pipeSize ? [pipeSize] : [])])
  );

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-950/35 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={
        isEditing ? 'แก้ไขรายการจุดแตกรั่ว' : 'ลงจุดรั่วท่อประปาใหม่'
      }
    >
      <div className="w-full md:max-w-xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-slate-900 truncate">
              {isEditing
                ? `แก้ไขรายการ ${initialLeak?.dma} · #${initialLeak?.no}`
                : 'ลงจุดรั่วท่อประปาใหม่'}
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">
              กรอกข้อมูล DMA, NO, วันที่, ตำแหน่ง, ชนิด/ขนาดท่อ, ระดับความเร่งด่วน และภาพถ่าย
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="flex-1 overflow-y-auto thin-scrollbar px-4 sm:px-6 py-4 sm:py-5 space-y-4 sm:space-y-5">
            {formError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {/* DMA, NO, Report Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  DMA <span className="text-red-600">*</span>
                </label>
                <select
                  value={dma}
                  onChange={(e) => {
                    const nextDma = e.target.value;
                    setDma(nextDma);
                    if (!isEditing) {
                      setNoManuallyEdited(false);
                      setNo(getNextNoForDma(nextDma, leaks));
                    }
                  }}
                  aria-label="เลือกเขต DMA"
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
                >
                  {Array.from(
                    new Set([
                      ...DMA_OPTIONS,
                      ...existingDmas,
                      ...(dma ? [dma] : []),
                    ])
                  )
                    .sort()
                    .map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  NO <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={no}
                  onChange={(e) => {
                    setNo(e.target.value);
                    setNoManuallyEdited(true);
                  }}
                  placeholder="เช่น 01, 02"
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
                />
                {!isEditing && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    รันต่ออัตโนมัติของ {dma} (ถัดไป: {getNextNoForDma(dma, leaks)})
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  วันที่ <span className="text-red-600">*</span>
                </label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
                />
              </div>
            </div>

            {/* ตำแหน่ง */}
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-900">
                  ตำแหน่ง (สถานที่และพิกัดบนแผนที่)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleUseGps}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                  >
                    <LocateFixed className="w-3.5 h-3.5 text-sky-600" />
                    ใช้ GPS ปัจจุบัน
                  </button>
                  <button
                    type="button"
                    onClick={() => onRequestMapPick(buildDraftRecord())}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-sky-50 border border-sky-200 text-xs font-medium text-sky-700 hover:bg-sky-100 transition-colors whitespace-nowrap"
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    คลิกเลือกบนแผนที่
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-600 mb-1">
                  ตำแหน่ง / ชื่อถนน / ซอย / จุดสังเกต
                </label>
                <input
                  type="text"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="เช่น ถ.ประชาราษฎร์ สาย 1 ซอย 18 หน้าปากซอย"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">
                    Latitude (ละติจูด)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={latStr}
                    onChange={(e) => setLatStr(e.target.value)}
                    placeholder="13.819500"
                    className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">
                    Longitude (ลองจิจูด)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={lngStr}
                    onChange={(e) => setLngStr(e.target.value)}
                    placeholder="100.519000"
                    className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                  />
                </div>
              </div>
            </div>

            {/* ชนิดท่อ / ขนาดท่อแยกกัน + ระดับความเร่งด่วน */}
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    ชนิดท่อ
                  </label>
                  <select
                    value={pipeType}
                    onChange={(e) => setPipeType(e.target.value)}
                    aria-label="เลือกชนิดท่อ"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
                  >
                    <option value="">-- เลือกชนิดท่อ --</option>
                    {resolvedPipeTypeOptions.map((pt) => (
                      <option key={pt} value={pt}>
                        {pt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    ขนาดท่อ
                  </label>
                  <select
                    value={pipeSize}
                    onChange={(e) => setPipeSize(e.target.value)}
                    aria-label="เลือกขนาดท่อ"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
                  >
                    <option value="">-- เลือกขนาดท่อ --</option>
                    {resolvedPipeSizeOptions.map((ps) => (
                      <option key={ps} value={ps}>
                        {ps}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    ระดับความเร่งด่วน <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={severity}
                    onChange={(e) => {
                      setSeverity(e.target.value as LeakSeverity);
                      setFormError(null);
                    }}
                    aria-label="เลือกระดับความเร่งด่วน"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
                  >
                    {SEVERITY_ORDER.map((k) => (
                      <option key={k} value={k}>
                        {k === 'critical'
                          ? `! ${SEVERITY_LABELS[k]}`
                          : SEVERITY_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    ผู้รับผิดชอบ / ทีมช่าง
                    {severity === 'resolved' && (
                      <span className="text-red-600"> *</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={technician}
                    onChange={(e) => setTechnician(e.target.value)}
                    placeholder="เช่น ทีมซ่อมบำรุง A"
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 ${
                      severity === 'resolved' && !technician.trim()
                        ? 'border-amber-400 bg-amber-50/40 focus:border-amber-600 focus:ring-amber-500/20'
                        : 'border-slate-300 focus:border-sky-600 focus:ring-sky-600/15'
                    }`}
                  />
                  {severity === 'resolved' && (
                    <p className="mt-1 text-[11px] text-amber-700">
                      บังคับกรอกชื่อผู้รับผิดชอบ / ทีมช่าง เมื่อเลือก "ซ่อมแล้วเสร็จ"
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  วิธีแก้ไข / ผลการซ่อมแซม
                </label>
                <textarea
                  rows={2}
                  value={repairMethod}
                  onChange={(e) => setRepairMethod(e.target.value)}
                  placeholder="เช่น ปิดประตูน้ำย่อย รัดแคลมป์สแตนเลส เปลี่ยนปะเก็นหน้าแปลน..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15 leading-relaxed"
                />
              </div>
            </div>

            {/* Photo Upload + Mobile Camera Section */}
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">
                  ภาพถ่ายหน้างาน ({photos.length})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-700 transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    ถ่ายภาพจากกล้อง
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <ImagePlus className="w-3.5 h-3.5 text-sky-700" />
                    เลือกรูปภาพ
                  </button>
                </div>
              </div>

              {/* Camera capture input for mobile */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  void handleFiles(e.target.files);
                  e.target.value = '';
                }}
              />

              {/* Gallery / multi-file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleFiles(e.target.files);
                  e.target.value = '';
                }}
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  void handleFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-sky-500 bg-sky-50'
                    : 'border-slate-300 hover:border-slate-400 bg-slate-50/70'
                }`}
              >
                <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1.5" />
                <p className="text-xs font-medium text-slate-700">
                  {isCompressing
                    ? 'กำลังย่อขนาดและบันทึกรูปภาพ...'
                    : 'คลิกเพื่อเลือกภาพจากเครื่อง หรือกดปุ่ม "ถ่ายภาพจากกล้อง"'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  รองรับกล้องมือถือ และไฟล์ JPG, PNG, WebP (แนบได้หลายภาพ)
                </p>
              </div>

              {uploadError && (
                <p className="text-xs text-red-600">{uploadError}</p>
              )}

              {photos.length > 0 && (
                <div className="space-y-2.5">
                  {photos.map((photo, idx) => (
                    <div
                      key={photo.id}
                      className="flex items-start gap-3 p-2.5 rounded-lg border border-slate-200 bg-white"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onOpenLightbox(
                            photos,
                            idx,
                            `${dma || 'DMA'} · #${no || '-'}`
                          )
                        }
                        className="relative w-20 h-16 rounded-md overflow-hidden bg-slate-100 shrink-0 group"
                      >
                        <img
                          src={photo.url}
                          alt={photo.caption || 'ภาพหน้างาน'}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                          <Maximize2 className="w-4 h-4" />
                        </span>
                      </button>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <select
                            value={photo.stage}
                            onChange={(e) => {
                              const val = e.target.value as PhotoStage;
                              setPhotos((prev) =>
                                prev.map((p) =>
                                  p.id === photo.id ? {...p, stage: val} : p
                                )
                              );
                            }}
                            className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1"
                          >
                            {Object.entries(PHOTO_STAGE_LABELS).map(
                              ([k, label]) => (
                                <option key={k} value={k}>
                                  {label}
                                </option>
                              )
                            )}
                          </select>

                          <button
                            type="button"
                            onClick={() =>
                              setPhotos((prev) =>
                                prev.filter((p) => p.id !== photo.id)
                              )
                            }
                            className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                            aria-label="ลบภาพนี้"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <input
                          type="text"
                          value={photo.caption}
                          onChange={(e) => {
                            const caption = e.target.value;
                            setPhotos((prev) =>
                              prev.map((p) =>
                                p.id === photo.id ? {...p, caption} : p
                              )
                            );
                          }}
                          placeholder="คำอธิบายภาพ (เช่น พบรอยร้าวที่ข้อต่อ)..."
                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-sky-600"
                        />

                        {isAdmin && (
                          <div className="hidden md:flex items-center justify-between text-[11px]">
                            {photo.driveUrl ? (
                              <a
                                href={photo.driveUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-medium"
                              >
                                อัปโหลดลง Google Drive แล้ว
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-slate-400">
                                รออัปโหลดขึ้น Google Drive
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 flex items-center justify-between gap-3 bg-white shrink-0">
            {isEditing && isAdmin && onDelete && initialLeak ? (
              <button
                type="button"
                onClick={() => onDelete(initialLeak.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                ลบรายการ
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 sm:px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-4 sm:px-5 py-2 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 transition-colors whitespace-nowrap"
              >
                บันทึกรายการจุดแตกรั่ว
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
