import {
  formatPipeSpec,
  LeakPoint,
  LeakSeverity,
  parsePipeSpec,
  SEVERITY_LABELS,
} from '../types/leak';

function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r' && next === '\n') {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
      } else if (char === '\n' || char === '\r') {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell !== ''));
}

function parseSeverity(
  val: string | undefined,
  legacyStatus?: string | undefined
): LeakSeverity {
  const v = (val || '').trim().toLowerCase();
  const leg = (legacyStatus || '').trim().toLowerCase();
  if (
    v.includes('เสร็จ') ||
    v === 'resolved' ||
    leg.includes('เสร็จ') ||
    leg === 'resolved'
  ) {
    return 'resolved';
  }
  if (v.includes('วิกฤต') || v === 'critical') return 'critical';
  if (v.includes('ต่ำ') || v === 'low') return 'low';
  return 'moderate';
}

function extractCoordsFromText(text: string): {lat: number | null; lng: number | null} {
  const match = text.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (!match) return {lat: null, lng: null};
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return {lat, lng};
  }
  return {lat: null, lng: null};
}

export function importLeaksFromCsv(csvText: string): LeakPoint[] {
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader =
    header.includes('dma') ||
    header.includes('no') ||
    header.some((h) => h.includes('รายละเอียด') || h.includes('วันที่') || h.includes('ตำแหน่ง'));

  const startIdx = hasHeader ? 1 : 0;

  const findCol = (pred: (h: string) => boolean, fallback: number): number => {
    if (!hasHeader) return fallback;
    const idx = header.findIndex(pred);
    return idx >= 0 ? idx : fallback;
  };

  const idxDma = findCol((h) => h === 'dma', 0);
  const idxNo = findCol((h) => h === 'no' || h === 'เลขที่', 1);
  const idxDate = findCol((h) => h.includes('วันที่') || h === 'date', 2);
  const idxDetails = findCol(
    (h) => h.includes('รายละเอียดงาน') || h.includes('รายละเอียด') || h === 'details',
    3
  );
  const idxCombinedPos = findCol(
    (h) => h.includes('สถานที่และพิกัด') || h === 'ตำแหน่ง',
    4
  );
  const idxStreet = findCol(
    (h) => h.includes('ชื่อถนน') || h.includes('จุดสังเกต') || h === 'location',
    5
  );
  const idxPipe = findCol((h) => h.includes('ชนิดและขนาดท่อ') || h.includes('ท่อ'), 6);
  const idxTech = findCol((h) => h.includes('ผู้รับผิดชอบ') || h.includes('ทีมช่าง'), 7);
  const idxRepair = findCol((h) => h.includes('วิธีแก้ไข') || h.includes('ผลการซ่อม'), 8);
  const idxStatus = hasHeader ? header.findIndex((h) => h.includes('สถานะ') || h === 'status') : -1;
  const idxSeverity = findCol((h) => h.includes('ความเร่งด่วน'), 9);
  const idxLat = hasHeader ? header.findIndex((h) => h === 'lat' || h === 'latitude') : -1;
  const idxLng = hasHeader ? header.findIndex((h) => h === 'lng' || h === 'lon' || h === 'longitude') : -1;

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const parsed: LeakPoint[] = [];

  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    const dma = (row[idxDma] || '').trim() || 'DMA-01';
    const no = (row[idxNo] || '').trim() || String(i).padStart(2, '0');
    const rawDate = (row[idxDate] || '').trim() || today;
    const workDetails = (row[idxDetails] || '').trim();
    if (!dma && !no && !(row[idxCombinedPos] || '').trim()) continue;

    const combinedPos = (row[idxCombinedPos] || '').trim();
    const street = (row[idxStreet] || '').trim();

    let lat: number | null = null;
    let lng: number | null = null;
    if (idxLat >= 0 && idxLng >= 0) {
      const parsedLat = parseFloat(row[idxLat] || '');
      const parsedLng = parseFloat(row[idxLng] || '');
      if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
        lat = parsedLat;
        lng = parsedLng;
      }
    }
    if (lat === null) {
      const fromPos = extractCoordsFromText(combinedPos);
      const fromStreet = extractCoordsFromText(street);
      lat = fromPos.lat ?? fromStreet.lat;
      lng = fromPos.lng ?? fromStreet.lng;
    }

    const cleanLocationName =
      street ||
      combinedPos
        .replace(/\(\s*-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+\s*\)/g, '')
        .replace(/^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$/g, '')
        .trim();

    const rawPipeSpec = (row[idxPipe] || '').trim();
    const {pipeType, pipeSize} = parsePipeSpec(rawPipeSpec);

    parsed.push({
      id: `leak-csv-${Date.now()}-${i}`,
      dma,
      no,
      workDetails,
      pipeType,
      pipeSize,
      pipeSpec: rawPipeSpec || formatPipeSpec(pipeType, pipeSize),
      repairMethod: (row[idxRepair] || '').trim(),
      locationName: cleanLocationName,
      lat,
      lng,
      severity: parseSeverity(row[idxSeverity], idxStatus >= 0 ? row[idxStatus] : ''),
      technician: (row[idxTech] || '').trim(),
      photos: [],
      reportDate: rawDate,
      reportedAt: now,
      updatedAt: now,
    });
  }

  return parsed;
}

function escapeCsvCell(value: string): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatPositionCell(item: LeakPoint): string {
  const coords =
    item.lat !== null && item.lng !== null
      ? `${item.lat.toFixed(6)}, ${item.lng.toFixed(6)}`
      : '';
  if (item.locationName && coords) return `${item.locationName} (${coords})`;
  return item.locationName || coords;
}

export function exportLeaksToCsv(leaks: LeakPoint[], mode: 'compact' | 'full'): string {
  const lines: string[] = [];
  if (mode === 'compact') {
    lines.push('DMA,NO,วันที่,ตำแหน่ง,ระดับความเร่งด่วน');
    for (const item of leaks) {
      lines.push(
        [
          escapeCsvCell(item.dma),
          escapeCsvCell(item.no),
          escapeCsvCell(item.reportDate),
          escapeCsvCell(formatPositionCell(item)),
          escapeCsvCell(SEVERITY_LABELS[item.severity]),
        ].join(',')
      );
    }
  } else {
    lines.push(
      'DMA,NO,วันที่,ตำแหน่ง (สถานที่และพิกัดบนแผนที่),ตำแหน่ง / ชื่อถนน / ซอย / จุดสังเกต,ชนิดท่อ,ขนาดท่อ,ผู้รับผิดชอบ / ทีมช่าง,วิธีแก้ไข / ผลการซ่อมแซม,ระดับความเร่งด่วน,ภาพถ่ายหน้างาน'
    );
    for (const item of leaks) {
      const {pipeType, pipeSize} = parsePipeSpec(item.pipeSpec, item.pipeType, item.pipeSize);
      lines.push(
        [
          escapeCsvCell(item.dma),
          escapeCsvCell(item.no),
          escapeCsvCell(item.reportDate),
          escapeCsvCell(formatPositionCell(item)),
          escapeCsvCell(item.locationName),
          escapeCsvCell(pipeType),
          escapeCsvCell(pipeSize),
          escapeCsvCell(item.technician),
          escapeCsvCell(item.repairMethod),
          escapeCsvCell(SEVERITY_LABELS[item.severity]),
          escapeCsvCell(item.photos.length > 0 ? `${item.photos.length} ภาพ` : '0'),
        ].join(',')
      );
    }
  }
  return '\uFEFF' + lines.join('\r\n');
}

export function downloadCsvFile(filename: string, content: string): void {
  const blob = new Blob([content], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
