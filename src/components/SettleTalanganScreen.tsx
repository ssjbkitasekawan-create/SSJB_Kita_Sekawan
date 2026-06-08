import React, { useState, useEffect } from 'react';
import { 
  Database, Landmark, ArrowRight, User, CheckCircle, Clock, 
  PlusCircle, RefreshCw, Send, AlertCircle, FileSpreadsheet, X, Coins
} from 'lucide-react';
import { SystemState, JointLiability, Customer, LiabilityPaymentHistory } from '../types';

interface SettleTalanganScreenProps {
  systemState: SystemState | null;
  onRefreshParent: () => void;
  activeUser: { id: string; nama: string; role: string; nik: string } | null;
}

// Simulated local SQLite storage model for React Native
interface SQLiteJointLiability {
  id: string;
  lender_id: string;
  lender_name: string;
  borrower_id: string;
  borrower_name: string;
  nominal_utang: number;
  nominal_terbayar: number;
  status: 'UNPAID' | 'PARTIAL' | 'SETTLED';
  created_at: string;
  is_cash_withdrawn?: boolean;
}

interface SQLiteOutboxItem {
  id: string;
  action_type: 'SETTLE_LIABILITY';
  payload: {
    liabilityId: string;
    nominalBayar: number;
    petugasId: string;
    timestamp: string;
    details: string;
  };
  synced: boolean;
  error?: string;
}

export default function SettleTalanganScreen({ systemState, onRefreshParent, activeUser }: SettleTalanganScreenProps) {
  const [activeSubTab, setActiveSubTab] = useState<'ruang_isolasi' | 'p2p'>('ruang_isolasi');
  const [apiTrDebts, setApiTrDebts] = useState<any[]>([]);
  const [isProcessingTr, setIsProcessingTr] = useState<string | null>(null);

  // Simulated SQLite states
  const [sqliteJointLiabilities, setSqliteJointLiabilities] = useState<SQLiteJointLiability[]>([]);
  const [sqliteOutbox, setSqliteOutbox] = useState<SQLiteOutboxItem[]>([]);
  
  // Selection and formulation states
  const [selectedLiabilityId, setSelectedLiabilityId] = useState<string>("");
  const [nominalBayarInput, setNominalBayarInput] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isWithdrawing, setIsWithdrawing] = useState<string | null>(null);

  const loadApiTrDebts = async () => {
    try {
      const res = await fetch("/api/tanggung-renteng/tr-debts");
      const json = await res.json();
      if (json.success) {
        setApiTrDebts(json.data);
      }
    } catch (e) {
      console.error("Gagal menarik data trDebts secara real-time", e);
    }
  };

  const handlePayTrDebt = async (trDebtId: string, name: string, amount: number) => {
    if (!confirm(`Apakah Anda yakin ingin menerima pelunasan talangan sebesar Rp ${amount.toLocaleString('id-ID')} dari ${name}?`)) {
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsProcessingTr(trDebtId);

    try {
      const res = await fetch('/api/tanggung-renteng/bayar-tr-debt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tr_debt_id: trDebtId })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setSuccessMsg(`Sukses: Pelunasan talangan Rp ${amount.toLocaleString('id-ID')} dari ${name} berhasil diterima dan dicatat.`);
        onRefreshParent();
        await loadApiTrDebts();
      } else {
        setErrorMsg(json.error || "Gagal melunasi talangan.");
      }
    } catch (err: any) {
      setErrorMsg("Gagal terhubung ke server.");
    } finally {
      setIsProcessingTr(null);
    }
  };

  const handleWithdrawLiabilityCash = async (liabilityId: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsWithdrawing(liabilityId);
    try {
      const res = await fetch('/api/tanggung-renteng/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          liabilityId,
          petugasId: activeUser?.id || "USR-01"
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`Berhasil! ${data.message || 'Dana talangan tanggung renteng diserahkan.'}`);
        onRefreshParent();
      } else {
        setErrorMsg(data.error || "Gagal mencatat penyerahan dana.");
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Gagal terhubung ke API server.");
    } finally {
      setIsWithdrawing(null);
    }
  };

  // Initialize simulated SQLite database from SystemState on mount / update
  useEffect(() => {
    loadApiTrDebts();
    if (!systemState) return;
    
    // Build simulated local relational JOIN values (Lender & Borrower names)
    const liabilities = systemState.jointLiabilities || [];
    const customers = systemState.customers || [];

    const joined: SQLiteJointLiability[] = liabilities.map(l => {
      const lender = customers.find(c => c.id === l.lender_id);
      const borrower = customers.find(c => c.id === l.borrower_id);
      return {
        ...l,
        lender_name: lender ? lender.name : `Nasabah ${l.lender_id}`,
        borrower_name: borrower ? borrower.name : `Nasabah ${l.borrower_id}`
      };
    });

    setSqliteJointLiabilities(joined);

    // Load simulated SQLite Outbox from localStorage
    const savedOutbox = localStorage.getItem('sqlite_outbox_queue');
    if (savedOutbox) {
      try {
        setSqliteOutbox(JSON.parse(savedOutbox));
      } catch (e) {
        console.error("Error reading simulated outbox queue", e);
      }
    }
  }, [systemState]);

  // Helper to save outbox locally
  const saveOutboxLocally = (queue: SQLiteOutboxItem[]) => {
    setSqliteOutbox(queue);
    localStorage.setItem('sqlite_outbox_queue', JSON.stringify(queue));
  };

  // Action: Save to outbox (offline SQLite write!)
  const handleSavePelunasanToOutbox = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);

    if (!selectedLiabilityId) {
      setErrorMsg("Harap pilih salah satu utang talangan.");
      return;
    }

    const value = parseFloat(nominalBayarInput);
    if (isNaN(value) || value <= 0) {
      setErrorMsg("Harap masukkan jumlah nominal bayar yang valid dan lebih dari 0.");
      return;
    }

    // Find the targeted liability in SQLite
    const liability = sqliteJointLiabilities.find(l => l.id === selectedLiabilityId);
    if (!liability) {
      setErrorMsg("Utang talangan tidak ditemukan!");
      return;
    }

    const sisa = liability.nominal_utang - liability.nominal_terbayar;
    if (value > sisa) {
      setErrorMsg(`Nominal bayar (Rp ${value.toLocaleString()}) melebihi sisa utang talangan (Rp ${sisa.toLocaleString()}).`);
      return;
    }

    // Create Outbox Record representing mobile db queue
    const outboxId = `OUT-${Date.now()}`;
    const newOutboxItem: SQLiteOutboxItem = {
      id: outboxId,
      action_type: 'SETTLE_LIABILITY',
      payload: {
        liabilityId: selectedLiabilityId,
        nominalBayar: value,
        petugasId: activeUser?.id || "USR-01",
        timestamp: new Date().toISOString(),
        details: `${liability.borrower_name} bayar ke ${liability.lender_name}`
      },
      synced: false
    };

    // Optimistically update simulated SQLite local state to reflect transaction
    const updatedLiabilities = sqliteJointLiabilities.map(l => {
      if (l.id === selectedLiabilityId) {
        const nextTerbayar = l.nominal_terbayar + value;
        const nextStatus = (l.nominal_utang - nextTerbayar === 0) ? 'SETTLED' : 'PARTIAL';
        return {
          ...l,
          nominal_terbayar: nextTerbayar,
          status: nextStatus
        };
      }
      return l;
    });

    const newQueue = [...sqliteOutbox, newOutboxItem];
    saveOutboxLocally(newQueue);
    setSqliteJointLiabilities(updatedLiabilities);

    setSelectedLiabilityId("");
    setNominalBayarInput("");
    setSuccessMsg("BERHASIL! Data disimpan ke tabel outbox SQLite lokal. Transaksi siap disinkronisasikan ke server pusat.");
    
    // Clear success message after 5 seconds
    setTimeout(() => setSuccessMsg(null), 6000);
  };

  // Action: Sync local outbox with Central Server
  const handleSyncOutboxToServer = async () => {
    if (sqliteOutbox.length === 0) return;
    
    setIsSyncing(true);
    let successfullySyncedCount = 0;
    const nextQueue = [...sqliteOutbox];

    for (let i = 0; i < nextQueue.length; i++) {
      const item = nextQueue[i];
      if (item.synced) continue;

      try {
        const res = await fetch('/api/tanggung-renteng/settle', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            liabilityId: item.payload.liabilityId,
            nominalBayar: item.payload.nominalBayar,
            petugasId: item.payload.petugasId
          })
        });

        const data = await res.json();
        if (res.ok) {
          nextQueue[i] = { ...item, synced: true };
          successfullySyncedCount++;
        } else {
          nextQueue[i] = { ...item, error: data.error || "Gagal sinkronisasi" };
        }
      } catch (e: any) {
        nextQueue[i] = { ...item, error: e.message || "Koneksi terputus ke API" };
      }
    }

    // Keep only non-synced items (with errors) or empty outbox entirely if everything succeeded
    const remainingOutbox = nextQueue.filter(item => !item.synced);
    saveOutboxLocally(remainingOutbox);
    setIsSyncing(false);

    if (successfullySyncedCount > 0) {
      setSuccessMsg(`Berhasil menyinkronkan seluruh outbox: ${successfullySyncedCount} transaksi lunas tercatat di server.`);
      onRefreshParent();
    } else {
      setErrorMsg("Sinkronisasi gagal. Pastikan koneksi server aktif dan periksa pesan error di antrean.");
    }
  };

  const handleClearOutboxQueue = () => {
    saveOutboxLocally([]);
    setErrorMsg(null);
    setSuccessMsg("Antrean outbox lokal berhasil dibersihkan.");
    onRefreshParent();
  };

  // Filtering list for dropdown selector
  const activeLiabilities = sqliteJointLiabilities.filter(l => l.status !== 'SETTLED');

  return (
    <div className="space-y-6" id="settle_talangan_screen_comp">
      {/* Visual Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight font-display uppercase">
            🔄 Pelunasan Talangan & Tanggung Renteng (TR)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Sistem pengembalian dana patungan kelompok (TR) dan isolasi piutang petugas lapangan.
          </p>
        </div>
        <div className="bg-amber-600/10 text-amber-900 border border-amber-600/20 text-[10.5px] font-mono font-bold uppercase py-1.5 px-3 rounded-full flex items-center gap-1.5 shrink-0">
          <Coins size={12} /> Tanggung Renteng Engine v2_1
        </div>
      </div>

      {/* Sub-tab switcher */}
      <div className="flex select-none border-b border-slate-200" id="tr_sub_tab_switcher">
        <button
          type="button"
          onClick={() => {
            setActiveSubTab('ruang_isolasi');
            setSuccessMsg(null);
            setErrorMsg(null);
          }}
          className={`py-3 px-5 font-black text-xs uppercase tracking-wider border-b-2 transition duration-200 -mb-px flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'ruang_isolasi'
              ? 'border-amber-600 text-amber-850 bg-amber-50/20 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          🔒 Ruang Isolasi Piutang Talangan ({apiTrDebts.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveSubTab('p2p');
            setSuccessMsg(null);
            setErrorMsg(null);
          }}
          className={`py-3 px-5 font-black text-xs uppercase tracking-wider border-b-2 transition duration-200 -mb-px flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'p2p'
              ? 'border-indigo-600 text-indigo-850 bg-indigo-50/20 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          🔄 Talangan Antar-Anggota Rute (P2P SQLite Outbox)
        </button>
      </div>

      {successMsg && (
        <div id="sqlite_success_toast" className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg font-semibold animate-fadeIn">
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div id="sqlite_error_toast" className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg font-semibold">
          {errorMsg}
        </div>
      )}

      {activeSubTab === 'ruang_isolasi' ? (
        <div className="space-y-6 animate-fadeIn" id="ruang_isolasi_subtab_view">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-xs leading-none flex items-center justify-between gap-4">
              <div className="space-y-1.5 flex flex-col justify-center">
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-extrabold">Total Utang Isolasi Terbuka</span>
                <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                  Rp {apiTrDebts.reduce((sum, d) => sum + d.nominal_talangan, 0).toLocaleString('id-ID')}
                </div>
              </div>
              <div className="p-3 bg-slate-800/80 rounded-xl text-amber-500 flex items-center animate-pulse">
                <Coins size={20} />
              </div>
            </div>

            <div className="bg-white border p-5 rounded-2xl shadow-xs leading-none flex items-center justify-between gap-4">
              <div className="space-y-1.5 flex flex-col justify-center">
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold">Anggota dalam Isolasi</span>
                <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                  {apiTrDebts.length} Anggota Lapangan
                </div>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl text-amber-600 border border-amber-100 flex items-center">
                <User size={18} />
              </div>
            </div>
          </div>

          {/* Table list of Ruang Isolasi */}
          <div className="bg-white rounded-2xl p-5 border shadow-xs">
            <div className="border-b pb-3 mb-4 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase font-mono tracking-tight flex items-center gap-2">
                  <span>📋 Daftar Anggota Tertunggak Talangan TR (Ruang Isolasi)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-sans font-medium">
                  Menampilkan nasabah berhalangan hadir yang angsurannya ditalangi kas kelompok. Saring pelunasan utang disini.
                </p>
              </div>
              <button
                type="button"
                onClick={loadApiTrDebts}
                className="p-1.5 hover:bg-slate-100 rounded border text-slate-500 hover:text-slate-800 transition cursor-pointer"
                title="Refresh Piutang Talangan"
              >
                <RefreshCw size={14} />
              </button>
            </div>

            {apiTrDebts.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 bg-slate-50/50">
                <CheckCircle className="mx-auto text-emerald-500 mb-2" size={32} />
                <h4 className="text-sm font-black text-slate-800 uppercase font-mono">Ruang Isolasi Bersih!</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  Seluruh anggota kelompok yang sebelumnya memicu denda / talangan bersama telah membayar kembali utang kelompoknya hingga lunas.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-205">
                <table className="w-full text-left border-collapse font-sans text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-mono text-slate-500 font-bold uppercase tracking-wider">
                      <th className="p-4">Nama Anggota</th>
                      <th className="p-4">Nama Kelompok</th>
                      <th className="p-4 text-right">Nominal Talangan (TR)</th>
                      <th className="p-4 text-center">Tanggal Kejadian</th>
                      <th className="p-4 text-center">Aksi Pelunasan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150">
                    {apiTrDebts.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition">
                        <td className="p-4 font-extrabold text-slate-950 flex items-center gap-1.5">
                          <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-705 font-mono font-bold text-[10px] flex items-center justify-center border">
                            👤
                          </span>
                          {item.customer_name}
                        </td>
                        <td className="p-4 font-bold text-indigo-705">{item.group_name}</td>
                        <td className="p-4 text-right font-black font-mono text-rose-600 text-sm">
                          Rp {item.nominal_talangan.toLocaleString('id-ID')}
                        </td>
                        <td className="p-4 text-center text-slate-500 font-mono font-bold">
                          {new Date(item.tanggal_kejadian).toLocaleDateString('id-ID', {
                            weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
                          })}
                        </td>
                        <td className="p-4 text-center">
                          <button
                            type="button"
                            disabled={isProcessingTr === item.id}
                            onClick={() => handlePayTrDebt(item.id, item.customer_name, item.nominal_talangan)}
                            className="inline-flex items-center justify-center gap-1.5 py-1.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-lg text-[10.5px] uppercase tracking-wide transition shadow-3xs cursor-pointer hover:scale-[1.02] disabled:bg-slate-300 disabled:cursor-not-allowed"
                          >
                            💰 {isProcessingTr === item.id ? "Memproses..." : "Terima Pelunasan Talangan"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-fadeIn" id="p2p_sqlite_subtab_view">
          {/* Visual Header Banner outlining SAK rules */}
          <div className="bg-amber-50/70 rounded-xl p-5 border border-amber-205">
            <h2 className="text-xs font-bold text-amber-800 font-mono uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <AlertCircle size={16} />
              REGULASI AKUNTANSI KOOPERATIF (PENGECUALIAN LEDGER)
            </h2>
            <p className="text-xs text-amber-700 leading-relaxed max-w-4xl font-sans font-medium">
              Fungsi <span className="font-bold font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-800">settleLiability</span> ini 
              didesain khusus untuk mencatatkan pelunasan talangan internal tanggung renteng (antarkelompok). 
              Transaksi ini <strong>TIDAK</strong> memicu jurnal pembukuan Buku Besar umum ke Kas Perasuransian/Perusahaan 
              karena dana murni langsung diserahkan oleh <strong>Anggota A (Borrower)</strong> kepada <strong>Anggota B (Lender)</strong> di depan petugas.
              Tujuannya murni rekonsiliasi data kolektansi internal lapangan.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* LEFT COMPONENT: The Simulated Mobile DB Form (Lg: 7/12 cols) */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white rounded-xl p-5 shadow-xs border border-slate-202">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
                  <div>
                    <h3 className="text-xs font-bold text-slate-902 font-mono uppercase tracking-wider flex items-center gap-2">
                      <Database className="text-indigo-650" size={16} />
                      SettleTalanganScreen (SQLite Interface)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Antarmuka mobile petugas untuk mencatat pengembalian dana pinjaman tanggung renteng.
                    </p>
                  </div>
                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-mono text-[10px] rounded border border-indigo-150 font-bold border-dashed uppercase">
                    Offline Caching
                  </span>
                </div>

                {/* Simulated Mobile SQLite Form */}
                <form onSubmit={handleSavePelunasanToOutbox} className="space-y-4">
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide font-mono">
                      Pilih Anggota & Utang yang Ingin Dilunasi:
                    </label>
                    <select
                      value={selectedLiabilityId}
                      onChange={(e) => {
                        setSelectedLiabilityId(e.target.value);
                        const liab = sqliteJointLiabilities.find(l => l.id === e.target.value);
                        if (liab) {
                          setNominalBayarInput((liab.nominal_utang - liab.nominal_terbayar).toString());
                        } else {
                          setNominalBayarInput("");
                        }
                      }}
                      className="w-full bg-slate-550 border border-slate-250 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-650"
                    >
                      <option value="">-- Pilih Rekon Talangan Lapangan Aktif --</option>
                      {activeLiabilities.map((l) => {
                        const sisa = l.nominal_utang - l.nominal_terbayar;
                        return (
                          <option key={l.id} value={l.id}>
                            {l.borrower_name} berutang kepada {l.lender_name} — Sisa: Rp {sisa.toLocaleString('id-ID')} (Plafon: {l.nominal_utang.toLocaleString()})
                          </option>
                        );
                      })}
                      {activeLiabilities.length === 0 && (
                        <option disabled>Seluruh kewajiban internal kelompok lunas (SETTLED)!</option>
                      )}
                    </select>
                  </div>

                  {selectedLiabilityId && (
                    <div className="bg-indigo-50/50 p-3.5 rounded-lg border border-indigo-100 text-xs grid grid-cols-2 gap-4 animate-fadeIn">
                      <div>
                        <span className="text-slate-550 block">Pemberi Talangan (Lender):</span>
                        <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                          <User size={13} className="text-indigo-600" />
                          {sqliteJointLiabilities.find(l => l.id === selectedLiabilityId)?.lender_name}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-550 block">Anggota Berutang (Borrower):</span>
                        <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                          <User size={13} className="text-amber-600" />
                          {sqliteJointLiabilities.find(l => l.id === selectedLiabilityId)?.borrower_name}
                        </span>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide font-mono">
                      Nominal Pembayaran (Rp):
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-slate-500 text-xs font-semibold">Rp</span>
                      </div>
                      <input
                        type="number"
                        value={nominalBayarInput}
                        onChange={(e) => setNominalBayarInput(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-250 rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-indigo-650 font-semibold font-mono"
                        placeholder="Masukkan nominal bayar, ex: 100000"
                      />
                    </div>
                    {selectedLiabilityId && (
                      <div className="mt-1.5 flex justify-between font-semibold font-mono text-[10.5px]">
                        <span className="text-[10px] text-slate-500">
                          * Sisa utang maksimal untuk talangan ini: <strong>Rp {(
                            sqliteJointLiabilities.find(l => l.id === selectedLiabilityId)
                            ? (sqliteJointLiabilities.find(l => l.id === selectedLiabilityId)!.nominal_utang - sqliteJointLiabilities.find(l => l.id === selectedLiabilityId)!.nominal_terbayar)
                            : 0
                          ).toLocaleString('id-ID')}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const liab = sqliteJointLiabilities.find(l => l.id === selectedLiabilityId);
                            if (liab) {
                              setNominalBayarInput((liab.nominal_utang - liab.nominal_terbayar).toString());
                            }
                          }}
                          className="text-[10px] text-indigo-650 hover:underline font-bold"
                        >
                          Bayar Lunas
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-indigo-650 hover:bg-slate-900 text-white font-bold py-2.5 rounded-lg text-xs transition flex items-center justify-center gap-2 shadow-sm cursor-pointer uppercase tracking-wider font-mono text-[10px]"
                  >
                    <PlusCircle size={15} />
                    SIMPAN PELUNASAN (Catat Outbox SQLite Offline)
                  </button>

                </form>
              </div>

              {/* SQLite Outbox Queue List */}
              <div className="bg-white rounded-xl p-5 shadow-xs border border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center gap-2">
                      <Landmark className="text-indigo-600" size={16} />
                      SQLite Outbox Table (Pending Sync Queue)
                    </h4>
                    <p className="text-xs text-slate-500">
                      Merekam aksi-aksi yang tersimpan di HP dalam mode offline-first sebelum dipublikasi ke server.
                    </p>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {sqliteOutbox.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearOutboxQueue}
                        className="p-1 px-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-xs font-bold transition flex items-center gap-1"
                      >
                        Wipe Outbox
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSyncOutboxToServer}
                      disabled={sqliteOutbox.length === 0 || isSyncing}
                      className={`p-1 px-3.5 rounded text-xs font-bold transition flex items-center gap-1.5 shadow-sm ${
                        sqliteOutbox.length > 0 && !isSyncing
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <Send size={12} className={isSyncing ? "animate-spin" : ""} />
                      {isSyncing ? "Syncing..." : "Sync Push ke Server"}
                    </button>
                  </div>
                </div>

                {sqliteOutbox.length === 0 ? (
                  <div className="text-center py-7 border-2 border-dashed border-slate-200 rounded-lg text-slate-450 bg-slate-50/50">
                    <CheckCircle className="mx-auto text-emerald-400 mb-1.5" size={24} />
                    <p className="text-xs font-semibold">Tabel Outbox SQLite Kosong</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Semua aksi penagihan dan tanggung renteng telah sinkron dengan server pusat.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sqliteOutbox.map((item) => (
                      <div key={item.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 font-mono text-[11px]">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-800 text-[9px] rounded font-bold font-mono">
                              {item.action_type}
                            </span>
                            <span className="text-slate-400">ID: {item.id}</span>
                          </div>
                          <div className="text-slate-800 font-semibold mt-1">
                            {item.payload.details} — <span className="text-indigo-600 font-bold">Rp {item.payload.nominalBayar.toLocaleString('id-ID')}</span>
                          </div>
                          <span className="text-[9px] text-slate-400 block mt-0.5 font-sans">Antrean dicatat: {new Date(item.payload.timestamp).toLocaleTimeString()}</span>
                          
                          {item.error && (
                            <span className="text-[9px] text-rose-600 font-bold block mt-1">Error: {item.error}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 self-end md:self-center">
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] rounded font-semibold flex items-center gap-1 uppercase tracking-wider font-mono text-[9px]">
                            <Clock size={11} />
                            PENDING SYNC
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* CARD NO. 3 - DISBURSEMENT/WITHDRAWAL FOR AKUN 2140 */}
              <div className="bg-white rounded-xl p-5 shadow-xs border border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center gap-2">
                      <Coins className="text-amber-500" size={16} />
                      Serah Terima Dana Talangan (Akun 2140)
                    </h4>
                    <p className="text-xs text-slate-500">
                      Tempat penyerahan dana titipan secara fisik dari HP Petugas ke Nasabah Lender (Anggota Penalang).
                    </p>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-700 font-mono text-[10px] rounded border border-amber-200 font-bold border-dashed uppercase">
                    KAS TITIPAN
                  </span>
                </div>

                {sqliteJointLiabilities.filter(l => l.nominal_terbayar > 0 && !l.is_cash_withdrawn).length === 0 ? (
                  <div className="text-center py-7 border-2 border-dashed border-slate-200 rounded-lg text-slate-450 bg-slate-50/50">
                    <CheckCircle className="mx-auto text-slate-400 mb-1.5" size={24} />
                    <p className="text-xs font-semibold">Tidak Ada Saldo Titipan Mengendap</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Seluruh dana titipan di akun 2140 untuk kelompok ini telah diserahkan kembali kepada nasabah penolong/lender.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sqliteJointLiabilities
                      .filter(l => l.nominal_terbayar > 0 && !l.is_cash_withdrawn)
                      .map((l) => (
                        <div key={l.id} className="bg-amber-50/45 p-4 rounded-lg border border-amber-200 flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono text-[11px]">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] rounded font-bold font-mono">
                                Kewajiban Akun 2140
                              </span>
                              <span className="text-slate-500">ID: {l.id}</span>
                            </div>
                            <div className="text-slate-800 font-semibold mt-1">
                              Nominal Mengendap: <span className="text-emerald-700 font-bold text-sm">Rp {l.nominal_terbayar.toLocaleString('id-ID')}</span>
                            </div>
                            <div className="text-[11px] text-slate-600 space-y-0.5 font-sans font-medium">
                              <div>• Dari Borrower: <strong className="text-slate-800 font-bold">{l.borrower_name}</strong></div>
                              <div>• Berhak Diserahkan ke Lender: <strong className="text-indigo-800 font-extrabold">{l.lender_name}</strong></div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleWithdrawLiabilityCash(l.id)}
                            disabled={isWithdrawing === l.id}
                            className="px-3.5 py-2 bg-indigo-650 hover:bg-slate-950 text-white font-bold text-xs rounded-lg transition-all shadow-sm disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-1.5 justify-center shrink-0 self-end md:self-center hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                          >
                            {isWithdrawing === l.id ? 'Memproses...' : 'Serahkan Dana Talangan ke Anggota'}
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COMPONENT: Simulated Local Database State & Reference (Lg: 5/12 cols) */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Active Local SQLite State inspector */}
              <div className="bg-white rounded-xl p-5 shadow-xs border border-slate-200">
                <h3 className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Coins className="text-amber-500" size={16} />
                  SQLite Local Database Inspector
                </h3>
                <p className="text-xs text-slate-500 mb-3 font-sans">
                  Melihat kondisi data lokal di HP petugas lapangan (Simulated SQLite Table). Sisa nominal secara optimis dikurangi setelah Outbox dibentuk.
                </p>

                <div className="space-y-3">
                  {sqliteJointLiabilities.map((l) => {
                    const sisa = l.nominal_utang - l.nominal_terbayar;
                    return (
                      <div key={l.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-col gap-1.5 font-mono text-[11px]">
                        <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
                          <span className="font-bold text-indigo-750">ID Talangan: {l.id}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                            l.status === 'SETTLED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-250' :
                            l.status === 'PARTIAL' ? 'bg-amber-100 text-amber-800 border border-amber-250' :
                            'bg-slate-100 text-slate-550 border border-slate-200'
                          }`}>
                            {l.status}
                          </span>
                        </div>

                        <div className="flex justify-between text-[11px] font-sans font-medium">
                          <span className="text-slate-550 font-medium font-semibold">Anggota Menalangi:</span>
                          <span className="font-semibold text-slate-800">{l.lender_name}</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-sans font-medium">
                          <span className="text-slate-550 font-medium font-semibold">Anggota Berutang:</span>
                          <span className="font-semibold text-slate-800">{l.borrower_name}</span>
                        </div>
                        <div className="flex justify-between text-[11px] border-t border-dashed border-slate-200 pt-1.5 mt-0.5 font-sans font-medium border-slate-200">
                          <span className="text-slate-555">Dana Talangan Pokok:</span>
                          <span className="font-bold text-slate-800 font-mono text-xs">Rp {l.nominal_utang.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-sans font-medium">
                          <span className="text-slate-550 font-medium">Berhasil Terbayar:</span>
                          <span className="font-bold text-emerald-600 font-mono text-xs">Rp {l.nominal_terbayar.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="flex justify-between text-[11px] bg-slate-900 text-white p-1.5 rounded mt-1 font-sans">
                          <span className="text-slate-300 font-medium font-sans">Sisa Utang Internal:</span>
                          <span className="font-bold text-amber-400 font-mono text-xs">Rp {sisa.toLocaleString('id-ID')}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SAK Double-Entry Guide exception */}
              <div className="bg-slate-900 text-white rounded-xl p-5 border border-slate-800">
                <h4 className="text-xs font-bold text-slate-350 font-mono uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <FileSpreadsheet className="text-emerald-400" size={15} />
                  Prinsip Entri Ganda & Entitas Hukum
                </h4>
                <p className="text-[11px] text-slate-350 leading-relaxed mb-3">
                  Dalam akuntansi koperasi simpan pinjam (KSP) modern, kas resmi hanya dipengaruhi jika uang tunai keluar atau masuk brankas/bank kasir lembaga.
                </p>
                <div className="bg-slate-950 p-2.5 rounded border border-slate-850 font-mono text-[9px] text-amber-300 leading-normal">
                  <p className="font-bold text-white mb-1 uppercase tracking-wider">MENGAPA TIDAK ADA JURNAL UMUM?</p>
                  <span>
                    Nasabah A secara sukarela menalangi cicilan Nasabah B saat sidang kelompok (tanggung renteng harian). 
                    Koperasi memantau kewajiban ini secara internal. Saat Nasabah B mengembalikan uang kepada Nasabah A di lapangan, 
                    uang tersebut berpindah langsung antar perorangan. Koperasi tidak memegang uang fisik tersebut, sehingga rekening 1111 (Kas Petugas) 
                    maupun 1210 (Piutang Koperasi) tidak berubah posisi debit-kreditnya.
                  </span>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
