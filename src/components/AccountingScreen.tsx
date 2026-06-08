import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Plus, 
  X, 
  TrendingUp, 
  Calculator, 
  Layers, 
  BookOpen, 
  ArrowRightLeft, 
  Check, 
  Download, 
  DownloadCloud,
  FileSpreadsheet,
  Calendar,
  AlertCircle,
  TrendingDown,
  RefreshCw,
  Cpu,
  Bookmark
} from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface AccountingScreenProps {
  onRefreshParent: () => void;
  activeUser: any;
  forcedSubTab?: 'REPORTS' | 'LEDGER' | 'ASSETS' | 'FUNDING' | 'BADDEBT';
}

const OFFLINE_COA = [
  { code: '1110', name: '1110 - Kas Kecil' },
  { code: '1111', name: '1111 - Kas di Tangan Petugas' },
  { code: '1112', name: '1112 - Kas Bank' },
  { code: '1210', name: '1210 - Piutang Pokok' },
  { code: '1220', name: '1220 - Piutang Tunggakan' },
  { code: '1230', name: '1230 - Piutang Tak Tertagih' },
  { code: '1310', name: '1310 - Aset Tetap - Peralatan/Inventaris' },
  { code: '1311', name: '1311 - Akumulasi Penyusutan Aset Tetap' },
  { code: '2110', name: '2110 - Utang Deposito' },
  { code: '2120', name: '2120 - Utang Pihak Ketiga' },
  { code: '2140', name: '2140 - Utang Titipan Kas Kelompok/Anggota' },
  { code: '3100', name: '3100 - Modal Disetor' },
  { code: '3300', name: '3300 - Ikhtisar Laba/Rugi' },
  { code: '4110', name: '4110 - Pendapatan Jasa' },
  { code: '4120', name: '4120 - Pendapatan Uang Pangkal (UP)' },
  { code: '5100', name: '5100 - Beban OPEX - Bensin' },
  { code: '5110', name: '5110 - Beban OPEX - Gaji' },
  { code: '5120', name: '5120 - Beban OPEX - ATK' },
  { code: '5130', name: '5130 - Beban OPEX - Listrik & Air' },
  { code: '5140', name: '5140 - Beban OPEX - Lainnya' },
  { code: '5200', name: '5200 - Beban Penyusutan Aset Tetap' }
];

export default function AccountingScreen({ onRefreshParent, activeUser, forcedSubTab }: AccountingScreenProps) {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<any>(null);
  const [fixedAssets, setFixedAssets] = useState<any[]>([]);
  const [fundingLogs, setFundingLogs] = useState<any[]>([]);
  const [errorStr, setErrorStr] = useState<string | null>(null);
  const [successStr, setSuccessStr] = useState<string | null>(null);

  // Sub Tab states (REPORTS | LEDGER | ASSETS | FUNDING | BADDEBT)
  const [activeSubTab, setActiveSubTab] = useState<'REPORTS' | 'LEDGER' | 'ASSETS' | 'FUNDING' | 'BADDEBT'>(forcedSubTab || 'REPORTS');

  useEffect(() => {
    if (forcedSubTab) {
      setActiveSubTab(forcedSubTab);
    }
  }, [forcedSubTab]);

  // Slide-out Drawer state
  const [drawerType, setDrawerType] = useState<'NONE' | 'ASSET' | 'FUNDING' | 'BADDEBT' | 'MANUAL_JOURNAL'>('NONE');

  // Manual Journal form states
  const [manualRef, setManualRef] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualLines, setManualLines] = useState<Array<{ account_code: string; debit: string; credit: string }>>([
    { account_code: '1110', debit: '', credit: '' },
    { account_code: '1111', debit: '', credit: '' }
  ]);

  // Add Asset form states
  const [assetName, setAssetName] = useState('');
  const [assetCost, setAssetCost] = useState('');
  const [assetSalvage, setAssetSalvage] = useState('');
  const [assetLife, setAssetLife] = useState('12');
  const [assetDate, setAssetDate] = useState(new Date().toISOString().split('T')[0]);

  // Add Funding form states
  const [fundingType, setFundingType] = useState<'UTANG' | 'MODAL'>('UTANG');
  const [fundingAmount, setFundingAmount] = useState('');
  const [fundingSource, setFundingSource] = useState('');
  const [fundingDescription, setFundingDescription] = useState('');

  // Add Bad debt form states
  const [writeOffCustomer, setWriteOffCustomer] = useState('');
  const [writeOffAmount, setWriteOffAmount] = useState('');
  const [writeOffDescription, setWriteOffDescription] = useState('');

  // Date range filters for SAK reports
  const [startDate, setStartDate] = useState('2026-06-01');
  const [endDate, setEndDate] = useState('2026-06-30');

  const fetchReportsData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/accounting/reports?startDate=${startDate}&endDate=${endDate}`);
      const json = await res.json();
      if (json.trialBalance) {
        setReports(json);
      } else {
        setErrorStr("Gagal memuat laporan keuangan.");
      }
    } catch (err: any) {
      setErrorStr("Gagal menghubungi server.");
    } finally {
      setLoading(false);
    }
  };

  const fetchAssetsAndFunding = async () => {
    try {
      const resAssets = await fetch("/api/accounting/fixed-assets");
      const jsonAssets = await resAssets.json();
      if (jsonAssets.success) {
        setFixedAssets(jsonAssets.data);
      }

      const resFunding = await fetch("/api/accounting/liabilities-capital");
      const jsonFunding = await resFunding.json();
      if (jsonFunding.success) {
        setFundingLogs(jsonFunding.data);
      }
    } catch (err: any) {
      console.error("Gagal menjurnal data aset/utang", err);
    }
  };

  useEffect(() => {
    fetchReportsData();
    fetchAssetsAndFunding();
  }, [startDate, endDate, activeSubTab]);

  const triggerSuccess = (msg: string) => {
    setSuccessStr(msg);
    setTimeout(() => setSuccessStr(null), 5000);
  };

  const triggerError = (msg: string) => {
    setErrorStr(msg);
    setTimeout(() => setErrorStr(null), 5000);
  };

  // Submit Fixed Asset
  const handleAssetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetName.trim() || !assetCost || Number(assetCost) <= 0) {
      triggerError("Keterangan aset dan biaya perolehan wajib valid.");
      return;
    }

    try {
      const res = await fetch("/api/accounting/fixed-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: assetName.trim(),
          acquisition_cost: Number(assetCost),
          salvage_value: Number(assetSalvage) || 0,
          useful_life: Number(assetLife),
          purchase_date: assetDate
        })
      });
      const data = await res.json();
      if (data.success) {
        triggerSuccess(data.message);
        setAssetName('');
        setAssetCost('');
        setAssetSalvage('');
        setDrawerType('NONE');
        fetchAssetsAndFunding();
        fetchReportsData();
        onRefreshParent();
      } else {
        triggerError(data.error);
      }
    } catch (err: any) {
      triggerError("Gagal menyimpan aset tetap.");
    }
  };

  // Submit Manual Journal (Balanced Double-Entry Bookkeeping)
  const handleManualJournalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualRef.trim()) {
      triggerError("Nomor referensi Jurnal SAK wajib diisi.");
      return;
    }
    if (!manualDesc.trim()) {
      triggerError("Memo detail peruntukan transaksi wajib diisi.");
      return;
    }

    const payloadLines = manualLines.map(line => ({
      account_code: line.account_code,
      debit: Number(line.debit) || 0,
      credit: Number(line.credit) || 0
    }));

    const totalDeb = payloadLines.reduce((sum, l) => sum + l.debit, 0);
    const totalCred = payloadLines.reduce((sum, l) => sum + l.credit, 0);

    if (totalDeb === 0 && totalCred === 0) {
      triggerError("Jumlah debit dan kredit transaksi tidak boleh kosong.");
      return;
    }

    if (Math.abs(totalDeb - totalCred) > 0.01) {
      triggerError(`Saldo ayat Jurnal tidak seimbang! Total Debit (Rp ${totalDeb.toLocaleString('id-ID')}) harus sama dengan Kredit (Rp ${totalCred.toLocaleString('id-ID')}). Selisih: Rp ${Math.abs(totalDeb - totalCred).toLocaleString('id-ID')}`);
      return;
    }

    try {
      const res = await fetch("/api/accounting/manual-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: manualRef.trim(),
          description: manualDesc.trim(),
          lines: payloadLines
        })
      });
      const data = await res.json();
      if (data.success) {
        triggerSuccess(data.message);
        setManualRef('');
        setManualDesc('');
        setManualLines([
          { account_code: '1110', debit: '', credit: '' },
          { account_code: '1111', debit: '', credit: '' }
        ]);
        setDrawerType('NONE');
        fetchReportsData();
        onRefreshParent();
      } else {
        triggerError(data.error || "Gagal memposting jurnal SAK.");
      }
    } catch (err: any) {
      triggerError("Gagal mengirim entri jurnal manual ke server database.");
    }
  };

  // Run Depreciation
  const handleRunDepreciation = async () => {
    if (!confirm("Konfirmasi eksekusi straight-line amortisasi penyusutan bulanan untuk seluruh aset tetap aktif?")) {
      return;
    }
    try {
      const res = await fetch("/api/accounting/fixed-assets/depreciate-all", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        triggerSuccess(data.message);
        fetchAssetsAndFunding();
        fetchReportsData();
        onRefreshParent();
      } else {
        triggerError(data.error || "Gagal menyusutkan aset.");
      }
    } catch (err: any) {
      triggerError("Kesalahan server.");
    }
  };

  // Submit Liabilities/Capital
  const handleFundingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundingAmount || Number(fundingAmount) <= 0 || !fundingSource.trim()) {
      triggerError("Suku nominal & sumber dana wajib diisi lengkap.");
      return;
    }

    try {
      const res = await fetch("/api/accounting/liabilities-capital", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: fundingType,
          amount: Number(fundingAmount),
          source: fundingSource.trim(),
          description: fundingDescription.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        triggerSuccess(data.message);
        setFundingAmount('');
        setFundingSource('');
        setFundingDescription('');
        setDrawerType('NONE');
        fetchAssetsAndFunding();
        fetchReportsData();
        onRefreshParent();
      } else {
        triggerError(data.error);
      }
    } catch (err: any) {
      triggerError("Kesalahan server.");
    }
  };

  // Mark bad debt writeoff
  const handleBadDebtSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!writeOffCustomer || !writeOffAmount || Number(writeOffAmount) <= 0) {
      triggerError("Nasabah & suku nilai write-off wajib valid.");
      return;
    }

    try {
      const res = await fetch("/api/accounting/mark-bad-debt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: writeOffCustomer,
          amount: Number(writeOffAmount),
          description: writeOffDescription
        })
      });
      const data = await res.json();
      if (data.success) {
        triggerSuccess(data.message);
        setWriteOffCustomer('');
        setWriteOffAmount('');
        setWriteOffDescription('');
        setDrawerType('NONE');
        fetchReportsData();
        onRefreshParent();
      } else {
        triggerError(data.error);
      }
    } catch (err: any) {
      triggerError("Gagal memproses write-off piutang tak tertagih.");
    }
  };

  // EXPORT CODES
  // 1. CSV EXPORT
  const handleExportCSV = () => {
    if (!reports) return;
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "=== LAPORAN NERACA SALDO SAK ===\n";
    csvContent += "Kode Akun,Nama Akun,Debit Total,Kredit Total,Saldo Akhir\n";
    
    reports.trialBalance.accounts.forEach((acc: any) => {
      csvContent += `"${acc.code}","${acc.name}",${acc.debitTotal},${acc.creditTotal},${acc.endingBalance}\n`;
    });

    csvContent += "\n=== LAPORAN LABA RUGI SAK ===\n";
    csvContent += `Pendapatan Jasa Bergerak,${reports.incomeStatement.totalRevenue}\n`;
    csvContent += `Beban Operasional Komulatif,${reports.incomeStatement.totalExpense}\n`;
    csvContent += `Laba Bersih Segar,${reports.incomeStatement.netProfit}\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Laporan_Keuangan_ERP_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerSuccess("Ekspor CSV ringkasan SAK berhasil diunduh.");
  };

  // 2. EXCEL EXPORT (Simple structured spreadsheet table XML)
  const handleExportExcel = () => {
    if (!reports) return;
    let excelContent = "=== LAPORAN TRIAL BALANCE ERP KOPERASI ===\n";
    excelContent += "Kode Akun\tNama Akun\tDr Total\tCr Total\tSaldo Bersih\n";
    reports.trialBalance.accounts.forEach((acc: any) => {
      excelContent += `${acc.code}\t${acc.name}\t${acc.debitTotal}\t${acc.creditTotal}\t${acc.endingBalance}\n`;
    });
    
    const blob = new Blob([excelContent], { type: "application/vnd.ms-excel" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Laporan_Skehed_Excel_${startDate}_to_${endDate}.xls`;
    link.click();
    triggerSuccess("Ekspor ke lembar kerja Excel (.xls) berhasil diunduh.");
  };

  // 3. pdfMake or jsPDF Landscape Premium Export (with Signature blocks!)
  const handleExportLandscapePDF = () => {
    if (!reports) return;
    
    // Create jsPDF in LANDSCAPE (l)
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    // 1. Header Banner
    doc.setFillColor(15, 23, 42); // slate-900 color
    doc.rect(0, 0, 297, 30, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(16);
    doc.text("KOPERASI MITRA SEJAHTERA INDONESIA", 14, 12);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.text("ERP Core Accounting Financial Statement (SAK & Standar Akuntansi Keuangan)", 14, 18);
    doc.text(`Periode: ${startDate} s/d ${endDate} | Kantor Cabang Utama`, 14, 23);

    // Date Generated watermark
    doc.setFontSize(8);
    doc.setTextColor(200, 200, 200);
    doc.text(`Dicetak harian secara otomatis pada: ${new Date().toLocaleString()}`, 200, 12);

    // 2. TRIAL BALANCE TABLE
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);
    doc.setFont("Helvetica", "bold");
    doc.text("I. NERACA SALDO PERIODE BERJALAN", 14, 40);

    const accountsData = reports.trialBalance.accounts.map((acc: any) => [
      acc.code,
      acc.name,
      acc.debitTotal ? `Rp ${acc.debitTotal.toLocaleString('id-ID')}` : "Rp 0",
      acc.creditTotal ? `Rp ${acc.creditTotal.toLocaleString('id-ID')}` : "Rp 0",
      `Rp ${acc.endingBalance.toLocaleString('id-ID')}`
    ]);

    (doc as any).autoTable({
      startY: 44,
      head: [["Kode", "Akun SAK Koperasi", "Debet", "Kredit", "Saldo Sisa"]],
      body: accountsData,
      theme: 'striped',
      headStyles: { fillColor: [51, 65, 85] },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 }
    });

    // 3. INCOME STATEMENT SUM
    let nextY = (doc as any).lastAutoTable.finalY + 12;
    if (nextY > 160) {
      doc.addPage();
      nextY = 20;
    }

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.text("II. LAPORAN LABA RUGI (INCOME STATEMENT)", 14, nextY);

    const incomeMetrics = [
      ["TOTAL PENDAPATAN JASA KOPERASI", `Rp ${reports.incomeStatement.totalRevenue.toLocaleString('id-ID')}`],
      ["TOTAL REALISASI BEBAN & OPEX CABANG", `Rp ${reports.incomeStatement.totalExpense.toLocaleString('id-ID')}`],
      ["LABA BERSIH PERIODE BERJALAN (NET PROFIT)", `Rp ${reports.incomeStatement.netProfit.toLocaleString('id-ID')}`]
    ];

    (doc as any).autoTable({
      startY: nextY + 4,
      head: [["Akun Penentu Profitabilitas", "Jumlah Rupiah"]],
      body: incomeMetrics,
      theme: 'grid',
      headStyles: { fillColor: [15, 22, 42] },
      styles: { fontSize: 9 },
      margin: { left: 14, right: 14 }
    });

    // 4. CASH FLOW REPORT SUMMARY
    nextY = (doc as any).lastAutoTable.finalY + 12;
    if (nextY > 165) {
      doc.addPage();
      nextY = 20;
    }

    doc.setFont("Helvetica", "bold");
    doc.text("III. ALIRAN REKAPITULASI DUA SUMBER KAS (ARUS KAS)", 14, nextY);

    const cashFlowData = [
      ["Arus Kas Masuk (Penerimaan Tagihan + Anggota Baru)", `Rp ${reports.cashFlow.totalInflow.toLocaleString('id-ID')}`],
      ["Arus Kas Keluar (Disbursements Pokok + Modal OPEX)", `Rp ${reports.cashFlow.totalOutflow.toLocaleString('id-ID')}`],
      ["Saldo Bersih Arus Kas Lapangan (Net Arus)", `Rp ${reports.cashFlow.netCashFlow.toLocaleString('id-ID')}`]
    ];

    (doc as any).autoTable({
      startY: nextY + 4,
      head: [["Sirkulasi Likuidasi Brankas", "Rupiah Koresponden"]],
      body: cashFlowData,
      theme: 'striped',
      headStyles: { fillColor: [5, 47, 22] }, // emerald dark
      styles: { fontSize: 8.5 },
      margin: { left: 14, right: 14 }
    });

    // 5. SIGNBLOCKS (Gives it authentic cashier look!)
    nextY = (doc as any).lastAutoTable.finalY + 18;
    if (nextY > 170) {
      doc.addPage();
      nextY = 20;
    }

    // Border line above signature
    doc.setDrawColor(220, 220, 220);
    doc.line(14, nextY - 4, 283, nextY - 4);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("KOLOM TANDA TANGAN KOMITMEN AKUNTANSY", 14, nextY);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.text("Dipersiapkan Oleh :", 14, nextY + 8);
    doc.text("Kasir Keuangan Utama", 14, nextY + 12);
    doc.setLineWidth(0.2);
    doc.line(14, nextY + 30, 80, nextY + 30);
    doc.setFont("Helvetica", "italic");
    doc.text("Siti Rahayu, S.Ak.", 14, nextY + 34);

    doc.setFont("Helvetica", "bold");
    doc.text("Disetujui & Diotorisasi Oleh :", 110, nextY + 8);
    doc.text("Manager Operasional Cabang", 110, nextY + 12);
    doc.line(110, nextY + 30, 180, nextY + 30);
    doc.setFont("Helvetica", "italic");
    doc.text("Harlis Prabowo, M.M.", 110, nextY + 34);

    doc.setFont("Helvetica", "bold");
    doc.text("Diverifikasi Audit Internal", 200, nextY + 8);
    doc.text("Pengurus Utama Koperasi", 200, nextY + 12);
    doc.line(200, nextY + 30, 270, nextY + 30);
    doc.setFont("Helvetica", "italic");
    doc.text("Dewan Pengawas Koperasi", 200, nextY + 34);

    // Save
    doc.save(`Laporan_Keuangan_Koperasi_LQ_${startDate}_to_${endDate}.pdf`);
    triggerSuccess("Dokumen PDF Landscape dengan Signblocks Audit berhasil dicetak!");
  };

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="space-y-6 w-full animate-fadeIn" id="accounting_main_layout">
      {/* HEADER BAR */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-6 rounded-2xl border border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4" id="accounting_header">
        <div>
          <span className="text-[10px] font-mono uppercase bg-indigo-500/15 text-indigo-300 font-bold px-2 py-0.5 rounded border border-indigo-500/30">SAK ACCOUNTING PORTAL</span>
          <h2 className="text-xl font-bold font-display mt-2 flex items-center gap-2">
            <BookOpen className="text-indigo-400" size={24} />
            Double-Entry General Ledger & Laporan Keuangan
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Sistem akuntansi berpasangan (Double-Entry Bookkeeping). Menghasilkan neraca saldo, laba rugi bulanan, depresiasi aset otomatis dengan metode straight-line perolehan aset, dan penanaman modal korporat.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            id="btn_refresh_accounting"
            onClick={() => {
              fetchReportsData();
              fetchAssetsAndFunding();
              triggerSuccess("Database buku besar akuntansi direfresh.");
            }}
            className="px-3 py-1.5 bg-slate-850 text-white hover:bg-slate-750 text-xs font-semibold rounded-lg flex items-center gap-1.5 border border-slate-700 transition"
          >
            <RefreshCw size={13} />
            Sikron Buku Besar
          </button>
        </div>
      </div>

      {successStr && (
        <div className="bg-emerald-50 text-emerald-900 border border-emerald-200 px-4 py-3 rounded-lg text-xs font-medium flex items-center gap-2" id="accounting_success_toast">
          <Check className="text-emerald-600" size={14} />
          {successStr}
        </div>
      )}
      {errorStr && (
        <div className="bg-rose-50 text-rose-900 border border-rose-200 px-4 py-3 rounded-lg text-xs font-medium flex items-center gap-2" id="accounting_error_toast">
          <AlertCircle className="text-rose-600" size={14} />
          {errorStr}
        </div>
      )}

      {/* SUB MENU NAVIGATION CARDS */}
      {!forcedSubTab && (
        <div className="flex border-b border-slate-200 bg-white p-1 rounded-xl shadow-xs gap-1" id="accounting_tab_menu">
          <button
            id="tab_btn_reports"
            onClick={() => setActiveSubTab('REPORTS')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeSubTab === 'REPORTS' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <FileText size={14} />
            Laporan Keuangan SAK
          </button>
          <button
            id="tab_btn_ledger"
            onClick={() => setActiveSubTab('LEDGER')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeSubTab === 'LEDGER' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Layers size={14} />
            Buku Besar (Ledger)
          </button>
          <button
            id="tab_btn_assets"
            onClick={() => setActiveSubTab('ASSETS')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeSubTab === 'ASSETS' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Calculator size={14} />
            Amortisasi Aset Tetap
          </button>
          <button
            id="tab_btn_funding"
            onClick={() => setActiveSubTab('FUNDING')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeSubTab === 'FUNDING' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ArrowRightLeft size={14} />
            Utang & Modal (Sourcing)
          </button>
          <button
            id="tab_btn_baddebt"
            onClick={() => setActiveSubTab('BADDEBT')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeSubTab === 'BADDEBT' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <TrendingDown size={14} />
            Piutang Tertanggung (NPL)
          </button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border" id="accounting_loader_slate">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <span className="text-xs text-slate-500 mt-3 font-semibold font-mono">Menyeimbangkan Buku Besar Neraca Saldo...</span>
        </div>
      )}

      {/* MAIN SCREEN DISPATCHER */}
      {!loading && reports && (
        <div className="space-y-6" id="accounting_screens_wrapper">
          
          {/* TAB 1: FINANCIAL REPORTS */}
          {activeSubTab === 'REPORTS' && (
            <div className="space-y-6 animate-fadeIn" id="sub_financial_reports_view">
              
              {/* DATE RANGE CONTROLLER */}
              <div className="bg-white rounded-xl border p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs" id="reports_date_filer_pane">
                <div className="flex items-center gap-3 text-xs font-bold text-slate-700" id="date_inputs_wrapper">
                  <Calendar className="text-indigo-500" size={15} />
                  <span>Periode Analisis:</span>
                  <input
                    id="reports_start_date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-650 font-mono text-[11px]"
                  />
                  <span>s/d</span>
                  <input
                    id="reports_end_date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-650 font-mono text-[11px]"
                  />
                </div>

                <div className="flex items-center gap-2" id="export_buttons_row">
                  <span className="text-[10px] font-bold text-slate-400 font-mono hidden md:inline">CETAK/EKSPOR SAK:</span>
                  <button
                    id="btn_export_pdf"
                    onClick={handleExportLandscapePDF}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition"
                  >
                    <DownloadCloud size={13} />
                    PDF Landscape
                  </button>
                  <button
                    id="btn_export_xls"
                    onClick={handleExportExcel}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-550 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition"
                  >
                    <FileSpreadsheet size={13} />
                    Excel
                  </button>
                  <button
                    id="btn_export_csv"
                    onClick={handleExportCSV}
                    className="px-3.5 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition"
                  >
                    <Download size={13} />
                    CSV
                  </button>
                </div>
              </div>

              {/* REPORT CARDS GRID */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="financial_results_grid">
                
                {/* 1. TRIAL BALANCE CARD (NERACA SALDO) */}
                <div className="bg-white rounded-2xl border shadow-xs overflow-hidden" id="report_card_trial_balance">
                  <div className="px-5 py-4 border-b bg-slate-50 flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                      <Layers className="text-indigo-600" size={15} />
                      Neraca Saldo Trial Balance (Audit Ledger)
                    </h3>
                    <span className={`px-2 py-0.5 text-[9px] font-bold rounded font-mono ${
                      reports.trialBalance.isBalanced ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800 animate-pulse'
                    }`}>
                      {reports.trialBalance.isBalanced ? 'BALANCE' : 'UNBALANCED'}
                    </span>
                  </div>
                  <div className="overflow-x-auto max-h-96 text-xs relative">
                    <table className="w-full text-left font-sans border-collapse">
                      <thead className="sticky top-0 bg-slate-100 backdrop-blur-xs z-10">
                        <tr className="bg-slate-100 text-slate-500 font-mono text-[9px] border-b uppercase">
                          <th className="p-3">Kode</th>
                          <th className="p-3">Kategori Akun</th>
                          <th className="p-3 text-right">Debit Total</th>
                          <th className="p-3 text-right">Kredit Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.trialBalance.accounts.map((acc: any) => (
                          <tr key={acc.code} className="border-b hover:bg-slate-100/50 even:bg-slate-50/30 transition-colors">
                            <td className="p-3 font-mono font-semibold text-slate-500">{acc.code}</td>
                            <td className="p-3 font-semibold text-slate-805 text-slate-800">{acc.name}</td>
                            <td className="p-3 text-right font-mono font-bold text-slate-650">{acc.debitTotal > 0 ? formatRupiah(acc.debitTotal) : "-"}</td>
                            <td className="p-3 text-right font-mono font-bold text-slate-650">{acc.creditTotal > 0 ? formatRupiah(acc.creditTotal) : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-4 bg-slate-50 border-t flex justify-between font-bold text-xs text-slate-600 font-mono">
                    <span>Grand Total Buku SAK:</span>
                    <div className="space-x-4">
                      <span>Dr: {formatRupiah(reports.trialBalance.totalDebits)}</span>
                      <span>Cr: {formatRupiah(reports.trialBalance.totalCredits)}</span>
                    </div>
                  </div>
                </div>

                {/* 2. PROFITABILITY CARD (LABA RUGI) & CAPITAL TRANSITIONS */}
                <div className="space-y-6" id="report_right_combination_panel">
                  
                  {/* LABA RUGI STATEMENT */}
                  <div className="bg-white rounded-2xl border shadow-xs overflow-hidden" id="report_card_profitability">
                    <div className="px-5 py-4 border-b bg-slate-50">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                        <TrendingUp className="text-emerald-600" size={15} />
                        Laporan Laba Rugi (Income Statement)
                      </h3>
                    </div>
                    <div className="p-5 space-y-4 text-xs font-sans">
                      <div className="flex justify-between items-center border-b pb-25">
                        <span className="font-bold text-slate-700">Total Pendapatan Jasa Koperasi (A/C 41xx)</span>
                        <span className="font-semibold font-mono text-emerald-600">{formatRupiah(reports.incomeStatement.totalRevenue)}</span>
                      </div>

                      <div className="space-y-2">
                        <span className="text-[10px] uppercase font-bold text-slate-450 font-mono block">Rincian Beban Operasional Cabang:</span>
                        {reports.incomeStatement.expenses?.map((beban: any) => (
                          <div key={beban.code} className="flex justify-between items-center text-slate-600 pl-3 border-l-2 border-indigo-200">
                            <span>{beban.name}</span>
                            <span className="font-mono">{formatRupiah(beban.endingBalance)}</span>
                          </div>
                        ))}
                        {(!reports.incomeStatement.expenses || reports.incomeStatement.expenses.length === 0) && (
                          <span className="text-[11px] italic text-slate-400 pl-3">Belum ada realisasi pembiayaan opex.</span>
                        )}
                      </div>

                      <div className="flex justify-between items-center border-t pt-3 font-semibold text-slate-700">
                        <span>Total Realisasi Amortisasi & Beban</span>
                        <span className="font-mono text-rose-600">{formatRupiah(reports.incomeStatement.totalExpense)}</span>
                      </div>

                      <div className="flex justify-between items-center bg-emerald-50 text-emerald-950 p-3 rounded-xl border border-emerald-250 mt-4">
                        <div>
                          <div className="font-bold text-slate-800">Sisa Hasil Usaha / Laba Bersih</div>
                          <span className="text-[9px] text-emerald-700 font-mono">Surplus Perputaran Rutin</span>
                        </div>
                        <div className="text-lg font-black font-mono text-emerald-700">
                          {formatRupiah(reports.incomeStatement.netProfit)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* LIQUIDITY FLOW (ARUS KAS) */}
                  <div className="bg-white rounded-2xl border shadow-xs overflow-hidden" id="report_card_cashflow">
                    <div className="px-5 py-4 border-b bg-emerald-950 text-white flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                        <ArrowRightLeft className="text-emerald-400" size={15} />
                        Laporan Dua Sumber Arus Kas (Direct Cash Flow)
                      </h3>
                    </div>
                    <div className="p-5 space-y-3.5 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-700">Total Arus Kas Masuk (Inflow)</span>
                        <span className="font-semibold font-mono text-emerald-600">+{formatRupiah(reports.cashFlow.totalInflow)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-700">Total Arus Kas Keluar (Outflow)</span>
                        <span className="font-semibold font-mono text-rose-600">-{formatRupiah(reports.cashFlow.totalOutflow)}</span>
                      </div>
                      <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-150 font-bold">
                        <span>Laju Perubahan Saldo Likuiditas Bersih</span>
                        <span className={`font-mono ${reports.cashFlow.netCashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {formatRupiah(reports.cashFlow.netCashFlow)}
                        </span>
                      </div>
                    </div>
                  </div>

                </div>

              </div>

              {/* CASHIER SIGNBLOCK DISPLAY */}
              <div className="bg-white rounded-xl border p-5 flex flex-col md:flex-row justify-between items-center text-xs text-slate-500 pt-8 mr-1 gap-6 border-t-2" id="report_bottom_signature_mockup">
                <div className="text-center w-full md:w-1/3">
                  <div className="font-bold uppercase tracking-wider text-[10px] text-slate-400 mb-6">DIPERSIAPKAN OLEH:</div>
                  <div className="font-mono text-slate-900 font-bold border-b pb-1 w-3/4 mx-auto">SITI RAHAYU, S.Ak.</div>
                  <div className="text-[10px] text-slate-400 mt-1">Kasir Keuangan Cabang</div>
                </div>
                <div className="text-center w-full md:w-1/3">
                  <div className="font-bold uppercase tracking-wider text-[10px] text-slate-400 mb-6">DIOTORISASI OLEH MANAGER:</div>
                  <div className="font-mono text-slate-900 font-bold border-b pb-1 w-3/4 mx-auto">HARLIS PRABOWO, M.M.</div>
                  <div className="text-[10px] text-slate-400 mt-1">Manager Operasional Cabang</div>
                </div>
                <div className="text-center w-full md:w-1/3">
                  <div className="font-bold uppercase tracking-wider text-[10px] text-slate-400 mb-6">KOMISIONER INTERNAL AUDIT:</div>
                  <div className="font-mono text-slate-900 font-bold border-b pb-1 w-3/4 mx-auto">DEWAN PENGAWAS MSI</div>
                  <div className="text-[10px] text-slate-400 mt-1">Audit Komitmen SAK Koperasi</div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: CHRONOLOGICAL Buku Besar */}
          {activeSubTab === 'LEDGER' && (
            <div className="bg-white rounded-2xl border shadow-xs overflow-hidden animate-fadeIn" id="sub_bookkeeping_ledger_view">
              <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Buku Besar Utama (General Ledger - Balanced Journal Entries)
                  </h3>
                  <p className="text-[10.5px] text-slate-500 mt-0.5">Seluruh ayat jurnal akuntansi yang dideclare secara real-time berdasarkan transaksi kasir dan petugas lapangan.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    id="btn_open_manual_journal_drawer"
                    onClick={() => setDrawerType('MANUAL_JOURNAL')}
                    className="px-3 py-1.5 bg-[#0066CC] hover:bg-[#0052CC] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition"
                  >
                    <Plus size={14} />
                    Input Jurnal Manual
                  </button>
                  <div className="font-mono text-[10px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg border font-bold">
                    Total Entry: {(reports.trialBalance.accounts || []).length} Akun SAK
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[450px] relative">
                <table className="w-full text-left text-xs border-collapse font-sans">
                  <thead className="sticky top-0 bg-slate-100 backdrop-blur-xs z-10">
                    <tr className="bg-slate-100 text-slate-525 font-mono text-[9px] border-b uppercase">
                      <th className="p-3">ID Jurnal</th>
                      <th className="p-3">Ref Akun</th>
                      <th className="p-3">Kategori Koperasi</th>
                      <th className="p-3 text-right">Debit (Dr)</th>
                      <th className="p-3 text-right">Kredit (Cr)</th>
                      <th className="p-3 text-center">Tipe Normal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.trialBalance.accounts.map((acc: any) => (
                      <tr key={acc.code} className="border-b hover:bg-slate-100/50 even:bg-slate-50/30 transition-colors">
                        <td className="p-3 font-mono font-semibold text-slate-605">ACC-{acc.code}</td>
                        <td className="p-3 font-mono font-bold text-indigo-700">{acc.code}</td>
                        <td className="p-3 font-semibold text-slate-900">{acc.name}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">{acc.debitTotal > 0 ? formatRupiah(acc.debitTotal) : "Rp 0"}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">{acc.creditTotal > 0 ? formatRupiah(acc.creditTotal) : "Rp 0"}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 text-[8.5px] font-mono font-bold rounded-md ${
                            acc.normal_balance === 'DR' ? 'bg-emerald-50 text-emerald-800 border border-emerald-150' : 'bg-rose-50 text-rose-800 border border-rose-150'
                          }`}>
                            {acc.normal_balance}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: ASSET MANAGEMENT (STRAIGHT LINE METHOD) */}
          {activeSubTab === 'ASSETS' && (
            <div className="space-y-6 animate-fadeIn" id="sub_assets_management_view">
              
              <div className="flex flex-wrap items-center justify-between gap-4">
                <button
                  id="btn_open_asset_drawer"
                  onClick={() => setDrawerType('ASSET')}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
                >
                  <Plus size={14} />
                  Daftarkan Perolehan Aset Baru
                </button>

                <button
                  id="btn_automate_straight_depr"
                  onClick={handleRunDepreciation}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-550 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition"
                >
                  <Cpu size={14} />
                  Automated Straight-line Depreciation Bulan Ini
                </button>
              </div>

              {/* ASSET DATATABLE LIST */}
              <div className="bg-white rounded-2xl border shadow-xs overflow-hidden" id="assets_list_wrapper">
                <div className="p-4 border-b bg-slate-50">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <Calculator className="text-indigo-600" size={15} />
                    Daftar Asset Tetap & Log Depresiasi (Metode Garis Lurus)
                  </h3>
                </div>
                 <div className="overflow-x-auto max-h-96 relative">
                  <table className="w-full text-left text-xs border-collapse font-sans">
                    <thead className="sticky top-0 bg-slate-100 backdrop-blur-xs z-10">
                      <tr className="bg-slate-100 text-slate-525 font-mono text-[10px] border-b">
                        <th className="p-3">Asset ID</th>
                        <th className="p-3">Nama Peralatan</th>
                        <th className="p-3">Tanggal Perolehan</th>
                        <th className="p-3 text-right">Biaya Perolehan</th>
                        <th className="p-3 text-right">Nilai Residu</th>
                        <th className="p-3 text-center">Tenor (Bulan)</th>
                        <th className="p-3 text-right">Depresiasi Bulanan</th>
                        <th className="p-3 text-right">Akumulasi Amortisasi</th>
                        <th className="p-3 text-right">Nilai Buku Saat Ini</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fixedAssets.map((asset: any) => (
                        <tr key={asset.id} className="border-b hover:bg-slate-100/50 even:bg-slate-50/30 transition-colors">
                          <td className="p-3 font-mono text-[10px] text-slate-500">{asset.id}</td>
                          <td className="p-3 font-bold text-slate-900">{asset.name}</td>
                          <td className="p-3 text-slate-505 font-mono">{asset.purchase_date}</td>
                          <td className="p-3 text-right font-mono font-semibold text-slate-800">{formatRupiah(asset.acquisition_cost)}</td>
                          <td className="p-3 text-right font-mono text-slate-500">{formatRupiah(asset.salvage_value)}</td>
                          <td className="p-3 text-center font-mono font-bold text-indigo-700">{asset.useful_life} Bln</td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-600">{formatRupiah(asset.monthly_depreciation)}/Bln</td>
                          <td className="p-3 text-right font-mono font-bold text-rose-600">{formatRupiah(asset.accumulated_depreciation)}</td>
                          <td className="p-3 text-right font-mono font-black text-slate-950 bg-slate-50/50">{formatRupiah(asset.current_value)}</td>
                        </tr>
                      ))}
                      {fixedAssets.length === 0 && (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                            Belum ada aset tetap kelayakan kantor cabang yang didaftarkan. Klik tombol di atas untuk menambah perolehan aset tetap pertama!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: FUNDING LOGS (UTANG & MODAL) */}
          {activeSubTab === 'FUNDING' && (
            <div className="space-y-6 animate-fadeIn" id="sub_funding_investments_view">
              <div>
                <button
                  id="btn_open_funding_drawer"
                  onClick={() => setDrawerType('FUNDING')}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
                >
                  <Plus size={14} />
                  Catat Utang Pihak Ketiga / Suntikan Modal Baru
                </button>
              </div>

              {/* FUNDING LOGS TABLE */}
              <div className="bg-white rounded-2xl border shadow-xs overflow-hidden" id="funding_table_wrapper">
                <div className="p-4 border-b bg-slate-50">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <ArrowRightLeft className="text-indigo-600" size={15} />
                    Log Ekuitas & Liabilitas (Sourcing Transaksi Dana Masuk Pihak Ketiga)
                  </h3>
                </div>
                <div className="overflow-x-auto max-h-96 relative font-sans">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-100 backdrop-blur-xs z-10 font-sans">
                      <tr className="bg-slate-100 text-slate-525 font-mono text-[10px] border-b">
                        <th className="p-3">Ref ID</th>
                        <th className="p-3">Tanggal Aliran Dana</th>
                        <th className="p-3">Klasifikasi</th>
                        <th className="p-3">Sumber Pendanaan</th>
                        <th className="p-3">Rincian Kegiatan</th>
                        <th className="p-3 text-right">Nominal Kontribusi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fundingLogs.map((log: any) => (
                        <tr key={log.id} className="border-b hover:bg-slate-100/50 even:bg-slate-50/30 transition-colors">
                          <td className="p-3 font-mono text-[10px] text-slate-500">{log.id}</td>
                          <td className="p-3 font-mono text-slate-500">{new Date(log.date).toLocaleDateString('id-ID')}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 text-[9px] font-bold rounded-md ${
                              log.type === 'UTANG' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {log.type}
                            </span>
                          </td>
                          <td className="p-3 font-black text-slate-900">{log.source}</td>
                          <td className="p-3 font-medium text-slate-700">{log.description}</td>
                          <td className="p-3 text-right font-mono font-bold text-slate-900">{formatRupiah(log.amount)}</td>
                        </tr>
                      ))}
                      {fundingLogs.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                            Belum ada rekam jejak kontribusi utang pihak ketiga atau injeksi modal segar saat ini.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PIUTANG TAK TERTAGIH (BAD DEBT) */}
          {activeSubTab === 'BADDEBT' && (
            <div className="space-y-6 animate-fadeIn" id="sub_bad_debts_view">
              
              <div className="bg-rose-50 rounded-xl p-4 border border-rose-200 text-xs text-rose-900 leading-relaxed flex items-start gap-2.5">
                <AlertCircle className="shrink-0 text-rose-600 mt-0.5" size={16} />
                <div>
                  <span className="font-bold block text-rose-955">Prosedur Penghapusan Piutang Rutin (Write-off SAK):</span>
                  Untuk akuntabilitas lapor, nasabah penunggak kritis yang sudah hilang secara penelusuran (Macat/Kabur Kol 5) dapat dialihkan saldonya secara manual dari akun <span className="font-bold">Piutang Pokok Koperasi (1210)</span> dideklarasikan sebagai beban ke <span className="font-bold">Piutang Tak Tertagih (1230)</span>. Klik tombol di bawah ini lalu tentukan nasabah penunggak bersangkutan.
                </div>
              </div>

              <div>
                <button
                  id="btn_open_baddebt_drawer"
                  onClick={() => setDrawerType('BADDEBT')}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow transition"
                >
                  <Plus size={14} />
                  Posting Pengalihan Piutang Tak Tertagih (Write-off)
                </button>
              </div>

              <div className="bg-white rounded-2xl border shadow-xs overflow-hidden" id="bad_debts_accounts_ledger_panel">
                <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Buku Piutang Gagal Bayar (Macet & Tak Tertagih)
                  </h3>
                  <span className="font-bold text-rose-600 font-mono text-xs">
                    Akun Buku Besar: 1230 - Piutang Tak Tertagih
                  </span>
                </div>
                <div className="p-6 text-center text-slate-400 italic text-xs">
                  Semua transaksi mark-bad-debt otomatis tercatat di histori Jurnal Umum Buku Besar SAK.
                </div>
              </div>

            </div>
          )}

        </div>
      )}

      {/* REUSABLE SLIDE-OUT DRAWER BASED ON TYPE SELECTED */}
      <div className={`fixed inset-0 z-50 overflow-hidden transition-all duration-350 ease-in-out ${drawerType !== 'NONE' ? 'opacity-100 visible' : 'opacity-0 invisible'}`} id="accounting_drawer_root">
        {/* Backdrop hover */}
        <div 
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300"
          onClick={() => setDrawerType('NONE')}
        />

        <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
          <div className={`w-screen max-w-md bg-white shadow-2xl flex flex-col transform transition-transform duration-350 ease-out-sine ${drawerType !== 'NONE' ? 'translate-x-0' : 'translate-x-full'}`}>
             
             {/* Header */}
             <div className="px-6 py-5 border-b flex items-center justify-between bg-[#004494] border-b-2 border-[#00C853] text-white">
               <div>
                  <h4 className="font-bold font-display text-base">
                     {drawerType === 'ASSET' && 'Otorisasi Perolehan Aset Baru'}
                     {drawerType === 'FUNDING' && 'Injeksi Pendanaan Pihak Ketiga'}
                     {drawerType === 'BADDEBT' && 'Opsi Pengalihan Piutang Macet'}
                     {drawerType === 'MANUAL_JOURNAL' && 'Entri Jurnal Penyesuaian Manual (Double-Entry)'}
                  </h4>
                  <p className="text-[11px] text-[#00C853] font-mono font-bold uppercase tracking-wider">Form Bookkeeping SAK Portal</p>
               </div>
               <button
                 onClick={() => setDrawerType('NONE')}
                 className="p-1 px-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
               >
                 <X size={15} />
               </button>
             </div>

             {/* Dynamic Form Render */}
             {drawerType === 'ASSET' && (
               <form onSubmit={handleAssetSubmit} className="grow p-6 space-y-4 overflow-y-auto">
                 <div>
                   <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-1">Nama Peralatan / Inventaris</label>
                   <input
                     id="input_asset_name"
                     type="text"
                     placeholder="Contoh: Genset Honda KC Matim II"
                     value={assetName}
                     onChange={(e) => setAssetName(e.target.value)}
                     className="w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-slate-900"
                   />
                 </div>

                 <div>
                   <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-1">Biaya Hasil Perolehan (Depresiasi Pokok)</label>
                   <div className="relative">
                     <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold font-mono">Rp</span>
                     <input
                       id="input_asset_cost"
                       type="number"
                       placeholder="Contoh: 12000000"
                       value={assetCost}
                       onChange={(e) => setAssetCost(e.target.value)}
                       className="w-full pl-9 pr-3 py-2 border rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-900"
                     />
                   </div>
                 </div>

                 <div>
                   <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-1">Perkiraan Nilai Residu Hari Akhir (Rp)</label>
                   <div className="relative">
                     <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold font-mono">Rp</span>
                     <input
                       id="input_asset_salvage"
                       type="number"
                       placeholder="Contoh: 2000000"
                       value={assetSalvage}
                       onChange={(e) => setAssetSalvage(e.target.value)}
                       className="w-full pl-9 pr-3 py-2 border rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-900"
                     />
                   </div>
                 </div>

                 <div>
                   <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-1">Umur Manfaat / Useful Life</label>
                   <select
                     id="select_asset_life"
                     value={assetLife}
                     onChange={(e) => setAssetLife(e.target.value)}
                     className="w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-slate-900"
                   >
                     <option value="6">6 Bulan</option>
                     <option value="12">12 Bulan (1 Tahun)</option>
                     <option value="24">24 Bulan (2 Tahun)</option>
                     <option value="48">48 Bulan (4 Tahun)</option>
                   </select>
                 </div>

                 <div>
                   <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-1">Tanggal Perolehan</label>
                   <input
                     id="input_asset_date"
                     type="date"
                     value={assetDate}
                     onChange={(e) => setAssetDate(e.target.value)}
                     className="w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-slate-900"
                   />
                 </div>

                 <div className="bg-slate-50 p-3 rounded-xl border text-[11px] text-slate-500 leading-relaxed">
                   <span className="font-bold">Kalkulator Garis Lurus:</span> Penyusutan bulanan dihitung = (Biaya Perolehan - Residu) / Umur Manfaat. Otomatisasi pemyusutan didebit ke akun <span className="font-mono bg-slate-200 px-1 rounded text-[10px]">5200</span> dan dikredit ke <span className="font-mono bg-slate-200 px-1 rounded text-[10px]">1311</span>.
                 </div>

                 <button
                   id="btn_submit_fixed_asset"
                   type="submit"
                   className="w-full py-2.5 bg-slate-950 hover:bg-slate-850 text-white rounded-xl text-xs font-black shadow transition"
                 >
                   Posting Pembelian Aset Tetap ✅
                 </button>
               </form>
             )}

             {drawerType === 'FUNDING' && (
               <form onSubmit={handleFundingSubmit} className="grow p-6 space-y-4 overflow-y-auto">
                 <div>
                   <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-1">Klasifikasi Aliran Dana</label>
                   <div className="grid grid-cols-2 gap-3">
                     <button
                       id="btn_funding_utang"
                       type="button"
                       onClick={() => setFundingType('UTANG')}
                       className={`py-2 px-3 rounded-xl border text-xs font-bold transition text-center ${
                         fundingType === 'UTANG' 
                           ? 'border-slate-950 bg-slate-950 text-white' 
                           : 'bg-white hover:bg-slate-50 text-slate-700'
                       }`}
                     >
                       Utang Pihak Ketiga <span className="block text-[9px] opacity-75 font-mono">A/C 2120</span>
                     </button>
                     <button
                       id="btn_funding_modal"
                       type="button"
                       onClick={() => setFundingType('MODAL')}
                       className={`py-2 px-3 rounded-xl border text-xs font-bold transition text-center ${
                         fundingType === 'MODAL' 
                           ? 'border-slate-950 bg-slate-950 text-white' 
                           : 'bg-white hover:bg-slate-50 text-slate-700'
                       }`}
                     >
                       Injeksi Modal Cadangan <span className="block text-[9px] opacity-75 font-mono">A/C 3100</span>
                     </button>
                   </div>
                 </div>

                 <div>
                   <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-1">Nominal Dana Masuk (Rp)</label>
                   <div className="relative">
                     <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold font-mono">Rp</span>
                     <input
                       id="input_funding_amount"
                       type="number"
                       placeholder="Contoh: 50000000"
                       value={fundingAmount}
                       onChange={(e) => setFundingAmount(e.target.value)}
                       className="w-full pl-9 pr-3 py-2 border rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-900"
                     />
                   </div>
                 </div>

                 <div>
                   <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-1">Nama Kreditur / Investor</label>
                   <input
                     id="input_funding_source"
                     type="text"
                     placeholder="Contoh: Bank BPD NTT / Koperasi Pusat"
                     value={fundingSource}
                     onChange={(e) => setFundingSource(e.target.value)}
                     className="w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-slate-900"
                   />
                 </div>

                 <div>
                   <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-1">Keterangan Aktivitas Penyaluran</label>
                   <textarea
                     id="input_funding_description"
                     placeholder="Hubungan detail suntikan dana..."
                     rows={3}
                     value={fundingDescription}
                     onChange={(e) => setFundingDescription(e.target.value)}
                     className="w-full p-3 border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                   />
                 </div>

                 <button
                   id="btn_submit_funding"
                   type="submit"
                   className="w-full py-2.5 bg-slate-950 hover:bg-slate-850 text-white rounded-xl text-xs font-black shadow transition"
                 >
                   Posting Sourcing Dana Masuk ✅
                 </button>
               </form>
             )}

             {drawerType === 'BADDEBT' && (
               <form onSubmit={handleBadDebtSubmit} className="grow p-6 space-y-4 overflow-y-auto">
                 <div>
                   <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-1">ID Anggota / Nama Nasabah Terdaftar</label>
                   <input
                     id="input_writeoff_customer"
                     type="text"
                     placeholder="Contoh: Anastasia L. - CUST-103"
                     value={writeOffCustomer}
                     onChange={(e) => setWriteOffCustomer(e.target.value)}
                     className="w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-slate-900"
                   />
                 </div>

                 <div>
                   <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-1">Nominal Suku Piutang Dihapuskan (Rp)</label>
                   <div className="relative">
                     <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold font-mono">Rp</span>
                     <input
                       id="input_writeoff_amount"
                       type="number"
                       placeholder="Contoh: 1500000"
                       value={writeOffAmount}
                       onChange={(e) => setWriteOffAmount(e.target.value)}
                       className="w-full pl-9 pr-3 py-2 border rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-900"
                     />
                   </div>
                 </div>

                 <div>
                   <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-1">Alasan Write-Off / Catatan Lapangan</label>
                   <textarea
                     id="input_writeoff_description"
                     placeholder="Sifat kemacetan: Kabur / Meninggal dunia..."
                     rows={3}
                     value={writeOffDescription}
                     onChange={(e) => setWriteOffDescription(e.target.value)}
                     className="w-full p-3 border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                   />
                 </div>

                 <button
                   id="btn_submit_writeoff"
                   type="submit"
                   className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black shadow transition"
                 >
                   Posting Otorisasi Write-Off SAK ⚠
                 </button>
               </form>
             )}

             {drawerType === 'MANUAL_JOURNAL' && (
               <form onSubmit={handleManualJournalSubmit} className="grow p-6 space-y-4 overflow-y-auto flex flex-col justify-between">
                 <div className="space-y-4">
                   <div>
                     <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-1">Nomor Referensi (ID Bukti)</label>
                     <input
                       id="input_manual_ref"
                       type="text"
                       placeholder="Contoh: ADJ-2026-001"
                       value={manualRef}
                       onChange={(e) => setManualRef(e.target.value)}
                       className="w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-slate-900"
                       required
                     />
                   </div>

                   <div>
                     <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-1">Memo / Keterangan Transaksi</label>
                     <input
                       id="input_manual_desc"
                       type="text"
                       placeholder="Contoh: Koreksi kas di tangan maret"
                       value={manualDesc}
                       onChange={(e) => setManualDesc(e.target.value)}
                       className="w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-slate-900"
                       required
                     />
                   </div>

                   <div className="border-t pt-3">
                     <div className="flex items-center justify-between mb-2">
                       <span className="text-[11px] font-bold text-slate-755 uppercase font-mono">Alokasi Debit & Kredit</span>
                       <button
                         type="button"
                         onClick={() => setManualLines([...manualLines, { account_code: '5140', debit: '', credit: '' }])}
                         className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-extrabold rounded-lg border border-emerald-205 transition"
                       >
                         + Tambah Baris
                       </button>
                     </div>

                     <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                       {manualLines.map((line, idx) => {
                         return (
                           <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 relative space-y-2">
                             <div className="flex items-center justify-between">
                               <span className="text-[10px] font-mono font-bold text-slate-400">Baris #{idx + 1}</span>
                               {manualLines.length > 2 && (
                                 <button
                                   type="button"
                                   onClick={() => setManualLines(manualLines.filter((_, i) => i !== idx))}
                                   className="text-red-500 hover:text-red-700 text-[11px] font-bold transition"
                                 >
                                   Hapus
                                 </button>
                               )}
                             </div>

                             <div>
                               <label className="text-[9px] font-bold text-slate-500 block mb-0.5">Akun COA</label>
                               <select
                                 value={line.account_code}
                                 onChange={(e) => {
                                   const newLines = [...manualLines];
                                   newLines[idx].account_code = e.target.value;
                                   setManualLines(newLines);
                                 }}
                                 className="w-full p-1.5 border rounded-lg text-[11px] font-semibold bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                               >
                                 {OFFLINE_COA.map(acc => (
                                   <option key={acc.code} value={acc.code}>{acc.name}</option>
                                 ))}
                               </select>
                             </div>

                             <div className="grid grid-cols-2 gap-2">
                               <div>
                                 <label className="text-[9px] font-bold text-slate-500 block mb-0.5">Debit (Rp)</label>
                                 <input
                                   type="number"
                                   placeholder="0"
                                   value={line.debit}
                                   disabled={!!line.credit}
                                   onChange={(e) => {
                                     const newLines = [...manualLines];
                                     newLines[idx].debit = e.target.value;
                                     if (e.target.value) newLines[idx].credit = '';
                                     setManualLines(newLines);
                                   }}
                                   className="w-full p-1.5 border rounded font-mono font-bold text-[11px] text-right focus:outline-none"
                                 />
                               </div>
                               <div>
                                 <label className="text-[9px] font-bold text-slate-500 block mb-0.5">Kredit (Rp)</label>
                                 <input
                                   type="number"
                                   placeholder="0"
                                   value={line.credit}
                                   disabled={!!line.debit}
                                   onChange={(e) => {
                                     const newLines = [...manualLines];
                                     newLines[idx].credit = e.target.value;
                                     if (e.target.value) newLines[idx].debit = '';
                                     setManualLines(newLines);
                                   }}
                                   className="w-full p-1.5 border rounded font-mono font-bold text-[11px] text-right focus:outline-none"
                                 />
                               </div>
                             </div>
                           </div>
                         );
                       })}
                     </div>
                   </div>

                   <div className="bg-slate-100 p-3 rounded-xl border space-y-1 text-[11px] font-mono font-semibold">
                     <div className="flex justify-between items-center text-slate-700">
                       <span>Total Debit:</span>
                       <span className="text-slate-900 font-bold">
                         Rp {manualLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0).toLocaleString('id-ID')}
                       </span>
                     </div>
                     <div className="flex justify-between items-center text-slate-700">
                       <span>Total Kredit:</span>
                       <span className="text-slate-900 font-bold">
                         Rp {manualLines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0).toLocaleString('id-ID')}
                       </span>
                     </div>
                     <div className="border-t border-slate-300 my-1"></div>
                     <div className="flex justify-between items-center font-bold font-sans">
                       <span>Penyimpangan (Diff):</span>
                       {(() => {
                         const debTotal = manualLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
                         const credTotal = manualLines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
                         const diff = Math.abs(debTotal - credTotal);
                         return (
                           <span className={diff === 0 && debTotal > 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                             {diff === 0 && debTotal > 0 ? "✓ balanced" : `Rp ${diff.toLocaleString('id-ID')}`}
                           </span>
                         );
                       })()}
                     </div>
                   </div>
                 </div>

                 <button
                   id="btn_submit_manual_journal"
                   type="submit"
                   className="w-full py-2.5 bg-[#0066CC] hover:bg-[#0052CC] text-white rounded-xl text-xs font-black shadow-md mt-4 transition"
                 >
                   Posting Jurnal Manual SAK ⚖
                 </button>
               </form>
             )}

          </div>
        </div>
      </div>
    </div>
  );
}
