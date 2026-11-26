import {
  formatPipeSpec,
  LeakPhoto,
  LeakPoint,
  LeakSeverity,
  parsePipeSpec,
  SEVERITY_LABELS,
} from '../types/leak';
import {moveFileToDriveFolder} from './googleDrive';

export const SHEET_HEADERS = [
  'DMA',
  'NO',
  'วันที่',
  'รายละเอียดงาน',
  'ตำแหน่ง (สถานที่และพิกัดบนแผนที่)',
  'ตำแหน่ง / ชื่อถนน / ซอย / จุดสังเกต',
  'ชนิดและขนาดท่อ',
  'ผู้รับผิดชอบ / ทีมช่าง',
  'วิธีแก้ไข / ผลการซ่อมแซม',
  'ระดับความเร่งด่วน',
  'ภาพถ่ายหน้างาน',
];

export interface SpreadsheetMeta {
  spreadsheetId: string;
  title: string;
  sheetTitles: string[];
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return trimmed;
}

function parseSeverityLabel(
  severityVal: string,
  legacyStatusVal = ''
): LeakSeverity {
  const sev = (severityVal || '').trim().toLowerCase();
  const leg = (legacyStatusVal || '').trim().toLowerCase();

  if (
    sev.includes('เสร็จ') ||
    sev === 'resolved' ||
    sev === 'done' ||
    leg.includes('เสร็จ') ||
    leg === 'resolved' ||
    leg === 'done'
  ) {
    return 'resolved';
  }
  if (sev.includes('วิกฤต') || sev === 'critical' || sev.includes('สูง')) {
    return 'critical';
  }
  if (sev.includes('ต่ำ') || sev === 'low') {
    return 'low';
  }
  return 'moderate';
}

function parseCoords(text: string): {lat: number | null; lng: number | null} {
  const match = (text || '').match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (!match) return {lat: null, lng: null};
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return {lat, lng};
  }
  return {lat: null, lng: null};
}

function parseDrivePhotoLinks(cellText: string, rowIndex: number): LeakPhoto[] {
  const matches = (cellText || '').match(/https:\/\/drive\.google\.com\/[^\s,;]+/g);
  if (!matches || matches.length === 0) return [];
  const now = new Date().toISOString();

  return matches.map((driveUrl, idx) => {
    const idMatch =
      driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
      driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const driveFileId = idMatch?.[1];
    const previewUrl = driveFileId
      ? `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w1000`
      : driveUrl;

    return {
      id: `photo-drive-${rowIndex}-${idx}-${driveFileId || idx}`,
      url: previewUrl,
      stage: 'before',
      caption: 'ภาพจาก Google Drive',
      addedAt: now,
      driveFileId,
      driveUrl,
    };
  });
}

export function leakToSheetRow(leak: LeakPoint): string[] {
  const coords =
    leak.lat !== null && leak.lng !== null
      ? `${leak.lat.toFixed(6)}, ${leak.lng.toFixed(6)}`
      : '';
  const combinedLocation =
    leak.locationName && coords
      ? `${leak.locationName} (${coords})`
      : coords || leak.locationName || '';

  const driveLinks = leak.photos
    .map((p) => p.driveUrl)
    .filter((u): u is string => Boolean(u));
  const photoCell =
    driveLinks.length > 0
      ? driveLinks.join('\n')
      : leak.photos.length > 0
        ? `${leak.photos.length} ภาพ`
        : '0';

  const pipeText =
    formatPipeSpec(leak.pipeType, leak.pipeSize) || leak.pipeSpec || '';

  return [
    leak.dma,
    leak.no,
    leak.reportDate || '',
    leak.workDetails || '',
    combinedLocation,
    leak.locationName || '',
    pipeText,
    leak.technician || '',
    leak.repairMethod || '',
    SEVERITY_LABELS[leak.severity],
    photoCell,
  ];
}

export function sheetRowsToLeaks(
  values: string[][],
  existingLeaks: LeakPoint[]
): LeakPoint[] {
  if (!values || values.length === 0) return [];

  const firstRow = values[0].map((c) => (c || '').trim().toLowerCase());
  const hasHeader =
    firstRow.includes('dma') ||
    firstRow.includes('no') ||
    firstRow.some((h) => h.includes('รายละเอียด') || h.includes('วันที่'));

  const startRow = hasHeader ? 1 : 0;

  const findCol = (pred: (h: string) => boolean, fallback: number): number => {
    if (!hasHeader) return fallback;
    const idx = firstRow.findIndex(pred);
    return idx >= 0 ? idx : fallback;
  };

  const findOptionalCol = (pred: (h: string) => boolean): number => {
    if (!hasHeader) return -1;
    return firstRow.findIndex(pred);
  };

  const colDma = findCol((h) => h === 'dma', 0);
  const colNo = findCol((h) => h === 'no' || h === 'เลขที่', 1);
  const colDate = findCol((h) => h.includes('วันที่') || h === 'date', 2);
  const colDetails = findOptionalCol(
    (h) => h.includes('รายละเอียดงาน') || h.includes('รายละเอียด')
  );
  const colCombinedPos = findCol(
    (h) => h.includes('สถานที่และพิกัด') || h === 'ตำแหน่ง',
    4
  );
  const colStreet = findCol(
    (h) => h.includes('ชื่อถนน') || h.includes('จุดสังเกต'),
    5
  );
  const colPipe = findCol((h) => h.includes('ชนิดและขนาดท่อ'), 6);
  const colPipeType = findOptionalCol((h) => h === 'ชนิดท่อ');
  const colPipeSize = findOptionalCol((h) => h === 'ขนาดท่อ');
  const colTech = findCol(
    (h) => h.includes('ผู้รับผิดชอบ') || h.includes('ทีมช่าง'),
    7
  );
  const colRepair = findCol(
    (h) => h.includes('วิธีแก้ไข') || h.includes('ผลการซ่อม'),
    8
  );
  const colLegacyStatus = findOptionalCol((h) => h.includes('สถานะ'));
  const colSeverity = findCol(
    (h) => h.includes('ความเร่งด่วน'),
    colLegacyStatus >= 0 ? 10 : 9
  );
  const colPhotos = findCol(
    (h) => h.includes('ภาพถ่าย') || h.includes('photo'),
    colLegacyStatus >= 0 ? 11 : 10
  );

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const result: LeakPoint[] = [];

  for (let i = startRow; i < values.length; i++) {
    const row = values[i] || [];
    if (row.every((cell) => !String(cell || '').trim())) continue;

    const dma = (row[colDma] || '').trim() || 'DMA-01';
    const no = (row[colNo] || '').trim() || String(i).padStart(2, '0');
    const reportDate = (row[colDate] || '').trim() || today;
    const workDetails = colDetails >= 0 ? (row[colDetails] || '').trim() : '';
    const combinedPos = (row[colCombinedPos] || '').trim();
    const street = (row[colStreet] || '').trim();

    const coords = parseCoords(combinedPos);
    const fallbackCoords =
      coords.lat === null ? parseCoords(street) : coords;
    const cleanedLocationName =
      street ||
      combinedPos
        .replace(/\(\s*-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+\s*\)/g, '')
        .replace(/^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$/g, '')
        .trim();

    const matchedLocal = existingLeaks.find(
      (item) =>
        item.dma.trim().toLowerCase() === dma.toLowerCase() &&
        item.no.trim().toLowerCase() === no.toLowerCase()
    );

    const rawPipeSpec = (row[colPipe] || '').trim();
    const rawPipeType = colPipeType >= 0 ? (row[colPipeType] || '').trim() : '';
    const rawPipeSize = colPipeSize >= 0 ? (row[colPipeSize] || '').trim() : '';
    const {pipeType, pipeSize} = parsePipeSpec(
      rawPipeSpec,
      rawPipeType,
      rawPipeSize
    );

    const drivePhotos = parseDrivePhotoLinks(row[colPhotos] || '', i);
    const resolvedPhotos =
      matchedLocal && matchedLocal.photos.length > 0
        ? matchedLocal.photos.map((localPhoto, idx) => {
            if (localPhoto.driveUrl || !drivePhotos[idx]) return localPhoto;
            return {
              ...localPhoto,
              driveFileId: drivePhotos[idx].driveFileId,
              driveUrl: drivePhotos[idx].driveUrl,
            };
          })
        : drivePhotos;

    const legacyStatusVal =
      colLegacyStatus >= 0 ? row[colLegacyStatus] || '' : '';

    result.push({
      id: matchedLocal?.id || `leak-sheet-${i}-${Date.now()}`,
      dma,
      no,
      reportDate,
      workDetails,
      locationName: cleanedLocationName,
      lat: fallbackCoords.lat ?? matchedLocal?.lat ?? null,
      lng: fallbackCoords.lng ?? matchedLocal?.lng ?? null,
      pipeType,
      pipeSize,
      pipeSpec: rawPipeSpec || formatPipeSpec(pipeType, pipeSize),
      technician: (row[colTech] || '').trim(),
      repairMethod: (row[colRepair] || '').trim(),
      severity: parseSeverityLabel(row[colSeverity] || '', legacyStatusVal),
      photos: resolvedPhotos,
      reportedAt: matchedLocal?.reportedAt || now,
      updatedAt: now,
    });
  }

  return result;
}

async function handleApiResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error?.message) errMsg = data.error.message;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }
  return res.json() as Promise<T>;
}

export async function fetchSpreadsheetMeta(
  spreadsheetId: string,
  accessToken: string
): Promise<SpreadsheetMeta> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}?fields=properties.title,sheets.properties.title`;
  const res = await fetch(url, {
    headers: {Authorization: `Bearer ${accessToken}`},
  });
  const data = await handleApiResponse<{
    properties?: {title?: string};
    sheets?: Array<{properties?: {title?: string}}>;
  }>(res);

  return {
    spreadsheetId,
    title: data.properties?.title || 'Google Sheet',
    sheetTitles: (data.sheets || [])
      .map((s) => s.properties?.title || '')
      .filter(Boolean),
  };
}

export async function createLeakSpreadsheet(
  title: string,
  accessToken: string,
  folderId?: string
): Promise<SpreadsheetMeta> {
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {title},
      sheets: [{properties: {title: 'รายการจุดแตกรั่ว'}}],
    }),
  });
  const created = await handleApiResponse<{
    spreadsheetId: string;
    properties?: {title?: string};
    sheets?: Array<{properties?: {title?: string}}>;
  }>(createRes);

  const sheetTitle = created.sheets?.[0]?.properties?.title || 'รายการจุดแตกรั่ว';

  await writeSheetValues(
    created.spreadsheetId,
    sheetTitle,
    [SHEET_HEADERS],
    accessToken
  );

  if (folderId) {
    try {
      await moveFileToDriveFolder(created.spreadsheetId, folderId, accessToken);
    } catch {
      // Non-fatal
    }
  }

  return {
    spreadsheetId: created.spreadsheetId,
    title: created.properties?.title || title,
    sheetTitles: [sheetTitle],
  };
}

export async function readSheetValues(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string
): Promise<string[][]> {
  const range = encodeURIComponent(`'${sheetTitle}'!A1:L2000`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${range}`;
  const res = await fetch(url, {
    headers: {Authorization: `Bearer ${accessToken}`},
  });
  const data = await handleApiResponse<{values?: string[][]}>(res);
  return data.values || [];
}

export async function writeSheetValues(
  spreadsheetId: string,
  sheetTitle: string,
  rows: string[][],
  accessToken: string
): Promise<void> {
  const clearRange = encodeURIComponent(`'${sheetTitle}'!A1:L2000`);
  const clearRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${clearRange}:clear`,
    {
      method: 'POST',
      headers: {Authorization: `Bearer ${accessToken}`},
    }
  );
  await handleApiResponse(clearRes);

  const updateRange = encodeURIComponent(`'${sheetTitle}'!A1:K${rows.length}`);
  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${updateRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: `'${sheetTitle}'!A1:K${rows.length}`,
        majorDimension: 'ROWS',
        values: rows,
      }),
    }
  );
  await handleApiResponse(updateRes);
}

let pickerScriptPromise: Promise<void> | null = null;

function ensureGapiLoaded(): Promise<void> {
  if (pickerScriptPromise) return pickerScriptPromise;
  pickerScriptPromise = new Promise((resolve, reject) => {
    const existing = (window as unknown as {gapi?: unknown}).gapi;
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('ไม่สามารถโหลด Google Picker ได้'));
    document.head.appendChild(script);
  });
  return pickerScriptPromise;
}

export async function openGoogleSheetPicker(
  accessToken: string
): Promise<{id: string; name: string} | null> {
  await ensureGapiLoaded();
  const gapiObj = (window as unknown as {
    gapi: {load: (name: string, cb: () => void) => void};
  }).gapi;

  await new Promise<void>((resolve) => {
    gapiObj.load('picker', () => resolve());
  });

  const googleObj = (window as unknown as {
    google: {
      picker: {
        PickerBuilder: new () => {
          addView: (view: unknown) => unknown;
          setOAuthToken: (token: string) => unknown;
          setCallback: (
            cb: (data: {
              action: string;
              docs?: Array<{id: string; name: string}>;
            }) => void
          ) => unknown;
          setOrigin: (origin: string) => unknown;
          build: () => {setVisible: (v: boolean) => void};
        };
        ViewId: {SPREADSHEETS: unknown};
        Action: {PICKED: string; CANCEL: string};
      };
    };
  }).google;

  const pickerOrigin =
    window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
      ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
      : window.location.origin;

  return new Promise((resolve) => {
    const builder = new googleObj.picker.PickerBuilder() as unknown as {
      addView: (view: unknown) => typeof builder;
      setOAuthToken: (token: string) => typeof builder;
      setCallback: (
        cb: (data: {
          action: string;
          docs?: Array<{id: string; name: string}>;
        }) => void
      ) => typeof builder;
      setOrigin: (origin: string) => typeof builder;
      build: () => {setVisible: (v: boolean) => void};
    };

    const picker = builder
      .addView(googleObj.picker.ViewId.SPREADSHEETS)
      .setOAuthToken(accessToken)
      .setOrigin(pickerOrigin)
      .setCallback((data) => {
        if (data.action === googleObj.picker.Action.PICKED && data.docs?.[0]) {
          resolve({id: data.docs[0].id, name: data.docs[0].name});
        } else if (data.action === googleObj.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();

    picker.setVisible(true);
  });
}
