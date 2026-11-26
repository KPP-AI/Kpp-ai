import {formatPipeSpec, LeakPoint, SEVERITY_LABELS} from '../types/leak';
import {DEFAULT_DRIVE_FOLDER_ID} from './googleDrive';
import {sheetRowsToLeaks} from './googleSheets';

export const APPS_SCRIPT_URL_STORAGE_KEY = 'hydropin_apps_script_url_v1';
export const ENV_APPS_SCRIPT_URL = (
  import.meta.env.VITE_APPS_SCRIPT_URL || ''
).trim();

export interface AppsScriptConnectionInfo {
  scriptUrl: string;
  sheetTitle: string;
  tabName?: string;
  spreadsheetUrl?: string;
  folderId?: string;
}

export function getSavedAppsScriptUrl(): string {
  try {
    const saved = localStorage.getItem(APPS_SCRIPT_URL_STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch {
    // ignore storage errors
  }
  return ENV_APPS_SCRIPT_URL;
}

export function saveAppsScriptUrl(url: string): void {
  const trimmed = url.trim();
  try {
    if (!trimmed) {
      localStorage.removeItem(APPS_SCRIPT_URL_STORAGE_KEY);
    } else {
      localStorage.setItem(APPS_SCRIPT_URL_STORAGE_KEY, trimmed);
    }
  } catch {
    // ignore storage errors
  }
}

export function isValidAppsScriptUrl(url: string): boolean {
  const trimmed = url.trim();
  return /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/(exec|dev)(\?.*)?$/.test(
    trimmed
  );
}

async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:image/')) return url;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('ไม่สามารถอ่านไฟล์ภาพสำหรับการอัปโหลดได้');
  }
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('แปลงไฟล์ภาพไม่สำเร็จ'));
    };
    reader.onerror = () => reject(new Error('แปลงไฟล์ภาพไม่สำเร็จ'));
    reader.readAsDataURL(blob);
  });
}

export async function fetchLeaksViaAppsScript(
  scriptUrl: string,
  existingLeaks: LeakPoint[]
): Promise<{
  leaks: LeakPoint[];
  info: AppsScriptConnectionInfo;
}> {
  const urlWithQuery = scriptUrl.includes('?')
    ? `${scriptUrl}&action=read`
    : `${scriptUrl}?action=read`;

  const res = await fetch(urlWithQuery, {
    method: 'GET',
  });

  if (!res.ok) {
    throw new Error(`Apps Script ตอบกลับสถานะ HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    sheetTitle?: string;
    tabName?: string;
    spreadsheetUrl?: string;
    folderId?: string;
    values?: string[][];
  };

  if (!data.ok) {
    throw new Error(data.error || 'Apps Script ไม่สามารถอ่านข้อมูลได้');
  }

  const parsed = sheetRowsToLeaks(data.values || [], existingLeaks);
  return {
    leaks: parsed,
    info: {
      scriptUrl,
      sheetTitle: data.sheetTitle || 'LEAK',
      tabName: data.tabName,
      spreadsheetUrl: data.spreadsheetUrl,
      folderId: data.folderId || DEFAULT_DRIVE_FOLDER_ID,
    },
  };
}

export async function syncLeaksViaAppsScript(
  scriptUrl: string,
  leaks: LeakPoint[]
): Promise<{
  updatedLeaks: LeakPoint[];
  uploadedCount: number;
  info: AppsScriptConnectionInfo;
}> {
  const payloadLeaks = await Promise.all(
    leaks.map(async (leak) => {
      const coords =
        leak.lat !== null && leak.lng !== null
          ? `${leak.lat.toFixed(6)}, ${leak.lng.toFixed(6)}`
          : '';
      const combinedLocation =
        leak.locationName && coords
          ? `${leak.locationName} (${coords})`
          : coords || leak.locationName || '';

      const photosPayload = await Promise.all(
        leak.photos.map(async (photo, idx) => {
          if (photo.driveFileId && photo.driveUrl) {
            return {
              id: photo.id,
              driveFileId: photo.driveFileId,
              driveUrl: photo.driveUrl,
            };
          }
          const safeDate = (
            leak.reportDate || new Date().toISOString().slice(0, 10)
          ).replace(/[^0-9-]/g, '');
          const dataUrl = await toDataUrl(photo.url);
          return {
            id: photo.id,
            filename: `${leak.dma}_NO${leak.no}_${safeDate}_${idx + 1}.jpg`,
            dataUrl,
          };
        })
      );

      return {
        id: leak.id,
        dma: leak.dma,
        no: leak.no,
        reportDate: leak.reportDate || '',
        workDetails: leak.workDetails || '',
        combinedLocation,
        locationName: leak.locationName || '',
        pipeSpec:
          formatPipeSpec(leak.pipeType, leak.pipeSize) || leak.pipeSpec || '',
        technician: leak.technician || '',
        repairMethod: leak.repairMethod || '',
        statusLabel: SEVERITY_LABELS[leak.severity],
        severityLabel: SEVERITY_LABELS[leak.severity],
        photos: photosPayload,
      };
    })
  );

  // Use text/plain;charset=utf-8 to avoid CORS preflight OPTIONS failure on Google Apps Script Web Apps
  const res = await fetch(scriptUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'sync_all',
      folderId: DEFAULT_DRIVE_FOLDER_ID,
      leaks: payloadLeaks,
    }),
  });

  if (!res.ok) {
    throw new Error(`Apps Script ตอบกลับสถานะ HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    sheetTitle?: string;
    tabName?: string;
    spreadsheetUrl?: string;
    folderId?: string;
    uploadedPhotos?: Array<{
      leakId: string;
      photoId: string;
      driveFileId: string;
      driveUrl: string;
    }>;
  };

  if (!data.ok) {
    throw new Error(data.error || 'Apps Script ไม่สามารถบันทึกข้อมูลได้');
  }

  const uploadedMap: Record<
    string,
    {driveFileId: string; driveUrl: string}
  > = {};
  for (const item of data.uploadedPhotos || []) {
    uploadedMap[`${item.leakId}::${item.photoId}`] = {
      driveFileId: item.driveFileId,
      driveUrl: item.driveUrl,
    };
  }

  const updatedLeaks = leaks.map((leak) => {
    let changed = false;
    const nextPhotos = leak.photos.map((photo) => {
      const uploaded = uploadedMap[`${leak.id}::${photo.id}`];
      if (!uploaded) return photo;
      changed = true;
      return {
        ...photo,
        driveFileId: uploaded.driveFileId,
        driveUrl: uploaded.driveUrl,
      };
    });
    return changed ? {...leak, photos: nextPhotos} : leak;
  });

  return {
    updatedLeaks,
    uploadedCount: (data.uploadedPhotos || []).length,
    info: {
      scriptUrl,
      sheetTitle: data.sheetTitle || 'LEAK',
      tabName: data.tabName,
      spreadsheetUrl: data.spreadsheetUrl,
      folderId: data.folderId || DEFAULT_DRIVE_FOLDER_ID,
    },
  };
}

export const APPS_SCRIPT_CODE_TEMPLATE = `// Google Apps Script สำหรับระบบ "รายการจุดแตกรั่ว"
// เชื่อมต่อ Google Drive (เก็บรูปภาพ) + Google Sheet (LEAK 12 คอลัมน์) อัตโนมัติ

const DRIVE_FOLDER_ID = '${DEFAULT_DRIVE_FOLDER_ID}';
const DEFAULT_SHEET_NAME = 'LEAK';
const HEADERS = [
  'DMA',
  'NO',
  'วันที่',
  'รายละเอียดงาน',
  'ตำแหน่ง (สถานที่และพิกัดบนแผนที่)',
  'ตำแหน่ง / ชื่อถนน / ซอย / จุดสังเกต',
  'ชนิดและขนาดท่อ',
  'ผู้รับผิดชอบ / ทีมช่าง',
  'วิธีแก้ไข / ผลการซ่อมแซม',
  'สถานะการแก้ไข',
  'ระดับความเร่งด่วน',
  'ภาพถ่ายหน้างาน'
];

function getOrCreateSpreadsheet_() {
  // 1) ถ้าสร้างสคริปต์ผูกไว้กับไฟล์ Google Sheet อยู่แล้ว ให้ใช้ไฟล์นั้นทันที
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  // 2) ถ้าเป็น Standalone Script ให้ใช้ ID ที่บันทึกไว้หรือค้นหาไฟล์ LEAK ในโฟลเดอร์ Drive
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('SPREADSHEET_ID');
  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId);
    } catch (e) {}
  }

  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (files.hasNext()) {
    const f = files.next();
    if (f.getName().toUpperCase().indexOf('LEAK') !== -1) {
      props.setProperty('SPREADSHEET_ID', f.getId());
      return SpreadsheetApp.openById(f.getId());
    }
  }

  // 3) ถ้ายังไม่มีไฟล์ ให้สร้างไฟล์ LEAK ใหม่และย้ายเข้าโฟลเดอร์ Drive
  const created = SpreadsheetApp.create(DEFAULT_SHEET_NAME);
  const createdFile = DriveApp.getFileById(created.getId());
  createdFile.moveTo(folder);
  props.setProperty('SPREADSHEET_ID', created.getId());
  return created;
}

function getTargetSheet_(ss) {
  const sheets = ss.getSheets();
  let sheet = sheets[0];
  for (let i = 0; i < sheets.length; i++) {
    const name = sheets[i].getName();
    if (name.toUpperCase().indexOf('LEAK') !== -1 || name.indexOf('รายการ') !== -1) {
      sheet = sheets[i];
      break;
    }
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function formatCellValue_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyy-MM-dd');
  }
  return val === null || val === undefined ? '' : String(val);
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const ss = getOrCreateSpreadsheet_();
    const sheet = getTargetSheet_(ss);
    const rawValues = sheet.getDataRange().getValues();
    const values = rawValues.map(function(row) {
      return row.map(formatCellValue_);
    });

    return jsonResponse_({
      ok: true,
      sheetTitle: ss.getName(),
      tabName: sheet.getName(),
      spreadsheetUrl: ss.getUrl(),
      folderId: DRIVE_FOLDER_ID,
      values: values
    });
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message || String(err) });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse((e.postData && e.postData.contents) || '{}');
    const folderId = payload.folderId || DRIVE_FOLDER_ID;
    const folder = DriveApp.getFolderById(folderId);
    const ss = getOrCreateSpreadsheet_();
    const sheet = getTargetSheet_(ss);

    const leaks = payload.leaks || [];
    const uploadedPhotos = [];
    const rows = [HEADERS];

    for (let i = 0; i < leaks.length; i++) {
      const leak = leaks[i];
      const driveLinks = [];
      const photos = leak.photos || [];

      for (let j = 0; j < photos.length; j++) {
        const photo = photos[j];
        if (photo.driveUrl) {
          driveLinks.push(photo.driveUrl);
        } else if (photo.dataUrl && photo.dataUrl.indexOf('data:') === 0) {
          const parts = photo.dataUrl.split(',');
          const mimeMatch = parts[0].match(/:(.*?);/);
          const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
          const bytes = Utilities.base64Decode(parts[1] || '');
          const blob = Utilities.newBlob(bytes, mimeType, photo.filename || ('leak_' + (i + 1) + '_' + (j + 1) + '.jpg'));
          const file = folder.createFile(blob);
          try {
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          } catch (shareErr) {}
          const driveFileId = file.getId();
          const driveUrl = 'https://drive.google.com/file/d/' + driveFileId + '/view';
          driveLinks.push(driveUrl);
          uploadedPhotos.push({
            leakId: leak.id,
            photoId: photo.id,
            driveFileId: driveFileId,
            driveUrl: driveUrl
          });
        }
      }

      rows.push([
        leak.dma || '',
        leak.no || '',
        leak.reportDate || '',
        leak.workDetails || '',
        leak.combinedLocation || '',
        leak.locationName || '',
        leak.pipeSpec || '',
        leak.technician || '',
        leak.repairMethod || '',
        leak.statusLabel || '',
        leak.severityLabel || '',
        driveLinks.length > 0 ? driveLinks.join('\\n') : (photos.length > 0 ? photos.length + ' ภาพ' : '0')
      ]);
    }

    sheet.clearContents();
    sheet.getRange(1, 1, rows.length, HEADERS.length).setValues(rows);
    sheet.setFrozenRows(1);

    return jsonResponse_({
      ok: true,
      sheetTitle: ss.getName(),
      tabName: sheet.getName(),
      spreadsheetUrl: ss.getUrl(),
      folderId: folderId,
      rowCount: rows.length - 1,
      uploadedPhotos: uploadedPhotos
    });
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message || String(err) });
  }
}
`;
