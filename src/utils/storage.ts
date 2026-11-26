import {formatPipeSpec, LeakPoint, parsePipeSpec} from '../types/leak';

const DB_NAME = 'hydropin_gis_db';
const DB_VERSION = 1;
const STORE_NAME = 'leaks';
const SEEDED_KEY = 'hydropin_seeded_v1';

export const INITIAL_SEED_LEAKS: LeakPoint[] = [
  {
    id: 'leak-seed-1',
    dma: 'DMA-01',
    no: '01',
    workDetails: '',
    pipeType: 'PVC',
    pipeSize: '150 มม.',
    pipeSpec: 'PVC · 150 มม.',
    repairMethod: 'สูบน้ำออกจากบ่อซ่อม ทำความสะอาดผิวท่อ และรัด Repair Clamp สแตนเลส 2 ชิ้น',
    locationName: 'ถ.ประชาราษฎร์ สาย 1 ซอย 18',
    lat: 13.80582,
    lng: 100.51745,
    severity: 'critical',
    technician: 'ทีมซ่อมบำรุง A',
    photos: [
      {
        id: 'photo-seed-1',
        url: '/src/assets/images/leak_pvc_road_1795595511565.jpg',
        stage: 'before',
        caption: 'เปิดหน้าดินพบจุดรั่วบริเวณข้อต่อท่อ PVC 150 มม.',
        addedAt: '2026-11-25T08:15:00.000Z',
      },
    ],
    reportDate: '2026-11-25',
    reportedAt: '2026-11-25T08:15:00.000Z',
    updatedAt: '2026-11-25T08:15:00.000Z',
  },
  {
    id: 'leak-seed-2',
    dma: 'DMA-02',
    no: '02',
    workDetails: '',
    pipeType: 'SP',
    pipeSize: '200 มม.',
    pipeSpec: 'SP · 200 มม.',
    repairMethod: 'ปิดประตูน้ำย่อย คลายน็อตหน้าแปลน เปลี่ยนปะเก็นยางเสริมผ้าใบใหม่และขันทอร์คตามมาตรฐาน',
    locationName: 'แยกวงศ์สว่าง หน้าปากซอย 4',
    lat: 13.82864,
    lng: 100.52631,
    severity: 'moderate',
    technician: 'ช่างสมชาย / ทีม B',
    photos: [
      {
        id: 'photo-seed-2',
        url: '/src/assets/images/leak_valve_meter_1795595511732.jpg',
        stage: 'during',
        caption: 'ตรวจพบรอยน้ำหยดต่อเนื่องที่หน้าแปลนประตูน้ำ 200 มม.',
        addedAt: '2026-11-25T09:10:00.000Z',
      },
    ],
    reportDate: '2026-11-25',
    reportedAt: '2026-11-25T09:10:00.000Z',
    updatedAt: '2026-11-25T10:30:00.000Z',
  },
  {
    id: 'leak-seed-3',
    dma: 'DMA-01',
    no: '03',
    workDetails: '',
    pipeType: 'PVC',
    pipeSize: '100 มม.',
    pipeSpec: 'PVC · 100 มม.',
    repairMethod: 'รัดแคลมป์สแตนเลสเต็มวง ตรวจสอบแรงดัน 30 นาที ไม่พบน้ำซึม พร้อมกลบดินบดอัด',
    locationName: 'ซ.กรุงเทพ-นนทบุรี 23',
    lat: 13.81725,
    lng: 100.52988,
    severity: 'resolved',
    technician: 'ทีมซ่อมบำรุง A',
    photos: [
      {
        id: 'photo-seed-3',
        url: '/src/assets/images/leak_repaired_clamp_1795595511999.jpg',
        stage: 'after',
        caption: 'ติดตั้งแคลมป์สแตนเลสรัดจุดรั่วเรียบร้อย บ่อซ่อมแห้งสนิท',
        addedAt: '2026-11-24T15:40:00.000Z',
      },
    ],
    reportDate: '2026-11-24',
    reportedAt: '2026-11-24T13:20:00.000Z',
    updatedAt: '2026-11-24T16:10:00.000Z',
  },
  {
    id: 'leak-seed-4',
    dma: 'DMA-03',
    no: '01',
    workDetails: '',
    pipeType: 'PB',
    pipeSize: '25 มม.',
    pipeSpec: 'PB · 25 มม.',
    repairMethod: 'ตัดต่อข้อต่อตรงเกลียวนอกทองเหลืองใหม่ และพันเทปพันเกลียว',
    locationName: 'ถ.พิบูลสงคราม ใกล้ท่าน้ำนนท์',
    lat: 13.83512,
    lng: 100.50195,
    severity: 'low',
    technician: '',
    photos: [],
    reportDate: '2026-11-25',
    reportedAt: '2026-11-25T07:50:00.000Z',
    updatedAt: '2026-11-25T07:50:00.000Z',
  },
];

function normalizeLeak(item: LeakPoint): LeakPoint {
  const {pipeType, pipeSize} = parsePipeSpec(
    item.pipeSpec,
    item.pipeType,
    item.pipeSize
  );
  const resolvedSeverity =
    item.severity === 'resolved' || item.status === 'resolved'
      ? 'resolved'
      : item.severity === 'critical' ||
          item.severity === 'moderate' ||
          item.severity === 'low'
        ? item.severity
        : 'moderate';

  return {
    ...item,
    pipeType,
    pipeSize,
    pipeSpec: item.pipeSpec || formatPipeSpec(pipeType, pipeSize),
    severity: resolvedSeverity,
    reportDate:
      item.reportDate ||
      (item.reportedAt
        ? item.reportedAt.slice(0, 10)
        : new Date().toISOString().slice(0, 10)),
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {keyPath: 'id'});
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadLeaks(): Promise<LeakPoint[]> {
  try {
    const db = await openDb();
    const items = await new Promise<LeakPoint[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as LeakPoint[]) || []);
      req.onerror = () => reject(req.error);
    });

    const alreadySeeded = localStorage.getItem(SEEDED_KEY) === '1';
    if (items.length === 0 && !alreadySeeded) {
      await saveAllLeaks(INITIAL_SEED_LEAKS);
      localStorage.setItem(SEEDED_KEY, '1');
      return INITIAL_SEED_LEAKS;
    }

    return items
      .map(normalizeLeak)
      .sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  } catch {
    try {
      const raw = localStorage.getItem('hydropin_leaks_fallback');
      if (raw) return (JSON.parse(raw) as LeakPoint[]).map(normalizeLeak);
    } catch {
      // ignore
    }
    return INITIAL_SEED_LEAKS;
  }
}

export async function saveAllLeaks(leaks: LeakPoint[]): Promise<void> {
  localStorage.setItem(SEEDED_KEY, '1');
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      for (const item of leaks) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    localStorage.setItem('hydropin_leaks_fallback', JSON.stringify(leaks));
  }
}

export async function upsertLeak(leak: LeakPoint): Promise<void> {
  localStorage.setItem(SEEDED_KEY, '1');
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(leak);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const existing = await loadLeaks();
    const updated = [leak, ...existing.filter((x) => x.id !== leak.id)];
    localStorage.setItem('hydropin_leaks_fallback', JSON.stringify(updated));
  }
}

export async function deleteLeakById(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const existing = await loadLeaks();
    localStorage.setItem(
      'hydropin_leaks_fallback',
      JSON.stringify(existing.filter((x) => x.id !== id))
    );
  }
}

export function compressImageFile(
  file: File,
  maxDim = 1280,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์ภาพได้'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('รูปแบบภาพไม่ถูกต้อง'));
      img.onload = () => {
        let {width, height} = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
