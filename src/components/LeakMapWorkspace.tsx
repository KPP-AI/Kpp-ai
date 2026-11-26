import React, {useCallback, useEffect, useState} from 'react';
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  MapMouseEvent,
  Pin,
  useAdvancedMarkerRef,
  useApiIsLoaded,
  useApiLoadingStatus,
  APILoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  Camera,
  Crosshair,
  Edit3,
  Layers,
  LocateFixed,
  MapPin,
  Maximize2,
  RefreshCw,
  Scan,
  X,
} from 'lucide-react';
import {
  formatPipeSpec,
  LeakPhoto,
  LeakPoint,
  parsePipeSpec,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
} from '../types/leak';
import {PlaceSearchBox} from './PlaceSearchBox';

interface LeakMarkerItemProps {
  leak: LeakPoint;
  isSelected: boolean;
  showInfoWindow: boolean;
  onSelect: (id: string) => void;
  onCloseInfo: () => void;
  onEdit: (leak: LeakPoint) => void;
  onOpenLightbox: (photos: LeakPhoto[], index: number, title: string) => void;
  onUpdatePosition: (id: string, lat: number, lng: number) => void;
}

const LeakMarkerItem: React.FC<LeakMarkerItemProps> = ({
  leak,
  isSelected,
  showInfoWindow,
  onSelect,
  onCloseInfo,
  onEdit,
  onOpenLightbox,
  onUpdatePosition,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  if (leak.lat === null || leak.lng === null) return null;

  const colors = SEVERITY_COLORS[leak.severity];
  const shortGlyph = leak.no.length <= 3 ? leak.no : leak.no.slice(0, 3);
  const pinGlyph = leak.severity === 'critical' ? '!' : shortGlyph;
  const coverPhoto = leak.photos[0];
  const {pipeType, pipeSize} = parsePipeSpec(
    leak.pipeSpec,
    leak.pipeType,
    leak.pipeSize
  );
  const pipeDisplay = formatPipeSpec(pipeType, pipeSize) || leak.pipeSpec;

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{lat: leak.lat, lng: leak.lng}}
        title={`${leak.dma} · NO.${leak.no} (${SEVERITY_LABELS[leak.severity]})`}
        zIndex={isSelected ? 50 : leak.severity === 'critical' ? 20 : 10}
        draggable={isSelected}
        onDragEnd={(e) => {
          const latLng = e.latLng;
          if (latLng) {
            onUpdatePosition(leak.id, latLng.lat(), latLng.lng());
          }
        }}
        onClick={() => onSelect(leak.id)}
      >
        <Pin
          background={colors.pinBg}
          borderColor={colors.pinBorder}
          glyphColor={colors.pinGlyphColor}
          glyph={pinGlyph}
          scale={isSelected ? 1.25 : 1}
        />
      </AdvancedMarker>

      {showInfoWindow && marker && (
        <InfoWindow
          anchor={marker}
          maxWidth={310}
          onCloseClick={onCloseInfo}
          headerContent={
            <div className="flex items-center gap-1.5 pr-2 flex-wrap">
              <span className="font-mono text-xs font-semibold text-slate-900">
                {leak.dma} · #{leak.no}
              </span>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold ${colors.text}`}
              >
                {leak.severity === 'critical' && (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                )}
                {SEVERITY_LABELS[leak.severity]}
              </span>
            </div>
          }
        >
          <div className="w-[270px] overflow-hidden text-slate-800 space-y-2.5 pt-1">
            {coverPhoto ? (
              <button
                type="button"
                onClick={() =>
                  onOpenLightbox(
                    leak.photos,
                    0,
                    `${leak.dma} · #${leak.no}`
                  )
                }
                className="group relative block w-full h-32 sm:h-36 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 focus-visible:outline-2 focus-visible:outline-sky-600"
              >
                <img
                  src={coverPhoto.url}
                  alt={coverPhoto.caption || `${leak.dma} #${leak.no}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent flex items-end justify-between p-2.5 text-white text-xs">
                  <span className="truncate font-medium">
                    {leak.photos.length > 1
                      ? `ภาพหน้างาน (${leak.photos.length} รูป)`
                      : 'คลิกเพื่อขยายภาพ'}
                  </span>
                  <Maximize2 className="w-3.5 h-3.5 shrink-0 opacity-90" />
                </div>
              </button>
            ) : (
              <div className="w-full h-20 rounded-lg bg-slate-100 border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 gap-1">
                <Camera className="w-4 h-4" />
                <span className="text-xs">ยังไม่มีภาพถ่ายหน้างาน</span>
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="font-mono tabular-nums">{leak.reportDate}</span>
                {leak.locationName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{leak.locationName}</span>
                  </>
                )}
              </div>

              {pipeDisplay && (
                <div className="text-xs font-semibold text-slate-900">
                  ท่อ: {pipeDisplay}
                </div>
              )}

              {leak.technician && (
                <div className="text-[11px] text-slate-600">
                  ผู้รับผิดชอบ: {leak.technician}
                </div>
              )}

              {leak.repairMethod && (
                <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                  วิธีแก้ไข: {leak.repairMethod}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
              <span className="font-mono tabular-nums">
                {leak.lat.toFixed(5)}, {leak.lng.toFixed(5)}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => onEdit(leak)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                แก้ไข / เพิ่มภาพ
              </button>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface MapViewportControllerProps {
  pinnedLeaks: LeakPoint[];
  isMobile: boolean;
  focusTarget: {lat: number; lng: number; zoom?: number; seq: number} | null;
  fitBoundsSeq: number;
}

const MapViewportController: React.FC<MapViewportControllerProps> = ({
  pinnedLeaks,
  isMobile,
  focusTarget,
  fitBoundsSeq,
}) => {
  const map = useMap();
  const hasInitialFitRef = React.useRef(false);
  const lastFocusSeqRef = React.useRef<number>(focusTarget?.seq ?? 0);
  const lastFitSeqRef = React.useRef<number>(fitBoundsSeq);
  const lastPinSignatureRef = React.useRef<string>('');

  const fitAllVisiblePins = useCallback(
    (pins: LeakPoint[]) => {
      if (!map) return false;
      const validPins = pins.filter(
        (l): l is LeakPoint & {lat: number; lng: number} =>
          typeof l.lat === 'number' &&
          Number.isFinite(l.lat) &&
          typeof l.lng === 'number' &&
          Number.isFinite(l.lng)
      );
      if (validPins.length === 0) return false;

      if (validPins.length === 1) {
        map.setCenter({lat: validPins[0].lat, lng: validPins[0].lng});
        map.setZoom(16);
        return true;
      }

      const LatLngBounds = window.google?.maps?.LatLngBounds;
      if (!LatLngBounds) return false;

      const bounds = new LatLngBounds();
      for (const pin of validPins) {
        bounds.extend({lat: pin.lat, lng: pin.lng});
      }

      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      if (ne.equals(sw)) {
        map.setCenter({lat: validPins[0].lat, lng: validPins[0].lng});
        map.setZoom(16);
        return true;
      }

      const applyFit = () => {
        map.fitBounds(bounds, {
          top: isMobile ? 56 : 88,
          right: isMobile ? 40 : 60,
          bottom: isMobile ? 48 : 64,
          left: isMobile ? 40 : 60,
        });
        window.google?.maps?.event?.addListenerOnce(map, 'idle', () => {
          const z = map.getZoom();
          if (typeof z === 'number' && z > 16) {
            map.setZoom(16);
          }
        });
      };

      const div = map.getDiv();
      if (div && div.clientHeight > 0 && div.clientWidth > 0) {
        applyFit();
      } else {
        requestAnimationFrame(applyFit);
      }
      return true;
    },
    [map, isMobile]
  );

  useEffect(() => {
    if (!map) return;
    const signature = pinnedLeaks
      .map((l) => `${l.id}:${l.lat ?? ''},${l.lng ?? ''}`)
      .join('|');

    const fitRequestedExplicitly = fitBoundsSeq !== lastFitSeqRef.current;
    if (fitRequestedExplicitly) {
      lastFitSeqRef.current = fitBoundsSeq;
    }

    if (focusTarget && focusTarget.seq !== lastFocusSeqRef.current) {
      return;
    }

    if (
      fitRequestedExplicitly ||
      (!hasInitialFitRef.current && !focusTarget && pinnedLeaks.length > 0) ||
      (hasInitialFitRef.current &&
        !focusTarget &&
        lastPinSignatureRef.current === '' &&
        pinnedLeaks.length > 0)
    ) {
      if (fitAllVisiblePins(pinnedLeaks)) {
        hasInitialFitRef.current = true;
        lastPinSignatureRef.current = signature;
      }
    }
  }, [map, pinnedLeaks, focusTarget, fitBoundsSeq, fitAllVisiblePins]);

  useEffect(() => {
    if (!map || !focusTarget) return;
    if (focusTarget.seq === lastFocusSeqRef.current && hasInitialFitRef.current) {
      return;
    }
    lastFocusSeqRef.current = focusTarget.seq;
    hasInitialFitRef.current = true;
    map.panTo({lat: focusTarget.lat, lng: focusTarget.lng});
    if (focusTarget.zoom) {
      map.setZoom(focusTarget.zoom);
    }
  }, [map, focusTarget]);

  return null;
};

interface LeakMapWorkspaceProps {
  leaks: LeakPoint[];
  selectedId: string | null;
  isPickingLocation: boolean;
  pickingReason: 'new' | 'edit';
  focusTarget: {lat: number; lng: number; zoom?: number; seq: number} | null;
  fitBoundsSeq?: number;
  draftPin: {lat: number; lng: number} | null;
  theme?: 'day' | 'night';
  hasApiKey?: boolean;
  mapsError?: string | null;
  onSelectLeak: (id: string | null) => void;
  onPickMapLocation: (lat: number, lng: number) => void;
  onStartPickNew: () => void;
  onCancelPick: () => void;
  onEditLeak: (leak: LeakPoint) => void;
  onUpdatePosition: (id: string, lat: number, lng: number) => void;
  onOpenLightbox: (photos: LeakPhoto[], index: number, title: string) => void;
  onPanToLocation: (lat: number, lng: number, zoom?: number) => void;
}

const DEFAULT_CENTER = {lat: 13.8195, lng: 100.519};

export const LeakMapWorkspace: React.FC<LeakMapWorkspaceProps> = ({
  leaks,
  selectedId,
  isPickingLocation,
  pickingReason,
  focusTarget,
  fitBoundsSeq = 0,
  draftPin,
  theme = 'day',
  hasApiKey = true,
  mapsError = null,
  onSelectLeak,
  onPickMapLocation,
  onStartPickNew,
  onCancelPick,
  onEditLeak,
  onUpdatePosition,
  onOpenLightbox,
  onPanToLocation,
}) => {
  const isApiLoaded = useApiIsLoaded();
  const apiStatus = useApiLoadingStatus();
  const [mapTypeId, setMapTypeId] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [localFitSeq, setLocalFitSeq] = useState(0);
  const [searchPin, setSearchPin] = useState<{
    lat: number;
    lng: number;
    label: string;
  } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 639px)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const handleMapClick = useCallback(
    (e: MapMouseEvent) => {
      const latLng = e.detail.latLng;
      if (!latLng) return;
      if (isPickingLocation) {
        onPickMapLocation(latLng.lat, latLng.lng);
      } else {
        onSelectLeak(null);
      }
    },
    [isPickingLocation, onPickMapLocation, onSelectLeak]
  );

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus('เบราว์เซอร์ไม่รองรับการระบุตำแหน่ง GPS');
      return;
    }
    setGpsStatus('กำลังค้นหาตำแหน่ง...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsStatus(null);
        const {latitude, longitude} = pos.coords;
        onPanToLocation(latitude, longitude, 17);
        setSearchPin({
          lat: latitude,
          lng: longitude,
          label: 'ตำแหน่งปัจจุบันของคุณ',
        });
      },
      () => {
        setGpsStatus('ไม่สามารถเข้าถึงตำแหน่ง GPS ได้');
        setTimeout(() => setGpsStatus(null), 3500);
      },
      {enableHighAccuracy: true, timeout: 8000}
    );
  }, [onPanToLocation]);

  const pinnedLeaks = leaks.filter(
    (l) => l.lat !== null && l.lng !== null
  );

  const selectedLeak = selectedId
    ? pinnedLeaks.find((l) => l.id === selectedId) || null
    : null;
  const selectedColors = selectedLeak
    ? SEVERITY_COLORS[selectedLeak.severity]
    : null;
  const selectedPipe = selectedLeak
    ? (() => {
        const {pipeType, pipeSize} = parsePipeSpec(
          selectedLeak.pipeSpec,
          selectedLeak.pipeType,
          selectedLeak.pipeSize
        );
        return (
          formatPipeSpec(pipeType, pipeSize) || selectedLeak.pipeSpec || ''
        );
      })()
    : '';

  return (
    <div className="flex flex-col w-full h-full bg-slate-100 dark:bg-slate-900">
      {/* Mobile Dedicated Map Toolbar (stacked cleanly above map, zero overlap) */}
      <div className="sm:hidden bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-2.5 space-y-2 shrink-0 z-20">
        <PlaceSearchBox
          onSelectLocation={(loc) => {
            setSearchPin(loc);
            onPanToLocation(loc.lat, loc.lng, 17);
          }}
        />

        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() =>
              setMapTypeId((prev) =>
                prev === 'roadmap' ? 'hybrid' : 'roadmap'
              )
            }
            className="inline-flex items-center justify-center gap-1 px-1.5 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-xs transition-colors whitespace-nowrap"
          >
            <Layers className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
            <span className="truncate">
              {mapTypeId === 'roadmap' ? 'ดาวเทียม' : 'ถนน'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleLocateMe}
            className="inline-flex items-center justify-center gap-1 px-1.5 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-xs transition-colors whitespace-nowrap"
          >
            <LocateFixed className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="truncate">พิกัดฉัน</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectLeak(null);
              setLocalFitSeq((n) => n + 1);
            }}
            disabled={pinnedLeaks.length === 0}
            className="inline-flex items-center justify-center gap-1 px-1.5 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 shadow-xs transition-colors whitespace-nowrap"
          >
            <Scan className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="truncate">ทั้งหมด</span>
          </button>

          {!isPickingLocation ? (
            <button
              type="button"
              onClick={onStartPickNew}
              className="inline-flex items-center justify-center gap-1 px-1.5 py-2 rounded-lg bg-sky-600 text-white text-[11px] font-medium hover:bg-sky-700 shadow-xs transition-colors whitespace-nowrap"
            >
              <Crosshair className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">ปักหมุด</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onCancelPick}
              className="inline-flex items-center justify-center gap-1 px-1.5 py-2 rounded-lg bg-slate-900 text-white text-[11px] font-medium hover:bg-slate-800 shadow-xs transition-colors whitespace-nowrap"
            >
              <X className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">ยกเลิก</span>
            </button>
          )}
        </div>
      </div>

      {/* Map Canvas Container */}
      <div className="relative flex-1 min-h-[300px] sm:min-h-[340px] w-full bg-slate-100 dark:bg-slate-950">
        {/* Desktop Floating Top Map Controls */}
        <div className="hidden sm:flex absolute top-3 left-3 right-3 z-20 items-start justify-between gap-2 pointer-events-none">
          <div className="pointer-events-auto min-w-[280px]">
            <PlaceSearchBox
              onSelectLocation={(loc) => {
                setSearchPin(loc);
                onPanToLocation(loc.lat, loc.lng, 17);
              }}
            />
          </div>

          <div className="pointer-events-auto flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() =>
                setMapTypeId((prev) =>
                  prev === 'roadmap' ? 'hybrid' : 'roadmap'
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition-colors whitespace-nowrap shrink-0"
            >
              <Layers className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              {mapTypeId === 'roadmap' ? 'ดาวเทียม' : 'แผนที่ถนน'}
            </button>

            <button
              type="button"
              onClick={handleLocateMe}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition-colors whitespace-nowrap shrink-0"
            >
              <LocateFixed className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              พิกัดฉัน
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectLeak(null);
                setLocalFitSeq((n) => n + 1);
              }}
              disabled={pinnedLeaks.length === 0}
              title="ปรับมุมมองแผนที่ให้เห็นจุดรั่วทั้งหมดในรายการ"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 shadow-sm transition-colors whitespace-nowrap shrink-0"
            >
              <Scan className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              ดูทั้งหมด
            </button>

            {!isPickingLocation ? (
              <button
                type="button"
                onClick={onStartPickNew}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-700 shadow-sm transition-colors whitespace-nowrap shrink-0"
              >
                <Crosshair className="w-3.5 h-3.5" />
                ปักหมุดจุดรั่ว
              </button>
            ) : (
              <button
                type="button"
                onClick={onCancelPick}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 shadow-sm transition-colors whitespace-nowrap shrink-0"
              >
                <X className="w-3.5 h-3.5" />
                ยกเลิก
              </button>
            )}
          </div>
        </div>

        {/* Pin-Pick Mode Banner */}
        {isPickingLocation && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-3.5 py-2 rounded-lg bg-slate-900/95 text-white text-[11px] sm:text-xs font-medium shadow-lg flex items-center gap-2.5 whitespace-nowrap max-w-[92%]">
            <Crosshair className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="truncate">
              {pickingReason === 'edit'
                ? 'คลิกบนแผนที่เพื่อย้ายตำแหน่งจุดรั่วนี้'
                : 'คลิกบนแผนที่เพื่อปักหมุดตำแหน่งท่อประปารั่ว'}
            </span>
            <button
              type="button"
              onClick={onCancelPick}
              className="text-slate-300 hover:text-white underline ml-1 shrink-0"
            >
              ยกเลิก
            </button>
          </div>
        )}

        {/* Mobile Selected Pin Bottom Card (no scrollbars, no clipping, clean proportions) */}
        {isMobile &&
          selectedLeak &&
          selectedColors &&
          !isPickingLocation && (
            <div className="sm:hidden absolute bottom-2 left-2 right-2 z-20 max-h-[calc(100%-16px)] overflow-y-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl p-3">
              {/* Header Row */}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-white shrink-0">
                    {selectedLeak.dma} · #{selectedLeak.no}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold truncate ${selectedColors.badge}`}
                  >
                    {selectedLeak.severity === 'critical' && (
                      <AlertTriangle className="w-3 h-3 text-red-600 shrink-0" />
                    )}
                    <span className="truncate">
                      {SEVERITY_LABELS[selectedLeak.severity]}
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectLeak(null)}
                  aria-label="ปิดรายละเอียดจุดรั่ว"
                  className="p-1 -mr-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Compact Side-by-Side Body */}
              <div className="flex items-stretch gap-3 mt-2.5">
                {selectedLeak.photos[0] ? (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenLightbox(
                        selectedLeak.photos,
                        0,
                        `${selectedLeak.dma} · #${selectedLeak.no}`
                      )
                    }
                    className="relative w-20 h-20 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 group"
                  >
                    <img
                      src={selectedLeak.photos[0].url}
                      alt={
                        selectedLeak.photos[0].caption ||
                        `${selectedLeak.dma} #${selectedLeak.no}`
                      }
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/65 text-white text-[10px] font-medium inline-flex items-center gap-0.5">
                      <Maximize2 className="w-2.5 h-2.5" />
                      {selectedLeak.photos.length > 1
                        ? selectedLeak.photos.length
                        : ''}
                    </span>
                  </button>
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 gap-1 shrink-0">
                    <Camera className="w-4 h-4" />
                    <span className="text-[10px]">ไม่มีภาพ</span>
                  </div>
                )}

                <div className="min-w-0 flex-1 flex flex-col justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-mono tabular-nums shrink-0">
                        {selectedLeak.reportDate}
                      </span>
                      {selectedLeak.locationName && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">
                            {selectedLeak.locationName}
                          </span>
                        </>
                      )}
                    </div>

                    {selectedPipe && (
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        ท่อ: {selectedPipe}
                      </div>
                    )}

                    {selectedLeak.technician && (
                      <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                        ผู้รับผิดชอบ: {selectedLeak.technician}
                      </div>
                    )}

                    {selectedLeak.repairMethod && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                        วิธีแก้ไข: {selectedLeak.repairMethod}
                      </p>
                    )}
                  </div>

                  {selectedLeak.lat !== null && selectedLeak.lng !== null && (
                    <div className="font-mono text-[10px] text-slate-400 dark:text-slate-500 tabular-nums pt-0.5">
                      {selectedLeak.lat.toFixed(5)},{' '}
                      {selectedLeak.lng.toFixed(5)}
                    </div>
                  )}
                </div>
              </div>

              {/* Clean Full-Width Action Button */}
              <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => onEditLeak(selectedLeak)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 dark:bg-sky-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  แก้ไข / เพิ่มภาพ
                </button>
              </div>
            </div>
          )}

        {/* GPS Feedback Toast */}
        {gpsStatus && (
          <div className="absolute top-3 sm:top-16 right-3 z-20 px-3 py-1.5 rounded-md bg-slate-900/90 text-white text-xs shadow-md">
            {gpsStatus}
          </div>
        )}

        {/* Loading / Auth Failure Fallback */}
        {(!hasApiKey ||
          apiStatus === APILoadingStatus.FAILED ||
          apiStatus === APILoadingStatus.AUTH_FAILURE) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-900">
            <div className="max-w-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 text-center space-y-3 shadow-sm">
              <MapPin className="w-8 h-8 text-amber-600 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                ไม่สามารถโหลดแผนที่ Google Maps ได้
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {!hasApiKey
                  ? 'ไม่พบ Google Maps API Key ในการตั้งค่าโปรเจกต์ กรุณาตั้งค่า Google Maps API Key แล้วลองใหม่อีกครั้ง'
                  : 'กรุณาตรวจสอบการตั้งค่า Google Maps API Key การเชื่อมต่ออินเทอร์เน็ต หรือโควต้าการใช้งานในโปรเจกต์'}
              </p>
              {mapsError && (
                <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 break-words">
                  {mapsError}
                </p>
              )}
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>ลองโหลดแผนที่ใหม่</span>
              </button>
            </div>
          </div>
        )}

        {hasApiKey &&
          !isApiLoaded &&
          apiStatus !== APILoadingStatus.FAILED &&
          apiStatus !== APILoadingStatus.AUTH_FAILURE && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100 dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400">
              กำลังโหลดแผนที่ Google Maps...
            </div>
          )}

        {hasApiKey && (
          <div
            className={`w-full h-full ${isPickingLocation ? 'cursor-crosshair' : ''}`}
          >
            <GoogleMap
              mapId="DEMO_MAP_ID"
              defaultCenter={DEFAULT_CENTER}
              defaultZoom={14}
              mapTypeId={mapTypeId}
              colorScheme={theme === 'night' ? 'DARK' : 'LIGHT'}
              gestureHandling="greedy"
              reuseMaps={true}
              disableDefaultUI={false}
              zoomControl={true}
              streetViewControl={!isMobile}
              mapTypeControl={false}
              fullscreenControl={false}
              onClick={handleMapClick}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{width: '100%', height: '100%'}}
            >
              <MapViewportController
                pinnedLeaks={pinnedLeaks}
                isMobile={isMobile}
                focusTarget={focusTarget}
                fitBoundsSeq={fitBoundsSeq + localFitSeq}
              />

            {pinnedLeaks.map((leak) => (
              <LeakMarkerItem
                key={leak.id}
                leak={leak}
                isSelected={selectedId === leak.id}
                showInfoWindow={!isMobile && selectedId === leak.id}
                onSelect={(id) => onSelectLeak(id)}
                onCloseInfo={() => onSelectLeak(null)}
                onEdit={onEditLeak}
                onOpenLightbox={onOpenLightbox}
                onUpdatePosition={onUpdatePosition}
              />
            ))}

            {draftPin && (
              <AdvancedMarker position={draftPin} title="ตำแหน่งที่เลือก">
                <Pin
                  background="#0284C7"
                  borderColor="#075985"
                  glyphColor="#FFFFFF"
                  scale={1.2}
                />
              </AdvancedMarker>
            )}

            {searchPin && (
              <AdvancedMarker
                position={{lat: searchPin.lat, lng: searchPin.lng}}
                title={searchPin.label}
                onClick={() => {
                  onPickMapLocation(searchPin.lat, searchPin.lng);
                  setSearchPin(null);
                }}
              >
                <Pin
                  background="#0F172A"
                  borderColor="#334155"
                  glyphColor="#FFFFFF"
                  scale={1.05}
                />
              </AdvancedMarker>
            )}
            </GoogleMap>
          </div>
        )}
      </div>
    </div>
  );
};
