import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Plus, 
  X, 
  Search, 
  FileSpreadsheet, 
  Wallet, 
  ArrowRightLeft, 
  Building, 
  Check, 
  Calendar, 
  Upload, 
  TrendingDown, 
  Cpu,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

interface OperasionalScreenProps {
  onRefreshParent: () => void;
  activeUser: any;
  forcedSubTab?: 'RECEIPTS' | 'OPEX' | 'RECONCILIATION' | 'NPL';
}

export default function OperasionalScreen({ onRefreshParent, activeUser, forcedSubTab }: OperasionalScreenProps) {
  // Master states
  const [loading, setLoading] = useState(true);
  const [dataSummary, setDataSummary] = useState<any>(null);
  const [reconData, setReconData] = useState<any>({ bankMutations: [], internalBankEntries: [] });
  const [errorStr, setErrorStr] = useState<string | null>(null);
  const [successStr, setSuccessStr] = useState<string | null>(null);

  // Active sub-section state (RECEIPTS | OPEX | RECONCILIATION | NPL)
  const [activeSubTab, setActiveSubTab] = useState<'RECEIPTS' | 'OPEX' | 'RECONCILIATION' | 'NPL'>(forcedSubTab || 'RECEIPTS');

  useEffect(() => {
    if (forcedSubTab) {
      setActiveSubTab(forcedSubTab);
    }
  }, [forcedSubTab]);

  // Slide-out Drawer states for OPEX Form
  const [isOpexDrawerOpen, setIsOpexDrawerOpen] = useState(false);
  const [opexCategory, setOpexCategory] = useState('Bensin');
  const [opexAmount, setOpexAmount] = useState('');
  const [opexDescription, setOpexDescription] = useState('');
  const [opexPayingAccount, setOpexPayingAccount] = useState('Kas Kecil');
  const [opexDate, setOpexDate] = useState(new Date().toISOString().split('T')[0]);

  // Bank Statement Simulation imports
  const [reconSearch, setReconSearch] = useState('');
  const [selectedMutation, setSelectedMutation] = useState<any>(null);
  const [selectedLedgerEntry, setSelectedLedgerEntry] = useState<any>(null);

  // Fetch Summary data
  const fetchSummary = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/operasional/reports-summary");
      const json = await res.json();
      if (json.success) {
        setDataSummary(json);
      } else {
        setErrorStr(json.error || "Gagal mengambil data ringkasan operasional.");
      }
    } catch (err: any) {
      setErrorStr(err.message || "Gagal menghubungi server.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch Reconciliation data
  const fetchReconciliation = async () => {
    try {
      const res = await fetch("/api/operasional/reconciliation");
      const json = await res.json();
      if (json.success) {
        setReconData(json);
      }
    } catch (err: any) {
      console.error("Gagal mengambil data rekonsiliasi", err);
    }
  };

  useEffect(() => {
    fetchSummary();
    fetchReconciliation();
  }, [activeSubTab]);

  const triggerSuccess = (msg: string) => {
    setSuccessStr(msg);
    setTimeout(() => setSuccessStr(null), 5000);
  };

  const triggerError = (msg: string) => {
    setErrorStr(msg);
    setTimeout(() => setErrorStr(null), 5000);
  };

  // Handle OPEX Submit
  const handleOpexSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opexAmount || isNaN(Number(opexAmount)) || Number(opexAmount) <= 0) {
      triggerError("Nominal pengeluaran OPEX harus valid & lebih besar dari 0.");
      return;
    }
    if (!opexDescription.trim()) {
      triggerError("Keterangan pengeluaran OPEX harus diisi.");
      return;
    }

    try {
      const response = await fetch("/api/operasional/opex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: opexCategory,
          amount: Number(opexAmount),
          description: opexDescription.trim(),
          paying_account: opexPayingAccount,
          date: opexDate
        })
      });

      const resJson = await response.json();
      if (resJson.success) {
        triggerSuccess(resJson.message);
        // Clear Form and close drawer
        setOpexAmount('');
        setOpexDescription('');
        setIsOpexDrawerOpen(false);
        fetchSummary();
        onRefreshParent();
      } else {
        triggerError(resJson.error || "Gagal menyimpan pengeluaran OPEX.");
      }
    } catch (err: any) {
      triggerError(err.message || "Kesalahan koneksi sever.");
    }
  };

  // Import mock bank mutasi statement
  const handleImportDummyMutmut = async () => {
    try {
      const sampleMutations = [
        {
          id: `MUT-${Date.now()}-1`,
          date: new Date().toISOString().split('T')[0],
          description: "SETORAN TUNAI HARIAN KASIR - TRANSFER BRANKAS",
          amount: 15200000,
          type: "CR"
        },
        {
          id: `MUT-${Date.now()}-2`,
          date: new Date().toISOString().split('T')[0],
          description: "BIAYA ADMIN NOTARIS - PERALATAN",
          amount: 450000,
          type: "DR"
        }
      ];

      const res = await fetch("/api/operasional/reconciliation/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mutations: sampleMutations })
      });
      const data = await res.json();
      if (data.success) {
        triggerSuccess(data.message);
        fetchReconciliation();
      }
    } catch (err: any) {
      triggerError("Gagal mengimpor data dummy bank mutasi.");
    }
  };

  // Match Mutation Statement to Internal Journal Entry Line
  const handleMatchRecon = async () => {
    if (!selectedMutation) {
      triggerError("Pilih salah satu mutasi bank korporat di tabel kiri terlebih dahulu.");
      return;
    }
    if (!selectedLedgerEntry) {
      triggerError("Pilih salah satu jurnal kas bank internal di tabel kanan untuk mencocokkan.");
      return;
    }

    try {
      const res = await fetch("/api/operasional/reconciliation/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mutationId: selectedMutation.id,
          matchedWithId: selectedLedgerEntry.entry_id
        })
      });
      const json = await res.json();
      if (json.success) {
        triggerSuccess(json.message);
        setSelectedMutation(null);
        setSelectedLedgerEntry(null);
        fetchReconciliation();
        fetchSummary();
      } else {
        triggerError(json.error || "Gagal mencocokkan mutasi.");
      }
    } catch (err: any) {
      triggerError("Kesalahan server.");
    }
  };

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val);
  };

  const formatDateLabel = (dStr: string) => {
    if (!dStr) return "-";
    const d = new Date(dStr);
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <div className="space-y-6 w-full animate-fadeIn" id="operasional_main_layout">
      {/* HEADER SECTION */}
      <div className="bg-gradient-to-r from-slate-900 to-amber-950 text-white p-6 rounded-2xl border border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4" id="operasional_header">
        <div>
          <span className="text-[10px] font-mono uppercase bg-amber-500/15 text-amber-300 font-bold px-2 py-0.5 rounded border border-amber-500/30">OPERATIONAL PANEL</span>
          <h2 className="text-xl font-bold font-display mt-2 flex items-center gap-2">
            <TrendingUp className="text-amber-400" size={24} />
            Kategori Operasional & Arus Kas Lapangan
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Modul pengawasan likuiditas harian kasir. Menyatukan setoran tagihan terverifikasi, potongan dana awal pencairan (UP, Deposito, Administrasi), biaya OPEX kantor cabang, dan instrumen rekonsiliasi korporat otomatis.
          </p>
        </div>
        
        <div className="flex gap-2">
          <button
            id="btn_refresh_operasional"
            onClick={() => {
              fetchSummary();
              fetchReconciliation();
              triggerSuccess("Data operasional berhasil diperbarui dari database.");
            }}
            className="px-3 py-1.5 bg-slate-800 text-white hover:bg-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1 border border-slate-700 transition"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {successStr && (
        <div className="bg-emerald-50 text-emerald-900 border border-emerald-200 px-4 py-3 rounded-lg text-xs font-medium flex items-center gap-2" id="operasional_success_toast">
          <Check className="text-emerald-600" size={14} />
          {successStr}
        </div>
      )}
      {errorStr && (
        <div className="bg-rose-50 text-rose-900 border border-rose-200 px-4 py-3 rounded-lg text-xs font-medium flex items-center gap-2" id="operasional_error_toast">
          <X className="text-rose-600" size={14} />
          {errorStr}
        </div>
      )}

      {/* HORIZONTAL TAB BAR */}
      {!forcedSubTab && (
        <div className="flex border-b border-slate-200 bg-white p-1 rounded-xl shadow-xs gap-1" id="operasional_tab_container">
          <button
            id="tab_btn_receipts"
            onClick={() => setActiveSubTab('RECEIPTS')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeSubTab === 'RECEIPTS' 
                ? 'bg-slate-900 text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Wallet size={15} />
            A. Penerimaan Kas Kantor
          </button>
          <button
            id="tab_btn_opex"
            onClick={() => setActiveSubTab('OPEX')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeSubTab === 'OPEX' 
                ? 'bg-slate-900 text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <TrendingDown size={15} />
            B. Pengeluaran & OPEX
          </button>
          <button
            id="tab_btn_recon"
            onClick={() => setActiveSubTab('RECONCILIATION')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeSubTab === 'RECONCILIATION' 
                ? 'bg-slate-900 text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ArrowRightLeft size={15} />
            C. Rekonsiliasi Bank
          </button>
          <button
            id="tab_btn_npl"
            onClick={() => setActiveSubTab('NPL')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeSubTab === 'NPL' 
                ? 'bg-slate-900 text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <TrendingUp size={15} />
            D. Widget Analisis NPL
          </button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border" id="operasional_loader">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
          <span className="text-xs text-slate-550 mt-3 font-semibold font-mono">Memuat database operasional keuangan...</span>
        </div>
      )}

      {/* RENDER DYNAMIC SUB-TABS */}
      {!loading && dataSummary && (
        <div className="space-y-6" id="operasional_tab_content_wrapper">
          
          {/* TAB A: REKAPAN PENERIMAAN KAS */}
          {activeSubTab === 'RECEIPTS' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="receipts_view_grid">
              {/* Receipts aggregator stats */}
              <div className="bg-white rounded-2xl p-5 border shadow-xs flex flex-col justify-between" id="stat_setoran_approved">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Sumber Penerimaan A</span>
                  <h4 className="text-sm font-semibold text-slate-700 mt-1">Setoran Tagihan Terverifikasi</h4>
                  <div className="text-2xl font-black text-slate-900 tracking-tight font-mono mt-3">
                    {formatRupiah(dataSummary.penerimaan.totalSetoranTagihan)}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-2.5 border-t pt-2.5">
                    Total transfer dan tunai penagihan lapangan yang sudah disetujui (ACC Rekapan) oleh kasir utama. Terposting aman ke Kas Kecil <span className="font-mono bg-slate-100 text-slate-700 px-1 rounded text-[10px]">1110</span> atau Kas Bank <span className="font-mono bg-slate-100 text-slate-700 px-1 rounded text-[10px]">1112</span>.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-5 border shadow-xs flex flex-col justify-between" id="stat_dana_awal_potongan">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Sumber Penerimaan B</span>
                  <h4 className="text-sm font-semibold text-slate-700 mt-1">Setoran Dana Awal (Potongan)</h4>
                  <div className="text-2xl font-black text-slate-900 tracking-tight font-mono mt-3">
                    {formatRupiah(dataSummary.penerimaan.totalDanaAwal)}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-2.5 border-t pt-2.5">
                    Hasil potongan wajib langsung saat pencairan kolektif nasabah baru: Uang Pangkal (UP), Deposito hold, Biaya Administrasi, dan pelunasan piutang lama (potongan angsuran sisa di awal).
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-emerald-950 to-slate-900 text-white rounded-2xl p-5 border shadow-xs flex flex-col justify-between" id="stat_total_aruskas_masuk">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 font-mono">KONSOLIDASI PENERIMAAN</span>
                  <h4 className="text-sm font-bold text-slate-300 mt-1">Memos Total Kas Masuk</h4>
                  <div className="text-3xl font-black text-emerald-400 tracking-tight font-mono mt-3">
                    {formatRupiah(dataSummary.penerimaan.totalSetoranTagihan + dataSummary.penerimaan.totalDanaAwal)}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-2.5 border-t border-slate-800 pt-2.5">
                    Total real penerimaan dana segar harian koperasi baik dari angsuran rutin bergulir maupun fee tabungan awal sebelum dialihkan ke kas bank umum.
                  </p>
                </div>
              </div>

              {/* DETAILS TABLES */}
              <div className="lg:col-span-2 bg-white rounded-2xl border shadow-xs overflow-hidden" id="details_approved_payments_table">
                <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                    <Check className="text-emerald-600" size={15} />
                    Riwayat Transaksi Setoran Tagihan Lapangan (Terverifikasi)
                  </h3>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-lg uppercase">
                    {dataSummary.penerimaan.receiptDetails.setoranTagihan.length} Transaksi
                  </span>
                </div>
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-500 font-mono text-[10px] border-b">
                        <th className="p-3">Ref ID</th>
                        <th className="p-3">Nasabah</th>
                        <th className="p-3">Tanggal Verif</th>
                        <th className="p-3">Metode</th>
                        <th className="p-3 text-right">Nominal Suku</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataSummary.penerimaan.receiptDetails.setoranTagihan.map((pay: any) => (
                        <tr key={pay.id} className="border-b hover:bg-slate-50">
                          <td className="p-3 font-mono font-semibold text-slate-600">{pay.id}</td>
                          <td className="p-3 font-semibold text-slate-900">{pay.customer_id}</td>
                          <td className="p-3 text-slate-500 font-mono">{formatDateLabel(pay.date)}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 text-[9px] font-bold rounded ${
                              pay.method === 'TRANSFER' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'
                            }`}>
                              {pay.method}
                            </span>
                          </td>
                          <td className="p-3 text-right font-bold text-emerald-600 font-mono">{formatRupiah(pay.amount)}</td>
                        </tr>
                      ))}
                      {dataSummary.penerimaan.receiptDetails.setoranTagihan.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                            Belum ada setoran tagihan penagihan yang di-ACC oleh kasir hari ini.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Setoran Dana Awal breakdown details */}
              <div className="bg-white rounded-2xl border shadow-xs overflow-hidden p-5 space-y-4" id="details_disbursements_deductions">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2 border-b pb-3">
                  <Cpu className="text-amber-500" size={15} />
                  Breakdown Dana Awal Pencairan
                </h3>
                <div className="space-y-3" id="deductions_detail_list">
                  <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border">
                    <div>
                      <div className="text-[11px] font-bold text-slate-700">Uang Pangkal (UP)</div>
                      <span className="text-[9px] font-mono text-slate-400">Account 4120 - Potongan UP</span>
                    </div>
                    <div className="text-xs font-bold font-mono text-slate-900">
                      {formatRupiah(dataSummary.penerimaan.receiptDetails.setoranDanaAwal.potongan_up)}
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border">
                    <div>
                      <div className="text-[11px] font-bold text-slate-700">Uang Deposito Anggota</div>
                      <span className="text-[9px] font-mono text-slate-400">Account 2140 - Deposito Hold</span>
                    </div>
                    <div className="text-xs font-bold font-mono text-slate-900">
                      {formatRupiah(dataSummary.penerimaan.receiptDetails.setoranDanaAwal.potongan_deposito)}
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border">
                    <div>
                      <div className="text-[11px] font-bold text-slate-700">Biaya Administrasi</div>
                      <span className="text-[9px] font-mono text-slate-400">Account 4130 - Pendapatan Adm</span>
                    </div>
                    <div className="text-xs font-bold font-mono text-slate-900">
                      {formatRupiah(dataSummary.penerimaan.receiptDetails.setoranDanaAwal.potongan_administrasi)}
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border">
                    <div>
                      <div className="text-[11px] font-bold text-slate-700">Potongan Sisa Piutang Lama</div>
                      <span className="text-[9px] font-mono text-slate-400">Reduksi Piutang Account 1210</span>
                    </div>
                    <div className="text-xs font-bold font-mono text-slate-950 font-semibold text-rose-600">
                      {formatRupiah(dataSummary.penerimaan.receiptDetails.setoranDanaAwal.potongan_sisa_piutang)}
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 p-3 rounded-lg text-[10px] text-amber-900 leading-relaxed border border-amber-200">
                  <span className="font-bold">Info Integrasi Pencairan:</span> Data di atas terisi otomatis setelah Supervisor (SPV) mengeksekusi pencairan kelompok di menu PENCAIRAN KOLEKTIF. Tidak perlu diinput manual!
                </div>
              </div>
            </div>
          )}

          {/* TAB B: REKAPAN PENGELUARAN KAS & OPEX */}
          {activeSubTab === 'OPEX' && (
            <div className="space-y-6" id="opex_tab_view_container">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="opex_stats_row">
                <div className="bg-white rounded-2xl p-5 border shadow-xs" id="opex_stat_manual">
                  <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">PENGELUARAN KATEGORI A</span>
                  <h4 className="text-sm font-semibold text-slate-700 mt-1">Biaya Operasional (Manual OPEX)</h4>
                  <div className="text-2xl font-black text-slate-900 tracking-tight font-mono mt-3">
                    {formatRupiah(dataSummary.pengeluaran.totalOPEX)}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Total beban operasional bulanan (ATK, Bensin, Gaji, Listrik, dll) yang dilaporkan kasir.
                  </p>
                </div>

                <div className="bg-white rounded-2xl p-5 border shadow-xs" id="opex_stat_disbursed_kotor">
                  <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">PENGELUARAN KATEGORI B</span>
                  <h4 className="text-sm font-semibold text-slate-700 mt-1">Lembaga Pencairan Kotor (Outstanding Out)</h4>
                  <div className="text-2xl font-black text-rose-600 tracking-tight font-mono mt-3">
                    {formatRupiah(dataSummary.pengeluaran.totalPencairanKotor)}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Total plafon pinjaman terdaftar yang berhasil dimobilisasi keluar ke tangan nasabah harian.
                  </p>
                </div>

                <div className="bg-slate-900 text-white rounded-2xl p-5 border shadow-xs" id="opex_stat_disbursed_net">
                  <span className="text-[10px] uppercase font-emerald-400 font-bold font-mono">LIKUIDITAS NETTO PENCAIRAN SILANG</span>
                  <h4 className="text-sm font-bold text-slate-300 mt-1">Keluaran Bersih Dana Pokok (Netto)</h4>
                  <div className="text-2xl font-black text-amber-400 tracking-tight font-mono mt-3">
                    {formatRupiah(dataSummary.pengeluaran.totalPencairanBersih)}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    Uang fisik bersih keluar dari brankas induk setelah dikurangkan uang sisa penolakan pencairan anggota kelompok.
                  </p>
                </div>
              </div>

              {/* OPEX manual table & drawer triggers */}
              <div className="bg-white rounded-2xl border shadow-xs overflow-hidden" id="opex_expenses_module">
                <div className="p-4 border-b bg-slate-50 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                      <TrendingDown className="text-rose-500" size={15} />
                      Log Pengeluaran Biaya Beban Operasional Kantor (OPEX)
                    </h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">Semua inputan pengaliran OPEX otomatis didebit ke akun Buku Besar 51xx dan dikredit ke Kas.</p>
                  </div>
                  <button
                    id="btn_open_opex_drawer"
                    onClick={() => setIsOpexDrawerOpen(true)}
                    className="px-3.5 py-2 bg-slate-900 border border-slate-900 text-white hover:bg-slate-850 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                  >
                    <Plus size={14} />
                    Catat Beban OPEX Baru
                  </button>
                </div>

                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-500 font-mono text-[10px] border-b">
                        <th className="p-3">Ref Input ID</th>
                        <th className="p-3">Tanggal Pengeluaran</th>
                        <th className="p-3">Kategori</th>
                        <th className="p-3">Deskripsi Keterangan</th>
                        <th className="p-3 text-right">Nominal Suku</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataSummary.pengeluaran.opexExpenses.map((exp: any) => (
                        <tr key={exp.id} className="border-b hover:bg-slate-55">
                          <td className="p-3 font-mono font-semibold text-slate-650">{exp.id}</td>
                          <td className="p-3 text-slate-500 font-mono">{formatDateLabel(exp.date)}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 text-[9px] font-bold rounded-lg ${
                              exp.category === 'Gaji' ? 'bg-purple-100 text-purple-800' :
                              exp.category === 'ATK' ? 'bg-blue-105 bg-blue-100 text-blue-800' :
                              exp.category === 'Bensin' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800'
                            }`}>
                              {exp.category}
                            </span>
                          </td>
                          <td className="p-3 font-medium text-slate-800">{exp.description}</td>
                          <td className="p-3 text-right font-bold text-rose-600 font-mono">{formatRupiah(exp.amount)}</td>
                        </tr>
                      ))}
                      {dataSummary.pengeluaran.opexExpenses.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                            Belum ada catatan pengeluaran biaya OPEX kantor hari ini. Klik tombol di atas untuk menambah pengeluaran pertama!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB C: BANK RECONCILIATION */}
          {activeSubTab === 'RECONCILIATION' && (
            <div className="space-y-6" id="bank_recon_tab_view">
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 text-xs text-amber-900 leading-relaxed flex items-start gap-2.5">
                <AlertCircle className="shrink-0 text-amber-600 mt-0.5" size={16} />
                <div>
                  <span className="font-bold block text-amber-955">Instruksi Rekonsiliasi Kas Bank harian:</span>
                  Modul ini membandingkan data mutasi tabungan rekening koran asli (kiri) dengan pencatatan jurnal kas di Kas Bank internal account 1112 (kanan). Silakan pilih satu baris transaksi dari mutasi bank, pilih baris penandingan di kas internal, lalu klik <span className="font-bold">"Cocokkan & Verifikasi Rekon"</span> untuk mencatatkan rincian mutasi sebagai MATCHED.
                </div>
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  id="btn_sim_import_mut"
                  onClick={handleImportDummyMutmut}
                  className="px-3 py-2 bg-slate-150 border border-slate-350 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-xs"
                >
                  <Upload size={13} />
                  Simulasikan Impor Rekening Koran (Excel/CSV Dummy)
                </button>

                {selectedMutation && selectedLedgerEntry && (
                  <button
                    id="btn_execute_recon_matching"
                    onClick={handleMatchRecon}
                    className="px-4 py-2 bg-emerald-600 border border-emerald-600 text-white hover:bg-emerald-500 text-xs font-black rounded-xl flex items-center gap-1.5 transition shadow"
                  >
                    <Check size={14} className="animate-bounce" />
                    Cocokkan Transaksi Terpilih Sekarang
                  </button>
                )}
              </div>

              {/* Side-by-Side Dual Tables Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="recon_side_by_side_panels">
                
                {/* LEFT SIDE: Bank Statement mutations */}
                <div className="bg-white rounded-2xl border shadow-xs overflow-hidden" id="recon_bank_muttable">
                  <div className="p-4 border-b bg-indigo-50/50 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-indigo-950 flex items-center gap-2">
                        <Building size={14} className="text-indigo-600" />
                        A. Rekening Koran Koran Bank (Imported Excel Statement)
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">Data rasi mutasi resmi log perbankan korporat eksternal.</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-500 font-mono text-[10px] border-b">
                          <th className="p-3">Ref ID</th>
                          <th className="p-3">Tanggal</th>
                          <th className="p-3">Keterangan Transfer</th>
                          <th className="p-3 text-right">Debit/Kredit</th>
                          <th className="p-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reconData.bankMutations.map((mut: any) => (
                          <tr 
                            key={mut.id} 
                            onClick={() => {
                              if (mut.status !== 'MATCHED') {
                                setSelectedMutation(selectedMutation?.id === mut.id ? null : mut);
                              }
                            }}
                            className={`border-b cursor-pointer transition ${
                              mut.status === 'MATCHED' ? 'bg-emerald-50/30 text-slate-400 opacity-80' :
                              selectedMutation?.id === mut.id ? 'bg-amber-100 font-bold border-amber-300 text-amber-950' : 'hover:bg-slate-55'
                            }`}
                          >
                            <td className="p-3 font-mono font-semibold text-[10px]">{mut.id}</td>
                            <td className="p-3 font-mono text-slate-505">{mut.date}</td>
                            <td className="p-3 text-slate-800 font-semibold">{mut.description}</td>
                            <td className="p-3 text-right font-bold font-mono">
                              <span className={mut.type === 'CR' ? 'text-emerald-600' : 'text-rose-605 text-rose-600'}>
                                {mut.type === 'CR' ? '+' : '-'} {formatRupiah(mut.amount)}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 text-[8px] font-mono font-bold rounded-lg uppercase ${
                                mut.status === 'MATCHED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {mut.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* RIGHT SIDE: Internal Ledger entries */}
                <div className="bg-white rounded-2xl border shadow-xs overflow-hidden" id="recon_internal_ledgertable">
                  <div className="p-4 border-b bg-emerald-50/20 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-emerald-950 flex items-center gap-2">
                        <Wallet size={14} className="text-emerald-600" />
                        B. Ledger Internal Buku Besar (Account 1112 - Kas Bank)
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">Segala postingan otomatis terverifikasi sistem di Buku Besar.</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto max-h-96 text-[11px]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-500 font-mono text-[10px] border-b">
                          <th className="p-3">Ref ID</th>
                          <th className="p-3">Tanggal Jurnal</th>
                          <th className="p-3">Rincian Buku Besar</th>
                          <th className="p-3 text-right">Debit/Kredit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reconData.internalBankEntries.map((line: any) => (
                          <tr 
                            key={line.id} 
                            onClick={() => setSelectedLedgerEntry(selectedLedgerEntry?.id === line.id ? null : line)}
                            className={`border-b cursor-pointer transition ${
                              selectedLedgerEntry?.id === line.id ? 'bg-amber-100 font-bold border-amber-300 text-amber-950' : 'hover:bg-slate-55'
                            }`}
                          >
                            <td className="p-3 font-mono font-semibold text-[10px] text-slate-500">{line.reference}</td>
                            <td className="p-3 font-mono text-slate-500">{formatDateLabel(line.date)}</td>
                            <td className="p-3 font-medium text-slate-800">{line.description}</td>
                            <td className="p-3 text-right font-bold font-mono">
                              {line.debit > 0 ? (
                                <span className="text-emerald-605 text-emerald-600">+{formatRupiah(line.debit)}</span>
                              ) : (
                                <span className="text-rose-505 text-rose-600">-{formatRupiah(line.credit)}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB D: NON-PERFORMING LOAN (NPL) METRICS */}
          {activeSubTab === 'NPL' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="npl_trend_and_stats_row">
              <div className="lg:col-span-1 space-y-6" id="npl_left_indicators_col">
                <div className="bg-white rounded-2xl p-5 border shadow-xs" id="npl_stat_ratio_circle">
                  <span className="text-[10px] uppercase font-bold text-slate-400 font-mono block">Rasio Kolektibilitas</span>
                  <h4 className="text-sm font-semibold text-slate-700 mt-1">NPL Ratio Kelompok Cabang</h4>
                  
                  <div className="flex items-baseline gap-2 mt-5">
                    <span className="text-5xl font-black text-rose-605 text-rose-600 tracking-tighter">
                      {dataSummary.npl.ratio}%
                    </span>
                    <span className="text-xs font-semibold text-rose-500 font-mono uppercase">Macet / Kol 5</span>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed border-t pt-4 mt-4">
                    Rasio dihitung real-time dari total seluruh saldo <span className="font-bold">Piutang Tak Tertagih (Sisa Plafon Cabang Macet & Berkas Kabur)</span> sebesar <span className="font-semibold text-rose-650">{formatRupiah(dataSummary.npl.totalBadDebt)}</span> dibagi dengan total keseluruhan sisa portofolio Outstanding Pinjaman Berjalan sebesar <span className="font-semibold text-slate-850">{formatRupiah(dataSummary.npl.outstandingPortfolio)}</span>.
                  </p>
                </div>

                <div className="bg-slate-900 text-white rounded-2xl p-5 border shadow-xs" id="npl_status_limit">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <AlertCircle className="text-yellow-500" size={13} />
                    Ambang Batas Toleransi OJK (5.00%)
                  </h4>
                  <div className="mt-4 h-2 w-full bg-slate-855 bg-slate-800 rounded-full overflow-hidden flex">
                    <div 
                      className={`h-full ${dataSummary.npl.ratio > 5 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, (dataSummary.npl.ratio / 5) * 100)}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-semibold">
                    <span>Aman (0.00%)</span>
                    <span>NPL Saat ini: {dataSummary.npl.ratio}%</span>
                    <span>Kritis (&gt;5.00%)</span>
                  </div>
                </div>
              </div>

              {/* RIGHT SIDE: CUSTOM DECORATIVE SVG LINE CHART */}
              <div className="lg:col-span-2 bg-white rounded-2xl border shadow-xs p-5 flex flex-col justify-between" id="npl_right_line_chart_card">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2 border-b pb-3.5 mr-1">
                    <TrendingUp className="text-rose-500" size={15} />
                    Tren Non-Performing Loan (NPL) 6 Minggu Terakhir
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-1">Grafik kurva mulus interpolasi visualisasi resiko tunggakan (bebas grid-lines belakang, transparan gradien dibawah garis).</p>
                </div>

                {/* SVG Line chart renders beautifully without external dependency friction */}
                <div className="relative my-4" id="npl_trend_svg_area">
                  <svg viewBox="0 0 500 150" className="w-full h-44 overflow-visible" id="npl_line_chart_svg">
                    <defs>
                      <linearGradient id="nplGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal zero axis line */}
                    <line x1="20" y1="120" x2="480" y2="120" stroke="#e2e8f0" strokeWidth="1" />

                    {/* Plot coordinates: 
                       Data Points: Mg1 (1.2), Mg2 (1.4), Mg3 (1.1), Mg4 (1.5), Mg5 (1.8), current index ratio
                       Convert labels to pixels: X coordinates: 40, X2: 120, X3: 200, X4: 280, X5: 360, X6: 440
                       Y coordinates: Max ratio is 4% (say Y=20), Min is 0% (Y=120)
                       Formula: Y = 120 - (ratio * 22)
                    */}
                    {(() => {
                      const trend = dataSummary.npl.trend;
                      const coords = trend.map((t: any, idx: number) => {
                        const x = 40 + idx * 80;
                        const y = 120 - Math.min(4.5, t.ratio) * 22;
                        return { x, y };
                      });

                      // Curve bezier formula builder
                      let pathD = `M ${coords[0].x} ${coords[0].y}`;
                      for (let i = 0; i < coords.length - 1; i++) {
                        const xc = (coords[i].x + coords[i + 1].x) / 2;
                        const yc = (coords[i].y + coords[i + 1].y) / 2;
                        pathD += ` Q ${coords[i].x} ${coords[i].y}, ${xc} ${yc}`;
                      }
                      pathD += ` T ${coords[coords.length - 1].x} ${coords[coords.length - 1].y}`;

                      // Area closing line path
                      const areaD = `${pathD} L ${coords[coords.length - 1].x} 120 L ${coords[0].x} 120 Z`;

                      return (
                        <>
                          {/* Gradient Shaded Area */}
                          <path d={areaD} fill="url(#nplGradient)" />

                          {/* Smooth Line Curve */}
                          <path d={pathD} fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" />

                          {/* Decorative markers points */}
                          {coords.map((c: any, index: number) => (
                            <g key={index}>
                              <circle 
                                cx={c.x} 
                                cy={c.y} 
                                r="5.5" 
                                fill="#ffffff" 
                                stroke="#f43f5e" 
                                strokeWidth="2.5" 
                                className="cursor-pointer hover:r-7 transition-all duration-200"
                              />
                              <text 
                                x={c.x} 
                                y={c.y - 10} 
                                textAnchor="middle" 
                                fill="#475569" 
                                className="font-mono text-[9px] font-bold"
                              >
                                {trend[index].ratio}%
                              </text>
                            </g>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                </div>

                <div className="flex justify-between px-6 text-[10px] font-mono text-slate-400 border-t pt-3">
                  {dataSummary.npl.trend.map((t: any, idx: number) => (
                    <div key={idx} className="flex flex-col items-center">
                      <span className="font-bold text-slate-550">{t.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* SLIDE-OUT DRAWER PANEL FOR OPEX INPUT */}
      <div className={`fixed inset-0 z-50 overflow-hidden transition-all duration-350 ease-in-out ${isOpexDrawerOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`} id="opex_drawer_root">
        {/* Backdrop overlay */}
        <div 
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300" 
          onClick={() => setIsOpexDrawerOpen(false)} 
        />
        
        <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
          <div className={`w-screen max-w-md bg-white shadow-2xl flex flex-col transform transition-transform duration-350 ease-out-sine ${isOpexDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
             
             {/* Header */}
             <div className="px-6 py-5 border-b flex items-center justify-between bg-slate-900 text-white">
               <div>
                 <h4 className="font-bold font-display text-base">Catat Pengeluaran Cabang (OPEX)</h4>
                 <p className="text-[11px] text-slate-400 mt-0.5 font-mono">Bookkeeping Entry Form Drawer</p>
               </div>
               <button 
                 onClick={() => setIsOpexDrawerOpen(false)}
                 className="p-1 px-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
               >
                 <X size={15} />
               </button>
             </div>

             {/* Form body */}
             <form onSubmit={handleOpexSubmit} className="grow p-6 space-y-4 overflow-y-auto">
               <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-1">Pilih Kategori Beban</label>
                  <select 
                    id="select_opex_cat"
                    value={opexCategory} 
                    onChange={(e) => setOpexCategory(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-slate-900"
                  >
                    <option value="Bensin">Biaya Bensin & BBM (A/C 5100)</option>
                    <option value="Gaji">Biaya Gaji Petugas Lapangan (A/C 5110)</option>
                    <option value="ATK">Biaya Alat Tulis & Cetak (A/C 5120)</option>
                    <option value="Listrik">Biaya Tagihan Listrik & Air (A/C 5130)</option>
                    <option value="Lainnya">Pengeluaran Lainnya (A/C 5140)</option>
                  </select>
               </div>

               <div>
                 <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-1">Nominal Biaya Keluar (Rp)</label>
                 <div className="relative">
                   <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold font-mono">Rp</span>
                   <input
                     id="input_opex_amount"
                     type="number"
                     placeholder="Contoh: 150000"
                     value={opexAmount}
                     onChange={(e) => setOpexAmount(e.target.value)}
                     className="w-full pl-9 pr-3 py-2 border rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-900"
                   />
                 </div>
               </div>

               <div>
                 <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-1">Sumber Rekening Pembayaran</label>
                 <div className="grid grid-cols-2 gap-3">
                   <button
                     id="btn_select_cash_kecil"
                     type="button"
                     onClick={() => setOpexPayingAccount('Kas Kecil')}
                     className={`py-2 px-3 rounded-xl border text-xs font-bold transition text-center ${
                       opexPayingAccount === 'Kas Kecil' 
                         ? 'border-slate-950 bg-slate-950 text-white' 
                         : 'bg-white hover:bg-slate-50 text-slate-700'
                     }`}
                   >
                     Kas Drawer Kecil <span className="block text-[9px] opacity-75 font-mono">A/C 1110</span>
                   </button>
                   <button
                     id="btn_select_cash_bank"
                     type="button"
                     onClick={() => setOpexPayingAccount('Kas Bank')}
                     className={`py-2 px-3 rounded-xl border text-xs font-bold transition text-center ${
                       opexPayingAccount === 'Kas Bank' 
                         ? 'border-slate-950 bg-slate-950 text-white' 
                         : 'bg-white hover:bg-slate-50 text-slate-705 text-slate-700'
                     }`}
                   >
                     Kas Bank Mandiri <span className="block text-[9px] opacity-75 font-mono">A/C 1112</span>
                   </button>
                 </div>
               </div>

               <div>
                 <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-1">Tanggal Transaksi</label>
                 <div className="relative">
                   <Calendar className="absolute left-3 top-2.5 text-slate-410 text-slate-400" size={13} />
                   <input
                     id="input_opex_date"
                     type="date"
                     value={opexDate}
                     onChange={(e) => setOpexDate(e.target.value)}
                     className="w-full pl-9 pr-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-slate-900"
                   />
                 </div>
               </div>

               <div>
                 <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-1">Keterangan / Maksud Pengeluaran</label>
                 <textarea
                   id="input_opex_description"
                   placeholder="Contoh: Pembelian bensin rute Rudi Hermawan Kelompok Matim II"
                   rows={3}
                   value={opexDescription}
                   onChange={(e) => setOpexDescription(e.target.value)}
                   className="w-full p-3 border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                 />
               </div>

               <div className="bg-slate-50 p-3 rounded-xl border text-[11px] text-slate-500 leading-relaxed">
                 <span className="font-bold text-slate-700">Audit SAK:</span> Nominal wajib didebit langsung dari akun pengeluaran dan dikredit dari rekening kas Drawer Kecil (A/C 1110) atau Rekening Bank (A/C 1112) agar balance.
               </div>

               <button
                 id="btn_save_opex_expense"
                 type="submit"
                 className="w-full py-2.5 bg-slate-950 hover:bg-slate-850 text-white rounded-xl text-xs font-black shadow transition"
               >
                 Simpan & Posting ke Buku Besar ✅
               </button>
             </form>
          </div>
        </div>
      </div>
    </div>
  );
}
