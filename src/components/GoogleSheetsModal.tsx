import React, {useMemo, useState} from 'react';
import {User} from 'firebase/auth';
import {
  Check,
  CheckCircle2,
  CloudUpload,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  HardDrive,
  ImagePlus,
  Link2,
  LogOut,
  Plus,
  RefreshCw,
  Table2,
  Unlink,
  X,
} from 'lucide-react';
import {LeakPoint} from '../types/leak';
import {
  APPS_SCRIPT_CODE_TEMPLATE,
  AppsScriptConnectionInfo,
  fetchLeaksViaAppsScript,
  isValidAppsScriptUrl,
  syncLeaksViaAppsScript,
} from '../utils/appsScript';
import {
  DEFAULT_DRIVE_FOLDER_ID,
  DEFAULT_DRIVE_FOLDER_URL,
  findSpreadsheetInDrive,
  uploadPendingPhotosForLeaks,
} from '../utils/googleDrive';
import {
  createLeakSpreadsheet,
  extractSpreadsheetId,
  fetchSpreadsheetMeta,
  leakToSheetRow,
  openGoogleSheetPicker,
  readSheetValues,
  SHEET_HEADERS,
  sheetRowsToLeaks,
  SpreadsheetMeta,
  writeSheetValues,
} from '../utils/googleSheets';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  user: User | null;
  accessToken: string | null;
  connectedSheet: SpreadsheetMeta | null;
  activeTab: string;
  appsScriptUrl: string;
  appsScriptInfo: AppsScriptConnectionInfo | null;
  leaks: LeakPoint[];
  onClose: () => void;
  onSaveAppsScriptUrl: (
    url: string,
    info: AppsScriptConnectionInfo | null
  ) => void;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onConnectSheet: (meta: SpreadsheetMeta, tabName: string) => void;
  onSelectTab: (tabName: string) => void;
  onImportFromSheet: (loaded: LeakPoint[]) => Promise<void>;
  onLeaksUpdated: (updated: LeakPoint[]) => Promise<void>;
  onMarkSynced: () => void;
}

type ModalMode = 'apps_script' | 'oauth';

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  user,
  accessToken,
  connectedSheet,
  activeTab,
  appsScriptUrl,
  appsScriptInfo,
  leaks,
  onClose,
  onSaveAppsScriptUrl,
  onSignIn,
  onSignOut,
  onConnectSheet,
  onSelectTab,
  onImportFromSheet,
  onLeaksUpdated,
  onMarkSynced,
}) => {
  const [mode, setMode] = useState<ModalMode>('apps_script');
  const [scriptInput, setScriptInput] = useState(appsScriptUrl);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showCode, setShowCode] = useState(!appsScriptUrl);

  const [urlInput, setUrlInput] = useState(
    connectedSheet?.spreadsheetId || ''
  );
  const [newSheetTitle, setNewSheetTitle] = useState('LEAK');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Explicit confirmation state for mutating Google Drive / Sheet data via 1P OAuth
  const [pendingConfirm, setPendingConfirm] = useState<{
    action: 'push_all' | 'create_new' | 'upload_drive_only';
    title: string;
    description: string;
  } | null>(null);

  const pendingPhotoCount = useMemo(() => {
    let count = 0;
    for (const leak of leaks) {
      for (const p of leak.photos) {
        if (!p.driveFileId || !p.driveUrl) count++;
      }
    }
    return count;
  }, [leaks]);

  if (!isOpen) return null;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_CODE_TEMPLATE);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      setError('ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาเลือกข้อความในกล่องโค้ดแล้วกด Ctrl+C');
    }
  };

  const handleConnectAppsScript = async () => {
    const trimmed = scriptInput.trim();
    if (!isValidAppsScriptUrl(trimmed)) {
      setError(
        'กรุณาวางลิงก์ Google Apps Script Web App ให้ถูกต้อง (ขึ้นต้นด้วย https://script.google.com/macros/s/.../exec)'
      );
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setBusy('กำลังทดสอบการเชื่อมต่อ Google Apps Script และดึงข้อมูล...');
    try {
      const res = await fetchLeaksViaAppsScript(trimmed, leaks);
      onSaveAppsScriptUrl(trimmed, res.info);
      if (res.leaks.length > 0) {
        await onImportFromSheet(res.leaks);
        setSuccessMsg(
          `เชื่อมต่อ Apps Script สำเร็จ! โหลดข้อมูลจากชีต "${res.info.sheetTitle}" จำนวน ${res.leaks.length} รายการ และเปิดการซิงค์อัตโนมัติแล้ว`
        );
      } else {
        setSuccessMsg(
          `เชื่อมต่อ Apps Script สำเร็จกับไฟล์ "${res.info.sheetTitle}" แล้ว (กด "อัปโหลด & ส่งข้อมูลทั้งหมดขึ้นชีต" เพื่อส่งข้อมูลเริ่มต้นขึ้น Google Sheet ได้เลย)`
        );
      }
      setShowCode(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? `เชื่อมต่อ Apps Script ไม่สำเร็จ: ${err.message}`
          : 'ไม่สามารถเชื่อมต่อ Apps Script ได้ กรุณาตรวจสอบว่า Deploy เป็น "ทุกคน (Anyone)" แล้ว'
      );
    } finally {
      setBusy(null);
    }
  };

  const handleSyncNowAppsScript = async () => {
    const targetUrl = scriptInput.trim() || appsScriptUrl;
    if (!isValidAppsScriptUrl(targetUrl)) {
      setError('กรุณาเชื่อมต่อลิงก์ Apps Script Web App ก่อน');
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setBusy(
      pendingPhotoCount > 0
        ? `กำลังอัปโหลดรูป ${pendingPhotoCount} ภาพลง Drive และบันทึกข้อมูลผ่าน Apps Script...`
        : 'กำลังซิงค์ข้อมูลขึ้น Google Sheet ผ่าน Apps Script...'
    );
    try {
      const res = await syncLeaksViaAppsScript(targetUrl, leaks);
      onSaveAppsScriptUrl(targetUrl, res.info);
      await onLeaksUpdated(res.updatedLeaks);
      onMarkSynced();
      setSuccessMsg(
        `ซิงค์ข้อมูล ${res.updatedLeaks.length} รายการลง "${res.info.sheetTitle}"${
          res.uploadedCount > 0
            ? ` และอัปโหลดรูป ${res.uploadedCount} ภาพลง Google Drive`
            : ''
        } เรียบร้อย`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? `ส่งข้อมูลผ่าน Apps Script ไม่สำเร็จ: ${err.message}`
          : 'เกิดข้อผิดพลาดระหว่างซิงค์ข้อมูลผ่าน Apps Script'
      );
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnectAppsScript = () => {
    setScriptInput('');
    onSaveAppsScriptUrl('', null);
    setSuccessMsg('ยกเลิกการเชื่อมต่อ Apps Script แล้ว');
    setError(null);
    setShowCode(true);
  };

  const handleSignInClick = async () => {
    setError(null);
    setSuccessMsg(null);
    setBusy('กำลังเข้าสู่ระบบ Google และเชื่อมต่อ Drive / Sheet อัตโนมัติ...');
    try {
      await onSignIn();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'ไม่สามารถเข้าสู่ระบบ Google ได้'
      );
    } finally {
      setBusy(null);
    }
  };

  const handleAutoDetectInFolder = async () => {
    if (!accessToken) return;
    setError(null);
    setSuccessMsg(null);
    setBusy('กำลังค้นหาไฟล์ Google Sheet ในโฟลเดอร์ Google Drive...');
    try {
      const found = await findSpreadsheetInDrive(
        DEFAULT_DRIVE_FOLDER_ID,
        accessToken
      );
      if (!found) {
        setError(
          'ยังไม่พบไฟล์สเปรดชีตในโฟลเดอร์นี้ คุณสามารถเลือกไฟล์จาก Drive หรือสร้างไฟล์ LEAK ใหม่ได้ทันที'
        );
        return;
      }
      const meta = await fetchSpreadsheetMeta(found.id, accessToken);
      const firstTab = meta.sheetTitles[0] || 'Sheet1';
      setUrlInput(meta.spreadsheetId);
      onConnectSheet(meta, firstTab);
      setSuccessMsg(`ตรวจพบและเชื่อมต่อไฟล์ "${meta.title}" สำเร็จ`);
    } catch (err) {
      setError(
        err instanceof Error
          ? `ค้นหาไฟล์ไม่สำเร็จ: ${err.message}`
          : 'ไม่สามารถค้นหาไฟล์ใน Google Drive ได้'
      );
    } finally {
      setBusy(null);
    }
  };

  const handleOpenPicker = async () => {
    if (!accessToken) return;
    setError(null);
    setSuccessMsg(null);
    setBusy('กำลังเปิดหน้าต่างเลือกไฟล์ Google Sheets...');
    try {
      const picked = await openGoogleSheetPicker(accessToken);
      if (picked) {
        setBusy('กำลังโหลดข้อมูลหัวตาราง...');
        const meta = await fetchSpreadsheetMeta(picked.id, accessToken);
        const firstTab = meta.sheetTitles[0] || 'Sheet1';
        setUrlInput(meta.spreadsheetId);
        onConnectSheet(meta, firstTab);
        setSuccessMsg(`เชื่อมต่อไฟล์ "${meta.title}" สำเร็จ`);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'ไม่สามารถเลือกไฟล์จาก Google Drive ได้'
      );
    } finally {
      setBusy(null);
    }
  };

  const handleConnectByUrl = async () => {
    if (!accessToken) return;
    const id = extractSpreadsheetId(urlInput);
    if (!id) {
      setError('กรุณาวางลิงก์ Google Sheets หรือ Spreadsheet ID');
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setBusy('กำลังตรวจสอบ Google Sheet...');
    try {
      const meta = await fetchSpreadsheetMeta(id, accessToken);
      const firstTab = meta.sheetTitles[0] || 'Sheet1';
      onConnectSheet(meta, firstTab);
      setSuccessMsg(`เชื่อมต่อไฟล์ "${meta.title}" สำเร็จ`);
    } catch (err) {
      setError(
        err instanceof Error
          ? `ไม่สามารถเปิดไฟล์ได้: ${err.message}`
          : 'ไม่พบไฟล์ Google Sheet หรือไม่มีสิทธิ์เข้าถึง'
      );
    } finally {
      setBusy(null);
    }
  };

  const handlePullFromSheet = async () => {
    if (!accessToken || !connectedSheet || !activeTab) return;
    setError(null);
    setSuccessMsg(null);
    setBusy(`กำลังอ่านข้อมูลจากแท็บ "${activeTab}"...`);
    try {
      const values = await readSheetValues(
        connectedSheet.spreadsheetId,
        activeTab,
        accessToken
      );
      const parsed = sheetRowsToLeaks(values, leaks);
      if (parsed.length === 0) {
        setSuccessMsg('ไม่พบแถวข้อมูลในชีตนี้ (มีเฉพาะหัวตารางหรือชีตว่าง)');
      } else {
        await onImportFromSheet(parsed);
        setSuccessMsg(
          `ดึงข้อมูลจาก "${connectedSheet.title} / ${activeTab}" จำนวน ${parsed.length} รายการเข้าสู่แผนที่เรียบร้อย`
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? `อ่านข้อมูลไม่สำเร็จ: ${err.message}`
          : 'เกิดข้อผิดพลาดในการอ่าน Google Sheet'
      );
    } finally {
      setBusy(null);
    }
  };

  const executeConfirmedAction = async () => {
    if (!pendingConfirm || !accessToken) return;
    const action = pendingConfirm.action;
    setPendingConfirm(null);
    setError(null);
    setSuccessMsg(null);

    if (action === 'upload_drive_only') {
      setBusy('กำลังอัปโหลดรูปภาพหน้างานลง Google Drive...');
      try {
        const {updatedLeaks, uploadedCount} = await uploadPendingPhotosForLeaks(
          leaks,
          DEFAULT_DRIVE_FOLDER_ID,
          accessToken
        );
        await onLeaksUpdated(updatedLeaks);
        setSuccessMsg(
          uploadedCount > 0
            ? `อัปโหลดภาพถ่าย ${uploadedCount} ภาพลงโฟลเดอร์ Google Drive เรียบร้อย`
            : 'ภาพถ่ายทั้งหมดถูกอัปโหลดลง Google Drive แล้ว'
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? `อัปโหลดรูปไม่สำเร็จ: ${err.message}`
            : 'เกิดข้อผิดพลาดระหว่างอัปโหลดรูปขึ้น Google Drive'
        );
      } finally {
        setBusy(null);
      }
      return;
    }

    if (action === 'create_new') {
      setBusy('กำลังสร้างไฟล์ Google Sheet ใหม่ในโฟลเดอร์ Drive...');
      try {
        let workingLeaks = leaks;
        let uploadedCount = 0;

        if (pendingPhotoCount > 0) {
          setBusy(
            `กำลังอัปโหลดรูปภาพ ${pendingPhotoCount} ภาพลง Google Drive...`
          );
          const uploadRes = await uploadPendingPhotosForLeaks(
            leaks,
            DEFAULT_DRIVE_FOLDER_ID,
            accessToken
          );
          workingLeaks = uploadRes.updatedLeaks;
          uploadedCount = uploadRes.uploadedCount;
          await onLeaksUpdated(workingLeaks);
        }

        setBusy('กำลังสร้างไฟล์ Google Sheet และบันทึกข้อมูล...');
        const meta = await createLeakSpreadsheet(
          newSheetTitle.trim() || 'LEAK',
          accessToken,
          DEFAULT_DRIVE_FOLDER_ID
        );
        const firstTab = meta.sheetTitles[0] || 'รายการจุดแตกรั่ว';
        setUrlInput(meta.spreadsheetId);
        onConnectSheet(meta, firstTab);
        if (workingLeaks.length > 0) {
          const rows = [SHEET_HEADERS, ...workingLeaks.map(leakToSheetRow)];
          await writeSheetValues(
            meta.spreadsheetId,
            firstTab,
            rows,
            accessToken
          );
          onMarkSynced();
          setSuccessMsg(
            `สร้างไฟล์ "${meta.title}"${
              uploadedCount > 0 ? ` อัปโหลดรูป ${uploadedCount} ภาพลง Drive` : ''
            } และบันทึกข้อมูล ${workingLeaks.length} รายการเรียบร้อย`
          );
        } else {
          setSuccessMsg(
            `สร้างไฟล์ "${meta.title}" พร้อมหัวตาราง 12 คอลัมน์เรียบร้อย`
          );
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? `สร้างไฟล์ไม่สำเร็จ: ${err.message}`
            : 'เกิดข้อผิดพลาดในการสร้าง Google Sheet'
        );
      } finally {
        setBusy(null);
      }
      return;
    }

    if (action === 'push_all' && connectedSheet && activeTab) {
      setBusy('กำลังเตรียมอัปโหลดรูปภาพและซิงค์ข้อมูล...');
      try {
        let workingLeaks = leaks;
        let uploadedCount = 0;

        if (pendingPhotoCount > 0) {
          setBusy(
            `กำลังอัปโหลดรูปภาพ ${pendingPhotoCount} ภาพลงโฟลเดอร์ Google Drive...`
          );
          const uploadRes = await uploadPendingPhotosForLeaks(
            leaks,
            DEFAULT_DRIVE_FOLDER_ID,
            accessToken
          );
          workingLeaks = uploadRes.updatedLeaks;
          uploadedCount = uploadRes.uploadedCount;
          await onLeaksUpdated(workingLeaks);
        }

        setBusy(
          `กำลังบันทึก ${workingLeaks.length} รายการลง Google Sheet "${connectedSheet.title}"...`
        );
        const rows = [SHEET_HEADERS, ...workingLeaks.map(leakToSheetRow)];
        await writeSheetValues(
          connectedSheet.spreadsheetId,
          activeTab,
          rows,
          accessToken
        );
        onMarkSynced();
        setSuccessMsg(
          `${
            uploadedCount > 0
              ? `อัปโหลดรูป ${uploadedCount} ภาพลง Google Drive และ`
              : ''
          }อัปเดตข้อมูล ${workingLeaks.length} รายการลงใน "${
            connectedSheet.title
          } (${activeTab})" เรียบร้อยแล้ว`
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? `บันทึกไม่สำเร็จ: ${err.message}`
            : 'เกิดข้อผิดพลาดในการอัปเดต Google Sheet'
        );
      } finally {
        setBusy(null);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[1px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="เชื่อมต่อและซิงค์ข้อมูลกับ Google Drive และ Google Sheets"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-gradient-to-r from-[#0A4DA2] to-[#1976D2] text-white">
          <div className="flex items-center gap-2.5">
            <Table2 className="w-5 h-5 text-white" />
            <div>
              <h2 className="text-sm font-semibold">
                เชื่อมต่อ Google Drive และ Google Sheets อัตโนมัติ
              </h2>
              <p className="text-xs text-sky-100">
                แนะนำเชื่อมต่อผ่าน Google Apps Script เพื่อให้ทุกคนซิงค์รูปภาพและข้อมูลได้อัตโนมัติไม่ต้องล็อกอินซ้ำ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
            aria-label="ปิดหน้าต่าง Google Sheets"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-6 pt-3 pb-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setMode('apps_script');
              setError(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              mode === 'apps_script'
                ? 'bg-[#0A4DA2] text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            เชื่อมต่ออัตโนมัติผ่าน Apps Script (แนะนำ)
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('oauth');
              setError(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              mode === 'oauth'
                ? 'bg-[#0A4DA2] text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Table2 className="w-3.5 h-3.5" />
            เชื่อมต่อผ่านบัญชี Google (OAuth)
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto thin-scrollbar space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {busy && (
            <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-800 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              <span>{busy}</span>
            </div>
          )}

          {/* Target Google Drive Folder Info */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-sky-200 bg-sky-50/60 flex-wrap">
            <div className="flex items-center gap-2.5 min-w-0">
              <HardDrive className="w-4 h-4 text-sky-700 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900">
                  โฟลเดอร์เก็บรูปภาพ Google Drive ที่ตั้งค่าไว้
                </div>
                <div className="text-[11px] font-mono text-slate-600 truncate">
                  Folder ID: {DEFAULT_DRIVE_FOLDER_ID}
                </div>
              </div>
            </div>
            <a
              href={DEFAULT_DRIVE_FOLDER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline shrink-0"
            >
              เปิดโฟลเดอร์ Google Drive
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {mode === 'apps_script' ? (
            <div className="space-y-5">
              {/* Apps Script URL Form */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/60">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-[#0A4DA2]" />
                    <h3 className="text-xs font-semibold text-slate-900">
                      ลิงก์ Web App URL จาก Google Apps Script (/exec)
                    </h3>
                  </div>
                  {appsScriptUrl && (
                    <span className="text-[11px] font-semibold text-emerald-700">
                      เชื่อมต่ออัตโนมัติเปิดใช้งานอยู่
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={scriptInput}
                    onChange={(e) => setScriptInput(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="flex-1 px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                  />
                  <button
                    type="button"
                    onClick={handleConnectAppsScript}
                    disabled={Boolean(busy)}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#0A4DA2] text-white text-xs font-semibold hover:bg-[#083D84] disabled:opacity-60 shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    เชื่อมต่อและดึงข้อมูลอัตโนมัติ
                  </button>
                </div>

                {appsScriptUrl && (
                  <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-700 space-y-0.5">
                      <div>
                        ไฟล์ที่เชื่อมอยู่:{' '}
                        <strong className="text-slate-900">
                          {appsScriptInfo?.sheetTitle || 'LEAK'}
                        </strong>
                        {appsScriptInfo?.tabName
                          ? ` (แท็บ ${appsScriptInfo.tabName})`
                          : ''}
                      </div>
                      {appsScriptInfo?.spreadsheetUrl && (
                        <a
                          href={appsScriptInfo.spreadsheetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-sky-700 hover:underline"
                        >
                          เปิดไฟล์ Google Sheet
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={handleSyncNowAppsScript}
                        disabled={Boolean(busy)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <CloudUpload className="w-3.5 h-3.5" />
                        {pendingPhotoCount > 0
                          ? `อัปโหลดรูป (${pendingPhotoCount}) & ซิงค์ชีตทันที`
                          : `ส่งข้อมูลทั้งหมด (${leaks.length} จุด) ขึ้นชีต`}
                      </button>

                      <button
                        type="button"
                        onClick={handleDisconnectAppsScript}
                        disabled={Boolean(busy)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-600 hover:text-red-600 hover:border-red-200"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        ยกเลิกการเชื่อม
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Copyable Code.gs & Step-by-step setup */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowCode((v) => !v)}
                    className="flex items-center gap-2 text-xs font-semibold text-slate-900 hover:text-[#0A4DA2]"
                  >
                    <Code2 className="w-4 h-4 text-[#0A4DA2]" />
                    <span>
                      โค้ด Google Apps Script (Code.gs) สำหรับติดตั้งบน Google Drive / Sheet
                    </span>
                  </button>

                  <div className="flex items-center gap-2">
                    <a
                      href="https://script.google.com/home"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:underline"
                    >
                      เปิด Apps Script
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
                    >
                      {copiedCode ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          คัดลอกแล้ว
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          คัดลอกโค้ด Apps Script
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {showCode && (
                  <div className="p-4 space-y-3 bg-white">
                    <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside leading-relaxed">
                      <li>
                        เปิดไฟล์ Google Sheet <strong>LEAK</strong> แล้วเลือกเมนู{' '}
                        <strong>ส่วนขยาย (Extensions) &gt; Apps Script</strong>{' '}
                        (หรือสร้างโปรเจกต์ใหม่ที่{' '}
                        <span className="font-mono text-slate-800">
                          script.google.com
                        </span>
                        )
                      </li>
                      <li>
                        ลบโค้ดเดิมออกทั้งหมด แล้ววางโค้ดด้านล่างนี้ลงไป (ตั้งค่าโฟลเดอร์{' '}
                        <span className="font-mono text-slate-800">
                          {DEFAULT_DRIVE_FOLDER_ID}
                        </span>{' '}
                        และคอลัมน์ 12 ช่องไว้เรียบร้อยแล้ว) จากนั้นกดบันทึก
                      </li>
                      <li>
                        กดปุ่ม <strong>การทำให้ใช้งานได้ (Deploy) &gt; รายการใหม่ &gt; เว็บแอป (Web app)</strong>{' '}
                        ตั้งค่าสิทธิ์ผู้มีสิทธิ์เข้าถึงเป็น <strong>ทุกคน (Anyone)</strong>{' '}
                        แล้วคัดลอกลิงก์ <span className="font-mono">/exec</span>{' '}
                        มาวางในช่องด้านบน
                      </li>
                    </ol>

                    <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-60 thin-scrollbar leading-relaxed">
                      {APPS_SCRIPT_CODE_TEMPLATE}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* OAuth Mode */
            <>
              {!user || !accessToken ? (
                <div className="border border-slate-200 rounded-xl p-6 text-center space-y-4 bg-slate-50/50">
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-semibold text-slate-900">
                      เข้าสู่ระบบบัญชี Google เพื่อเชื่อม Drive และ Google Sheets อัตโนมัติ
                    </h3>
                    <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                      เมื่อลงชื่อเข้าใช้ ระบบจะเชื่อมโฟลเดอร์ Google Drive
                      และค้นหาสเปรดชีต LEAK ให้อัตโนมัติทันที
                    </p>
                  </div>

                  {/* Official Google Sign-In Button */}
                  <button
                    type="button"
                    onClick={handleSignInClick}
                    disabled={Boolean(busy)}
                    className="inline-flex items-center gap-3 px-4 py-2.5 rounded-md bg-white border border-[#747775] text-[#1f1f1f] text-sm font-medium hover:bg-slate-50 shadow-xs transition-colors disabled:opacity-60"
                  >
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      className="w-[18px] h-[18px] block shrink-0"
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                    <span>Sign in with Google</span>
                  </button>
                </div>
              ) : (
                <>
                  {/* Account Bar */}
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName || 'Google User'}
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded-full shrink-0"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {user.displayName || 'บัญชี Google'}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {user.email}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={onSignOut}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-xs text-slate-700 hover:bg-slate-100 shrink-0"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      ออกจากระบบ
                    </button>
                  </div>

                  {/* Drive Photo Status Banner */}
                  {pendingPhotoCount > 0 && (
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-amber-200 bg-amber-50/70 flex-wrap">
                      <div className="text-xs text-amber-950">
                        มีภาพถ่ายหน้างานที่ยังไม่ได้อัปโหลดขึ้น Google Drive จำนวน{' '}
                        <strong className="tabular-nums">
                          {pendingPhotoCount}
                        </strong>{' '}
                        ภาพ
                      </div>
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          setPendingConfirm({
                            action: 'upload_drive_only',
                            title: `อัปโหลดรูปภาพ ${pendingPhotoCount} ภาพลง Google Drive?`,
                            description: `ระบบจะอัปโหลดภาพถ่ายหน้างานที่ค้างอยู่ทั้งหมดไปยังโฟลเดอร์ Google Drive (${DEFAULT_DRIVE_FOLDER_ID})`,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-700 text-white text-xs font-medium hover:bg-amber-800 disabled:opacity-60"
                      >
                        <ImagePlus className="w-3.5 h-3.5" />
                        อัปโหลดรูปขึ้น Drive ทันที
                      </button>
                    </div>
                  )}

                  {/* Step 2: Select or Create Google Sheet */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h3 className="text-xs font-semibold text-slate-900">
                        ไฟล์ Google Sheets ที่ต้องการเชื่อมต่อ
                      </h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={handleAutoDetectInFolder}
                          disabled={Boolean(busy)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-200 bg-sky-50 text-sky-800 text-xs font-medium hover:bg-sky-100 disabled:opacity-60"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          ค้นหาไฟล์ในโฟลเดอร์อัตโนมัติ
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenPicker}
                          disabled={Boolean(busy)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-60"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          เลือกไฟล์จาก Google Drive
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="วางลิงก์ Google Sheets หรือ Spreadsheet ID (เช่น https://docs.google.com/spreadsheets/d/...)"
                        className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                      />
                      <button
                        type="button"
                        onClick={handleConnectByUrl}
                        disabled={Boolean(busy)}
                        className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 shrink-0"
                      >
                        เชื่อมต่อลิงก์นี้
                      </button>
                    </div>

                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <input
                        type="text"
                        value={newSheetTitle}
                        onChange={(e) => setNewSheetTitle(e.target.value)}
                        placeholder="ชื่อไฟล์ใหม่ (เช่น LEAK)"
                        className="w-48 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                      />
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          setPendingConfirm({
                            action: 'create_new',
                            title: `สร้าง Google Sheet ใหม่ชื่อ "${
                              newSheetTitle.trim() || 'LEAK'
                            }" ในโฟลเดอร์ Drive?`,
                            description:
                              leaks.length > 0
                                ? `ระบบจะสร้างไฟล์สเปรดชีตใหม่ในโฟลเดอร์ Google Drive (${DEFAULT_DRIVE_FOLDER_ID})${
                                    pendingPhotoCount > 0
                                      ? ` อัปโหลดรูปภาพ ${pendingPhotoCount} ภาพลง Drive`
                                      : ''
                                  } และบันทึกรายการจุดแตกรั่วทั้งหมด ${
                                    leaks.length
                                  } รายการลงในชีต`
                                : `ระบบจะสร้างไฟล์สเปรดชีตใหม่ในโฟลเดอร์ Google Drive (${DEFAULT_DRIVE_FOLDER_ID}) พร้อมหัวตาราง 12 คอลัมน์ตามโครงสร้าง LEAK`,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        สร้างไฟล์ใหม่ในโฟลเดอร์ Drive
                      </button>
                    </div>
                  </div>

                  {/* Step 3: Connected Sheet Actions */}
                  {connectedSheet && (
                    <div className="border border-slate-200 rounded-xl p-4 space-y-4 bg-slate-50/70">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="text-xs font-semibold text-slate-900">
                            ไฟล์ที่เชื่อมต่ออยู่: {connectedSheet.title}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                            ID: {connectedSheet.spreadsheetId}
                          </div>
                        </div>

                        <a
                          href={`https://docs.google.com/spreadsheets/d/${connectedSheet.spreadsheetId}/edit`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline"
                        >
                          เปิดใน Google Sheets
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <label className="text-xs font-medium text-slate-700">
                          ชีต / แท็บ:
                        </label>
                        <select
                          value={activeTab}
                          onChange={(e) => onSelectTab(e.target.value)}
                          className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800"
                        >
                          {connectedSheet.sheetTitles.map((tab) => (
                            <option key={tab} value={tab}>
                              {tab}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={handlePullFromSheet}
                          disabled={Boolean(busy)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                        >
                          <Download className="w-3.5 h-3.5 text-sky-600" />
                          ดึงข้อมูลจาก Google Sheet เข้าแผนที่
                        </button>

                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            setPendingConfirm({
                              action: 'push_all',
                              title:
                                pendingPhotoCount > 0
                                  ? `อัปโหลดรูป ${pendingPhotoCount} ภาพลง Drive และอัปเดตลง Google Sheet "${connectedSheet.title}"?`
                                  : `อัปเดตข้อมูลลง Google Sheet "${connectedSheet.title}"?`,
                              description: `${
                                pendingPhotoCount > 0
                                  ? `ระบบจะอัปโหลดรูปภาพ ${pendingPhotoCount} ภาพไปยังโฟลเดอร์ Google Drive และ`
                                  : 'ระบบจะ'
                              }เขียนทับข้อมูลช่วง A1:L${
                                leaks.length + 1
                              } ในแท็บ "${activeTab}" ด้วยรายการจุดแตกรั่วทั้งหมด ${
                                leaks.length
                              } รายการ (รวมลิงก์รูปภาพในคอลัมน์ L)`,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60"
                        >
                          <CloudUpload className="w-3.5 h-3.5" />
                          {pendingPhotoCount > 0
                            ? `อัปโหลดรูปที่ค้าง (${pendingPhotoCount}) ขึ้น Drive & ซิงค์ชีต`
                            : `ส่งข้อมูลทั้งหมด (${leaks.length} จุด) ขึ้น Google Sheet`}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Explicit Confirmation Dialog for Mutating Operations */}
                  {pendingConfirm && (
                    <div className="border border-amber-300 bg-amber-50 rounded-xl p-4 space-y-3">
                      <div className="space-y-1">
                        <h4 className="text-xs font-semibold text-amber-950">
                          {pendingConfirm.title}
                        </h4>
                        <p className="text-xs text-amber-900 leading-relaxed">
                          {pendingConfirm.description}
                        </p>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setPendingConfirm(null)}
                          className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="button"
                          onClick={executeConfirmedAction}
                          className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                        >
                          ยืนยันบันทึกข้อมูล
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
