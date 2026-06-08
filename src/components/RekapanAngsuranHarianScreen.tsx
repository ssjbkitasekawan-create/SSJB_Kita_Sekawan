import React, { useState, useEffect } from 'react';
import { 
  Users, CheckCircle, Clock, ShieldCheck, HelpCircle, 
  ChevronDown, ChevronUp, AlertCircle, TrendingUp, DollarSign,
  Lock, RefreshCw, Layers, FileSpreadsheet, Send, Calendar, CheckSquare
} from 'lucide-react';

interface GroupData {
  groupId: string;
  groupName: string;
  totalUang: number;
  isApproved: boolean;
  status: 'APPROVED' | 'PENDING_KASIR';
  paymentCount: number;
  pendingCount: number;
}

interface PetugasRow {
  petugasId: string;
  petugasNama: string;
  groups: GroupData[];
  totalUang: number;
  isReadyToAcc: boolean;
  isLocked: boolean;
}

interface RekapanMetrics {
  totalSetoranTerverifikasi: number;
  totalSetoranPending: number;
  totalSetoranKas: number;
}

interface Props {
  onRefreshParent: () => void;
  activeUser: { id: string; nama: string; role: string } | null;
}

export default function RekapanAngsuranHarianScreen({ onRefreshParent, activeUser }: Props) {
  const [data, setData] = useState<PetugasRow[]>([]);
  const [metrics, setMetrics] = useState<RekapanMetrics>({
    totalSetoranTerverifikasi: 0,
    totalSetoranPending: 0,
    totalSetoranKas: 0
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [expandedPetugas, setExpandedPetugas] = useState<{ [id: string]: boolean }>({});
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/rekapan/data");
      const json = await res.json();
      if (res.ok && json.success) {
        setData(json.data);
        setMetrics(json.metrics);
        
        // Auto-expand officers with pending items
        const expanded: { [id: string]: boolean } = {};
        json.data.forEach((p: PetugasRow) => {
          expanded[p.petugasId] = true; // Expand everything by default for great visibility
        });
        setExpandedPetugas(prev => ({ ...expanded, ...prev }));
      } else {
        setErrorMsg(json.error || "Gagal memuat data rekapan harian.");
      }
    } catch (e: any) {
      setErrorMsg("Koneksi gagal terhubung ke server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedPetugas(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleApproveGroup = async (groupId: string, groupName: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setProcessingAction(`group-${groupId}`);

    try {
      const res = await fetch("/api/rekapan/approve-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setSuccessMsg(`Sukses Verifikasi Tahap 1: Uang fisik dari kelompok ${groupName} berhasil disetujui.`);
        await fetchData();
        onRefreshParent();
      } else {
        setErrorMsg(json.error || "Gagal menyetujui kelompok.");
      }
    } catch (e) {
      setErrorMsg("Koneksi gagal saat menyetujui kelompok.");
    } finally {
      setProcessingAction(null);
    }
  };

  const handleUnapproveGroup = async (groupId: string, groupName: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setProcessingAction(`group-${groupId}`);

    try {
      const res = await fetch("/api/rekapan/unapprove-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setSuccessMsg(`Persetujuan kelompok ${groupName} dibatalkan.`);
        await fetchData();
        onRefreshParent();
      } else {
        setErrorMsg(json.error || "Gagal membatalkan persetujuan.");
      }
    } catch (e) {
      setErrorMsg("Koneksi gagal saat membatalkan persetujuan.");
    } finally {
      setProcessingAction(null);
    }
  };

  const handleAccRekapan = async (petugasId: string, petugasNama: string, totalSetoran: number) => {
    if (!confirm(`Konfirmasi ACC Rekapan Harian?\n\nTindakan ini akan mengunci pembukuan ${petugasNama} hari ini, memindahkan Rp ${totalSetoran.toLocaleString('id-ID')} ke akun Kas Koperasi / Kasir Utama.`)) {
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setProcessingAction(`petugas-${petugasId}`);

    try {
      const res = await fetch("/api/rekapan/acc-rekapan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petugasId })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setSuccessMsg(`BERHASIL ACC! Rekapan Penagihan ${petugasNama} telah dikunci 🔒 dan kas masuk masuk ke brankas harian.`);
        await fetchData();
        onRefreshParent();
      } else {
        setErrorMsg(json.error || "Gagal melakukan ACC Rekapan.");
      }
    } catch (e) {
      setErrorMsg("Koneksi gagal saat melakukan ACC.");
    } finally {
      setProcessingAction(null);
    }
  };

  return (
    <div className="space-y-6" id="rekapan_angsuran_harian_container">
      {/* Header section with brand colors */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight font-display uppercase flex items-center gap-2">
            📊 REKAPAN PENERIMAAN KAS
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Konsol verifikasi dua tahap (Double Approval) untuk melunasi dan memvalidasi uang setoran penagihan petugas lapangan.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3 py-1.5 bg-slate-150 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold font-mono uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Regulative Banner explaining Cashier Double Verification Rules */}
      <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl p-4.5 flex gap-3 text-xs leading-relaxed max-w-4xl" id="double_approval_reg_rule">
        <ShieldCheck className="text-indigo-600 shrink-0 mt-0.5" size={20} />
        <div>
          <h3 className="font-bold font-mono tracking-wider text-indigo-950 uppercase mb-1">PROTOKOL VERIFIKASI DUA TAHAP (DOUBLE APPROVAL)</h3>
          <p>
            Sebelum data keuangan lapangan terekam ke Buku Besar, Kasir wajib menjalankan:
          </p>
          <ul className="list-decimal pl-4 mt-1.5 space-y-1 font-medium text-indigo-900 text-[11px]">
            <li><strong>Tahap 1 (Approve Kelompok)</strong>: Kasir memverifikasi uang fisik per kelompok yang disetor, lalu klik tombol biru <em>Approve Kelompok</em>.</li>
            <li><strong>Tahap 2 (ACC Rekapan Penagihan)</strong>: Setelah semua kelompok disetujui, Kasir menekan tombol utama <em>ACC Rekapan Penagihan</em> di bagian atas petugas untuk mengunci pembukuan harian petugas dan memposting mutasi kas masuk.</li>
          </ul>
        </div>
      </div>

      {successMsg && (
        <div id="rekapan_success_bar" className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg font-bold flex items-center gap-2 animate-fadeIn">
          <CheckSquare size={16} />
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div id="rekapan_error_bar" className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg font-bold flex items-center gap-2">
          <AlertCircle size={16} />
          {errorMsg}
        </div>
      )}

      {/* THREE SUMMARY CARDS METRIC PANEL: STRICT REQUIREMENT */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5" id="rekapan_metrics_panel">
        
        {/* Card 1: Total Setoran Terverifikasi */}
        <div className="bg-emerald-600 text-white rounded-2xl p-5 border border-emerald-500 shadow-sm flex items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-100 font-extrabold block">
              1. Terverifikasi (Approve Kelompok)
            </span>
            <div className="text-xl font-bold font-mono mt-1">
              Rp {metrics.totalSetoranTerverifikasi.toLocaleString('id-ID')}
            </div>
            <p className="text-[9.5px] text-emerald-100 font-medium">Uang fisik disetujui, siap di-ACC/dikunci.</p>
          </div>
          <div className="p-3.5 bg-emerald-700/80 rounded-xl text-emerald-100 flex items-center">
            <CheckCircle size={24} />
          </div>
        </div>

        {/* Card 2: Total Setoran Pending */}
        <div className="bg-amber-500 text-white rounded-2xl p-5 border border-amber-400 shadow-xs flex items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-100 font-extrabold block">
              2. Setoran Pending Kasir
            </span>
            <div className="text-xl font-bold font-mono mt-1">
              Rp {metrics.totalSetoranPending.toLocaleString('id-ID')}
            </div>
            <p className="text-[9.5px] text-amber-50 font-medium">Menunggu penghitungan uang fisik per kelompok.</p>
          </div>
          <div className="p-3.5 bg-amber-605 rounded-xl text-amber-50 flex items-center">
            <Clock size={24} className="animate-pulse" />
          </div>
        </div>

        {/* Card 3: Total Setoran Kas */}
        <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-xs flex items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-extrabold block">
              3. Total Setoran Kas (Omni)
            </span>
            <div className="text-xl font-bold font-mono mt-1 text-indigo-300">
              Rp {metrics.totalSetoranKas.toLocaleString('id-ID')}
            </div>
            <p className="text-[9.5px] text-slate-400 font-medium">Beban likuiditas dalam penyetoran hari ini.</p>
          </div>
          <div className="p-3.5 bg-slate-800 rounded-xl text-indigo-400 flex items-center">
            <DollarSign size={24} />
          </div>
        </div>

      </div>

      {/* TABLE/ACCORDION STRUCTURE GROUPED BY PETUGAS LAPANGAN */}
      <div className="bg-white rounded-2xl border shadow-xs overflow-hidden" id="rekapan_main_table_container">
        
        <div className="bg-slate-50 p-4 border-b border-slate-200">
          <h3 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider flex items-center gap-1.5">
            👥 Konsolidasi Setoran per Petugas Lapangan
          </h3>
          <p className="text-[11px] text-slate-500 font-sans mt-0.5">
            Berikut adalah daftar petugas lapangan yang baru menyinkronisasikan penagihan dari HP petugas.
          </p>
        </div>

        {data.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <CheckCircle className="mx-auto text-emerald-500 mb-2.5" size={40} />
            <h4 className="text-sm font-black text-slate-800 uppercase font-mono">Pembukuan Harian Bersih!</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Tidak ada petugas lapangan dengan setoran tertunda hari ini. Seluruh setoran penagihan telah tervalidasi dan dalam lemari arsip kasir.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-150">
            {data.map((row) => (
              <div key={row.petugasId} className="transition" id={`officer_row_${row.petugasId}`}>
                
                {/* Officer Summary Header Area */}
                <div 
                  className={`p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50 select-none ${
                    row.isLocked ? 'bg-slate-50/45 opacity-85' : ''
                  }`}
                  onClick={() => toggleExpand(row.petugasId)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-sm border border-indigo-100">
                      👤
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black text-slate-900 font-mono tracking-tight uppercase">
                          {row.petugasNama}
                        </h4>
                        <span className="text-[10px] font-mono text-slate-400 font-bold">
                          [ID: {row.petugasId}]
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-[11px] text-slate-500">
                          Membina <strong className="font-extrabold text-slate-800">{row.groups.length} Kelompok</strong> penagihan harian.
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                        <span className="text-[11px] text-slate-800 font-semibold font-mono">
                          Setoran: Rp {row.totalUang.toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* DOUBLE APPROVAL CONTROLS BAR */}
                  <div className="flex items-center gap-2.5 self-end sm:self-center" onClick={(e) => e.stopPropagation()}>
                    {row.isLocked ? (
                      <span className="px-3.5 py-1.5 bg-slate-100 text-slate-655 border border-slate-205 rounded-full text-[10.5px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <Lock size={12} className="text-slate-500" />
                        🔒 Locked & Recorded
                      </span>
                    ) : (
                      <>
                        {/* ACC Master Button */}
                        <button
                          type="button"
                          disabled={!row.isReadyToAcc || processingAction !== null}
                          onClick={() => handleAccRekapan(row.petugasId, row.petugasNama, row.totalUang)}
                          className={`px-4 py-2 font-black text-xs uppercase tracking-wider rounded-lg transition-all shadow-sm cursor-pointer flex items-center gap-1.5 ${
                            row.isReadyToAcc
                              ? 'bg-amber-600 hover:bg-amber-700 text-white hover:scale-[1.02] active:scale-[0.98]'
                              : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                          }`}
                          title={row.isReadyToAcc ? "ACC Rekapan Penagihan (Kunci Pembukuan)" : "Seluruh kelompok milik petugas wajib di-Approve terlebih dahulu"}
                        >
                          <Send size={12} className={processingAction === `petugas-${row.petugasId}` ? "animate-spin" : ""} />
                          ACC Rekapan Penagihan
                        </button>
                        
                        {/* Expand Trigger Button */}
                        <button
                          type="button"
                          onClick={() => toggleExpand(row.petugasId)}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"
                        >
                          {expandedPetugas[row.petugasId] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Groups Accordion Detail (Expanded Area) */}
                {expandedPetugas[row.petugasId] && (
                  <div className="bg-slate-50/50 p-4 border-t border-slate-150 animate-fadeIn" id={`groups_detail_${row.petugasId}`}>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                      <table className="w-full text-left font-sans text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase font-mono text-[9px] tracking-wider">
                            <th className="p-3">ID Kelompok</th>
                            <th className="p-3">Nama Kelompok</th>
                            <th className="p-3 text-right">Fisik Ditagih (HP Petugas)</th>
                            <th className="p-3 text-center">Rincian Anggota</th>
                            <th className="p-3 text-center">Status Verifikasi Kasir</th>
                            <th className="p-3 text-center">Aksi (Tahap 1)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150/80">
                          {row.groups.map((g) => (
                            <tr key={g.groupId} className="hover:bg-slate-50/50 transition">
                              <td className="p-3 font-mono font-bold text-slate-500">{g.groupId}</td>
                              <td className="p-3 font-black text-slate-800">{g.groupName}</td>
                              <td className="p-3 text-right font-black font-mono text-slate-900 text-sm">
                                Rp {g.totalUang.toLocaleString('id-ID')}
                              </td>
                              <td className="p-3 text-center text-slate-500 font-mono font-semibold">
                                {g.paymentCount} Pembayaran ({g.pendingCount} Pending)
                              </td>
                              <td className="p-3 text-center">
                                {g.isApproved ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold font-mono uppercase tracking-wide border border-emerald-200">
                                    <CheckCircle size={10} /> APPROVED
                                  </span>
                                ) : g.pendingCount === 0 ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold font-mono uppercase tracking-wide">
                                    NO PENDING ACTION
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold font-mono uppercase tracking-wide border border-amber-200">
                                    <Clock size={10} /> PENDING KASIR
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                {row.isLocked ? (
                                  <span className="text-[10px] text-slate-400 italic">Terkuci ledger</span>
                                ) : g.pendingCount === 0 ? (
                                  <span className="text-[10px] text-slate-400 italic font-mono">-</span>
                                ) : g.isApproved ? (
                                  <button
                                    type="button"
                                    disabled={processingAction !== null}
                                    onClick={() => handleUnapproveGroup(g.groupId, g.groupName)}
                                    className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold rounded-lg border border-rose-200 transition cursor-pointer"
                                  >
                                    ✖ Batal Approve
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={processingAction !== null}
                                    onClick={() => handleApproveGroup(g.groupId, g.groupName)}
                                    className="px-3.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg transition cursor-pointer shadow-3xs"
                                  >
                                    ✔ Approve Kelompok
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            ))}
          </div>
        )}

      </div>

      {/* SAK Akuntansi Sektor Riil Footer Card information */}
      <div className="bg-slate-900 text-slate-300 rounded-2xl p-5 border border-slate-800">
        <h4 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <FileSpreadsheet className="text-emerald-400" size={15} />
          Prinsip Penutupan Kas Lapangan (KSP SAK-ETAP)
        </h4>
        <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
          Jurnal penyesuaian harian otomatis dipicu saat tombol <strong>"ACC Rekapan Penagihan"</strong> divalidasi. 
          Sistem akan mendebit Kas Kecil (1110) atau Rekening Kas Bank (1112) sesuai metode transfer / tunai dari lembar setoran petugas, 
          dan mengkreditkan piutang kontinjensi transisi (1111) dari Petugas Lapangan. Kunci buku ini bersifat final dan tidak dapat direvisi secara sepihak.
        </p>
      </div>
    </div>
  );
}
