import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  HelpCircle, 
  ArrowRight, 
  Download, 
  Layers, 
  RefreshCw 
} from 'lucide-react';
import { SystemState } from '../types';

interface OnboardingMigrasiScreenProps {
  onRefreshParent: () => void;
  systemState: SystemState | null;
  activeRole: string;
}

export const OnboardingMigrasiScreen: React.FC<OnboardingMigrasiScreenProps> = ({
  onRefreshParent,
  systemState,
  activeRole
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      const ext = droppedFile.name.split('.').pop()?.toLowerCase();
      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        setFile(droppedFile);
        setErrorMessage(null);
      } else {
        setErrorMessage("Format file tidak didukung. Harap unggah file XLSX, XLS, atau CSV.");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setErrorMessage(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/onboarding/import-excel', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMessage(data.message || "Seluruh data legacy onboarded successfully.");
        setImportedCount(data.rows_imported || 1);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        onRefreshParent();
      } else {
        setErrorMessage(data.error || "Gagal memproses data onboarding.");
      }
    } catch (err: any) {
      setErrorMessage("Koneksi gagal: Tidak dapat menghubungi server.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "Nama Wilayah": "Wilayah Bogor",
        "Nama Kelompok": "Kelompok Anggrek 05",
        "Tanggal Mulai Siklus": "2026-05-18",
        "Tenor": 5,
        "Nama Anggota": "Nenden Herlina",
        "NIK": "3201025508820004",
        "Plafon": 5000000,
        "Minggu Berjalan": 3
      },
      {
        "Nama Wilayah": "Wilayah Bogor",
        "Nama Kelompok": "Kelompok Anggrek 05",
        "Tanggal Mulai Siklus": "2026-05-18",
        "Tenor": 5,
        "Nama Anggota": "Lilis Rohayati",
        "NIK": "3201026112830005",
        "Plafon": 5000000,
        "Minggu Berjalan": 3
      },
      {
        "Nama Wilayah": "Wilayah Bandung",
        "Nama Kelompok": "Kelompok Rosella 02",
        "Tanggal Mulai Siklus": "2026-05-25",
        "Tenor": 10,
        "Nama Anggota": "Ratna Lestari",
        "NIK": "3214055204850006",
        "Plafon": 6000000,
        "Minggu Berjalan": 2
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Format Onboarding");
    XLSX.writeFile(workbook, "Template_Onboarding_Legacy_Sekawan.xlsx");
  };

  return (
    <div className="space-y-6" id="onboarding_legacy_screen">
      
      {/* Header Panel */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-mono font-bold rounded-full border border-indigo-150 uppercase tracking-wider">
                Menu Onboarding
              </span>
              <span className="text-slate-400">•</span>
              <h2 className="text-xs font-mono font-bold text-slate-800">ROLE: ADMIN</h2>
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="text-indigo-600" size={24} />
              Onboarding Data Legacy (Excel / CSV)
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Fasilitas import bulk migrasi data siklus berjalan dari cabang legacy. Sistem secara otomatis menerapkan validasi ketat, meng-upsert wilayah/kelompok, mendaftarkan anggota, serta menerbitkan jadwal penagihan dan menandai pembayaran minggu sebelumnya sebagai lunas terposting.
            </p>
          </div>
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 px-3.5 py-1.8 text-xs font-bold text-indigo-650 bg-indigo-50 hover:bg-indigo-100 border border-indigo-150 rounded-lg transition-all"
            id="download_template_btn"
          >
            <Download size={14} />
            Unduh Template Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Excel Upload and Transaction State (Col 7) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Main Upload Box */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2 font-mono uppercase tracking-wider">
              <Upload className="text-slate-500" size={16} />
              Unggah File Legacy
            </h3>

            <form onSubmit={handleUpload} className="space-y-4">
              
              {/* Drag and Drop Area */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  dragActive 
                    ? 'border-indigo-600 bg-indigo-50/40' 
                    : file 
                      ? 'border-emerald-500 bg-emerald-50/10' 
                      : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50'
                }`}
                id="drop_zone"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                
                <FileSpreadsheet 
                  className={`mx-auto mb-3 transition-colors ${
                    file ? 'text-emerald-500' : 'text-slate-400'
                  }`} 
                  size={42} 
                />

                {file ? (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-900">{file.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {(file.size / 1024).toFixed(1)} KB • Siap diproses
                    </p>
                    <p className="text-[10px] text-indigo-600 underline mt-2">
                      Klik untuk mengganti file
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      Tarik & lepas file di sini, atau klik untuk memilih file
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Mendukung file berekstensi .xlsx, .xls, atau .csv
                    </p>
                  </div>
                )}
              </div>

              {/* Action Handlers */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                  <Layers size={12} />
                  PRISMA TRANSACTION AUTOMATIC ROLLBACK
                </span>
                
                <button
                  type="submit"
                  disabled={!file || isUploading}
                  className="px-5 py-2.5 bg-indigo-650 hover:bg-slate-950 text-white font-bold text-xs rounded-lg transition-all shadow-sm disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="animate-spin" size={14} />
                      Sedang Mengunggah & Memvalidasi...
                    </>
                  ) : (
                    <>
                      Mulai Proses Onboarding Bulk
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Feedback Messages */}
          {successMessage && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex items-start gap-3">
              <CheckCircle className="text-emerald-600 shrink-0 mt-0.5" size={18} />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-emerald-900">Onboarding Selesai Dengan Sukses</h4>
                <p className="text-xs text-emerald-700">{successMessage}</p>
                <p className="text-[10px] text-emerald-650 font-mono mt-1 font-semibold">
                  • Seluruh baris legacy berhasil diimpor sebagai satu transaksi batch ACID.
                </p>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-3">
              <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={18} />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-red-900">Validasi Data Gagal (Transaksi Dibatalkan)</h4>
                <p className="text-xs text-red-700 font-mono text-[11px] bg-white border border-red-150 p-2 rounded mt-1 shadow-sm leading-relaxed">
                  {errorMessage}
                </p>
                <p className="text-[10px] text-red-500 mt-2 font-mono">
                  * Aturan Proteksi Prisma Transaction diaktifkan: Tidak ada data setengah masuk atau terganggu sebagian. Perbaiki baris di atas dan unggah kembali file Excel Anda.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Right Column: Mapping Rules & Structural Guidelines (Col 5) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Rules Card */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2 font-mono uppercase tracking-wider">
              <HelpCircle className="text-slate-500" size={16} />
              Peta Aturan Kolom (Spreadsheet)
            </h3>
            
            <div className="space-y-4 text-xs">
              <p className="text-slate-500 leading-relaxed text-[11px]">
                Sistem membaca lembar kerja pertama di file Excel/CSV. Harap pastikan header kolom mencakup nama-nama berikut (besar kecil huruf didukung otomatis):
              </p>
              
              <div className="divide-y divide-slate-100 font-mono text-[11px]">
                
                <div className="py-2 flex justify-between gap-2.5">
                  <span className="font-bold text-slate-800">Nama Wilayah</span>
                  <span className="text-slate-500 text-right">Nama wilayah legacy, di-upsert otomatis ke DB.</span>
                </div>

                <div className="py-2 flex justify-between gap-2.5">
                  <span className="font-bold text-slate-800">Nama Kelompok</span>
                  <span className="text-slate-500 text-right">Nama kelompok, di-upsert otomatis dan ditautkan ke wilayah.</span>
                </div>

                <div className="py-2 flex justify-between gap-2.5">
                  <span className="font-bold text-slate-800">Tanggal Mulai Siklus</span>
                  <span className="text-slate-500 text-right">YYYY-MM-DD (format tanggal mulai masa siklus).</span>
                </div>

                <div className="py-2 flex justify-between gap-2.5">
                  <span className="font-bold text-slate-800">Tenor</span>
                  <span className="text-slate-500 text-right">Angka minggu (misal: 5 atau 10 minggu).</span>
                </div>

                <div className="py-2 flex justify-between gap-2.5">
                  <span className="font-bold text-slate-800">Nama Anggota</span>
                  <span className="text-slate-500 text-right">Nama nasabah yang di-onboarding.</span>
                </div>

                <div className="py-2 flex justify-between gap-2.5">
                  <span className="font-bold text-slate-800">NIK</span>
                  <span className="text-slate-500 text-right">16-digit unik. Diuji dari duplikasi DB & file.</span>
                </div>

                <div className="py-2 flex justify-between gap-2.5">
                  <span className="font-bold text-slate-800">Plafon</span>
                  <span className="text-slate-500 text-right">Angka plafon kredit pembiayaan (misal: 5000000).</span>
                </div>

                <div className="py-2 flex justify-between gap-2.5">
                  <span className="font-bold text-slate-800">Minggu Berjalan</span>
                  <span className="text-slate-500 text-right">Misal: 3. Semua tagihan &lt; minggu 3 ditandai lunas.</span>
                </div>

              </div>

              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-150 text-[10.5px] leading-relaxed text-slate-500">
                <strong className="text-slate-800 block mb-0.5">💡 Cara Kerja Auto-Lunas Tagihan</strong>
                Jika kolom <strong>Minggu Berjalan</strong> berisi angka <strong>3</strong>, maka tagihan Minggu ke-1 dan Minggu ke-2 otomatis terbayar penuh. Jurnal Buku Besar (Aset Kas Bank bertambah, Piutang Pokok berkurang, Pendapatan Jasa bertambah) diterbitkan secara realtime.
              </div>

            </div>
          </div>

          {/* Current System Overview statistics */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 text-xs">
            <h4 className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wider mb-3">
              Status Data Sistem Saat Ini
            </h4>
            <div className="grid grid-cols-2 gap-3 font-mono">
              <div className="p-3 bg-slate-50/60 rounded-lg border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase">Wilayah Terdaftar</span>
                <span className="text-base font-bold text-slate-800">
                  {systemState?.regions?.length || 0} Wilayah
                </span>
              </div>
              <div className="p-3 bg-slate-50/60 rounded-lg border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase">Kelompok Aktif</span>
                <span className="text-base font-bold text-slate-800">
                  {systemState?.groups?.length || 0} Kelompok
                </span>
              </div>
              <div className="p-3 bg-slate-50/60 rounded-lg border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase">Jumlah Nasabah</span>
                <span className="text-base font-bold text-slate-800">
                  {systemState?.customers?.length || 0} Jiwa
                </span>
              </div>
              <div className="p-3 bg-slate-50/60 rounded-lg border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase">Schedules Aktif</span>
                <span className="text-base font-bold text-slate-800">
                  {systemState?.billingSchedules?.length || 0} Baris
                </span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
