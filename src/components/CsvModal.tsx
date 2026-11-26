import React, {useRef, useState} from 'react';
import {Download, FileSpreadsheet, Upload, X} from 'lucide-react';
import {LeakPoint} from '../types/leak';
import {
  downloadCsvFile,
  exportLeaksToCsv,
  importLeaksFromCsv,
} from '../utils/csv';

interface CsvModalProps {
  isOpen: boolean;
  leaks: LeakPoint[];
  onClose: () => void;
  onImport: (imported: LeakPoint[], mode: 'append' | 'replace') => void;
}

export const CsvModal: React.FC<CsvModalProps> = ({
  isOpen,
  leaks,
  onClose,
  onImport,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewRows, setPreviewRows] = useState<LeakPoint[]>([]);
  const [fileName, setFileName] = useState('');
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = importLeaksFromCsv(text);
      if (parsed.length === 0) {
        setError(
          'ไม่พบแถวข้อมูลในไฟล์ CSV กรุณาตรวจสอบหัวตาราง DMA,NO,รายละเอียดงาน,วันที่,ตำแหน่ง'
        );
        setPreviewRows([]);
        return;
      }
      setPreviewRows(parsed);
    } catch {
      setError('ไม่สามารถอ่านไฟล์ CSV ได้ กรุณาตรวจสอบรูปแบบ UTF-8');
      setPreviewRows([]);
    }
  };

  const handleConfirmImport = () => {
    if (previewRows.length === 0) return;
    onImport(previewRows, importMode);
    setPreviewRows([]);
    setFileName('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[1px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="นำเข้าและส่งออกข้อมูล CSV"
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-sky-600" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                นำเข้า / ส่งออกไฟล์ CSV (DMA, NO, รายละเอียดงาน, วันที่, ตำแหน่ง)
              </h2>
              <p className="text-xs text-slate-500">
                รองรับเทมเพลต DMA,NO,รายละเอียดงาน,วันที่,ตำแหน่ง และคอลัมน์พิกัด LAT,LNG
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="ปิดหน้าต่าง CSV"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {/* Export Section */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-900">
              ส่งออกข้อมูลเป็นไฟล์ CSV (รองรับภาษาไทยใน Excel)
            </h3>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() =>
                  downloadCsvFile(
                    `leak_report_full_${new Date().toISOString().slice(0, 10)}.csv`,
                    exportLeaksToCsv(leaks, 'full')
                  )
                }
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                ส่งออกรายงานฉบับเต็ม ({leaks.length} จุด + พิกัด)
              </button>

              <button
                type="button"
                onClick={() =>
                  downloadCsvFile(
                    `LEAK_${new Date().toISOString().slice(0, 10)}.csv`,
                    exportLeaksToCsv(leaks, 'compact')
                  )
                }
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                ส่งออกรูปแบบ DMA,NO,รายละเอียดงาน,วันที่,ตำแหน่ง
              </button>

              <button
                type="button"
                onClick={() =>
                  downloadCsvFile(
                    'LEAK_template.csv',
                    '\uFEFFDMA,NO,วันที่,รายละเอียดงาน,ตำแหน่ง (สถานที่และพิกัดบนแผนที่),ตำแหน่ง / ชื่อถนน / ซอย / จุดสังเกต,ชนิดและขนาดท่อ,ผู้รับผิดชอบ / ทีมช่าง,วิธีแก้ไข / ผลการซ่อมแซม,สถานะการแก้ไข,ระดับความเร่งด่วน,ภาพถ่ายหน้างาน\r\nDMA-01,01,2026-11-25,ท่อเมน PVC 150 มม. รั่วซึม,"ถ.ประชาราษฎร์ (13.819500, 100.519000)",ถ.ประชาราษฎร์ ซอย 5,PVC Ø 150 มม.,ทีม A,รัดแคลมป์สแตนเลส,รอแก้ไข,ปานกลาง (น้ำซึมขัง),0'
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sky-700 text-xs font-medium hover:bg-sky-50 transition-colors"
              >
                ดาวน์โหลดไฟล์ตัวอย่าง (12 คอลัมน์)
              </button>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Import Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-900">
              นำเข้าข้อมูลจุดรั่วจากไฟล์ CSV
            </h3>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                void handleFileChange(e.target.files?.[0]);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border border-dashed border-slate-300 rounded-lg p-5 text-center hover:border-sky-500 hover:bg-sky-50/40 transition-colors"
            >
              <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1.5" />
              <p className="text-xs font-medium text-slate-700">
                {fileName
                  ? `เลือกไฟล์แล้ว: ${fileName}`
                  : 'คลิกเพื่อเลือกไฟล์ .csv (DMA,NO,รายละเอียดงาน,วันที่,ตำแหน่ง)'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                หากคอลัมน์ตำแหน่งมีพิกัด Lat,Lng ระบบจะปักหมุดให้อัตโนมัติ หรือมากดปักหมุดบนแผนที่ทีหลังได้ทันที
              </p>
            </button>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {error}
              </div>
            )}

            {previewRows.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-700">
                    พบข้อมูลพร้อมนำเข้า {previewRows.length} รายการ
                  </span>
                  <div className="flex items-center gap-3 text-xs">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'append'}
                        onChange={() => setImportMode('append')}
                      />
                      เพิ่มต่อจากข้อมูลเดิม
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                      />
                      แทนที่ข้อมูลทั้งหมด
                    </label>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500">
                      <tr>
                        <th className="py-2 px-3">DMA</th>
                        <th className="py-2 px-2">NO</th>
                        <th className="py-2 px-3">รายละเอียดงาน</th>
                        <th className="py-2 px-3">วันที่</th>
                        <th className="py-2 px-3">ตำแหน่ง</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewRows.slice(0, 20).map((row) => (
                        <tr key={row.id}>
                          <td className="py-2 px-3 font-mono">{row.dma}</td>
                          <td className="py-2 px-2 font-mono">{row.no}</td>
                          <td className="py-2 px-3 text-slate-700 truncate max-w-[220px]">
                            {row.workDetails}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {row.reportDate}
                          </td>
                          <td className="py-2 px-3 text-[11px] text-slate-500 truncate max-w-[160px]">
                            {row.lat !== null && row.lng !== null
                              ? `${row.lat.toFixed(4)}, ${row.lng.toFixed(4)}`
                              : row.locationName || 'รอปักหมุด'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewRows([]);
                      setFileName('');
                    }}
                    className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    ล้างรายการ
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    className="px-4 py-2 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700"
                  >
                    ยืนยันนำเข้า {previewRows.length} รายการ
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
