import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {APIProvider} from '@vis.gl/react-google-maps';
import {User} from 'firebase/auth';
import {
  CloudUpload,
  Code2,
  Crosshair,
  ExternalLink,
  HardDrive,
  LogIn,
  LogOut,
  MapPin,
  Plus,
  RefreshCw,
  ShieldCheck,
  Table2,
} from 'lucide-react';
import {
  DMA_OPTIONS,
  LeakPhoto,
  LeakPoint,
  LeakSeverity,
  parsePipeSpec,
} from './types/leak';
import {
  deleteLeakById,
  loadLeaks,
  saveAllLeaks,
  upsertLeak,
} from './utils/storage';
import {
  getAccessToken,
  googleSignIn,
  googleSignOut,
  initGoogleAuth,
} from './utils/googleAuth';
import {
  DEFAULT_DRIVE_FOLDER_ID,
  DEFAULT_DRIVE_FOLDER_URL,
  findSpreadsheetInDrive,
  uploadPendingPhotosForLeaks,
} from './utils/googleDrive';
import {
  fetchSpreadsheetMeta,
  leakToSheetRow,
  readSheetValues,
  SHEET_HEADERS,
  sheetRowsToLeaks,
  SpreadsheetMeta,
  writeSheetValues,
} from './utils/googleSheets';
import {
  AppsScriptConnectionInfo,
  fetchLeaksViaAppsScript,
  getSavedAppsScriptUrl,
  isValidAppsScriptUrl,
  saveAppsScriptUrl,
  syncLeaksViaAppsScript,
} from './utils/appsScript';
import {DashboardSummarySection} from './components/DashboardSummarySection';
import {LeakMapWorkspace} from './components/LeakMapWorkspace';
import {LeakDrawer} from './components/LeakDrawer';
import {LeakTableView} from './components/LeakTableView';
import {ReportExportModal} from './components/ReportExportModal';
import {GoogleSheetsModal} from './components/GoogleSheetsModal';
import {PhotoLightbox} from './components/PhotoLightbox';
import {AdminLoginModal} from './components/AdminLoginModal';
import {AppTheme, HeaderQuickControls} from './components/HeaderQuickControls';
import {LandingPage} from './components/LandingPage';

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const SHEET_PREF_KEY = 'hydropin_sheet_pref_v1';
const THEME_PREF_KEY = 'hydropin_theme_v1';
const APP_LOGO_SRC = '/assets/aistudio/_________________________2e00b14d.png';

type ActiveView = 'map' | 'table';

export default function App() {
  const [leaks, setLeaks] = useState<LeakPoint[]>([]);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  // Pre-entry landing page & Day/Night theme
  const [showLanding, setShowLanding] = useState(true);
  const [theme, setTheme] = useState<AppTheme>(() => {
    try {
      return localStorage.getItem(THEME_PREF_KEY) === 'night' ? 'night' : 'day';
    } catch {
      return 'day';
    }
  });

  // Admin auth state held strictly in React memory (never localStorage/sessionStorage)
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminUsername, setAdminUsername] = useState<string | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const isAdmin = Boolean(adminToken);

  const [activeView, setActiveView] = useState<ActiveView>('map');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDma, setSelectedDma] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<LeakSeverity | 'all'>(
    'all'
  );

  // Drawer & map picking state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingLeak, setEditingLeak] = useState<LeakPoint | null>(null);
  const [pickedCoords, setPickedCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [pickingReason, setPickingReason] = useState<'new' | 'edit'>('new');
  const [pendingDraft, setPendingDraft] = useState<LeakPoint | null>(null);

  const [focusTarget, setFocusTarget] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    seq: number;
  } | null>(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [sheetsOpen, setSheetsOpen] = useState(false);

  // Google Sheets OAuth & Sync State
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [connectedSheet, setConnectedSheet] = useState<SpreadsheetMeta | null>(
    () => {
      try {
        const raw = localStorage.getItem(SHEET_PREF_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            meta: SpreadsheetMeta;
            tab: string;
          };
          return parsed.meta || null;
        }
      } catch {
        // ignore
      }
      return null;
    }
  );
  const [activeSheetTab, setActiveSheetTab] = useState<string>(() => {
    try {
      const raw = localStorage.getItem(SHEET_PREF_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          meta: SpreadsheetMeta;
          tab: string;
        };
        return parsed.tab || 'Sheet1';
      }
    } catch {
      // ignore
    }
    return 'Sheet1';
  });

  // Apps Script Web App auto-sync state
  const [appsScriptUrl, setAppsScriptUrl] = useState<string>(() =>
    getSavedAppsScriptUrl()
  );
  const [appsScriptInfo, setAppsScriptInfo] =
    useState<AppsScriptConnectionInfo | null>(null);

  const [pendingSheetSync, setPendingSheetSync] = useState<{
    leaksSnapshot: LeakPoint[];
    reason: string;
    driveOnly?: boolean;
  } | null>(null);
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const [sheetToast, setSheetToast] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [lightbox, setLightbox] = useState<{
    photos: LeakPhoto[];
    index: number;
    title: string;
  } | null>(null);

  const mapSectionRef = useRef<HTMLDivElement>(null);
  const leaksRef = useRef<LeakPoint[]>([]);
  useEffect(() => {
    leaksRef.current = leaks;
  }, [leaks]);

  // Sync Day/Night theme class on <html> and meta theme-color
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'night');
    try {
      localStorage.setItem(THEME_PREF_KEY, theme);
    } catch {
      // ignore
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute(
        'content',
        theme === 'night' ? '#0B1D3A' : '#0A4DA2'
      );
    }
  }, [theme]);

  // Force User mode back to map if not admin
  useEffect(() => {
    if (!isAdmin) {
      if (activeView !== 'map') setActiveView('map');
      if (severityFilter === 'resolved') setSeverityFilter('all');
      if (reportOpen) setReportOpen(false);
      if (sheetsOpen) setSheetsOpen(false);
    }
  }, [isAdmin, activeView, severityFilter, reportOpen, sheetsOpen]);

  // Quota exceeded listener
  useEffect(() => {
    const onQuotaExceeded = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () =>
      window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  // Firebase Auth listener for Google Workspace OAuth
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user, token) => {
        setGoogleUser(user);
        setAccessToken(token);
      },
      (user) => {
        setGoogleUser(user);
        setAccessToken(getAccessToken());
      }
    );
    return () => unsubscribe();
  }, []);

  // Load persisted leaks & auto-pull from Apps Script if configured
  useEffect(() => {
    let active = true;
    loadLeaks().then(async (items) => {
      if (!active) return;
      setLeaks(items);

      const initialScriptUrl = getSavedAppsScriptUrl();
      if (isValidAppsScriptUrl(initialScriptUrl)) {
        setIsAutoConnecting(true);
        try {
          const res = await fetchLeaksViaAppsScript(initialScriptUrl, items);
          if (!active) return;
          setAppsScriptInfo(res.info);
          if (res.leaks.length > 0) {
            await saveAllLeaks(res.leaks);
            if (!active) return;
            setLeaks(res.leaks);
          }
        } catch (err) {
          if (!active) return;
          setSheetToast({
            type: 'error',
            text:
              err instanceof Error
                ? `ไม่สามารถดึงข้อมูลอัตโนมัติจาก Apps Script: ${err.message}`
                : 'ไม่สามารถดึงข้อมูลอัตโนมัติจาก Apps Script ได้',
          });
        } finally {
          if (active) setIsAutoConnecting(false);
        }
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const handleAdminLoginSuccess = useCallback(
    (token: string, username: string) => {
      setAdminToken(token);
      setAdminUsername(username);
      setLoginModalOpen(false);
      setSheetToast({
        type: 'success',
        text: `เข้าสู่ระบบ Admin (${username}) เรียบร้อยแล้ว`,
      });
      setTimeout(() => setSheetToast(null), 3500);
    },
    []
  );

  const handleAdminLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {method: 'POST'});
    } catch {
      // ignore network error on logout
    }
    setAdminToken(null);
    setAdminUsername(null);
    setActiveView('map');
    setSeverityFilter((prev) => (prev === 'resolved' ? 'all' : prev));
    setReportOpen(false);
    setSheetsOpen(false);
  }, []);

  const persistSheetPref = useCallback(
    (meta: SpreadsheetMeta | null, tab: string) => {
      if (!meta) {
        localStorage.removeItem(SHEET_PREF_KEY);
        return;
      }
      localStorage.setItem(SHEET_PREF_KEY, JSON.stringify({meta, tab}));
    },
    []
  );

  const handleConnectSheet = useCallback(
    (meta: SpreadsheetMeta, tabName: string) => {
      setConnectedSheet(meta);
      setActiveSheetTab(tabName);
      persistSheetPref(meta, tabName);
    },
    [persistSheetPref]
  );

  const handleSelectTab = useCallback(
    (tabName: string) => {
      setActiveSheetTab(tabName);
      persistSheetPref(connectedSheet, tabName);
    },
    [connectedSheet, persistSheetPref]
  );

  const handleGoogleSignIn = useCallback(async () => {
    const res = await googleSignIn();
    setGoogleUser(res.user);
    setAccessToken(res.accessToken);

    setIsAutoConnecting(true);
    try {
      const found = await findSpreadsheetInDrive(
        DEFAULT_DRIVE_FOLDER_ID,
        res.accessToken
      );
      if (found) {
        const meta = await fetchSpreadsheetMeta(found.id, res.accessToken);
        const preferredTab = meta.sheetTitles.includes(activeSheetTab)
          ? activeSheetTab
          : meta.sheetTitles[0] || 'Sheet1';
        handleConnectSheet(meta, preferredTab);

        const values = await readSheetValues(
          meta.spreadsheetId,
          preferredTab,
          res.accessToken
        );
        const parsed = sheetRowsToLeaks(values, leaksRef.current);
        if (parsed.length > 0) {
          await saveAllLeaks(parsed);
          setLeaks(parsed);
          setSheetToast({
            type: 'success',
            text: `เชื่อมต่อ Google Drive และไฟล์ "${meta.title}" อัตโนมัติแล้ว (โหลด ${parsed.length} รายการ)`,
          });
        } else {
          setSheetToast({
            type: 'success',
            text: `เชื่อมต่อ Google Drive และไฟล์ "${meta.title}" อัตโนมัติแล้ว`,
          });
        }
      } else {
        setSheetToast({
          type: 'success',
          text: 'เชื่อมต่อโฟลเดอร์ Google Drive อัตโนมัติแล้ว (ยังไม่พบไฟล์สเปรดชีต LEAK — สร้างหรือเลือกไฟล์ได้ในเมนูเชื่อมต่อ)',
        });
      }
    } catch (err) {
      setSheetToast({
        type: 'error',
        text:
          err instanceof Error
            ? `เข้าสู่ระบบสำเร็จ แต่เชื่อมข้อมูลอัตโนมัติไม่สมบูรณ์: ${err.message}`
            : 'เข้าสู่ระบบสำเร็จ แต่ไม่สามารถค้นหาไฟล์ใน Google Drive ได้',
      });
    } finally {
      setIsAutoConnecting(false);
    }
  }, [activeSheetTab, handleConnectSheet]);

  const handleGoogleSignOut = useCallback(async () => {
    await googleSignOut();
    setGoogleUser(null);
    setAccessToken(null);
    setPendingSheetSync(null);
  }, []);

  const handleConfirmSheetSync = useCallback(async () => {
    if (!pendingSheetSync || !accessToken) return;
    setIsSyncingSheet(true);
    setSheetToast(null);
    try {
      let workingLeaks = pendingSheetSync.leaksSnapshot;
      let uploadedCount = 0;

      const hasPendingPhotos = workingLeaks.some((l) =>
        l.photos.some((p) => !p.driveFileId || !p.driveUrl)
      );

      if (hasPendingPhotos) {
        const uploadRes = await uploadPendingPhotosForLeaks(
          workingLeaks,
          DEFAULT_DRIVE_FOLDER_ID,
          accessToken
        );
        workingLeaks = uploadRes.updatedLeaks;
        uploadedCount = uploadRes.uploadedCount;
        await saveAllLeaks(workingLeaks);
        setLeaks(workingLeaks);
      }

      if (connectedSheet && !pendingSheetSync.driveOnly) {
        const rows = [SHEET_HEADERS, ...workingLeaks.map(leakToSheetRow)];
        await writeSheetValues(
          connectedSheet.spreadsheetId,
          activeSheetTab,
          rows,
          accessToken
        );
      }

      setPendingSheetSync(null);
      setSheetToast({
        type: 'success',
        text:
          connectedSheet && !pendingSheetSync.driveOnly
            ? `${
                uploadedCount > 0
                  ? `อัปโหลดรูป ${uploadedCount} ภาพลง Drive และ`
                  : ''
              }ซิงค์ข้อมูล ${workingLeaks.length} รายการลง Google Sheet "${
                connectedSheet.title
              }" สำเร็จ`
            : `อัปโหลดรูปภาพ ${uploadedCount} ภาพลงโฟลเดอร์ Google Drive สำเร็จ`,
      });
      setTimeout(() => setSheetToast(null), 4500);
    } catch (err) {
      setSheetToast({
        type: 'error',
        text:
          err instanceof Error
            ? `ซิงค์ไม่สำเร็จ: ${err.message}`
            : 'ไม่สามารถอัปโหลดรูปหรืออัปเดต Google Sheet ได้',
      });
    } finally {
      setIsSyncingSheet(false);
    }
  }, [pendingSheetSync, connectedSheet, activeSheetTab, accessToken]);

  const runAppsScriptSync = useCallback(
    async (targetLeaks: LeakPoint[], reason: string) => {
      if (!isValidAppsScriptUrl(appsScriptUrl)) return;
      setIsSyncingSheet(true);
      setSheetToast(null);
      try {
        const res = await syncLeaksViaAppsScript(appsScriptUrl, targetLeaks);
        await saveAllLeaks(res.updatedLeaks);
        setLeaks(res.updatedLeaks);
        setAppsScriptInfo(res.info);
        setSheetToast({
          type: 'success',
          text: `${reason}: ${
            res.uploadedCount > 0
              ? `อัปโหลดรูป ${res.uploadedCount} ภาพลง Drive และ`
              : ''
          }ซิงค์ข้อมูล ${res.updatedLeaks.length} รายการลง Google Sheet "${res.info.sheetTitle}" อัตโนมัติแล้ว`,
        });
        setTimeout(() => setSheetToast(null), 5000);
      } catch (err) {
        setSheetToast({
          type: 'error',
          text:
            err instanceof Error
              ? `ซิงค์อัตโนมัติผ่าน Apps Script ไม่สำเร็จ: ${err.message}`
              : 'ซิงค์อัตโนมัติผ่าน Apps Script ไม่สำเร็จ',
        });
      } finally {
        setIsSyncingSheet(false);
      }
    },
    [appsScriptUrl]
  );

  // User screen hides resolved leaks; Admin sees all leaks
  const roleScopedLeaks = useMemo(() => {
    if (isAdmin) return leaks;
    return leaks.filter((item) => item.severity !== 'resolved');
  }, [leaks, isAdmin]);

  const dmas = useMemo(() => {
    const set = new Set<string>();
    for (const item of roleScopedLeaks) {
      if (item.dma) set.add(item.dma);
    }
    return Array.from(set).sort();
  }, [roleScopedLeaks]);

  const allDmaOptions = useMemo(
    () => Array.from(new Set([...DMA_OPTIONS, ...dmas])).sort(),
    [dmas]
  );

  const dmaScopedLeaks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const normSelectedDma = selectedDma.trim().toUpperCase();
    return roleScopedLeaks.filter((item) => {
      if (
        selectedDma !== 'all' &&
        (item.dma || '').trim().toUpperCase() !== normSelectedDma
      ) {
        return false;
      }
      if (!q) return true;
      const {pipeType, pipeSize} = parsePipeSpec(
        item.pipeSpec,
        item.pipeType,
        item.pipeSize
      );
      return (
        item.dma.toLowerCase().includes(q) ||
        item.no.toLowerCase().includes(q) ||
        item.repairMethod.toLowerCase().includes(q) ||
        item.locationName.toLowerCase().includes(q) ||
        item.technician.toLowerCase().includes(q) ||
        pipeType.toLowerCase().includes(q) ||
        pipeSize.toLowerCase().includes(q) ||
        item.pipeSpec.toLowerCase().includes(q) ||
        (item.reportDate || '').toLowerCase().includes(q)
      );
    });
  }, [roleScopedLeaks, searchQuery, selectedDma]);

  const filteredLeaks = useMemo(() => {
    if (severityFilter === 'all') return dmaScopedLeaks;
    return dmaScopedLeaks.filter((item) => item.severity === severityFilter);
  }, [dmaScopedLeaks, severityFilter]);

  // Stats computed from filteredLeaks so selecting a severity displays only that severity
  const stats = useMemo(() => {
    let low = 0;
    let moderate = 0;
    let critical = 0;
    let resolved = 0;
    for (const item of filteredLeaks) {
      if (item.severity === 'low') low++;
      else if (item.severity === 'moderate') moderate++;
      else if (item.severity === 'critical') critical++;
      else resolved++;
    }
    return {
      total: filteredLeaks.length,
      low,
      moderate,
      critical,
      resolved,
    };
  }, [filteredLeaks]);

  const refreshSheetSilently = useCallback(async () => {
    try {
      if (isValidAppsScriptUrl(appsScriptUrl)) {
        const res = await fetchLeaksViaAppsScript(
          appsScriptUrl,
          leaksRef.current
        );
        setAppsScriptInfo(res.info);
        if (res.leaks.length > 0) {
          await saveAllLeaks(res.leaks);
          setLeaks(res.leaks);
        }
        return;
      }
      if (connectedSheet && accessToken) {
        const values = await readSheetValues(
          connectedSheet.spreadsheetId,
          activeSheetTab,
          accessToken
        );
        const parsed = sheetRowsToLeaks(values, leaksRef.current);
        if (parsed.length > 0) {
          await saveAllLeaks(parsed);
          setLeaks(parsed);
        }
      }
    } catch {
      // keep local leaks if background sheet refresh fails
    }
  }, [appsScriptUrl, connectedSheet, accessToken, activeSheetTab]);

  const panToLocation = useCallback(
    (lat: number, lng: number, zoom?: number) => {
      setFocusTarget((prev) => ({
        lat,
        lng,
        zoom,
        seq: (prev?.seq ?? 0) + 1,
      }));
    },
    []
  );

  const handleDmaChange = useCallback(
    (nextDma: string) => {
      setSelectedDma(nextDma);
      if (nextDma === 'all') return;
      const norm = nextDma.trim().toUpperCase();
      const matches = roleScopedLeaks.filter(
        (l) => (l.dma || '').trim().toUpperCase() === norm
      );
      setSelectedId((prev) =>
        prev && matches.some((m) => m.id === prev) ? prev : null
      );
      const firstPinned = matches.find(
        (m) => m.lat !== null && m.lng !== null
      );
      if (firstPinned && firstPinned.lat !== null && firstPinned.lng !== null) {
        panToLocation(firstPinned.lat, firstPinned.lng, 14);
      }
    },
    [roleScopedLeaks, panToLocation]
  );

  const scrollToMap = useCallback(() => {
    mapSectionRef.current?.scrollIntoView({behavior: 'smooth', block: 'center'});
  }, []);

  const handleSaveLeak = useCallback(
    async (saved: LeakPoint) => {
      await upsertLeak(saved);
      const exists = leaks.some((x) => x.id === saved.id);
      const nextLeaks = exists
        ? leaks.map((x) => (x.id === saved.id ? saved : x))
        : [saved, ...leaks];
      setLeaks(nextLeaks);
      setDrawerOpen(false);
      setEditingLeak(null);
      setPendingDraft(null);
      setPickedCoords(null);
      setIsPickingLocation(false);

      if (!isAdmin && saved.severity === 'resolved') {
        setSelectedId(null);
        setSheetToast({
          type: 'success',
          text: `บันทึก ${saved.dma} · NO.${saved.no} เป็น "ซ่อมแล้วเสร็จ" เรียบร้อยแล้ว (รายการถูกซ่อนจากหน้าผู้ใช้งาน)`,
        });
        setTimeout(() => setSheetToast(null), 4500);
      } else {
        setSelectedId(saved.id);
        if (saved.lat !== null && saved.lng !== null) {
          setActiveView('map');
          panToLocation(saved.lat, saved.lng, 16);
        }
      }

      const reason = exists
        ? `แก้ไขรายการ ${saved.dma} · NO.${saved.no}`
        : `เพิ่มรายการใหม่ ${saved.dma} · NO.${saved.no}`;

      if (isValidAppsScriptUrl(appsScriptUrl)) {
        void runAppsScriptSync(nextLeaks, reason);
        return;
      }

      const hasPendingPhotos = saved.photos.some(
        (p) => !p.driveFileId || !p.driveUrl
      );

      if (isAdmin && connectedSheet && accessToken) {
        setPendingSheetSync({
          leaksSnapshot: nextLeaks,
          reason,
        });
      } else if (isAdmin && accessToken && hasPendingPhotos) {
        setPendingSheetSync({
          leaksSnapshot: nextLeaks,
          reason: `อัปโหลดภาพถ่าย ${saved.dma} · NO.${saved.no} ขึ้น Google Drive`,
          driveOnly: true,
        });
      }
    },
    [
      leaks,
      isAdmin,
      panToLocation,
      appsScriptUrl,
      runAppsScriptSync,
      connectedSheet,
      accessToken,
    ]
  );

  const handleDeleteLeak = useCallback(
    async (id: string) => {
      if (!isAdmin) return;
      await deleteLeakById(id);
      const nextLeaks = leaks.filter((x) => x.id !== id);
      setLeaks(nextLeaks);
      setSelectedId((prev) => (prev === id ? null : prev));
      setDrawerOpen(false);
      setEditingLeak(null);

      if (isValidAppsScriptUrl(appsScriptUrl)) {
        void runAppsScriptSync(nextLeaks, 'ลบรายการจุดแตกรั่ว');
        return;
      }

      if (connectedSheet && accessToken) {
        setPendingSheetSync({
          leaksSnapshot: nextLeaks,
          reason: 'ลบรายการจุดแตกรั่ว',
        });
      }
    },
    [
      isAdmin,
      leaks,
      appsScriptUrl,
      runAppsScriptSync,
      connectedSheet,
      accessToken,
    ]
  );

  const handleUpdatePosition = useCallback(
    async (id: string, lat: number, lng: number) => {
      const target = leaks.find((x) => x.id === id);
      if (!target) return;
      const updated: LeakPoint = {
        ...target,
        lat,
        lng,
        updatedAt: new Date().toISOString(),
      };
      await upsertLeak(updated);
      const nextLeaks = leaks.map((x) => (x.id === id ? updated : x));
      setLeaks(nextLeaks);

      const reason = `ย้ายพิกัดจุดรั่ว ${updated.dma} · NO.${updated.no}`;
      if (isValidAppsScriptUrl(appsScriptUrl)) {
        void runAppsScriptSync(nextLeaks, reason);
        return;
      }

      if (isAdmin && connectedSheet && accessToken) {
        setPendingSheetSync({
          leaksSnapshot: nextLeaks,
          reason,
        });
      }
    },
    [
      isAdmin,
      leaks,
      appsScriptUrl,
      runAppsScriptSync,
      connectedSheet,
      accessToken,
    ]
  );

  const handleOpenNew = useCallback(() => {
    setEditingLeak(null);
    setPendingDraft(null);
    setPickedCoords(null);
    setIsPickingLocation(false);
    setDrawerOpen(true);
    void refreshSheetSilently();
  }, [refreshSheetSilently]);

  const handleOpenEdit = useCallback((leak: LeakPoint) => {
    setEditingLeak(leak);
    setPendingDraft(null);
    setPickedCoords(
      leak.lat !== null && leak.lng !== null
        ? {lat: leak.lat, lng: leak.lng}
        : null
    );
    setIsPickingLocation(false);
    setDrawerOpen(true);
  }, []);

  const handleStartPickNew = useCallback(() => {
    setActiveView('map');
    setDrawerOpen(false);
    setPendingDraft(null);
    setEditingLeak(null);
    setPickingReason('new');
    setIsPickingLocation(true);
    void refreshSheetSilently();
    setTimeout(() => scrollToMap(), 60);
  }, [scrollToMap, refreshSheetSilently]);

  const handleRequestMapPickFromDrawer = useCallback(
    (draft: LeakPoint) => {
      setPendingDraft(draft);
      setEditingLeak(draft);
      setDrawerOpen(false);
      setActiveView('map');
      setPickingReason('edit');
      setIsPickingLocation(true);
      setTimeout(() => scrollToMap(), 60);
    },
    [scrollToMap]
  );

  const handlePinFromList = useCallback(
    (leak: LeakPoint) => {
      setPendingDraft(leak);
      setEditingLeak(leak);
      setActiveView('map');
      setPickingReason('edit');
      setIsPickingLocation(true);
      setTimeout(() => scrollToMap(), 60);
    },
    [scrollToMap]
  );

  const handlePickMapLocation = useCallback(
    (lat: number, lng: number) => {
      setPickedCoords({lat, lng});
      setIsPickingLocation(false);
      if (pendingDraft) {
        setEditingLeak({...pendingDraft, lat, lng});
      }
      setDrawerOpen(true);
    },
    [pendingDraft]
  );

  const handleFocusLeak = useCallback(
    (leak: LeakPoint) => {
      setSelectedId(leak.id);
      setActiveView('map');
      if (leak.lat !== null && leak.lng !== null) {
        panToLocation(leak.lat, leak.lng, 16);
        setTimeout(() => scrollToMap(), 60);
      } else {
        handleOpenEdit(leak);
      }
    },
    [panToLocation, handleOpenEdit, scrollToMap]
  );

  const handleImportFromSheet = useCallback(async (loaded: LeakPoint[]) => {
    await saveAllLeaks(loaded);
    setLeaks(loaded);
  }, []);

  const handleLeaksUpdated = useCallback(async (updated: LeakPoint[]) => {
    await saveAllLeaks(updated);
    setLeaks(updated);
  }, []);

  const pendingSyncPhotoCount = useMemo(() => {
    if (!pendingSheetSync) return 0;
    let count = 0;
    for (const item of pendingSheetSync.leaksSnapshot) {
      for (const p of item.photos) {
        if (!p.driveFileId || !p.driveUrl) count++;
      }
    }
    return count;
  }, [pendingSheetSync]);

  const landingCriticalCount = useMemo(
    () =>
      roleScopedLeaks.filter((item) => item.severity === 'critical').length,
    [roleScopedLeaks]
  );

  return (
    <APIProvider
      apiKey={MAPS_API_KEY}
      language="th"
      region="TH"
      libraries={['marker', 'places']}
    >
      {showLanding ? (
        <LandingPage
          theme={theme}
          onChangeTheme={setTheme}
          totalActiveLeaks={roleScopedLeaks.length}
          criticalCount={landingCriticalCount}
          isAdmin={isAdmin}
          adminUsername={adminUsername}
          onEnterMain={() => setShowLanding(false)}
          onEnterAndPin={() => {
            setShowLanding(false);
            handleStartPickNew();
          }}
          onOpenAdminLogin={() => setLoginModalOpen(true)}
        />
      ) : (
        <div className="min-h-screen flex flex-col bg-[#F0F5FA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-x-hidden">
          {/* Quota Defense Banner */}
          {quotaExceeded && (
            <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
              <span>
                Google Maps Platform quota reached. If you are the app owner,
                visit{' '}
                <a
                  href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold text-amber-950 hover:text-amber-800"
                >
                  maps developer site
                </a>{' '}
                for instructions to update your account.
              </span>
            </div>
          )}

          {/* Top Bar */}
          <header className="h-14 md:h-16 bg-gradient-to-r from-[#0A4DA2] via-[#1267C9] to-[#1A7FE2] dark:from-[#0B1D3A] dark:via-[#0F2A54] dark:to-[#13386E] text-white px-3 sm:px-6 flex items-center justify-between gap-2 md:gap-4 sticky top-0 z-30 shrink-0 shadow-sm">
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                setActiveView('map');
              }}
              className="inline-flex items-center gap-2 text-sm sm:text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
            >
              <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-white p-0.5 flex items-center justify-center shadow-xs shrink-0">
                <img
                  src={APP_LOGO_SRC}
                  alt="โลโก้รายการจุดแตกรั่ว"
                  className="w-full h-full object-contain"
                />
              </span>
              <span>รายการจุดแตกรั่ว</span>
            </a>

            {/* Desktop Navigation */}
            <nav
              className="hidden md:flex items-center gap-2 sm:gap-3 text-sm font-medium"
              aria-label="เมนูหลัก"
            >
              <button
                type="button"
                onClick={() => setActiveView('map')}
                className={`px-3.5 py-1.5 rounded-full transition-colors whitespace-nowrap shrink-0 ${
                  activeView === 'map'
                    ? 'bg-white text-[#0A4DA2] font-semibold shadow-xs'
                    : 'text-white/90 hover:text-white hover:bg-white/10'
                }`}
              >
                แผนที่จุดรั่ว
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setActiveView('table')}
                  className={`px-3.5 py-1.5 rounded-full transition-colors whitespace-nowrap shrink-0 ${
                    activeView === 'table'
                      ? 'bg-white text-[#0A4DA2] font-semibold shadow-xs'
                      : 'text-white/90 hover:text-white hover:bg-white/10'
                  }`}
                >
                  ตารางรายการ DMA
                </button>
              )}
            </nav>

            {/* Right Header Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <HeaderQuickControls
                theme={theme}
                onChangeTheme={setTheme}
                compactOnMobile
              />

              <button
                type="button"
                onClick={handleOpenNew}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 md:px-4 md:py-2 rounded-full bg-white text-[#0A4DA2] text-xs font-semibold hover:bg-sky-50 shadow-xs transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="md:hidden">แจ้งจุดรั่ว</span>
                <span className="hidden md:inline">ลงจุดรั่วท่อประปาใหม่</span>
              </button>

              {/* Admin Login/Logout hidden completely on mobile */}
              {isAdmin ? (
                <div className="hidden md:flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-300/40 text-xs font-medium text-white">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-200" />
                    <span>{adminUsername || 'admin'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleAdminLogout()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors whitespace-nowrap"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>ออกจากระบบ</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setLoginModalOpen(true)}
                  className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/15 hover:bg-white/25 border border-white/25 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>เข้าสู่ระบบ Admin</span>
                </button>
              )}
            </div>
          </header>

        {/* Explicit User Confirmation Bar before Mutating Google Drive / Sheets (Admin desktop only) */}
        {isAdmin &&
          pendingSheetSync &&
          accessToken &&
          (connectedSheet || pendingSheetSync.driveOnly) && (
            <div className="hidden md:block bg-emerald-50 border-b border-emerald-200 px-4 sm:px-6 py-3 z-20">
              <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-xs text-emerald-950">
                  <CloudUpload className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>
                    {pendingSheetSync.driveOnly ? (
                      <>
                        ยืนยันอัปโหลดรูปภาพที่เพิ่มใหม่ (
                        <strong className="tabular-nums">
                          {pendingSyncPhotoCount}
                        </strong>{' '}
                        ภาพ) ไปยังโฟลเดอร์ Google Drive?
                      </>
                    ) : (
                      <>
                        ยืนยันการ
                        {pendingSyncPhotoCount > 0
                          ? `อัปโหลดรูป ${pendingSyncPhotoCount} ภาพขึ้น Drive และ`
                          : ''}
                        อัปเดตข้อมูล ({pendingSheetSync.reason}) ลงใน Google
                        Sheet <strong>{connectedSheet?.title}</strong> (แท็บ{' '}
                        <span className="font-mono">{activeSheetTab}</span>)
                        จำนวน{' '}
                        <strong className="tabular-nums">
                          {pendingSheetSync.leaksSnapshot.length}
                        </strong>{' '}
                        รายการ?
                      </>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSyncingSheet}
                    onClick={() => setPendingSheetSync(null)}
                    className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    disabled={isSyncingSheet}
                    onClick={handleConfirmSheetSync}
                    className="px-4 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-60"
                  >
                    {isSyncingSheet
                      ? 'กำลังบันทึก...'
                      : pendingSheetSync.driveOnly
                        ? 'ยืนยันอัปโหลดรูปขึ้น Drive'
                        : pendingSyncPhotoCount > 0
                          ? 'ยืนยันอัปโหลดรูป & อัปเดต Google Sheet'
                          : 'ยืนยันอัปเดต Google Sheet'}
                  </button>
                </div>
              </div>
            </div>
          )}

        {/* Sync / Status Feedback Toast */}
        {sheetToast && (
          <div
            className={`px-3 sm:px-6 py-2.5 text-xs border-b ${
              sheetToast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
              <span>{sheetToast.text}</span>
              <button
                type="button"
                onClick={() => setSheetToast(null)}
                className="underline text-[11px] shrink-0"
              >
                ปิด
              </button>
            </div>
          </div>
        )}

        {/* Main Workspace */}
        <main className="flex-1 flex flex-col">
          {activeView === 'map' || !isAdmin ? (
            <div className="max-w-7xl w-full mx-auto px-3 sm:px-6 py-3 sm:py-5 space-y-3 sm:space-y-5">
              {/* Hero Blue Banner */}
              <section
                aria-label="หัวข้อระบบบริหารจัดการจุดแตกรั่ว"
                className="rounded-xl sm:rounded-2xl bg-gradient-to-r from-[#0A4999] via-[#1267CC] to-[#1C8EE9] dark:from-[#0C2142] dark:via-[#123364] dark:to-[#164482] text-white px-4 py-3.5 sm:px-7 sm:py-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white p-1 flex items-center justify-center shadow-xs shrink-0">
                    <img
                      src={APP_LOGO_SRC}
                      alt="โลโก้ระบบจุดแตกรั่วท่อประปา"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-base sm:text-xl font-bold tracking-tight text-white">
                      ระบบติดตามและจัดการจุดแตกรั่วท่อประปา
                    </h1>
                    {/* Hidden on mobile per requirement 10 */}
                    <p className="hidden md:block text-xs sm:text-sm text-sky-100 mt-0.5">
                      บันทึกพิกัดจุดรั่วแยกตามเขต DMA-01 ถึง DMA-20 พร้อมรูปภาพหน้างานบน Google Drive และ Google Sheets
                    </p>
                  </div>
                </div>

                {/* Drive / Sheet buttons: Admin desktop only (hidden on mobile & User mode) */}
                {isAdmin && (
                  <div className="hidden md:flex items-center gap-2.5 shrink-0 flex-wrap">
                    {isValidAppsScriptUrl(appsScriptUrl) ? (
                      <a
                        href={DEFAULT_DRIVE_FOLDER_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors whitespace-nowrap"
                      >
                        <HardDrive className="w-3.5 h-3.5" />
                        <span>Drive รูปภาพ</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : accessToken ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={DEFAULT_DRIVE_FOLDER_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors whitespace-nowrap"
                        >
                          <HardDrive className="w-3.5 h-3.5" />
                          <span>Drive รูปภาพ</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <button
                          type="button"
                          onClick={() => setSheetsOpen(true)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white text-[#0A4DA2] text-xs font-semibold hover:bg-sky-50 transition-colors whitespace-nowrap"
                        >
                          <Table2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>
                            {connectedSheet
                              ? `Sheet: ${connectedSheet.title}`
                              : 'ตั้งค่า Sheet / Apps Script'}
                          </span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSheetsOpen(true)}
                        disabled={isAutoConnecting}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-[#0A4999] text-xs font-semibold hover:bg-sky-50 shadow-xs transition-colors whitespace-nowrap"
                      >
                        {isAutoConnecting ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Code2 className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                        <span>
                          {isAutoConnecting
                            ? 'กำลังเชื่อมต่ออัตโนมัติ...'
                            : 'เชื่อม Apps Script (Drive & Sheet)'}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </section>

              {/* Soft Warm Callout Banner */}
              <section
                aria-label="แถบแจ้งจุดท่อประปาแตกรั่วด่วน"
                className="rounded-xl sm:rounded-2xl bg-gradient-to-r from-[#FFFDF4] via-[#FFF8E3] to-[#FFFDF5] dark:from-slate-900 dark:via-amber-950/25 dark:to-slate-900 border border-amber-300/75 dark:border-amber-700/40 px-3.5 py-2.5 sm:px-6 sm:py-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-2.5 md:gap-4"
              >
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                    <Crosshair className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xs sm:text-base font-bold text-slate-900 dark:text-white leading-snug">
                      พบจุดท่อประปาแตกรั่วหรือน้ำซึมในเขตพื้นที่รับผิดชอบ?
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      ปักหมุดพิกัดบนแผนที่ได้ทันที ใช้เวลาไม่ถึง 1 นาที
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={handleStartPickNew}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-[#0D6EFD] text-white text-xs font-semibold hover:bg-[#0B5ED7] shadow-xs transition-colors whitespace-nowrap"
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>ปักหมุดแจ้งจุดรั่ว</span>
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setActiveView('table')}
                      className="hidden md:inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                    >
                      <Table2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      <span>ตารางรายการ DMA</span>
                    </button>
                  )}
                </div>
              </section>

              {/* Band 1 (Desktop only): Dashboard Summary + Donut Chart */}
              <div className="hidden md:block">
                <DashboardSummarySection
                  searchQuery={searchQuery}
                  selectedDma={selectedDma}
                  severityFilter={severityFilter}
                  allDmaOptions={allDmaOptions}
                  isAdmin={isAdmin}
                  stats={stats}
                  filteredLeaks={filteredLeaks}
                  onSearchChange={setSearchQuery}
                  onDmaChange={handleDmaChange}
                  onSeverityChange={setSeverityFilter}
                />
              </div>

              {/* Band 2 (Center): Map Section */}
              <section
                ref={mapSectionRef}
                aria-label="แผนที่จุดแตกรั่วท่อประปา"
                className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 border-t-[3px] border-t-[#16A34A] rounded-xl sm:rounded-2xl shadow-xs p-3 sm:p-5 md:p-6 space-y-2.5 sm:space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[#16A34A] text-white flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div>
                      <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                        แผนที่จุดแตกรั่วท่อประปา
                      </h2>
                      <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                        แสดงพิกัดจุดแตกรั่วตามสีระดับความเร่งด่วน และคลิกปักหมุดบนแผนที่
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleStartPickNew}
                    className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>ปักหมุดจุดรั่วบนแผนที่</span>
                  </button>
                </div>

                <div className="w-full h-[500px] sm:h-[500px] lg:h-[540px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 relative">
                  <LeakMapWorkspace
                    leaks={filteredLeaks}
                    selectedId={selectedId}
                    isPickingLocation={isPickingLocation}
                    pickingReason={pickingReason}
                    focusTarget={focusTarget}
                    draftPin={
                      drawerOpen && pickedCoords ? pickedCoords : null
                    }
                    theme={theme}
                    onSelectLeak={setSelectedId}
                    onPickMapLocation={handlePickMapLocation}
                    onStartPickNew={handleStartPickNew}
                    onCancelPick={() => {
                      setIsPickingLocation(false);
                      if (pendingDraft) {
                        setDrawerOpen(true);
                      }
                    }}
                    onEditLeak={handleOpenEdit}
                    onUpdatePosition={handleUpdatePosition}
                    onOpenLightbox={(photos, index, title) =>
                      setLightbox({photos, index, title})
                    }
                    onPanToLocation={panToLocation}
                  />
                </div>
              </section>
            </div>
          ) : (
            /* Admin DMA Table View (Desktop Admin Only) */
            <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 space-y-5">
              <div className="hidden md:block">
                <DashboardSummarySection
                  searchQuery={searchQuery}
                  selectedDma={selectedDma}
                  severityFilter={severityFilter}
                  allDmaOptions={allDmaOptions}
                  isAdmin={isAdmin}
                  stats={stats}
                  filteredLeaks={filteredLeaks}
                  onSearchChange={setSearchQuery}
                  onDmaChange={handleDmaChange}
                  onSeverityChange={setSeverityFilter}
                />
              </div>
              <LeakTableView
                leaks={filteredLeaks}
                dmas={dmas}
                searchQuery={searchQuery}
                selectedDma={selectedDma}
                severityFilter={severityFilter}
                hideToolbar
                onSearchChange={setSearchQuery}
                onDmaChange={handleDmaChange}
                onSeverityChange={setSeverityFilter}
                onFocusOnMap={handleFocusLeak}
                onPinOnMap={handlePinFromList}
                onEdit={handleOpenEdit}
                onDelete={handleDeleteLeak}
                onAddNew={handleOpenNew}
                onOpenReport={() => setReportOpen(true)}
                onOpenLightbox={(photos, index, title) =>
                  setLightbox({photos, index, title})
                }
              />
            </div>
          )}
        </main>

        {/* Create / Edit Leak Drawer */}
        <LeakDrawer
          isOpen={drawerOpen}
          initialLeak={editingLeak}
          pickedCoords={pickedCoords}
          existingDmas={dmas}
          leaks={leaks}
          defaultDma={selectedDma}
          isAdmin={isAdmin}
          onClose={() => {
            setDrawerOpen(false);
            setEditingLeak(null);
            setPendingDraft(null);
            setPickedCoords(null);
          }}
          onRequestMapPick={handleRequestMapPickFromDrawer}
          onSave={handleSaveLeak}
          onDelete={handleDeleteLeak}
          onOpenLightbox={(photos, index, title) =>
            setLightbox({photos, index, title})
          }
        />

        {/* Google Sheets & Drive Sync Modal (Admin only) */}
        {isAdmin && (
          <GoogleSheetsModal
            isOpen={sheetsOpen}
            user={googleUser}
            accessToken={accessToken}
            connectedSheet={connectedSheet}
            activeTab={activeSheetTab}
            appsScriptUrl={appsScriptUrl}
            appsScriptInfo={appsScriptInfo}
            leaks={leaks}
            onClose={() => setSheetsOpen(false)}
            onSaveAppsScriptUrl={(url, info) => {
              setAppsScriptUrl(url);
              saveAppsScriptUrl(url);
              setAppsScriptInfo(info);
            }}
            onSignIn={handleGoogleSignIn}
            onSignOut={handleGoogleSignOut}
            onConnectSheet={handleConnectSheet}
            onSelectTab={handleSelectTab}
            onImportFromSheet={handleImportFromSheet}
            onLeaksUpdated={handleLeaksUpdated}
            onMarkSynced={() => setPendingSheetSync(null)}
          />
        )}

        {/* Executive Excel / PDF Report Modal (Admin only) */}
        {isAdmin && (
          <ReportExportModal
            isOpen={reportOpen}
            leaks={leaks}
            initialDma={selectedDma}
            initialSeverity={severityFilter}
            initialSearchQuery={searchQuery}
            onClose={() => setReportOpen(false)}
          />
        )}

        {/* Fullscreen Photo Lightbox */}
        {lightbox && (
          <PhotoLightbox
            photos={lightbox.photos}
            activeIndex={lightbox.index}
            title={lightbox.title}
            onClose={() => setLightbox(null)}
            onChangeIndex={(idx) =>
              setLightbox((prev) => (prev ? {...prev, index: idx} : null))
            }
          />
        )}
      </div>
      )}

      {/* Admin Login Modal available from both LandingPage and Main Workspace */}
      <AdminLoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onLoginSuccess={(token, username) => {
          handleAdminLoginSuccess(token, username);
          setShowLanding(false);
        }}
      />
    </APIProvider>
  );
}
