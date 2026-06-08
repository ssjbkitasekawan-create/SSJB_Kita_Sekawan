import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  X, 
  Users, 
  MapPin, 
  User, 
  Calendar, 
  CalendarCheck,
  Check, 
  AlertCircle, 
  CheckCircle, 
  RefreshCw, 
  Coins, 
  BookOpen, 
  Search,
  SlidersHorizontal,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Database,
  Clock,
  Trash2,
  Pencil,
  FileSpreadsheet,
  Upload,
  Printer
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SystemState, Customer, Group, Region } from '../types';

export function calculateLoanStatus(loan: {
  plafon: number;
  tenor: number;
  tanggal_cair: Date | string;
  payments: { nominal_bayar: number; status: string }[];
}) {
  const pokok = loan.plafon || 0;
  const bunga = pokok * 0.1; // 10%
  const totalPiutang = pokok + bunga;
  const targetAngsuran = totalPiutang / (loan.tenor || 1);

  const actualTotalSetoran = (loan.payments || [])
    .filter(p => p.status === 'SETORAN_APPROVED' || p.status === 'LUNAS_HISTORIS' || p.status === 'LUNAS_TALANGAN')
    .reduce((sum, p) => sum + (p.nominal_bayar || 0), 0);

  const sisaSaldo = Math.max(0, totalPiutang - actualTotalSetoran);

  // Expected Weeks
  const tCair = new Date(loan.tanggal_cair);
  const tToday = new Date();
  tCair.setHours(0,0,0,0);
  tToday.setHours(0,0,0,0);
  const timeDiff = tToday.getTime() - tCair.getTime();
  const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
  const expectedWeeks = Math.max(0, Math.floor(daysDiff / 7));

  const expectedTotalSetoran = targetAngsuran * expectedWeeks;
  const selisih = expectedTotalSetoran - actualTotalSetoran;

  let statusTagihan: 'SESUAI TARGET' | 'PIUTANG TAK TERTAGIH' | 'KELEBIHAN SETORAN' = 'SESUAI TARGET';
  if (selisih > 0) {
    statusTagihan = 'PIUTANG TAK TERTAGIH';
  } else if (selisih < 0) {
    statusTagihan = 'KELEBIHAN SETORAN';
  }

  return {
    pokok,
    bunga,
    totalPiutang,
    targetAngsuran,
    actualTotalSetoran,
    sisaSaldo,
    expectedWeeks,
    expectedTotalSetoran,
    selisih,
    statusTagihan
  };
}

interface ManajemenPenagihanScreenProps {
  onRefreshParent: () => void;
  systemState: SystemState | null;
  activeRole: string;
  activeBranch?: 'ALL' | 'PUSAT' | 'KC_MATIM';
  setActiveBranch?: (branch: 'ALL' | 'PUSAT' | 'KC_MATIM') => void;
}

export const ManajemenPenagihanScreen: React.FC<ManajemenPenagihanScreenProps> = ({
  onRefreshParent,
  systemState,
  activeRole,
  activeBranch = 'ALL',
  setActiveBranch
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    if (activeRole !== 'super_admin') {
      return activeBranch === 'KC_MATIM' ? 'KC_MATIM' : 'PUSAT';
    }
    return activeBranch || 'ALL';
  });

  const [localGroups, setLocalGroups] = useState<Group[]>([]);
  const [loadingLocalGroups, setLoadingLocalGroups] = useState(false);

  // Sync state if activeRole changes or inactive branch lock
  useEffect(() => {
    if (activeRole !== 'super_admin') {
      const lockedVal = activeBranch === 'KC_MATIM' ? 'KC_MATIM' : 'PUSAT';
      setSelectedBranch(lockedVal);
    } else if (activeBranch) {
      setSelectedBranch(activeBranch);
    }
  }, [activeRole, activeBranch]);

  // Handle local branch select change
  const handleBranchChange = (newVal: string) => {
    setSelectedBranch(newVal);
    if (setActiveBranch && (newVal === 'ALL' || newVal === 'PUSAT' || newVal === 'KC_MATIM')) {
      setActiveBranch(newVal);
    }
  };

  const fetchLocalGroups = async () => {
    setLoadingLocalGroups(true);
    try {
      const token = localStorage.getItem('erp_token') || 'sim-jwt.eyJ1c2VySWQiOiJTVVBFUl9BRE1JTiIsInJvbGUiOiJzdXBlcl9hZG1pbiJ9';
      const res = await fetch(`/api/penagihan?cabang=${selectedBranch}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setLocalGroups(data.groups || []);
      }
    } catch (err) {
      console.error("Gagal mematikan api/penagihan: ", err);
    } finally {
      setLoadingLocalGroups(false);
    }
  };

  useEffect(() => {
    fetchLocalGroups();
  }, [selectedBranch, systemState?.groups]);
  
  // Form State
  const [selectedPetugasId, setSelectedPetugasId] = useState('');
  const [selectedRegionId, setSelectedRegionId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [currentWeek, setCurrentWeek] = useState(5); // Default 5 weeks historical
  
  // Group details computed from selected group
  const [groupTenor, setGroupTenor] = useState(10);
  const [groupPlafon, setGroupPlafon] = useState(5000000);

  // Dynamic grid state: customerId -> week -> { pokok, jasa }
  const [historyGrid, setHistoryGrid] = useState<{
    [custId: string]: {
      [week: number]: { pokok: number; jasa: number; isPaid: boolean }
    }
  }>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Excel Import States
  const [isImportExcelModalOpen, setIsImportExcelModalOpen] = useState(false);
  const [importedRows, setImportedRows] = useState<any[]>([]);
  const [importOfficerId, setImportOfficerId] = useState('');
  const [importHariPenagihan, setImportHariPenagihan] = useState<'SENIN' | 'SELASA' | 'RABU' | 'KAMIS' | 'JUMAT' | 'SABTU'>('SENIN');
  const [importRegionId, setImportRegionId] = useState('');
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const [importErrorMsg, setImportErrorMsg] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Export Data and Expandable Accordion States
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>({});

  // Advanced Route Mapping Form State
  const [isPemetaanModalOpen, setIsPemetaanModalOpen] = useState(false);
  const [isPemetaanEditMode, setIsPemetaanEditMode] = useState(false);
  const [pemetaanMode, setPemetaanMode] = useState<'otomatis' | 'manual'>('otomatis');
  const [pemetaanGroupId, setPemetaanGroupId] = useState('');
  const [pemetaanIsTR, setPemetaanIsTR] = useState(true);
  const [pemetaanPetugasId, setPemetaanPetugasId] = useState('');
  const [pemetaanHari, setPemetaanHari] = useState<'SENIN' | 'SELASA' | 'RABU' | 'KAMIS' | 'JUMAT' | 'SABTU'>('SENIN');
  const [pemetaanJamSetoran, setPemetaanJamSetoran] = useState('09:00');
  const [pemetaanUrutan, setPemetaanUrutan] = useState(1);

  // Manual Mode Inputs State
  const [pemetaanNamaKelompokBaru, setPemetaanNamaKelompokBaru] = useState('');
  const [pemetaanManualRegionId, setPemetaanManualRegionId] = useState('');
  const [pemetaanNewRegionName, setPemetaanNewRegionName] = useState('');
  const [pemetaanTanggalPencairan, setPemetaanTanggalPencairan] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [pemetaanTanggalJatuhTempo, setPemetaanTanggalJatuhTempo] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [pemetaanPokokPinjaman, setPemetaanPokokPinjaman] = useState<number>(5000000);
  const [pemetaanPokokBunga, setPemetaanPokokBunga] = useState<number>(5500000);
  const [pemetaanTargetAngsuran, setPemetaanTargetAngsuran] = useState<number>(1100000);
  const [pemetaanMembers, setPemetaanMembers] = useState<{ 
    id?: string;
    name: string; 
    pokok: number; 
    pokokBunga: number; 
    tenor: number; 
    angsuran: number; 
    mingguBerjalan?: number;
  }[]>([
    { name: '', pokok: 1000000, pokokBunga: 1100000, tenor: 10, angsuran: 110000, mingguBerjalan: 0 }
  ]);

  // Dynamic Route Assignment State
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [targetGroup, setTargetGroup] = useState<Group | null>(null);
  const [routePetugasId, setRoutePetugasId] = useState('');
  const [routeHari, setRouteHari] = useState<'SENIN' | 'SELASA' | 'RABU' | 'KAMIS' | 'JUMAT' | 'SABTU'>('SENIN');
  const [routeUrutan, setRouteUrutan] = useState(1);

  const handleOpenEditRoute = (itemGroup: Group) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setPemetaanMode('otomatis');
    setPemetaanGroupId(itemGroup.id);
    setPemetaanNamaKelompokBaru(itemGroup.name || '');
    setPemetaanManualRegionId(itemGroup.region_id || '');
    setPemetaanNewRegionName('');
    
    // Fallback search assignee
    const groupMembers = systemState?.customers?.filter(c => c.group_id === itemGroup.id) || [];
    const defaultUserId = itemGroup.assigned_user_id || itemGroup.petugas_assigned_id || groupMembers[0]?.assigned_user_id || '';
    
    setPemetaanPetugasId(defaultUserId);
    setPemetaanHari((itemGroup.hari_penagihan || 'SENIN') as any);
    setPemetaanJamSetoran(itemGroup.jam_setoran || '09:00');
    setPemetaanUrutan(itemGroup.urutan_rute || 1);
    
    const isTR = typeof itemGroup.is_tanggung_renteng !== 'undefined'
      ? itemGroup.is_tanggung_renteng
      : (typeof itemGroup.sistem_tanggung_renteng !== 'undefined' ? itemGroup.sistem_tanggung_renteng : true);
    setPemetaanIsTR(isTR);

    // Pull members of this group with details
    const membersData = groupMembers.map(m => {
      const loan = systemState?.loans?.find(l => l.customer_id === m.id);
      const custSchedules = systemState?.billingSchedules?.filter(b => b.customer_id === m.id) || [];
      const totalPokok = custSchedules.reduce((sum, b) => sum + (b.pokok || 0), 0) || loan?.plafon || 0;
      const totalJasa = custSchedules.reduce((sum, b) => sum + (b.jasa || 0), 0) || 0;
      const totalPokokBunga = totalPokok + totalJasa;
      const tenorVal = (loan as any)?.tenor || custSchedules.length || 10;
      const targetAngsuran = custSchedules[0]?.total_tagihan || Math.round(totalPokokBunga / (tenorVal || 1));
      
      const paidTermsCount = custSchedules.filter(b => b.status === "PAID").length;
      const runningWeek = typeof (loan as any)?.installment_paid !== 'undefined' 
        ? (loan as any).installment_paid 
        : (typeof (loan as any)?.minggu_terbayar !== 'undefined' ? (loan as any).minggu_terbayar : paidTermsCount);

      return {
        id: m.id,
        name: m.name,
        pokok: totalPokok,
        pokokBunga: totalPokokBunga,
        tenor: tenorVal,
        angsuran: targetAngsuran,
        mingguBerjalan: runningWeek || 0
      };
    });
    setPemetaanMembers(membersData.length > 0 ? membersData : [{ name: '', pokok: 1000000, pokokBunga: 1100000, tenor: 10, angsuran: 110000, mingguBerjalan: 0 }]);

    const firstLoan = systemState?.loans?.find(l => groupMembers.some(m => m.id === l.customer_id));
    const defaultCairDate = firstLoan?.tanggal_cair || itemGroup.cycle_start_date || new Date().toISOString().slice(0, 10);
    setPemetaanTanggalPencairan(defaultCairDate);
    
    const defaultMaturity = (firstLoan as any)?.tanggal_jatuh_tempo || new Date().toISOString().slice(0, 10);
    setPemetaanTanggalJatuhTempo(defaultMaturity);
    
    setIsPemetaanEditMode(true);
    setIsPemetaanModalOpen(true);
  };

  const handleUnassignGroup = async (group: Group) => {
    const confirmUnassign = window.confirm(
      `Apakah Anda yakin ingin membatalkan penugasan petugas untuk kelompok '${group.name}'?`
    );
    if (!confirmUnassign) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const token = localStorage.getItem('erp_token') || 'sim-jwt.eyJ1c2VySWQiOiJTVVBFUl9BRE1JTiIsInJvbGUiOiJzdXBlcl9hZG1pbiJ9';
      const res = await fetch('/api/penagihan/pemetaan/unassign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ group_id: group.id })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(data.message || "Penugasan kelompok berhasil dibatalkan!");
        onRefreshParent();
      } else {
        setErrorMsg(data.error || "Gagal membatalkan penugasan.");
      }
    } catch (err) {
      setErrorMsg("Koneksi gagal: Tidak dapat menghubungi server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter State for Active Assignments Table
  const [filterHari, setFilterHari] = useState<string>('ALL');
  const [filterPetugas, setFilterPetugas] = useState<string>('ALL');

  // State Variables for "REKAPAN ANGSURAN HARIAN" Sub-tab
  const [activeSubTab, setActiveSubTab] = useState<'penugasan' | 'rekapan'>('penugasan');
  const [selectedRekapanPetugas, setSelectedRekapanPetugas] = useState<string>('');
  const [selectedRekapanHari, setSelectedRekapanHari] = useState<string>(() => {
    const days = ['SABTU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU']; // Sunday matches SAT as fallback
    const d = new Date().getDay();
    return days[d] || 'SENIN';
  });
  const [rekapanStatusFilter, setRekapanStatusFilter] = useState<'PENDING' | 'APPROVED'>('PENDING');
  const [approvedGroupIds, setApprovedGroupIds] = useState<Record<string, boolean>>({});
  const [rekapSuccessMsg, setRekapSuccessMsg] = useState<string | null>(null);
  const [rekapErrorMsg, setRekapErrorMsg] = useState<string | null>(null);
  const [isProcessingRekap, setIsProcessingRekap] = useState(false);

  const handleOpenRouteModal = (group: Group) => {
    setTargetGroup(group);
    
    // Fallback search assignee
    const groupMembers = systemState?.customers?.filter(c => c.group_id === group.id) || [];
    const defaultUserId = group.assigned_user_id || group.petugas_assigned_id || groupMembers[0]?.assigned_user_id || '';
    
    setRoutePetugasId(defaultUserId);
    setRouteHari((group.hari_penagihan || 'SENIN') as any);
    setRouteUrutan(group.urutan_rute || 1);
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsRouteModalOpen(true);
  };

  const handleRouteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetGroup) return;
    if (!routePetugasId || !routeHari) {
      setErrorMsg("Harap pilih petugas dan hari terlebih dahulu.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const token = localStorage.getItem('erp_token') || 'sim-jwt.eyJ1c2VySWQiOiJTVVBFUl9BRE1JTiIsInJvbGUiOiJzdXBlcl9hZG1pbiJ9';
      const res = await fetch('/api/users/assign-group', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          group_id: targetGroup.id,
          assigned_user_id: routePetugasId,
          hari_penagihan: routeHari,
          urutan_rute: Number(routeUrutan)
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(data.message || `Kelompok ${targetGroup.name} berhasil ditugaskan ke petugas!`);
        setTimeout(() => {
          setIsRouteModalOpen(false);
          setTargetGroup(null);
          onRefreshParent();
        }, 1200);
      } else {
        setErrorMsg(data.error || "Gagal memperbarui rute penagihan.");
      }
    } catch (err) {
      setErrorMsg("Koneksi gagal: Tidak dapat menghubungi server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExcelImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (importedRows.length === 0) {
      setImportErrorMsg("Silakan pilih dan unggah file Excel yang valid terlebih dahulu.");
      return;
    }
    if (!importOfficerId) {
      setImportErrorMsg("Harap pilih petugas lapangan penerima.");
      return;
    }

    setIsImporting(true);
    setImportErrorMsg(null);
    setImportSuccessMsg(null);

    try {
      const token = localStorage.getItem('sim_jwt_token') || '';
      const res = await fetch('/api/import-legacy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          rows: importedRows,
          assigned_user_id: importOfficerId,
          hari_penagihan: importHariPenagihan,
          kantor_cabang: selectedBranch
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Tampilkan Notifikasi/Toast sukses di halaman utama/dasbor
        setSuccessMsg(data.message || "Impor Excel Sukses!");
        
        // Tutup modal impor dan reset field pendukung
        setIsImportExcelModalOpen(false);
        setImportedRows([]);
        setImportOfficerId('');
        setImportRegionId('');
        setImportHariPenagihan('SENIN');
        setImportSuccessMsg(null);
        
        // Pemicu Auto-Refresh data tabel di dashboard utama secara real-time
        onRefreshParent();

        // Bersihkan Notifikasi/Toast sukses secara otomatis setelah 5 detik
        setTimeout(() => {
          setSuccessMsg(null);
        }, 5000);
      } else {
        setImportErrorMsg(data.error || "Gagal melakukan impor data Excel.");
      }
    } catch (err) {
      setImportErrorMsg("Koneksi gagal: Tidak dapat menghubungi server.");
    } finally {
      setIsImporting(false);
    }
  };

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroupIds(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const exportToExcel = () => {
    // Collect summary rows
    const summaryRows = activeAssignments.map((item, idx) => {
      return {
        "No": idx + 1,
        "Nama Kelompok": item.group.name,
        "Wilayah": item.region?.name || "Semua Wilayah/Luar Cabang",
        "Total Anggota": item.membersCount,
        "Hari Penagihan": item.group.hari_penagihan || "SENIN",
        "Petugas Lapangan": item.assignedUser?.nama || "Belum Assigned",
        "Status Minggu Berjalan": `Minggu ke-${item.currentWeek} Lunas`
      };
    });

    // Collect flattened detail rows
    const detailRows: any[] = [];
    let detailIdx = 1;

    activeAssignments.forEach(item => {
      const groupMembers = systemState?.customers?.filter(c => c.group_id === item.group.id) || [];
      groupMembers.forEach(cust => {
        const loan = systemState?.loans?.find(l => l.customer_id === cust.id);
        const custSchedules = systemState?.billingSchedules?.filter(b => b.customer_id === cust.id) || [];
        const totalPokok = custSchedules.reduce((sum, b) => sum + (b.pokok || 0), 0) || loan?.plafon || 0;
        const totalJasa = custSchedules.reduce((sum, b) => sum + (b.jasa || 0), 0) || 0;
        const pokokBunga = totalPokok + totalJasa;
        const targetAngsuran = custSchedules[0]?.total_tagihan || Math.round(pokokBunga / (loan?.tenor || 10));

        detailRows.push({
          "No": detailIdx++,
          "Nama Kelompok": item.group.name,
          "Nama Anggota": cust.name,
          "Besar Pinjaman (Plafon)": totalPokok,
          "Pokok + Bunga": pokokBunga,
          "Target (Angsuran)": targetAngsuran,
          "Tenor": (loan as any)?.tenor || 10,
          "Tanggal Pencairan": loan?.tanggal_cair || "-",
          "Tanggal Jatuh Tempo": (loan as any)?.tanggal_jatuh_tempo || "-"
        });
      });
    });

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Ringkasan");

    const wsDetail = XLSX.utils.json_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(wb, wsDetail, "Detail Anggota");

    XLSX.writeFile(wb, `Laporan_Manajemen_Penagihan_${selectedBranch}.xlsx`);
  };

  const exportToCSV = () => {
    const detailRows: any[] = [];
    let detailIdx = 1;

    activeAssignments.forEach(item => {
      const groupMembers = systemState?.customers?.filter(c => c.group_id === item.group.id) || [];
      groupMembers.forEach(cust => {
        const loan = systemState?.loans?.find(l => l.customer_id === cust.id);
        const custSchedules = systemState?.billingSchedules?.filter(b => b.customer_id === cust.id) || [];
        const totalPokok = custSchedules.reduce((sum, b) => sum + (b.pokok || 0), 0) || loan?.plafon || 0;
        const totalJasa = custSchedules.reduce((sum, b) => sum + (b.jasa || 0), 0) || 0;
        const pokokBunga = totalPokok + totalJasa;
        const targetAngsuran = custSchedules[0]?.total_tagihan || Math.round(pokokBunga / (loan?.tenor || 10));

        detailRows.push({
          "No": detailIdx++,
          "Nama Kelompok": item.group.name,
          "Nama Anggota": cust.name,
          "Besar Pinjaman": totalPokok,
          "PokokBunga": pokokBunga,
          "TargetAngsuran": targetAngsuran,
          "Tenor": (loan as any)?.tenor || 10,
          "TanggalPencairan": loan?.tanggal_cair || "-",
          "TanggalJatuhTempo": (loan as any)?.tanggal_jatuh_tempo || "-"
        });
      });
    });

    const headers = ["No", "Nama Kelompok", "Nama Anggota", "Besar Pinjaman", "Pokok+Bunga", "Target (Angsuran)", "Tenor", "Tanggal Pencairan", "Tanggal Jatuh Tempo"];
    const csvContent = [
      headers.join(","),
      ...detailRows.map(row => [
        row["No"],
        `"${row["Nama Kelompok"]}"`,
        `"${row["Nama Anggota"]}"`,
        row["Besar Pinjaman"],
        row["PokokBunga"],
        row["TargetAngsuran"],
        row["Tenor"],
        `"${row["TanggalPencairan"]}"`,
        `"${row["TanggalJatuhTempo"]}"`
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Laporan_Manajemen_Penagihan_${selectedBranch}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.text("LAPORAN RUTE PENAGIHAN HARIAN LAPANGAN", 14, 15);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Kantor Cabang: ${selectedBranch === 'ALL' ? 'Semua Cabang' : (selectedBranch === 'KC_MATIM' ? 'KC Manggarai Timur' : 'Pusat')}`, 14, 21);
    doc.text(`Mata Uang: IDR (Rupiah) | Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 14, 26);
    
    const tableData: any[] = [];
    let counter = 1;

    activeAssignments.forEach(item => {
      const groupMembers = systemState?.customers?.filter(c => c.group_id === item.group.id) || [];
      groupMembers.forEach(cust => {
        const loan = systemState?.loans?.find(l => l.customer_id === cust.id);
        const custSchedules = systemState?.billingSchedules?.filter(b => b.customer_id === cust.id) || [];
        const totalPokok = custSchedules.reduce((sum, b) => sum + (b.pokok || 0), 0) || loan?.plafon || 0;
        const totalJasa = custSchedules.reduce((sum, b) => sum + (b.jasa || 0), 0) || 0;
        const pokokBunga = totalPokok + totalJasa;
        const targetAngsuran = custSchedules[0]?.total_tagihan || Math.round(pokokBunga / (loan?.tenor || 10));

        tableData.push([
          counter++,
          item.group.name,
          cust.name,
          `Rp ${totalPokok.toLocaleString('id-ID')}`,
          `Rp ${pokokBunga.toLocaleString('id-ID')}`,
          `Rp ${targetAngsuran.toLocaleString('id-ID')}`,
          `${(loan as any)?.tenor || 10} Mg`,
          item.assignedUser?.nama || "-",
          item.group.hari_penagihan || "SENIN",
          "........................."
        ]);
      });
    });

    autoTable(doc, {
      startY: 32,
      head: [[
        "No", 
        "Kelompok", 
        "Nama Anggota", 
        "Besar Pinjaman", 
        "Pokok + Bunga", 
        "Target (Wajib)", 
        "Tenor", 
        "Petugas", 
        "Hari", 
        "TTD / KETERANGAN"
      ]],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [79, 70, 229],
        fontStyle: 'bold',
        fontSize: 8
      },
      bodyStyles: {
        fontSize: 7,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 25 },
        2: { cellWidth: 35 },
        3: { cellWidth: 25 },
        4: { cellWidth: 25 },
        5: { cellWidth: 25 },
        6: { cellWidth: 15 },
        7: { cellWidth: 25 },
        8: { cellWidth: 15 },
        9: { cellWidth: 45 }
      }
    });

    doc.save(`Laporan_Rute_Penagihan_${selectedBranch}.pdf`);
  };

  const exportRekapanToPDF = (
    processedPayments: any[], 
    stats: {
      totalSetoranKasTunai: number;
      totalPiutangTakTertagih: number;
      totalPiutangLapanganOutstanding: number;
    }
  ) => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    // 1. Corporate Header Design
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59); // deep slate
    doc.text("PT SEKAWAN SEJAHTERA BERSAMA", 14, 15);
    
    doc.setFontSize(11);
    doc.setTextColor(71, 85, 105); // intermediate slate
    doc.text("LAPORAN REKAPAN ANGSURAN HARIAN (DOUBLE-ENTRY ACC)", 14, 21);
    
    // Draw a thin line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(14, 24, 283, 24);

    // Meta details
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Kantor Cabang : ${selectedBranch === 'ALL' ? 'Semua Cabang' : (selectedBranch === 'KC_MATIM' ? 'KC Manggarai Timur' : 'Pusat')}`, 14, 30);
    doc.text(`Nama Petugas   : ${getOfficerName(selectedRekapanPetugas)}`, 14, 35);
    
    const hariFormat = selectedRekapanHari ? selectedRekapanHari.charAt(0).toUpperCase() + selectedRekapanHari.slice(1).toLowerCase() : 'Hari Ini';
    doc.text(`Hari Penagihan : ${hariFormat}`, 150, 30);
    doc.text(`Tanggal Cetak  : ${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}`, 150, 35);

    // Prepare table data
    const tableData: any[] = [];
    let counter = 1;

    processedPayments.forEach(p => {
      const customer = systemState?.customers.find(c => c.id === p.customer_id);
      const group = systemState?.groups.find(g => g.id === customer?.group_id);
      const sched = systemState?.billingSchedules.find(b => b.id === p.billing_schedule_id);

      const statusKehadiran = p.is_lari 
        ? "LARI" 
        : (p.is_menunggak ? "ABSEN / MENUNGGAK" : "HADIR");

      let setoranLabel = "Rp 0";
      if (!p.is_menunggak && !p.is_lari) {
        setoranLabel = `Rp ${p.nominal_bayar.toLocaleString('id-ID')} (${p.payment_method || 'TUNAI'})`;
      }

      tableData.push([
        counter++,
        group?.name || 'Belum Ditugaskan',
        customer?.name || '-',
        sched ? `Minggu ${sched.term}` : '-',
        setoranLabel,
        statusKehadiran
      ]);
    });

    autoTable(doc, {
      startY: 42,
      head: [[
        "No", 
        "Nama Kelompok", 
        "Nama Anggota", 
        "Minggu Berjalan", 
        "Setoran (Tunai/Transfer)", 
        "Status Kehadiran"
      ]],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [30, 41, 59], // Slate 800 corporate theme
        fontStyle: 'bold',
        fontSize: 8.5
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: 2.5
      },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 50 },
        2: { cellWidth: 60 },
        3: { cellWidth: 35 },
        4: { cellWidth: 60 },
        5: { cellWidth: 49 }
      }
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 100;

    // Remaining height safety check: If finalY is too low, add a page
    let sigY = finalY + 32;
    if (sigY > 180) {
      doc.addPage();
      sigY = 40;
    }

    // Summary Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(14, sigY - 26, 269, 16, 1.5, 1.5, "FD");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    
    doc.text(
      `Setoran Kas (Tunai): Rp ${stats.totalSetoranKasTunai.toLocaleString('id-ID')}   |   Piutang Tak Tertagih: Rp ${stats.totalPiutangTakTertagih.toLocaleString('id-ID')}   |   Piutang Lapangan (Outstanding): Rp ${stats.totalPiutangLapanganOutstanding.toLocaleString('id-ID')}`,
      18,
      sigY - 16
    );

    // Signatures Area
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text("Lembar verifikasi harian kasir & pertanggungjawaban fisik petugas lapangan:", 14, sigY - 5);

    doc.setFont("Helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("Petugas Lapangan,", 30, sigY + 5);
    doc.text("Kasir Pemutus / Verifikator,", 190, sigY + 5);

    // Line anchors
    doc.setFont("Helvetica", "normal");
    doc.text("_________________________", 30, sigY + 22);
    doc.text("_________________________", 190, sigY + 22);

    doc.setFont("Helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(getOfficerName(selectedRekapanPetugas), 30, sigY + 27);
    doc.text("KASIR HARIAN", 190, sigY + 27);

    doc.save(`Laporan_Rekapan_Angsuran_${getOfficerName(selectedRekapanPetugas).replace(/\s+/g, '_')}_${selectedRekapanHari}.pdf`);
  };

  // Automate group financing totals and maturity dates from member list entries (Manual Mode or Edit Mode)
  useEffect(() => {
    if ((pemetaanMode === 'manual' || isPemetaanEditMode) && pemetaanMembers.length > 0) {
      const totalPokok = pemetaanMembers.reduce((sum, m) => sum + (Number(m.pokok) || 0), 0);
      const totalBunga = pemetaanMembers.reduce((sum, m) => sum + (Number(m.pokokBunga) || 0), 0);
      const totalAngsuran = pemetaanMembers.reduce((sum, m) => sum + (Number(m.angsuran) || 0), 0);
      setPemetaanPokokPinjaman(totalPokok);
      setPemetaanPokokBunga(totalBunga);
      setPemetaanTargetAngsuran(totalAngsuran);

      // Formula: Tanggal Jatuh Tempo = Tanggal Pencairan + (Tenor * 7 hari)
      const maxTenor = Math.max(...pemetaanMembers.map(m => m.tenor || 10), 10);
      const daysToAdd = maxTenor * 7;
      const parsedCair = new Date(pemetaanTanggalPencairan);
      if (!isNaN(parsedCair.getTime())) {
        parsedCair.setDate(parsedCair.getDate() + daysToAdd);
        setPemetaanTanggalJatuhTempo(parsedCair.toISOString().slice(0, 10));
      }
    }
  }, [pemetaanMembers, pemetaanMode, isPemetaanEditMode, pemetaanTanggalPencairan]);

  const handlePemetaanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isPemetaanEditMode) {
      if (!pemetaanGroupId) {
        setErrorMsg("Harap pilih kelompok sasaran.");
        return;
      }
      if (!pemetaanPetugasId) {
        setErrorMsg("Harap pilih petugas lapangan.");
        return;
      }
      if (!pemetaanManualRegionId) {
        setErrorMsg("Harap pilih wilayah atau buat wilayah baru.");
        return;
      }
      if (pemetaanManualRegionId === 'create_new' && !pemetaanNewRegionName.trim()) {
        setErrorMsg("Harap masukkan nama wilayah baru.");
        return;
      }
      if (pemetaanMembers.some(m => !m.name.trim())) {
        setErrorMsg("Harap isi nama semua anggota kelompok.");
        return;
      }
    } else if (pemetaanMode === 'manual') {
      if (!pemetaanNamaKelompokBaru.trim()) {
        setErrorMsg("Harap masukkan nama kelompok baru.");
        return;
      }
      if (!pemetaanManualRegionId) {
        setErrorMsg("Harap pilih wilayah atau buat wilayah baru.");
        return;
      }
      if (pemetaanManualRegionId === 'create_new' && !pemetaanNewRegionName.trim()) {
        setErrorMsg("Harap masukkan nama wilayah baru.");
        return;
      }
      if (!pemetaanPetugasId) {
        setErrorMsg("Harap pilih petugas lapangan.");
        return;
      }
      if (pemetaanMembers.some(m => !m.name.trim())) {
        setErrorMsg("Harap isi nama semua anggota kelompok.");
        return;
      }
    } else {
      if (!pemetaanGroupId) {
        setErrorMsg("Harap pilih kelompok sasaran.");
        return;
      }
      if (!pemetaanPetugasId) {
        setErrorMsg("Harap pilih petugas lapangan.");
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const token = localStorage.getItem('erp_token') || 'sim-jwt.eyJ1c2VySWQiOiJTVVBFUl9BRE1JTiIsInJvbGUiOiJzdXBlcl9hZG1pbiJ9';
      
      const url = isPemetaanEditMode ? `/api/penagihan/pemetaan/${pemetaanGroupId}` : '/api/penagihan/pemetaan';
      const method = isPemetaanEditMode ? 'PUT' : 'POST';

      const requestBody = isPemetaanEditMode ? {
        assigned_user_id: pemetaanPetugasId,
        hari_penagihan: pemetaanHari,
        urutan_rute: Number(pemetaanUrutan),
        jam_setoran: pemetaanJamSetoran,
        is_tanggung_renteng: pemetaanIsTR,
        region_id: pemetaanManualRegionId,
        new_region_name: pemetaanNewRegionName.trim(),
        tanggal_pencairan: pemetaanTanggalPencairan,
        tanggal_jatuh_tempo: pemetaanTanggalJatuhTempo,
        members: pemetaanMembers
      } : (pemetaanMode === 'manual' ? {
        mode: 'manual',
        nama_kelompok: pemetaanNamaKelompokBaru.trim(),
        region_id: pemetaanManualRegionId,
        new_region_name: pemetaanNewRegionName.trim(),
        tanggal_pencairan: pemetaanTanggalPencairan,
        tanggal_jatuh_tempo: pemetaanTanggalJatuhTempo,
        pokok_pinjaman: Number(pemetaanPokokPinjaman),
        pokok_bunga: Number(pemetaanPokokBunga),
        target_angsuran: Number(pemetaanTargetAngsuran),
        is_tanggung_renteng: pemetaanIsTR,
        assigned_user_id: pemetaanPetugasId,
        hari_penagihan: pemetaanHari,
        jam_setoran: pemetaanJamSetoran,
        urutan_rute: Number(pemetaanUrutan),
        members: pemetaanMembers
      } : {
        mode: 'otomatis',
        group_id: pemetaanGroupId,
        assigned_user_id: pemetaanPetugasId,
        hari_penagihan: pemetaanHari,
        urutan_rute: Number(pemetaanUrutan),
        jam_setoran: pemetaanJamSetoran,
        is_tanggung_renteng: pemetaanIsTR
      });

      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(data.message || "Pemetaan rute kelompok berhasil disimpan!");
        setTimeout(() => {
          setIsPemetaanModalOpen(false);
          setIsPemetaanEditMode(false);
          setPemetaanGroupId('');
          setPemetaanNamaKelompokBaru('');
          setPemetaanManualRegionId('');
          setPemetaanNewRegionName('');
          setPemetaanTanggalPencairan(new Date().toISOString().slice(0, 10));
          setPemetaanTanggalJatuhTempo(new Date().toISOString().slice(0, 10));
          setPemetaanPokokPinjaman(5000000);
          setPemetaanPokokBunga(5500000);
          setPemetaanTargetAngsuran(1100000);
          setPemetaanMembers([{ name: '', pokok: 1000000, pokokBunga: 1100000, tenor: 10, angsuran: 110000 }]);
          setPemetaanPetugasId('');
          setPemetaanHari('SENIN');
          setPemetaanJamSetoran('09:00');
          setPemetaanUrutan(1);
          setPemetaanIsTR(true);
          onRefreshParent();
        }, 1200);
      } else {
        setErrorMsg(data.error || "Gagal menyimpan rute kelompok.");
      }
    } catch (err) {
      setErrorMsg("Koneksi gagal: Tidak dapat menghubungi server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get field officers
  const officers = systemState?.users?.filter(u => u.role === 'petugas') || [];

  // Unique collectors pool for "REKAPAN ANGSURAN HARIAN"
  const uniqueCollectors = Array.from(new Set([
    ...officers.map(o => o.id),
    ...(systemState?.payments || []).map(p => p.petugas_id)
  ])).filter(Boolean);

  const getOfficerName = (id: string) => {
    const user = systemState?.users?.find(u => u.id === id);
    if (user) return user.nama;
    if (id === 'Petugas Lapangan 1') return 'Petugas Lapangan 1';
    if (id === 'Petugas Lapangan (Offline)') return 'Petugas Lapangan (Offline)';
    return id;
  };

  // Set default officer for "REKAPAN ANGSURAN HARIAN"
  useEffect(() => {
    if (!selectedRekapanPetugas && uniqueCollectors.length > 0) {
      const withPending = uniqueCollectors.find(cId => 
        (systemState?.payments || []).some(p => p.status === 'PENDING_SETORAN' && p.petugas_id === cId)
      );
      setSelectedRekapanPetugas(withPending || uniqueCollectors[0]);
    }
  }, [uniqueCollectors, systemState?.payments, selectedRekapanPetugas]);

  // Filter groups by region, using the dynamically loaded groups based on selected branch
  const filteredGroups = (localGroups || []).filter(g => {
    if (!selectedRegionId) return true;
    return g.region_id === selectedRegionId;
  });

  // Get members of the chosen group
  const selectedGroupMembers = systemState?.customers?.filter(c => c.group_id === selectedGroupId) || [];

  // REKAPAN ANGSURAN HARIAN reactive lists and calculations
  const processedPayments = useMemo(() => {
    return (systemState?.payments || []).filter(p => {
      // Status filter
      if (rekapanStatusFilter === 'PENDING') {
        if (p.status !== 'PENDING_SETORAN') return false;
      } else {
        if (p.status !== 'SETORAN_APPROVED') return false;
      }

      // Officer filter
      if (selectedRekapanPetugas && p.petugas_id !== selectedRekapanPetugas) {
        return false;
      }

      // Customer and Group relations
      const customer = systemState?.customers?.find(c => c.id === p.customer_id);
      if (!customer) return false;

      const group = systemState?.groups?.find(g => g.id === customer.group_id);
      if (!group) return false;

      // Hari filter
      if (selectedRekapanHari && group.hari_penagihan?.toUpperCase() !== selectedRekapanHari.toUpperCase()) {
        return false;
      }

      return true;
    });
  }, [systemState?.payments, systemState?.customers, systemState?.groups, rekapanStatusFilter, selectedRekapanPetugas, selectedRekapanHari]);

  const relevantGroupsForRekap = useMemo(() => {
    const groupMap: Record<string, { group: Group; payments: any[]; totalTunai: number; totalTransfer: number; totalTagihan: number }> = {};
    
    processedPayments.forEach(p => {
      const customer = systemState?.customers?.find(c => c.id === p.customer_id);
      const groupId = customer?.group_id;
      if (!groupId) return;

      const group = systemState?.groups?.find(g => g.id === groupId);
      if (!group) return;

      const sched = systemState?.billingSchedules?.find(b => b.id === p.billing_schedule_id);

      if (!groupMap[groupId]) {
        groupMap[groupId] = {
          group,
          payments: [],
          totalTunai: 0,
          totalTransfer: 0,
          totalTagihan: 0
        };
      }

      groupMap[groupId].payments.push(p);
      if (p.is_menunggak || p.is_lari) {
        groupMap[groupId].totalTagihan += sched ? sched.total_tagihan : 0;
      } else {
        groupMap[groupId].totalTagihan += p.nominal_bayar;
        if (!p.payment_method || p.payment_method === 'TUNAI') {
          groupMap[groupId].totalTunai += p.nominal_bayar;
        } else {
          groupMap[groupId].totalTransfer += p.nominal_bayar;
        }
      }
    });

    return Object.values(groupMap);
  }, [processedPayments, systemState?.customers, systemState?.groups, systemState?.billingSchedules]);

  const stats = useMemo(() => {
    const totalSetoranKasTunai = processedPayments
      .filter(p => (!p.payment_method || p.payment_method === 'TUNAI') && !p.is_menunggak && !p.is_lari)
      .reduce((sum, p) => sum + p.nominal_bayar, 0);

    const totalPiutangTakTertagih = processedPayments
      .filter(p => p.is_menunggak || p.is_lari)
      .reduce((sum, p) => {
        const sched = systemState?.billingSchedules?.find(b => b.id === p.billing_schedule_id);
        return sum + (sched ? sched.total_tagihan : 0);
      }, 0);

    const groupIdsForOutstanding = Array.from(new Set(
      processedPayments.map(p => {
        const customer = systemState?.customers?.find(c => c.id === p.customer_id);
        return customer?.group_id;
      }).filter(Boolean)
    )) as string[];

    let totalPiutangLapanganOutstanding = 0;
    groupIdsForOutstanding.forEach(gId => {
      const members = (systemState?.customers || []).filter(c => c.group_id === gId);
      const unmaturedSchedules = (systemState?.billingSchedules || []).filter(b => 
        members.some(m => m.id === b.customer_id) && b.status !== 'PAID'
      );
      const remainingAmountForGroup = unmaturedSchedules.reduce((sum, b) => 
        sum + (b.total_tagihan - (b.bayar_pokok + b.bayar_jasa)), 0
      );
      totalPiutangLapanganOutstanding += remainingAmountForGroup;
    });

    return {
      totalSetoranKasTunai,
      totalPiutangTakTertagih,
      totalPiutangLapanganOutstanding
    };
  }, [processedPayments, systemState?.customers, systemState?.billingSchedules]);

  const handleSubmitRekapan = async () => {
    if (processedPayments.length === 0) {
      setRekapErrorMsg("Tidak ada pembayaran pelunasan harian untuk disetujui.");
      return;
    }

    const paymentIdsToVerify = processedPayments
      .filter(p => {
        const customer = systemState?.customers?.find(c => c.id === p.customer_id);
        const groupId = customer?.group_id;
        return groupId && approvedGroupIds[groupId];
      })
      .map(p => p.id);

    if (paymentIdsToVerify.length === 0) {
      setRekapErrorMsg("Belum ada kelompok yang disetujui (Tahap 1) atau tidak ada pembayaran aktif.");
      return;
    }

    setIsProcessingRekap(true);
    setRekapSuccessMsg(null);
    setRekapErrorMsg(null);

    try {
      const res = await fetch('/api/cashier/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_ids: paymentIdsToVerify,
          action: 'APPROVE',
          memo: `ACC REKAPAN PENAGIHAN - PETUGAS: ${getOfficerName(selectedRekapanPetugas)} HARI ${selectedRekapanHari}`
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setRekapSuccessMsg(`✓ SUKSES ACC REKAPAN: ${paymentIdsToVerify.length} Angsuran berhasil dibukukan & dimasukkan ke arus kas masuk!`);
        setApprovedGroupIds({});
        onRefreshParent();
      } else {
        setRekapErrorMsg(data.error || "Gagal melakukan ACC Rekapan Penagihan.");
      }
    } catch (err) {
      setRekapErrorMsg("Koneksi gagal: Tidak dapat menghubungi server untuk ACC.");
    } finally {
      setIsProcessingRekap(false);
    }
  };

  // Get currently selected Pemetaan group & region
  const selectedPemetaanGroup = systemState?.groups?.find(g => g.id === pemetaanGroupId);
  const selectedPemetaanRegion = selectedPemetaanGroup
    ? systemState?.regions?.find(r => r.id === selectedPemetaanGroup.region_id)
    : null;

  // Auto-populate advanced mapping fields when selected group changes
  useEffect(() => {
    if (selectedPemetaanGroup) {
      const isTR = typeof selectedPemetaanGroup.is_tanggung_renteng !== 'undefined'
        ? selectedPemetaanGroup.is_tanggung_renteng
        : (typeof selectedPemetaanGroup.sistem_tanggung_renteng !== 'undefined' ? selectedPemetaanGroup.sistem_tanggung_renteng : true);
      setPemetaanIsTR(isTR);
      
      if (selectedPemetaanGroup.hari_penagihan) {
        setPemetaanHari(selectedPemetaanGroup.hari_penagihan as any);
      }
      if (selectedPemetaanGroup.jam_setoran) {
        setPemetaanJamSetoran(selectedPemetaanGroup.jam_setoran);
      }
      if (selectedPemetaanGroup.urutan_rute) {
        setPemetaanUrutan(selectedPemetaanGroup.urutan_rute);
      }
      const groupMembers = systemState?.customers?.filter(c => c.group_id === pemetaanGroupId) || [];
      const defaultUserId = selectedPemetaanGroup.assigned_user_id || selectedPemetaanGroup.petugas_assigned_id || groupMembers[0]?.assigned_user_id || '';
      if (defaultUserId) {
        setPemetaanPetugasId(defaultUserId);
      }
    }
  }, [pemetaanGroupId, selectedPemetaanGroup]);

  // When selectedGroupId or currentWeek changes, auto-populate the history grid with default values
  useEffect(() => {
    if (!selectedGroupId) {
      setHistoryGrid({});
      return;
    }

    const linkedGroup = systemState?.groups?.find(g => g.id === selectedGroupId);
    const tenor = linkedGroup?.tenor || 10;
    setGroupTenor(tenor);

    const newGrid: typeof historyGrid = {};
    selectedGroupMembers.forEach(cust => {
      newGrid[cust.id] = {};
      for (let w = 1; w <= currentWeek; w++) {
        const defaultPokok = groupPlafon / tenor;
        const defaultJasa = groupPlafon * 0.01;
        newGrid[cust.id][w] = {
          pokok: defaultPokok,
          jasa: defaultJasa,
          isPaid: true
        };
      }
    });

    setHistoryGrid(newGrid);
  }, [selectedGroupId, currentWeek, selectedGroupMembers.length]);

  const handleInputChange = (custId: string, week: number, field: 'pokok' | 'jasa', value: number) => {
    setHistoryGrid(prev => ({
      ...prev,
      [custId]: {
        ...prev[custId],
        [week]: {
          ...prev[custId]?.[week],
          [field]: value
        }
      }
    }));
  };

  const handleTogglePaid = (custId: string, week: number) => {
    setHistoryGrid(prev => {
      const current = prev[custId]?.[week] || { pokok: 0, jasa: 0, isPaid: true };
      return {
        ...prev,
        [custId]: {
          ...prev[custId],
          [week]: {
            ...current,
            isPaid: !current.isPaid
          }
        }
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPetugasId || !selectedGroupId) {
      setErrorMsg("Harap lengkapi pilihan Petugas dan Kelompok.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Format grid inputs into historyData payload
    const historyData = selectedGroupMembers.map(cust => {
      const weeklyPayments: { [week: number]: { pokok: number; jasa: number; isPaid: boolean } } = {};
      for (let w = 1; w <= currentWeek; w++) {
        const gridVal = historyGrid[cust.id]?.[w] || { pokok: 0, jasa: 0, isPaid: false };
        weeklyPayments[w] = {
          pokok: gridVal.isPaid ? gridVal.pokok : 0,
          jasa: gridVal.isPaid ? gridVal.jasa : 0,
          isPaid: gridVal.isPaid
        };
      }
      return {
        customerId: cust.id,
        weeklyPayments
      };
    });

    try {
      const res = await fetch('/api/onboarding/assign-historical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          petugasId: selectedPetugasId,
          groupId: selectedGroupId,
          currentWeek,
          historyData
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(data.message || "Histori penagihan kelompok berhasil di-assign ke Petugas.");
        // Reset form
        setSelectedGroupId('');
        setSelectedRegionId('');
        setIsModalOpen(false);
        onRefreshParent();
      } else {
        setErrorMsg(data.error || "Gagal menyimpan data.");
      }
    } catch (err) {
      setErrorMsg("Koneksi gagal: Tidak dapat menghubungi server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper calculations for active view list with filtering & sorting, using localGroups loaded from API
  const activeAssignments = (localGroups || [])
    .map(g => {
      const groupMembers = systemState?.customers?.filter(c => c.group_id === g.id) || [];
      const assignedUserId = g.assigned_user_id || g.petugas_assigned_id || groupMembers[0]?.assigned_user_id;
      const assignedUser = systemState?.users?.find(u => u.id === assignedUserId);
      const region = systemState?.regions?.find(r => r.id === g.region_id);
      const assignedSchedules = systemState?.billingSchedules?.filter(b => groupMembers.some(m => m.id === b.customer_id)) || [];
      const maxPaidTerm = assignedSchedules.reduce((max, sched) => {
        if (sched.status === 'PAID') {
          return Math.max(max, sched.term);
        }
        return max;
      }, 0);

      return {
        group: g,
        region,
        membersCount: groupMembers.length,
        assignedUser,
        currentWeek: maxPaidTerm
      };
    })
    .filter(item => {
      if (!searchQuery) return true;
      return item.group.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
             (item.assignedUser?.nama || '').toLowerCase().includes(searchQuery.toLowerCase());
    })
    .filter(item => {
      if (filterHari !== 'ALL') {
        const dayMatch = (item.group.hari_penagihan || '').toUpperCase() === filterHari.toUpperCase();
        if (!dayMatch) return false;
      }
      if (filterPetugas !== 'ALL') {
        if (item.assignedUser?.id !== filterPetugas) {
          return false;
        }
      }
      return true;
    });

  // Sort groups (default sorting): Day -> Route Sequence -> Collection Time
  const daySortOrder: Record<string, number> = {
    'SENIN': 1,
    'SELASA': 2,
    'RABU': 3,
    'KAMIS': 4,
    'JUMAT': 5,
    'SABTU': 6,
    'MINGGU': 7
  };

  activeAssignments.sort((a, b) => {
    // 1. Sort by Day
    const dayA = daySortOrder[(a.group.hari_penagihan || 'SENIN').toUpperCase()] || 99;
    const dayB = daySortOrder[(b.group.hari_penagihan || 'SENIN').toUpperCase()] || 99;
    if (dayA !== dayB) return dayA - dayB;

    // 2. Sort by Route Sequence
    const ruteA = typeof a.group.urutan_rute !== 'undefined' ? Number(a.group.urutan_rute) : 0;
    const ruteB = typeof b.group.urutan_rute !== 'undefined' ? Number(b.group.urutan_rute) : 0;
    if (ruteA !== ruteB) return ruteA - ruteB;

    // 3. Sort by Jam Setoran (Time)
    const jamA = a.group.jam_setoran || '00:00';
    const jamB = b.group.jam_setoran || '00:00';
    return jamA.localeCompare(jamB);
  });

  return (
    <div className="space-y-6" id="manajemen_penagihan_screen">
      
      {/* RUNAWAY CUSTOMER WARNING ALERTS FOR SUPERVISORS */}
      {(() => {
        const runawayCustomers = (systemState?.customers || []).filter(c => c.status === 'MACET_KABUR' || c.is_lari);
        if (runawayCustomers.length === 0) return null;
        return (
          <div className="bg-rose-50 border-2 border-rose-500 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4" id="runaway_alerts_panel">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-600 rounded-lg text-white font-black mt-1 md:mt-0 leading-none">🏃</div>
              <div className="space-y-1">
                <h4 className="text-sm font-extrabold text-rose-950 flex items-center gap-1.5 uppercase font-mono">
                  🚨 WARNING SEGERA: TIM PENGAWAS / LEGAL HUKUM PENAGIHAN
                </h4>
                <p className="text-xs text-rose-700 leading-relaxed font-semibold">
                  Sistem mendeteksi <strong className="font-black text-rose-950">{runawayCustomers.length} Kasus Nasabah Melarikan Diri (Terbukti Kabur)</strong>. Seluruh kredit aktif dialihkan ke status <strong className="bg-rose-150 px-1.5 py-0.5 rounded text-rose-950 font-mono font-black">MACET_KABUR</strong> dan setoran sisa otomatis didelegasikan ke kelompok tanggung renteng.
                </p>
                <div className="flex flex-wrap gap-2 pt-1.5">
                  {runawayCustomers.map(rc => (
                    <span key={rc.id} className="text-[10px] font-bold font-mono bg-white border border-rose-200 text-rose-800 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-3xs">
                      • {rc.name} (Nasabah ID: {rc.id})
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex-shrink-0">
              <span className="inline-block px-3.5 py-1.5 bg-rose-600 text-white font-extrabold text-[10.5px] rounded-lg tracking-wide uppercase font-mono shadow-xs">
                🚨 MASUK PENANGANAN LEGAL
              </span>
            </div>
          </div>
        );
      })()}
      
      {/* Header and Add Action */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4" id="minimalist_header_penagihan">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[9px] font-mono font-bold rounded-md uppercase tracking-wider">
              Admin Web Portal
            </span>
            <span className="text-slate-300">•</span>
            <h2 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">DISTRIBUSI INSTANS</h2>
          </div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CalendarCheck className="text-indigo-650" size={20} />
            Manajemen Distribusi Penagihan Lapangan
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Sistem penugasan rute, kelompok, dan jadwal tagihan lapangan ke field officer secara realtime.
          </p>
        </div>
        
        {/* Right Corner Buttons Aligned: Location -> Impor Excel (Outline) -> Tambah Pemetaan (Primary) */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto lg:justify-end">
          
          {/* [1. Lokasi Kerja: Pusat/Cabang] */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 h-[38px]" id="branch_switcher_wrapper_local">
            <span className="text-slate-500 font-medium">📍 Lokasi:</span>
            {activeRole === 'super_admin' ? (
              <select
                value={selectedBranch}
                onChange={(e) => handleBranchChange(e.target.value)}
                className="bg-transparent border-none text-xs font-bold font-mono focus:outline-none focus:ring-0 cursor-pointer text-slate-800 p-0"
                id="branch_select_local_penagihan"
              >
                <option value="ALL">Semua Cabang</option>
                <option value="PUSAT">Pusat</option>
                <option value="KC_MATIM">KC Manggarai Timur</option>
              </select>
            ) : (
              <span className="font-mono text-xs">
                {selectedBranch === 'KC_MATIM' ? 'Manggarai Timur' : 'Pusat'}
              </span>
            )}
          </div>

          {/* [2. Impor Excel (Tombol Outline)] */}
          <button
            onClick={() => {
              setImportErrorMsg(null);
              setImportSuccessMsg(null);
              setImportedRows([]);
              setIsImportExcelModalOpen(true);
            }}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-indigo-750 bg-white hover:bg-slate-50 border border-indigo-250 rounded-xl transition-all shadow-sm cursor-pointer h-[38px] text-indigo-600 font-mono"
            id="btn_open_import_excel_modal"
          >
            <FileSpreadsheet size={14} className="text-indigo-650" />
            📥 Impor Excel
          </button>

          {/* [2.5. Ekspor Data (Dropdown Button)] */}
          <div className="relative" id="export_dropdown_container">
            <button
              onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-350 rounded-xl transition-all shadow-sm cursor-pointer h-[38px]"
              id="btn_open_export_dropdown"
            >
              <span>📤 Ekspor Data</span>
              {isExportDropdownOpen ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
            </button>
            {isExportDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-40 font-mono text-[11px] text-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setIsExportDropdownOpen(false);
                    exportToPDF();
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                >
                  <span>📄 Cetak PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsExportDropdownOpen(false);
                    exportToExcel();
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                >
                  <span>📊 Unduh Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsExportDropdownOpen(false);
                    exportToCSV();
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                >
                  <span>📝 Unduh CSV</span>
                </button>
              </div>
            )}
          </div>

          {/* [3. Tambah Pemetaan (Tombol Primary)] */}
          <button
            onClick={() => {
              setErrorMsg(null);
              setSuccessMsg(null);
              setPemetaanGroupId('');
              setPemetaanPetugasId('');
              setPemetaanHari('SENIN');
              setPemetaanJamSetoran('09:00');
              setPemetaanUrutan(1);
              setPemetaanIsTR(true);
              setIsPemetaanEditMode(false);
              setPemetaanMode('manual');
              setIsPemetaanModalOpen(true);
            }}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-indigo-650 hover:bg-indigo-750 rounded-xl transition-all shadow-sm cursor-pointer h-[38px]"
            id="btn_open_pemetaan_modal"
          >
            <Plus size={14} />
            + Tambah Pemetaan
          </button>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex border-b border-slate-205 bg-white p-1 rounded-xl gap-2 shadow-xs mb-4" id="billing_screen_subtabs">
        <button
          onClick={() => setActiveSubTab('penugasan')}
          className={`px-4 py-2.5 text-xs font-bold font-mono rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer uppercase ${
            activeSubTab === 'penugasan'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
          id="btn_subtab_penugasan"
        >
          📂 PENUGASAN AKTIF LAPANGAN
        </button>
        <button
          onClick={() => {
            setActiveSubTab('rekapan');
            setRekapSuccessMsg(null);
            setRekapErrorMsg(null);
          }}
          className={`px-4 py-2.5 text-xs font-bold font-mono rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer uppercase ${
            activeSubTab === 'rekapan'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
          id="btn_subtab_rekapan"
        >
          📝 REKAPAN ANGSURAN HARIAN
        </button>
      </div>

      {activeSubTab === 'penugasan' ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={14} className="text-slate-400" />
            <h3 className="text-xs font-bold text-slate-700 tracking-wider font-mono uppercase">
              Data Penugasan Aktif Lapangan ({activeAssignments.length})
            </h3>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            {/* Filter Hari */}
            <div className="flex items-center gap-1.5 {filterHari !== 'ALL' ? 'text-indigo-600' : ''}">
              <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">Hari:</span>
              <select
                value={filterHari}
                onChange={(e) => setFilterHari(e.target.value)}
                className="text-xs p-1.5 border rounded-lg bg-white font-mono font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                id="filter_hari_penagihan"
              >
                <option value="ALL">Semua Hari</option>
                <option value="SENIN">Senin</option>
                <option value="SELASA">Selasa</option>
                <option value="RABU">Rabu</option>
                <option value="KAMIS">Kamis</option>
                <option value="JUMAT">Jumat</option>
                <option value="SABTU">Sabtu</option>
              </select>
            </div>

            {/* Filter Petugas */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">Petugas:</span>
              <select
                value={filterPetugas}
                onChange={(e) => setFilterPetugas(e.target.value)}
                className="text-xs p-1.5 border rounded-lg bg-white font-mono font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 max-w-[150px] truncate"
                id="filter_petugas_penagihan"
              >
                <option value="ALL">Semua Petugas</option>
                {officers.map(u => (
                  <option key={u.id} value={u.id}>{u.nama}</option>
                ))}
              </select>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-48">
              <Search className="absolute left-2.5 top-2.5 text-slate-450" size={13} />
              <input
                type="text"
                placeholder="Cari..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 font-mono tracking-wider font-semibold text-[10px] uppercase">
                <th className="px-5 py-3">Nama Kelompok</th>
                <th className="px-5 py-3">Wilayah</th>
                <th className="px-5 py-3">Total Anggota</th>
                <th className="px-5 py-3">Tanggung Renteng</th>
                <th className="px-5 py-3">Jam Setoran</th>
                <th className="px-5 py-3">Petugas Lapangan & Hari Rute (Assigned)</th>
                <th className="px-5 py-3">Status Minggu Berjalan</th>
                <th className="px-5 py-3 text-right">Data Security status</th>
                <th className="px-5 py-3 text-center w-28">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeAssignments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-slate-450 font-mono">
                    Belum ada penugasan petugas untuk kriteria filter aktif saat ini.
                  </td>
                </tr>
              ) : (
                activeAssignments.map(item => {
                  const isTR = typeof item.group.is_tanggung_renteng !== 'undefined' 
                    ? item.group.is_tanggung_renteng 
                    : (typeof item.group.sistem_tanggung_renteng !== 'undefined' ? item.group.sistem_tanggung_renteng : true);
                  
                  const isExpanded = !!expandedGroupIds[item.group.id];

                  return (
                    <React.Fragment key={item.group.id}>
                      <tr className={`transition-all font-mono hover:bg-slate-50/50 ${isExpanded ? 'bg-indigo-50/10' : ''}`} id={`assignment_row_${item.group.id}`}>
                        <td className="px-5 py-3.5">
                          {/* [CLICKABLE NAMA KELOMPOK WITH CHEVRON ACCORDION TOGGLER] */}
                          <button
                            type="button"
                            onClick={() => toggleGroupExpand(item.group.id)}
                            className="flex items-center gap-1.5 font-bold hover:text-indigo-850 text-indigo-650 text-[13px] text-left hover:underline cursor-pointer focus:outline-none"
                            title="Klik untuk tampilkan rincian anggota kelompok"
                          >
                            <span>{item.group.name}</span>
                            {isExpanded ? (
                              <ChevronUp size={13} className="text-indigo-600 shrink-0" />
                            ) : (
                              <ChevronDown size={13} className="text-indigo-600 shrink-0" />
                            )}
                          </button>
                          
                          {selectedBranch === 'ALL' && (
                            <div className="mt-1">
                              {(!item.group.kantor_cabang || item.group.kantor_cabang.toUpperCase() === 'PUSAT') ? (
                                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-755 border border-blue-150 rounded text-[9px] font-bold uppercase inline-block">
                                  Pusat
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-[9px] font-bold uppercase inline-block font-mono">
                                  KC MATIM
                                </span>
                              )}
                            </div>
                          )}
                          <span className="text-[9px] text-slate-400 block mt-0.5">ID: {item.group.id}</span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-600 font-medium">
                          {item.region?.name || 'Semua Wilayah / Luar Cabang'}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-slate-800">
                          {item.membersCount} Jiwa
                        </td>
                        <td className="px-5 py-3.5">
                          {isTR ? (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold">
                              TR (YA)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 rounded text-[10px] font-medium">
                              Mandiri (TIDAK)
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-slate-700 text-xs">
                          {item.group.jam_setoran ? (
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <Clock size={11} className="text-slate-400" />
                              <span>{item.group.jam_setoran} WITA</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic font-normal text-[10px]">- Belum Diatur -</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {item.assignedUser ? (
                            <div className="flex flex-col gap-1 items-start">
                              <button
                                onClick={() => handleOpenEditRoute(item.group)}
                                className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-250 py-1 px-3 rounded-full text-emerald-850 font-bold text-[11px] w-fit text-left hover:bg-emerald-100 transition cursor-pointer"
                                title="Klik untuk ubah rute"
                              >
                                <User size={11} className="text-emerald-600" />
                                <span>
                                  {item.assignedUser.nama} - <b className="text-emerald-950 font-extrabold">{item.group.hari_penagihan || 'SENIN'}</b> (Rute #{item.group.urutan_rute || 1})
                                </span>
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleOpenEditRoute(item.group)}
                              className="text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 py-1 px-2.5 rounded-full font-bold text-[11px] transition flex items-center gap-1.5 shadow-sm shadow-amber-50 cursor-pointer"
                              title="Klik untuk menugaskan kelompok ini"
                            >
                              <span>⚠️ Belum Di-assign (Tugaskan)</span>
                            </button>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-150 rounded text-indigo-700 font-bold text-[10px]">
                              Minggu ke-{item.currentWeek} Lunas
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right font-bold text-[10.5px]">
                          {item.assignedUser ? (
                            <span className="text-indigo-650 bg-indigo-50 border border-indigo-150 px-2.5 py-1 rounded-md text-[9.5px]">
                              LOCKED (ISOLATED)
                            </span>
                          ) : (
                            <span className="text-slate-400 bg-slate-50 border border-slate-150 px-2.5 py-1 rounded-md text-[9.5px]">
                              OPEN CHANNELS
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex justify-center items-center gap-2">
                            <button
                              onClick={() => handleOpenEditRoute(item.group)}
                              className="p-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer"
                              title="Edit / Assign Penugasan"
                            >
                              <Pencil size={13} />
                            </button>
                            
                            <button
                              onClick={() => handleUnassignGroup(item.group)}
                              className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                              title="Batal / Hapus Penugasan"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* [EXPANDED ACCORDION ROW WITH INTERACTIVE DETAIL MEMBERS TABLE] */}
                      {isExpanded && (
                        <tr className="bg-indigo-50/15" id={`expanded_row_members_${item.group.id}`}>
                          <td colSpan={9} className="px-6 py-4.5 border-t border-b border-indigo-50">
                            <div className="bg-white rounded-xl border border-indigo-100 shadow-inner overflow-hidden p-4">
                              <div className="flex items-center gap-2 mb-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
                                <h4 className="text-[10px] font-bold text-indigo-900 font-mono uppercase tracking-wider">
                                  Rincian Anggota Kelompok: {item.group.name} | Terdiri dari {item.membersCount} Nasabah
                                </h4>
                              </div>
                              
                              <div className="overflow-x-auto rounded-lg border border-slate-100">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead>
                                    <tr className="bg-slate-55 bg-slate-100 text-slate-500 font-mono tracking-wider font-semibold text-[9px] uppercase border-b border-slate-200">
                                      <th className="px-4 py-2 w-12 text-center text-slate-400">No</th>
                                      <th className="px-4 py-2 text-slate-705">Nama Anggota</th>
                                      <th className="px-4 py-2 text-slate-705">Besar Pinjaman (Plafon)</th>
                                      <th className="px-4 py-2 text-slate-705">Pokok + Bunga</th>
                                      <th className="px-4 py-2 text-slate-705">Target (Angsuran)</th>
                                      <th className="px-4 py-2 text-slate-705">Tenor</th>
                                      <th className="px-4 py-2 text-slate-705">Sisa Saldo</th>
                                      <th className="px-4 py-2 text-slate-705">Status Tagihan</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 bg-white font-mono text-[11px]">
                                    {(() => {
                                      const groupMembers = systemState?.customers?.filter(c => c.group_id === item.group.id) || [];
                                      if (groupMembers.length === 0) {
                                        return (
                                          <tr>
                                            <td colSpan={8} className="px-4 py-5 text-center text-slate-400 italic">
                                              Tidak ada nasabah terdaftar di database untuk kelompok ini.
                                            </td>
                                          </tr>
                                        );
                                      }
                                      return groupMembers.map((cust, idx) => {
                                        const loan = systemState?.loans?.find(l => l.customer_id === cust.id);
                                        const custSchedules = systemState?.billingSchedules?.filter(b => b.customer_id === cust.id) || [];
                                        
                                        const totalPokok = custSchedules.reduce((sum, b) => sum + (b.pokok || 0), 0) || loan?.plafon || 0;
                                        const totalJasa = custSchedules.reduce((sum, b) => sum + (b.jasa || 0), 0) || 0;
                                        const totalPokokBunga = totalPokok + totalJasa;
                                        const targetAngsuran = custSchedules[0]?.total_tagihan || Math.round(totalPokokBunga / ((loan as any)?.tenor || 10));

                                        // Get payments
                                        const payments = systemState?.payments?.filter(p => p.customer_id === cust.id) || [];
                                        const calc = calculateLoanStatus({
                                          plafon: loan?.plafon || totalPokok,
                                          tenor: (loan as any)?.tenor || custSchedules.length || 10,
                                          tanggal_cair: loan?.tanggal_cair || (custSchedules[0]?.tanggal_jatuh_tempo ? new Date(custSchedules[0].tanggal_jatuh_tempo) : new Date()),
                                          payments: payments
                                        });

                                        return (
                                          <tr key={cust.id} className="hover:bg-slate-50/50 transition">
                                            <td className="px-4 py-2 text-center text-slate-400">{idx + 1}</td>
                                            <td className="px-4 py-2 font-bold text-slate-800">{cust.name}</td>
                                            <td className="px-4 py-2 text-slate-700">
                                              Rp {totalPokok.toLocaleString('id-ID')}
                                            </td>
                                            <td className="px-4 py-2 font-bold text-indigo-705 text-indigo-600">
                                              Rp {totalPokokBunga.toLocaleString('id-ID')}
                                            </td>
                                            <td className="px-4 py-2 font-semibold text-emerald-705 text-emerald-600">
                                              Rp {targetAngsuran.toLocaleString('id-ID')}
                                            </td>
                                            <td className="px-4 py-2 text-slate-600">
                                              {((loan as any)?.tenor || 10)} Mg
                                            </td>
                                            <td className="px-4 py-2 font-bold text-slate-700">
                                              Rp {calc.sisaSaldo.toLocaleString('id-ID')}
                                            </td>
                                            <td className="px-4 py-2">
                                              {calc.statusTagihan === 'PIUTANG TAK TERTAGIH' ? (
                                                <span className="px-2 py-0.5 rounded text-xs font-bold text-[#E53935] bg-[#E53935]/10 border border-[#E53935]/20">
                                                  Tunggakan: Rp {calc.selisih.toLocaleString('id-ID')}
                                                </span>
                                              ) : calc.statusTagihan === 'KELEBIHAN SETORAN' ? (
                                                <span className="px-2 py-0.5 rounded text-xs font-bold text-[#00C853] bg-[#00C853]/10 border border-[#00C853]/20">
                                                  Lebih: Rp {Math.abs(calc.selisih).toLocaleString('id-ID')}
                                                </span>
                                              ) : (
                                                <span className="text-slate-500 font-medium">Lancar</span>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      });
                                    })()}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      ) : (
        /* REKAPAN ANGSURAN HARIAN COMPONENT MODULE */
        <div className="space-y-6 animate-fade-in" id="view_rekapan_angsuran_harian">
          
          {/* Header & Controls Panel */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide font-mono flex items-center gap-2">
                  <span>🛡️</span> SINKRONISASI & VERIFIKASI SETORAN (DOUBLE APPROVAL)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Lakukan verifikasi berkas per kelompok (Tahap 1) sebelum menyetujui seluruh Angsuran Harian Petugas (Tahap 2).
                </p>
              </div>
              
              <div className="flex flex-wrap gap-2.5">
                {/* Print PDF Button */}
                <button
                  type="button"
                  onClick={() => exportRekapanToPDF(processedPayments, stats)}
                  disabled={processedPayments.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-sm font-mono disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  id="btn_print_pdf_rekapan"
                >
                  <Printer size={13} />
                  Cetak Laporan PDF
                </button>

                {/* ACC Main Button (Tahap 2) */}
                {rekapanStatusFilter === 'PENDING' && (
                  <button
                    type="button"
                    onClick={handleSubmitRekapan}
                    disabled={
                      isProcessingRekap || 
                      processedPayments.length === 0 || 
                      relevantGroupsForRekap.length === 0 || 
                      !relevantGroupsForRekap.every(item => approvedGroupIds[item.group.id])
                    }
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 rounded-lg shadow-sm font-mono transition-all duration-150 cursor-pointer disabled:cursor-not-allowed"
                    id="btn_acc_rekapan_utama"
                    title={
                      relevantGroupsForRekap.every(item => approvedGroupIds[item.group.id])
                        ? "Verifikasi akhir dan bukukan setoran harian"
                        : "Lengkapi verifikasi kelompok (Tahap 1) terlebih dahulu"
                    }
                  >
                    {isProcessingRekap ? (
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    ) : (
                      <span>✓ ACC Rekapan Penagihan</span>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Alert Messages */}
            {rekapSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-lg font-mono flex items-center gap-2">
                <span className="text-sm font-bold">✓</span>
                <span>{rekapSuccessMsg}</span>
              </div>
            )}
            {rekapErrorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-lg font-mono flex items-center gap-2">
                <span className="text-sm">⚠️</span>
                <span>{rekapErrorMsg}</span>
              </div>
            )}

            {/* Custom Interactive Filter controls */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-3 border-t border-slate-100">
              
              {/* Filter 1: Petugas */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase font-mono block">Petugas Lapangan</label>
                <select
                  value={selectedRekapanPetugas}
                  onChange={(e) => {
                    setSelectedRekapanPetugas(e.target.value);
                    setApprovedGroupIds({}); // reset approved groups when selection shifts
                  }}
                  className="w-full text-xs p-2 border border-slate-250 rounded-lg bg-white font-mono font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  id="rekap_filter_petugas"
                >
                  {uniqueCollectors.map(cId => (
                    <option key={cId} value={cId}>{getOfficerName(cId)}</option>
                  ))}
                  {uniqueCollectors.length === 0 && (
                    <option value="">Tidak ada petugas penyetor</option>
                  )}
                </select>
              </div>

              {/* Filter 2: Hari Penagihan */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase font-mono block">Hari Penagihan</label>
                <select
                  value={selectedRekapanHari}
                  onChange={(e) => {
                    setSelectedRekapanHari(e.target.value);
                    setApprovedGroupIds({});
                  }}
                  className="w-full text-xs p-2 border border-slate-250 rounded-lg bg-white font-mono font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  id="rekap_filter_hari"
                >
                  <option value="SENIN">Senin</option>
                  <option value="SELASA">Selasa</option>
                  <option value="RABU">Rabu</option>
                  <option value="KAMIS">Kamis</option>
                  <option value="JUMAT">Jumat</option>
                  <option value="SABTU">Sabtu</option>
                </select>
              </div>

              {/* Filter 3: Status Penagihan */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase font-mono block">Status Setoran</label>
                <div className="flex rounded-lg border border-slate-250 overflow-hidden text-xs h-[34px]">
                  <button
                    type="button"
                    onClick={() => {
                      setRekapanStatusFilter('PENDING');
                      setApprovedGroupIds({});
                    }}
                    className={`flex-1 font-bold font-mono transition-colors cursor-pointer ${
                      rekapanStatusFilter === 'PENDING'
                        ? 'bg-indigo-50 text-indigo-700 font-extrabold'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    PENDING (ACC)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRekapanStatusFilter('APPROVED');
                      setApprovedGroupIds({});
                    }}
                    className={`flex-1 font-bold font-mono transition-colors cursor-pointer ${
                      rekapanStatusFilter === 'APPROVED'
                        ? 'bg-indigo-50 text-indigo-700 font-extrabold'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    APPROVED
                  </button>
                </div>
              </div>

              {/* Filter 4: Branch Indicator */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase font-mono block">Kantor Cabang</label>
                <div className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-slate-700 h-[34px]" id="rekap_fixed_branch">
                  🏦 {selectedBranch === 'ALL' ? 'Semua Cabang' : (selectedBranch === 'KC_MATIM' ? 'KC Manggarai Timur' : 'Kantor Pusat')}
                </div>
              </div>

            </div>
          </div>

          {/* Section A: REALTIME SUMMARY METRICS CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5" id="rekapan_summary_metrics_cards">
            
            {/* Metrik 1: Setoran Kas (Tunai) */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2 flex flex-col justify-between" id="metric_setoran_kas">
              <div>
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block">SETORAN KAS (TUNAI)</span>
                <h3 className="text-xl font-black text-slate-900 font-mono tracking-tight mt-1 animate-fade-in">
                  Rp {stats.totalSetoranKasTunai.toLocaleString('id-ID')}
                </h3>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>Metode: TUNAI</span>
                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded font-bold">Wajib di Laci</span>
              </div>
            </div>

            {/* Metrik 2: Piutang Tak Tertagih */}
            <div className={`bg-white p-5 rounded-xl shadow-xs space-y-2 flex flex-col justify-between border transition-all ${stats.totalPiutangTakTertagih > 0 ? 'border-rose-300 bg-rose-50/10' : 'border-slate-200'}`} id="metric_tak_tertagih">
              <div>
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block">PIUTANG TAK TERTAGIH</span>
                <h3 className={`text-xl font-black font-mono tracking-tight mt-1 animate-fade-in ${stats.totalPiutangTakTertagih > 0 ? 'text-rose-600 font-extrabold' : 'text-slate-900'}`}>
                  Rp {stats.totalPiutangTakTertagih.toLocaleString('id-ID')}
                </h3>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>Absen / Kabur</span>
                {stats.totalPiutangTakTertagih > 0 ? (
                  <span className="px-1.5 py-0.5 bg-rose-600 text-white rounded font-bold animate-pulse text-[9px]">⚠️ Tunggakan Tak Tertagih</span>
                ) : (
                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-bold">Nihil</span>
                )}
              </div>
            </div>

            {/* Metrik 3: Piutang Lapangan (Outstanding) */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2 flex flex-col justify-between" id="metric_piutang_lapangan_outstanding">
              <div>
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block">PIUTANG LAPANGAN (OUTSTANDING)</span>
                <h3 className="text-xl font-black text-indigo-700 font-mono tracking-tight mt-1 animate-fade-in">
                  Rp {stats.totalPiutangLapanganOutstanding.toLocaleString('id-ID')}
                </h3>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>Pokok + Jasa Beredar</span>
                <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-bold">Portofolio Rute</span>
              </div>
            </div>

          </div>

          {/* Section B: TAHAP 1 - VERIFIKASI KELOMPOK */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4" id="section_tahap1_box">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono grid grid-cols-1">
                TAHAP 1: VERIFIKASI BERKAS FISIK KELOMPOK ({relevantGroupsForRekap.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Pilih dan verifikasi berkas per kelompok di bawah ini. Tombol ACC Rekapan Utama akan terbuka setelah seluruh kelompok terverifikasi.
              </p>
            </div>

            {relevantGroupsForRekap.length === 0 ? (
              <div className="text-center py-10 border border-dashed rounded-xl text-slate-400 font-mono text-xs bg-slate-50/20">
                Tidak ada data setoran kelompok yang cocok untuk kriteria seleksi ini.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {relevantGroupsForRekap.map(item => {
                  const isApproved = !!approvedGroupIds[item.group.id] || rekapanStatusFilter === 'APPROVED';
                  return (
                    <div 
                      key={item.group.id} 
                      className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                        isApproved 
                          ? 'border-emerald-200 bg-emerald-50/10' 
                          : 'border-slate-200 bg-slate-50/10 hover:bg-slate-50/50'
                      }`}
                      id={`card_tahap1_${item.group.id}`}
                    >
                      <div>
                        <div className="flex items-start justify-between">
                          <span className="text-xs font-mono font-bold text-slate-800">{item.group.name}</span>
                          {isApproved ? (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] rounded-lg font-bold font-mono shadow-3xs uppercase">
                              ✓ VERIFIED (TAHAP 1)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[9px] rounded-lg font-bold font-mono shadow-3xs uppercase animate-pulse">
                              ⏳ BELUM VERIFIKASI
                            </span>
                          )}
                        </div>
                        <div className="mt-2.5 space-y-1.5 font-mono text-[11px] text-slate-600">
                          <div className="flex justify-between">
                            <span>Total Penyetor:</span>
                            <span className="font-bold text-slate-800">{item.payments.length} Jiwa</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Uang Tunai:</span>
                            <span className="font-bold text-slate-800 font-mono">Rp {item.totalTunai.toLocaleString('id-ID')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Uang Transfer:</span>
                            <span className="font-bold text-slate-800 font-mono">Rp {item.totalTransfer.toLocaleString('id-ID')}</span>
                          </div>
                          <div className="flex justify-between border-t border-dashed border-slate-200 pt-1 text-[11px] font-bold text-indigo-700">
                            <span>Total Setoran:</span>
                            <span>Rp {item.totalTagihan.toLocaleString('id-ID')}</span>
                          </div>
                        </div>
                      </div>

                      {rekapanStatusFilter === 'PENDING' && (
                        <button
                          type="button"
                          onClick={() => {
                            setApprovedGroupIds(prev => ({
                              ...prev,
                              [item.group.id]: !prev[item.group.id]
                            }));
                          }}
                          className={`w-full py-1.5 text-[11px] text-center rounded-lg font-bold font-mono transition-all uppercase cursor-pointer ${
                            isApproved
                              ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                              : 'bg-indigo-600 text-white hover:bg-indigo-705 shadow-sm'
                          }`}
                          id={`btn_approve_group_local_${item.group.id}`}
                        >
                          {isApproved ? '↩ Batal Approve' : '✓ Approve Kelompok'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section C: TABEL RINCIAN REKAPAN ANGSURAN */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden" id="section_rekapan_table_panel">
            <div className="p-4 border-b border-slate-100 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-700 tracking-wider font-mono uppercase">
                DAFTAR DETAIL ANGSURAN PENAGIHAN LAPANGAN ({processedPayments.length} Pembayaran)
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-500 font-mono tracking-wider font-semibold text-[10px] uppercase border-b border-slate-150">
                    <th className="px-5 py-3 w-12 text-center text-slate-400">No</th>
                    <th className="px-5 py-3">Nama Kelompok</th>
                    <th className="px-5 py-3">Nama Anggota</th>
                    <th className="px-5 py-3">Minggu Berjalan</th>
                    <th className="px-5 py-3">Setoran (Tunai/Transfer)</th>
                    <th className="px-5 py-3">Status Kehadiran</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {processedPayments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-slate-400 font-mono">
                        Tidak ada data detail setoran untuk kriteria seleksi ini.
                      </td>
                    </tr>
                  ) : (
                    processedPayments.map((p, index) => {
                      const customer = systemState?.customers?.find(c => c.id === p.customer_id);
                      const group = systemState?.groups?.find(g => g.id === customer?.group_id);
                      const sched = systemState?.billingSchedules?.find(b => b.id === p.billing_schedule_id);

                      return (
                        <tr key={p.id} className="transition-all hover:bg-slate-50/30 font-mono text-[11px] text-slate-700">
                          <td className="px-5 py-3 w-12 text-center text-slate-400">{index + 1}</td>
                          <td className="px-5 py-3 font-semibold text-slate-900">{group?.name || 'Luar Kelompok'}</td>
                          <td className="px-5 py-3 text-slate-805 font-bold">{customer?.name || '-'}</td>
                          <td className="px-5 py-3">
                            <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded font-bold font-mono">
                              Minggu {sched ? sched.term : '-'}
                            </span>
                          </td>
                          <td className="px-5 py-3 font-bold">
                            {(p.is_menunggak || p.is_lari) ? (
                              <span className="text-slate-400 italic">Rp 0 (Gagal Bayar)</span>
                            ) : (
                              <span className={p.payment_method === 'TRANSFER' ? 'text-indigo-700 font-extrabold' : 'text-slate-850 font-bold'}>
                                Rp {p.nominal_bayar.toLocaleString('id-ID')}
                                <span className="text-[9.5px] text-slate-400 font-normal ml-1">({p.payment_method || 'TUNAI'})</span>
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            {p.is_lari ? (
                              <span className="px-2 py-0.5 bg-rose-600 text-white font-black rounded text-[9.5px] shadow-3xs whitespace-nowrap">
                                🚨 KABUR / MACET
                              </span>
                            ) : p.is_menunggak ? (
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[9.5px] font-bold whitespace-nowrap">
                                ⚠️ ABSEN / MENUNGGAK
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-250 rounded text-[9.5px] font-bold whitespace-nowrap">
                                ✓ HADIR / SETOR
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* MODAL WINDOW: '+' (Tambah Tagihan/Assign Petugas) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto" id="assignment_modal">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl border border-slate-300 flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-205 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5 font-display">
                  <Plus className="text-indigo-600" size={18} />
                  Distribusi Tagihan & Onboarding Historis Kelompok
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">ACID PRISMA TRANSACTION LOGS ENGAGED</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition"
                id="btn_close_assignment_modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-6 space-y-4">
              
              {/* Top Right positioned Dropdown */}
              <div className="flex justify-between items-center bg-slate-50 border border-slate-150 px-4 py-2.5 rounded-xl">
                <span className="text-xs font-bold text-slate-700 font-display">Daftar Anggota Kelompok</span>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest font-mono flex items-center gap-1">
                    📍 Pilih Cabang (Dropdown)
                  </label>
                  <select
                    value={selectedRegionId}
                    onChange={(e) => {
                      setSelectedRegionId(e.target.value);
                      setSelectedGroupId(''); // Reset kelompok
                    }}
                    className="text-xs p-1.5 border border-slate-250 rounded bg-white font-mono focus:outline-indigo-500 font-semibold text-slate-800"
                    id="dropdown_wilayah"
                  >
                    <option value="">-- Semua Wilayah (Luar Cabang) --</option>
                    {systemState?.regions?.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dropdowns row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-150">
                
                {/* 1. Dropdown Petugas */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1">
                    <User size={12} className="text-slate-500" />
                    Pilih Petugas (11 Lapangan)
                  </label>
                  <select
                    value={selectedPetugasId}
                    onChange={(e) => setSelectedPetugasId(e.target.value)}
                    required
                    className="w-full text-xs p-2 border rounded bg-white font-mono focus:outline-indigo-500 font-semibold text-slate-800"
                    id="dropdown_petugas"
                  >
                    <option value="">-- Pilih Petugas Lapangan --</option>
                    {officers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.nama} ({u.nik})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Dropdown Nama Kelompok */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-705 uppercase tracking-wide flex items-center gap-1">
                    <Users size={12} className="text-slate-500" />
                    Nama Kelompok
                  </label>
                  <select
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    required
                    className="w-full text-xs p-2 border rounded bg-white font-mono focus:outline-indigo-500 font-semibold text-slate-800"
                    id="dropdown_kelompok"
                  >
                    <option value="">-- Pilih Kelompok --</option>
                    {filteredGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>

                {/* 4. Selection Minguan */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1">
                    <Calendar size={12} className="text-slate-500" />
                    Minggu Berjalan
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={currentWeek}
                    onChange={(e) => setCurrentWeek(Math.max(1, Number(e.target.value)))}
                    className="w-full text-xs p-2 border rounded bg-white font-mono focus:outline-indigo-500 font-semibold text-slate-800"
                    id="input_current_week"
                  />
                </div>

              </div>

              {/* Loader/Guides if group is not loaded yet */}
              {!selectedGroupId && (
                <div className="p-8 border-2 border-dashed border-slate-200 rounded-xl text-center text-slate-400 font-mono text-xs">
                  Pilih Kelompok terlebih dahulu untuk meng-autoload daftar anggota dan riwayat angsuran.
                </div>
              )}

              {/* Dynamic members list & Grid Input */}
              {selectedGroupId && selectedGroupMembers.length === 0 && (
                <div className="p-8 border-2 border-dashed border-yellow-250 bg-yellow-50/50 rounded-xl text-center text-yellow-800 font-mono text-xs">
                  Tidak ditemukan anggota yang aktif terdaftar dalam Kelompok ini. Silakan periksa atau laporkan berkas.
                </div>
              )}

              {selectedGroupId && selectedGroupMembers.length > 0 && (
                <div className="space-y-3 animate-fade-in">
                  <div className="flex justify-between items-center border-b pb-1">
                    <h4 className="text-xs font-bold text-slate-700 tracking-wider font-mono uppercase">
                      Grid Input Historis Mingguan (Minggu 1 - {currentWeek})
                    </h4>
                    <span className="text-[10px] text-slate-400 font-mono">
                      * Secara default sistem mengisi data sesuai plafon cicilan ideal kelompok.
                    </span>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-inner max-h-[300px]">
                    <table className="w-full text-left text-xs border-collapse font-mono">
                      <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 z-10">
                        <tr className="text-[10px] text-slate-500 tracking-wider uppercase">
                          <th className="px-3 py-2.5 font-bold">Nama Anggota</th>
                          {Array.from({ length: currentWeek }).map((_, i) => (
                            <th key={i} className="px-3 py-2.5 font-bold text-center border-l">
                              Mg {i + 1}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {selectedGroupMembers.map(cust => {
                          return (
                            <tr key={cust.id} className="hover:bg-slate-50/60" id={`grid_member_row_${cust.id}`}>
                              <td className="px-3 py-2 w-48 font-medium">
                                <div className="font-bold text-slate-800 text-[11px] truncate leading-none">
                                  {cust.name}
                                </div>
                                <span className="text-[9px] text-slate-400 font-mono mt-1 block">NIK: {cust.nik}</span>
                              </td>
                              {Array.from({ length: currentWeek }).map((_, i) => {
                                const weekNum = i + 1;
                                const weekState = historyGrid[cust.id]?.[weekNum] || { pokok: 500000, jasa: 5000, isPaid: true };
                                const totalCycleInstallment = weekState.pokok + weekState.jasa;

                                return (
                                  <td key={i} className="px-2.5 py-1.5 border-l text-center min-w-[130px]" id={`grid_cell_${cust.id}_W${weekNum}`}>
                                    <div className="flex flex-col gap-1 items-center justify-center">
                                      {/* Status toggle */}
                                      <button
                                        type="button"
                                        onClick={() => handleTogglePaid(cust.id, weekNum)}
                                        className={`px-1.5 py-0.5 rounded text-[8px] font-bold w-full uppercase ${
                                          weekState.isPaid 
                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                                            : 'bg-slate-100 text-slate-400 border border-slate-200'
                                        }`}
                                      >
                                        {weekState.isPaid ? '✓ Lunas' : '❌ Belum Bayar'}
                                      </button>

                                      {weekState.isPaid && (
                                        <div className="flex items-center gap-1 font-mono text-[9px] w-full mt-1">
                                          <div className="space-y-0.5 w-full">
                                            <div className="flex justify-between items-center gap-1">
                                              <span className="text-slate-405">Pk:</span>
                                              <input
                                                type="number"
                                                value={Math.round(weekState.pokok)}
                                                onChange={(e) => handleInputChange(cust.id, weekNum, 'pokok', Number(e.target.value))}
                                                className="w-16 text-[9.5px] p-0.5 border text-right rounded font-bold"
                                              />
                                            </div>
                                            <div className="flex justify-between items-center gap-1">
                                              <span className="text-slate-405">Js:</span>
                                              <input
                                                type="number"
                                                value={Math.round(weekState.jasa)}
                                                onChange={(e) => handleInputChange(cust.id, weekNum, 'jasa', Number(e.target.value))}
                                                className="w-16 text-[9.5px] p-0.5 border text-right rounded font-bold"
                                              />
                                            </div>
                                            <div className="text-[8.5px] text-indigo-650 font-bold text-right pt-0.5">
                                              Rp {totalCycleInstallment.toLocaleString('id-ID')}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed italic">
                    * Tip: Setiap kolom "Lunas" akan memicu pencatatan Jurnal Buku SAK Double-Entry yang seimbang di server secara otomatis.
                  </p>
                </div>
              )}

              {/* Error / Success messages inside Modal */}
              {errorMsg && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="text-red-650 shrink-0 mt-0.5" size={16} />
                  <p className="text-xs text-red-700 font-mono font-medium">{errorMsg}</p>
                </div>
              )}

              {successMsg && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-4">
                  <CheckCircle className="text-emerald-650 shrink-0 mt-0.5" size={16} />
                  <p className="text-xs text-emerald-700 font-mono font-bold">{successMsg}</p>
                </div>
              )}

            </form>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-between items-center">
              <span className="text-[10px] text-slate-450 font-mono flex items-center gap-1.5 uppercase font-bold">
                <BookOpen size={13} /> SAK DOUBLE-ENTRY RULES APPLIED
              </span>
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting || !selectedGroupId || !selectedPetugasId}
                  className="px-5 py-2 bg-indigo-650 hover:bg-slate-950 text-white font-bold text-xs rounded-xl transition shadow disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center gap-1.5"
                  id="btn_submit_assignment"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="animate-spin" size={13} />
                      Sedang Menyimpan ACID...
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      Simpan & Tautkan Petugas
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Route Assignment Modal */}
      {isRouteModalOpen && targetGroup && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto" id="route_assignment_modal">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-300 flex flex-col">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <div>
                <h3 className="text-sm font-bold text-slate-950 flex items-center gap-1.5 font-sans">
                  <CalendarCheck className="text-indigo-605" size={16} />
                  Atur Rute Penagihan Kelompok
                </h3>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">KELOMPOK: {targetGroup.name}</p>
              </div>
              <button 
                onClick={() => {
                  setIsRouteModalOpen(false);
                  setTargetGroup(null);
                }}
                className="p-1 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleRouteSubmit} className="p-5 space-y-4 font-sans text-xs">
              
              {/* Petugas Dropdown */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                  Pilih Petugas Lapangan
                </label>
                <select
                  value={routePetugasId}
                  onChange={(e) => setRoutePetugasId(e.target.value)}
                  className="w-full text-xs p-2 border rounded-lg bg-white font-mono font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                  required
                  id="route_select_petugas"
                >
                  <option value="">-- Pilih Petugas --</option>
                  {officers.map(u => (
                    <option key={u.id} value={u.id}>{u.nama} ({u.nik})</option>
                  ))}
                </select>
              </div>

              {/* Day Dropdown */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                  Pilih Hari Penagihan
                </label>
                <select
                  value={routeHari}
                  onChange={(e) => setRouteHari(e.target.value as any)}
                  className="w-full text-xs p-2 border rounded-lg bg-white font-mono font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                  required
                  id="route_select_hari"
                >
                  <option value="SENIN">Senin</option>
                  <option value="SELASA">Selasa</option>
                  <option value="RABU">Rabu</option>
                  <option value="KAMIS">Kamis</option>
                  <option value="JUMAT">Jumat</option>
                  <option value="SABTU">Sabtu</option>
                </select>
              </div>

              {/* Priority Sequence (Urutan Kunjungan) */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                  Urutan Kunjungan (Prioritas Rute)
                </label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={routeUrutan}
                  onChange={(e) => setRouteUrutan(Math.max(1, Number(e.target.value)))}
                  className="w-full text-xs p-2 border rounded-lg bg-white font-mono font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                  required
                  id="route_input_urutan"
                />
                <span className="text-[10px] text-slate-400 block mt-1 leading-relaxed">
                  * Urutan prioritas perjalanan petugas (1, 2, 3...) dalam satu hari yang sama.
                </span>
              </div>

              {/* Alerts */}
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg font-mono text-[10px] flex items-start gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg font-mono text-[10px] flex items-start gap-2 animate-pulse">
                  <CheckCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Form buttons */}
              <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsRouteModalOpen(false);
                    setTargetGroup(null);
                  }}
                  className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !routePetugasId}
                  className="px-5 py-2 bg-indigo-650 hover:bg-slate-950 text-white font-bold text-xs rounded-xl transition shadow disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center gap-1.5"
                  id="btn_save_route_assignment"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="animate-spin" size={13} />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      Simpan Rute Kunjungan
                    </>
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Excel Import Modal */}
      {isImportExcelModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto" id="excel_import_modal">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-100 flex flex-col">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <div>
                <h3 className="text-sm font-bold text-slate-950 flex items-center gap-1.5 font-sans">
                  <FileSpreadsheet className="text-indigo-650" size={18} />
                  Impor Jadwal Penagihan via Excel
                </h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">MENDUKUNG FORMAT KELOMPOK SMART GROUPING REDUCE</p>
              </div>
              <button 
                onClick={() => setIsImportExcelModalOpen(false)}
                className="p-1 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleExcelImportSubmit} className="flex flex-col p-6 space-y-5">
              
              {importSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-150 rounded-xl text-emerald-800 text-xs flex items-center gap-2 font-mono">
                  <CheckCircle size={14} className="text-emerald-600 shrink-0" />
                  <span>{importSuccessMsg}</span>
                </div>
              )}

              {importErrorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-150 rounded-xl text-rose-800 text-xs flex items-center gap-2 font-mono">
                  <AlertCircle size={14} className="text-rose-600 shrink-0" />
                  <span>{importErrorMsg}</span>
                </div>
              )}

              {/* Grid of Assignment details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Petugas Select */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest font-mono">
                    👤 Petugas Lapangan
                  </label>
                  <select
                    value={importOfficerId}
                    onChange={(e) => setImportOfficerId(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                    required
                  >
                    <option value="">-- Pilih Petugas --</option>
                    {systemState?.users?.filter(u => u.role === 'field_officer' || u.role === 'petugas' || u.role === 'admin').map(user => (
                      <option key={user.id} value={user.id}>
                        {user.nama}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Hari Penagihan */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest font-mono">
                    📆 Hari Rute
                  </label>
                  <select
                    value={importHariPenagihan}
                    onChange={(e) => setImportHariPenagihan(e.target.value as any)}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                    required
                  >
                    <option value="SENIN">SENIN</option>
                    <option value="SELASA">SELASA</option>
                    <option value="RABU">RABU</option>
                    <option value="KAMIS">KAMIS</option>
                    <option value="JUMAT">JUMAT</option>
                    <option value="SABTU">SABTU</option>
                  </select>
                </div>

              </div>

              {/* Drag Zone Area */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest font-mono">
                  📂 Unggah Berkas Excel (.xlsx, .xls, .csv)
                </label>
                
                <div className="border border-dashed border-slate-350 hover:border-indigo-400 rounded-2xl p-6 transition bg-slate-50/50 flex flex-col items-center justify-center text-center relative">
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        try {
                          const data = new Uint8Array(event.target?.result as ArrayBuffer);
                          const workbook = XLSX.read(data, { type: 'array' });
                          const firstSheetName = workbook.SheetNames[0];
                          const worksheet = workbook.Sheets[firstSheetName];
                          const jsonRows = XLSX.utils.sheet_to_json(worksheet);
                          
                          if (jsonRows.length === 0) {
                            setImportErrorMsg("File Excel kosong atau tidak memiliki baris data.");
                            return;
                          }
                          setImportedRows(jsonRows);
                          setImportSuccessMsg(`Berhasil membaca ${jsonRows.length} baris dari sheet "${firstSheetName}".`);
                          setImportErrorMsg(null);
                        } catch (err: any) {
                          setImportErrorMsg("Gagal membaca file Excel. Error: " + err.message);
                        }
                      };
                      reader.readAsArrayBuffer(file);
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <Upload size={28} className="text-slate-400 mb-2" />
                  <p className="text-xs font-bold text-slate-700">Tarik berkas excel ke sini atau klik untuk memilih</p>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">Header wajib: "Nama Kelompok", "Nama Anggota", "Tenor", "Tanggal Pencairan", "Besar Pinjaman", "Pokok+Bunga"</p>
                </div>
              </div>

              {/* Rows Preview Grid Panel */}
              {importedRows.length > 0 && (
                <div className="space-y-1.5">
                  <span className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest font-mono">
                    📋 Pratinjau Data Unggahan (Menampilkan {Math.min(5, importedRows.length)} dari {importedRows.length} baris)
                  </span>
                  <div className="overflow-x-auto border border-slate-150 rounded-xl max-h-[160px]">
                    <table className="w-full text-left text-[10px] border-collapse font-mono bg-white">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[9px] font-bold">
                          <th className="p-2.5">Kelompok</th>
                          <th className="p-2.5">Anggota</th>
                          <th className="p-2.5">Pinjaman</th>
                          <th className="p-2.5">Tenor</th>
                          <th className="p-2.5">Cair Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importedRows.slice(0, 5).map((row, i) => {
                          const getPreviewVal = (keys: string[]) => {
                            for (const k of keys) {
                              if (row[k] !== undefined) return row[k];
                              const ck = k.toLowerCase().replace(/[^a-z0-9]/g, "");
                              for (const rk of Object.keys(row)) {
                                if (rk.toLowerCase().replace(/[^a-z0-9]/g, "") === ck) return row[rk];
                              }
                            }
                            return "-";
                          };
                          return (
                            <tr key={i} className="hover:bg-slate-50/50">
                              <td className="p-2.5 font-bold text-slate-800">{String(getPreviewVal(["Nama Kelompok", "nama_kelompok", "kelompok"]))}</td>
                              <td className="p-2.5 text-slate-600">{String(getPreviewVal(["Nama Anggota", "nama_anggota", "anggota"]))}</td>
                              <td className="p-2.5 text-slate-705 font-bold">Rp {Number(getPreviewVal(["Besar Pinjaman", "besar_pinjaman", "pokok", "pinjaman"]) || 0).toLocaleString('id-ID')}</td>
                              <td className="p-2.5 text-slate-600">{String(getPreviewVal(["Tenor", "tenor"]))} Mg</td>
                              <td className="p-2.5 text-indigo-700">{String(getPreviewVal(["Tanggal Pencairan", "tanggal_pencairan", "cair"]))}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-150">
                <button
                  type="button"
                  onClick={() => setIsImportExcelModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isImporting || importedRows.length === 0}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-650 hover:bg-indigo-700 disabled:bg-slate-300 rounded-xl flex items-center gap-1.5 shadow-sm shadow-indigo-100"
                >
                  {isImporting ? <RefreshCw className="animate-spin" size={14} /> : null}
                  Proses Transaksi Impor
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Advanced Route Mapping Modal */}
      {isPemetaanModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto" id="pemetaan_route_modal">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl border border-slate-300 flex flex-col">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <div>
                <h3 className="text-sm font-bold text-slate-950 flex items-center gap-1.5 font-sans">
                  {isPemetaanEditMode ? <Pencil className="text-indigo-600 animate-pulse" size={16} /> : <Clock className="text-indigo-600" size={16} />}
                  {isPemetaanEditMode ? "✏️ Edit Pemetaan Rute Kelompok" : "+ Tambah Pemetaan Rute Manual"}
                </h3>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">FORM DATA PEMETAAN PENANGANAN DAN JADWAL</p>
              </div>
              <button 
                onClick={() => {
                  setIsPemetaanModalOpen(false);
                }}
                className="p-1 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handlePemetaanSubmit} className="p-5 space-y-5 font-sans text-xs">
              
              {/* BAGIAN A: ALOKASI PETUGAS & JADWAL WAKTU PERTEMUAN */}
              <div className="space-y-4 p-5 bg-gradient-to-r from-indigo-50/40 to-slate-50 rounded-xl border border-indigo-100/50">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b border-indigo-100 pb-2 gap-2">
                  <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Clock size={15} />
                    BAGIAN A: ALOKASI PETUGAS & JADWAL WAKTU PERTEMUAN
                  </h4>

                  {/* 📍 Pilih Cabang/Wilayah (Dropdown) positioned in top-right corner of BAGIAN A */}
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
                      📍 Pilih Cabang/Wilayah (Dropdown)
                    </label>
                    {pemetaanMode === 'manual' || isPemetaanEditMode ? (
                      <div className="relative">
                        <select
                          value={pemetaanManualRegionId}
                          onChange={(e) => setPemetaanManualRegionId(e.target.value)}
                          className="text-[11px] p-1 border rounded bg-white font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 border-slate-300"
                          required={pemetaanMode === 'manual' || isPemetaanEditMode}
                        >
                          <option value="">-- Pilih Wilayah --</option>
                          {(systemState?.regions || []).map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                          <option value="create_new" className="text-emerald-700 font-bold">+ Tambah Wilayah Baru</option>
                        </select>

                        {pemetaanManualRegionId === 'create_new' && (
                          <div className="absolute right-0 top-full mt-1.5 z-50 w-52 bg-white border border-emerald-300 p-2 rounded-xl shadow-lg animate-fade-in space-y-1">
                            <input
                              type="text"
                              placeholder="Tulis Nama Wilayah Baru"
                              value={pemetaanNewRegionName}
                              onChange={(e) => setPemetaanNewRegionName(e.target.value)}
                              className="w-full text-xs p-1.5 border rounded bg-emerald-50/50 border-emerald-200 font-mono font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
                              required={pemetaanManualRegionId === 'create_new'}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-1 text-slate-600 font-bold font-mono text-[11px]">
                        {selectedPemetaanRegion ? `📍 ${selectedPemetaanRegion.name}` : "⚠️ Pilih POKOK"}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Pilih Petugas Lapangan Dropdown */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest font-mono">
                      👤 Pilih Petugas Lapangan
                    </label>
                    <select
                      value={pemetaanPetugasId}
                      onChange={(e) => setPemetaanPetugasId(e.target.value)}
                      className="w-full text-xs p-2.5 border rounded-lg bg-white font-mono font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                      required
                      id="pemetaan_select_petugas"
                    >
                      <option value="">-- Pilih Petugas Lapangan --</option>
                      {officers.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.nama} ({u.nik})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Empty/Filler column for spacing balance */}
                  <div className="hidden md:block"></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Hari Penagihan Dropdown */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest font-mono">
                      📅 Hari Penagihan
                    </label>
                    <select
                      value={pemetaanHari}
                      onChange={(e) => setPemetaanHari(e.target.value as any)}
                      className="w-full text-xs p-2.5 border rounded-lg bg-white font-mono font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                      required
                      id="pemetaan_select_hari"
                    >
                      <option value="SENIN">Senin</option>
                      <option value="SELASA">Selasa</option>
                      <option value="RABU">Rabu</option>
                      <option value="KAMIS">Kamis</option>
                      <option value="JUMAT">Jumat</option>
                      <option value="SABTU">Sabtu</option>
                    </select>
                  </div>

                  {/* Jam Pertemuan/Setoran Time Picker */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest font-mono">
                      ⏰ Jam Pertemuan/Setoran
                    </label>
                    <input
                      type="time"
                      value={pemetaanJamSetoran}
                      onChange={(e) => setPemetaanJamSetoran(e.target.value)}
                      className="w-full text-xs p-2 border rounded-lg bg-white font-mono font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                      required
                      id="pemetaan_input_jam"
                    />
                  </div>

                  {/* Urutan Kunjungan Rute Input Number */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest font-mono">
                      🗂️ Urutan Kunjungan Rute
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={pemetaanUrutan}
                      onChange={(e) => setPemetaanUrutan(Math.max(1, Number(e.target.value)))}
                      className="w-full text-xs p-2.5 border rounded-lg bg-white font-mono font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                      required
                      id="pemetaan_input_urutan"
                    />
                  </div>
                </div>
              </div>

              {/* BAGIAN B: DAFTAR KELOMPOK DAN ANGGOTA BIASA */}
              <div className="space-y-4 p-5 bg-gradient-to-r from-slate-50/70 to-slate-100/30 rounded-xl border border-slate-200">
                <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider font-mono flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  <Users size={15} />
                  BAGIAN B: DAFTAR KELOMPOK DAN ANGGOTA
                </h4>

                {/* Switcher Opsi Sumber Data */}
                {!isPemetaanEditMode ? (
                  <div className="space-y-1.5 pb-2 border-b border-slate-200/50">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono text-center mb-1">
                      Metode Input Data Kelompok:
                    </label>
                    <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                      <button
                        type="button"
                        onClick={() => setPemetaanMode('otomatis')}
                        className={`px-3 py-2 text-left rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                          pemetaanMode === 'otomatis'
                            ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-bold ring-2 ring-indigo-50/50'
                            : 'bg-white border-slate-250 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                          pemetaanMode === 'otomatis' ? 'border-indigo-600' : 'border-slate-300'
                        }`}>
                          {pemetaanMode === 'otomatis' && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                        </span>
                        <span>Tarik Data Sistem</span>
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => setPemetaanMode('manual')}
                        className={`px-3 py-2 text-left rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                          pemetaanMode === 'manual'
                            ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-bold ring-2 ring-indigo-50/50'
                            : 'bg-white border-slate-250 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                          pemetaanMode === 'manual' ? 'border-indigo-600' : 'border-slate-300'
                        }`}>
                          {pemetaanMode === 'manual' && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                        </span>
                        <span>Input Manual Baru</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pb-2 border-b border-slate-200/50">
                    <span className="px-2.5 py-1 bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-mono font-bold rounded uppercase">
                      ✏️ EDIT MODE KELOMPOK AKTIF
                    </span>
                  </div>
                )}

                {/* Render Dinamis Berdasarkan Opsi Terpilih */}
                {pemetaanMode === 'otomatis' && !isPemetaanEditMode ? (
                  <>
                    {/* Pilih Kelompok Dropdown */}
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest font-mono">
                        Nama Kelompok Terpilih
                      </label>
                      <select
                        value={pemetaanGroupId}
                        onChange={(e) => setPemetaanGroupId(e.target.value)}
                        disabled={isPemetaanEditMode}
                        className="w-full text-xs p-2.5 border rounded-lg bg-white font-mono font-bold text-slate-800 focus:outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                        required={pemetaanMode === 'otomatis'}
                        id="pemetaan_select_group"
                      >
                        <option value="">-- Pilih Kelompok Sasaran --</option>
                        {(systemState?.groups || []).map(g => (
                          <option key={g.id} value={g.id}>
                            {g.name} (ID: {g.id})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Auto-fill/Read-Only fields if a group is chosen */}
                    {pemetaanGroupId ? (
                      <div className="space-y-3 p-3 bg-indigo-50/40 border border-indigo-100 rounded-xl">
                        <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                          <div>
                            <span className="text-[9px] text-slate-400 block leading-none font-mono">POKOK PINJAMAN:</span>
                            <span className="text-indigo-955 font-bold font-mono block mt-1 text-[10px]">
                              {(() => {
                                const groupMembers = systemState?.customers?.filter(c => c.group_id === pemetaanGroupId) || [];
                                const groupContracts = systemState?.loans?.filter(l => groupMembers.find(m => m.id === l.customer_id)) || [];
                                const computedPokok = groupContracts.reduce((sum, l) => sum + (Number(l.plafon) || 0), 0);
                                return `Rp ${computedPokok.toLocaleString('id-ID')}`;
                              })()}
                            </span>
                          </div>

                          <div>
                            <span className="text-[9px] text-slate-400 block leading-none font-mono font-bold">POKOK + BUNGA:</span>
                            <span className="text-indigo-955 font-bold font-mono block mt-1 text-[10px]">
                              {(() => {
                                const groupMembers = systemState?.customers?.filter(c => c.group_id === pemetaanGroupId) || [];
                                const groupBillings = systemState?.billingSchedules?.filter(b => groupMembers.find(m => m.id === b.customer_id)) || [];
                                const computedTotal = groupBillings.reduce((sum, b) => sum + (Number(b.total_tagihan) || 0), 0);
                                if (computedTotal > 0) {
                                  return `Rp ${computedTotal.toLocaleString('id-ID')}`;
                                }
                                const groupContracts = systemState?.loans?.filter(l => groupMembers.find(m => m.id === l.customer_id)) || [];
                                const computedPokok = groupContracts.reduce((sum, l) => sum + (Number(l.plafon) || 0), 0);
                                const estimated = Math.round(computedPokok * 1.10);
                                return `Rp ${estimated.toLocaleString('id-ID')}`;
                              })()}
                            </span>
                          </div>

                          <div>
                            <span className="text-[9px] text-slate-400 block leading-none font-mono">TARGET ANGSURAN:</span>
                            <span className="text-emerald-700 font-extrabold font-mono block mt-1 text-[10px]">
                              {(() => {
                                const groupMembers = systemState?.customers?.filter(c => c.group_id === pemetaanGroupId) || [];
                                const groupBillings = systemState?.billingSchedules?.filter(b => groupMembers.find(m => m.id === b.customer_id)) || [];
                                const computedTarget = groupBillings.filter(b => b.term === 1).reduce((sum, b) => sum + (Number(b.total_tagihan) || 0), 0);
                                if (computedTarget > 0) {
                                  return `Rp ${computedTarget.toLocaleString('id-ID')}`;
                                }
                                const groupContracts = systemState?.loans?.filter(l => groupMembers.find(m => m.id === l.customer_id)) || [];
                                const computedPokok = groupContracts.reduce((sum, l) => sum + (Number(l.plafon) || 0), 0);
                                const estTarget = Math.round((computedPokok * 1.10) / 10);
                                return `Rp ${estTarget.toLocaleString('id-ID')}`;
                              })()}
                            </span>
                          </div>
                        </div>

                        {/* Read-Only Members List */}
                        <div className="pt-2 border-t border-indigo-100/60">
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                            Daftar Anggota Kelompok (Sistem):
                          </label>
                          <div className="space-y-1 mt-1 max-h-32 overflow-y-auto pr-1">
                            {(() => {
                              const groupMembers = systemState?.customers?.filter(c => c.group_id === pemetaanGroupId) || [];
                              if (groupMembers.length === 0) {
                                return <p className="text-[10px] text-slate-400 italic font-mono">- Anggota tidak ditemukan di sistem -</p>;
                              }
                              return groupMembers.map((m, idx) => {
                                const loan = systemState?.loans?.find(l => l.customer_id === m.id);
                                return (
                                  <div key={m.id} className="text-[11px] font-mono text-slate-700 bg-white border border-slate-100 px-3.5 py-1.5 rounded-lg flex justify-between shadow-sm">
                                    <span>{idx + 1}. {m.name}</span>
                                    <span className="text-slate-500 font-bold">
                                      {loan ? `Rp ${(loan.plafon || 0).toLocaleString('id-ID')}` : 'Belum cair'}
                                    </span>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    {/* INPUT MANUAL MODE */}
                    <div className="space-y-4">
                      
                      {/* Nama Kelompok Baru Input */}
                      {isPemetaanEditMode ? (
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold text-slate-650 uppercase tracking-widest font-mono">
                            📂 Mengedit Kelompok Terpilih
                          </label>
                          <input
                            type="text"
                            value={pemetaanNamaKelompokBaru}
                            disabled
                            className="w-full text-xs p-2.5 border rounded-lg bg-slate-100 font-mono font-bold text-slate-500 cursor-not-allowed"
                          />
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest font-mono">
                            📝 Nama Kelompok Baru
                          </label>
                          <input
                            type="text"
                            placeholder="Contoh: Kelompok Melati Baru"
                            value={pemetaanNamaKelompokBaru}
                            onChange={(e) => setPemetaanNamaKelompokBaru(e.target.value)}
                            className="w-full text-xs p-2.5 border rounded-lg bg-white font-mono font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                            required={pemetaanMode === 'manual'}
                          />
                        </div>
                      )}

                      {/* Penambahan Tanggal Pencairan & Jatuh Tempo */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest font-mono">
                            📅 Tanggal Pencairan
                          </label>
                          <input
                            type="date"
                            value={pemetaanTanggalPencairan}
                            onChange={(e) => setPemetaanTanggalPencairan(e.target.value)}
                            className="w-full text-xs p-2 border rounded-lg bg-white font-mono font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                            required={pemetaanMode === 'manual' || isPemetaanEditMode}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold text-indigo-750 uppercase tracking-widest font-mono flex items-center gap-1.5">
                            📅 Tanggal Jatuh Tempo (Maturity)
                            <span className="text-[9px] bg-indigo-150 text-indigo-850 px-2 py-0.5 rounded-full font-bold">Auto-Calculated</span>
                          </label>
                          <input
                            type="date"
                            value={pemetaanTanggalJatuhTempo}
                            onChange={(e) => setPemetaanTanggalJatuhTempo(e.target.value)}
                            className="w-full text-xs p-2 border border-indigo-200 rounded-lg bg-indigo-50/40 font-mono font-bold text-indigo-900 focus:outline-none focus:border-indigo-500"
                            required={pemetaanMode === 'manual' || isPemetaanEditMode}
                          />
                          <p className="text-[10px] text-slate-450 font-mono">
                            Dihitung otomatis: Tanggal Pencairan + (Tenor Terpanjang * 7 Hari)
                          </p>
                        </div>
                      </div>

                      {/* Summary Aggregations (Read-Only Sums or editable fallback) */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3.5 bg-indigo-50/20 border border-indigo-100 rounded-xl">
                        <div className="space-y-0.5">
                          <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                            Total Pokok Pinjaman
                          </span>
                          <span className="text-[12px] text-slate-700 font-extrabold block font-mono">
                            Rp {pemetaanPokokPinjaman.toLocaleString('id-ID')}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-mono">
                            *Otomatis dari penjumlahan anggota
                          </span>
                        </div>

                        <div className="space-y-0.5">
                          <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                            Total Pokok + Bunga
                          </span>
                          <span className="text-[12px] text-slate-700 font-extrabold block font-mono">
                            Rp {pemetaanPokokBunga.toLocaleString('id-ID')}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-mono">
                            *Sistem bunga berjalan 10%
                          </span>
                        </div>

                        <div className="space-y-0.5">
                          <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                            Total Target Angsuran
                          </span>
                          <span className="text-[12px] text-emerald-700 font-extrabold block font-mono">
                            Rp {pemetaanTargetAngsuran.toLocaleString('id-ID')}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-mono">
                            *Total kewajiban setor mingguan
                          </span>
                        </div>
                      </div>

                      {/* UI FIELD ARRAY: Daftar Anggota Kelompok (Format Grid Data-Entry) */}
                      <div className="p-4 bg-slate-50 border border-slate-150 rounded-xl space-y-3">
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-[10px] font-bold text-indigo-700 uppercase tracking-wider font-mono">
                            {isPemetaanEditMode ? "👥 DAFTAR ANGGOTA KELOMPOK" : "👥 DAFTAR ANGGOTA KELOMPOK BARU"} ({pemetaanMembers.length})
                          </label>
                          <button
                            type="button"
                            onClick={() => setPemetaanMembers([...pemetaanMembers, { name: '', pokok: 1000000, pokokBunga: 1100000, tenor: 10, angsuran: 110000, mingguBerjalan: 0 }])}
                            className="px-3 py-1 bg-indigo-650 text-white rounded-lg text-[10px] font-bold hover:bg-slate-900 transition flex items-center gap-1 cursor-pointer shadow-sm"
                          >
                            <Plus size={12} strokeWidth={2} />
                            <span>Tambah Baris</span>
                          </button>
                        </div>

                        {/* Table Header Row (Hidden on mobile) */}
                        <div className="hidden md:grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 pb-1.5 font-mono px-1">
                          <div className="col-span-3">Nama Pemohon</div>
                          <div className="col-span-2">Pokok Pinjaman (Rp)</div>
                          <div className="col-span-2">Pokok + Bunga (Rp)</div>
                          <div className="col-span-1 text-center">Tenor (Mg)</div>
                          <div className="col-span-1 text-center">Masuk (Mg)</div>
                          <div className="col-span-1 text-center font-mono">Sisa</div>
                          <div className="col-span-1 text-right">Angsuran / Mg</div>
                          <div className="col-span-1 text-center font-bold">Aksi</div>
                        </div>

                        {/* Table Body - Rows */}
                        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1 font-mono">
                          {pemetaanMembers.map((member, idx) => (
                            <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-white p-2 rounded-xl border border-slate-200 hover:border-indigo-200 hover:shadow-xs transition duration-150">
                              
                              {/* Nama Pemohon */}
                              <div className="col-span-3 space-y-0.5">
                                <span className="block md:hidden text-[9px] font-bold text-slate-400 font-mono">Nama Pemohon:</span>
                                <input
                                  type="text"
                                  placeholder="Contoh: Ibu Siti"
                                  value={member.name}
                                  onChange={(e) => {
                                    const list = [...pemetaanMembers];
                                    list[idx].name = e.target.value;
                                    setPemetaanMembers(list);
                                  }}
                                  className="w-full text-xs p-2 border rounded-lg focus:outline-none focus:border-indigo-500 bg-slate-50/20"
                                  required
                                />
                              </div>

                              {/* Pokok Pinjaman */}
                              <div className="col-span-2 space-y-0.5">
                                <span className="block md:hidden text-[9px] font-bold text-slate-400 font-mono">Pokok (Rp):</span>
                                <input
                                  type="number"
                                  placeholder="Rp..."
                                  value={member.pokok || ''}
                                  onChange={(e) => {
                                    const list = [...pemetaanMembers];
                                    const val = Number(e.target.value);
                                    list[idx].pokok = val;
                                    list[idx].pokokBunga = Math.round(val * 1.10);
                                    list[idx].angsuran = Math.round((val * 1.10) / (list[idx].tenor || 1));
                                    setPemetaanMembers(list);
                                  }}
                                  className="w-full text-xs p-2 border rounded-lg focus:outline-none focus:border-indigo-500 bg-slate-50/20 font-bold"
                                  required
                                />
                              </div>

                              {/* Pokok + Bunga */}
                              <div className="col-span-2 space-y-0.5">
                                <span className="block md:hidden text-[9px] font-bold text-slate-400 font-mono">Pokok+Bunga (Rp):</span>
                                <input
                                  type="number"
                                  placeholder="Rp..."
                                  value={member.pokokBunga || ''}
                                  onChange={(e) => {
                                    const list = [...pemetaanMembers];
                                    const val = Number(e.target.value);
                                    list[idx].pokokBunga = val;
                                    list[idx].angsuran = Math.round(val / (list[idx].tenor || 1));
                                    setPemetaanMembers(list);
                                  }}
                                  className="w-full text-xs p-2 border rounded-lg focus:outline-none focus:border-indigo-500 bg-slate-50/20 font-bold"
                                  required
                                />
                              </div>

                              {/* Tenor (Mg) */}
                              <div className="col-span-1 space-y-0.5">
                                <span className="block md:hidden text-[9px] font-bold text-slate-400 font-mono">Tenor:</span>
                                <input
                                  type="number"
                                  placeholder="10"
                                  value={member.tenor || ''}
                                  onChange={(e) => {
                                    const list = [...pemetaanMembers];
                                    const val = Number(e.target.value);
                                    list[idx].tenor = val;
                                    list[idx].angsuran = Math.round(list[idx].pokokBunga / (val || 1));
                                    setPemetaanMembers(list);
                                  }}
                                  className="w-full text-xs p-2 border rounded-lg focus:outline-none focus:border-indigo-500 bg-slate-50/20 text-center font-bold"
                                  required
                                />
                              </div>

                              {/* Minggu Berjalan (Mg) */}
                              <div className="col-span-1 space-y-0.5">
                                <span className="block md:hidden text-[9px] font-bold text-slate-400 font-mono">Minggu Berjalan:</span>
                                <input
                                  type="number"
                                  placeholder="0"
                                  min="0"
                                  max={member.tenor}
                                  value={member.mingguBerjalan ?? 0}
                                  onChange={(e) => {
                                    const list = [...pemetaanMembers];
                                    const val = Math.max(0, Number(e.target.value));
                                    list[idx].mingguBerjalan = val;
                                    setPemetaanMembers(list);
                                  }}
                                  className="w-full text-xs p-2 border border-emerald-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-emerald-50/10 text-center font-bold text-emerald-800"
                                  required
                                />
                              </div>

                              {/* Sisa Minggu (Mg) */}
                              <div className="col-span-1 space-y-0.5 text-center">
                                <span className="block md:hidden text-[9px] font-bold text-slate-400 font-mono">Sisa Minggu:</span>
                                <div className="text-xs font-bold font-mono text-indigo-700 bg-slate-100/55 p-1.5 rounded-lg border border-dashed border-slate-250">
                                  {Math.max(0, (member.tenor || 10) - (member.mingguBerjalan || 0))} Mg
                                </div>
                              </div>

                              {/* Angsuran per Mg */}
                              <div className="col-span-1 space-y-0.5">
                                <span className="block md:hidden text-[9px] font-bold text-slate-400 font-mono">Angsuran (Rp):</span>
                                <input
                                  type="number"
                                  placeholder="Rp..."
                                  value={member.angsuran || ''}
                                  onChange={(e) => {
                                    const list = [...pemetaanMembers];
                                    list[idx].angsuran = Number(e.target.value);
                                    setPemetaanMembers(list);
                                  }}
                                  className="w-full text-xs p-2 border rounded-lg focus:outline-none focus:border-indigo-500 bg-slate-50/20 font-bold"
                                  required
                                />
                              </div>

                              {/* Actions on extreme right */}
                              <div className="col-span-1 flex items-center justify-end md:justify-center gap-1.5 mt-2 md:mt-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const list = [...pemetaanMembers];
                                    list.splice(idx + 1, 0, { name: '', pokok: 1000000, pokokBunga: 1100000, tenor: 10, angsuran: 110000, mingguBerjalan: 0 });
                                    setPemetaanMembers(list);
                                  }}
                                  title="Tambah Baris"
                                  className="p-1 px-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer flex items-center justify-center shrink-0 border border-slate-100 bg-slate-50 hover:border-indigo-200"
                                >
                                  <Plus size={12} strokeWidth={2.5} />
                                </button>

                                {pemetaanMembers.length > 1 ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const list = [...pemetaanMembers];
                                      list.splice(idx, 1);
                                      setPemetaanMembers(list);
                                    }}
                                    title="Hapus Baris"
                                    className="p-1 px-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition cursor-pointer flex items-center justify-center shrink-0 border border-slate-100 bg-slate-50 hover:border-rose-200"
                                  >
                                    <Trash2 size={12} strokeWidth={2.5} />
                                  </button>
                                ) : (
                                  <div className="w-7 h-7" />
                                )}
                              </div>

                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  </>
                )}

                {/* Status Tanggung Renteng Switch/Toggle */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-200/65">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest font-mono">
                      Status Tanggung Renteng
                    </label>
                    <span className="text-[9px] text-slate-400 block max-w-sm">
                      Apakah kelompok ini mengikat tanggung renteng ketika ada tunggakan?
                    </span>
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => setPemetaanIsTR(!pemetaanIsTR)}
                    className="flex items-center gap-1.5 focus:outline-none cursor-pointer"
                  >
                    <div className={`w-11 h-6 flex items-center rounded-full p-1 transition-all duration-300 ${pemetaanIsTR ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                      <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-all duration-300 ${pemetaanIsTR ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                    <span className={`text-[10px] font-bold font-mono transition-colors ${pemetaanIsTR ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {pemetaanIsTR ? "Ya (TR)" : "Tidak"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Alerts */}
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg font-mono text-[10px] flex items-start gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg font-mono text-[10px] flex items-start gap-2 animate-pulse">
                  <CheckCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Form Actions */}
              <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsPemetaanModalOpen(false);
                  }}
                  className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || (pemetaanMode === 'otomatis' && !pemetaanGroupId) || !pemetaanPetugasId}
                  className="px-5 py-2 bg-indigo-650 hover:bg-slate-950 text-white font-bold text-xs rounded-xl transition shadow disabled:bg-slate-150 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center gap-1.5"
                  id="btn_save_pemetaan_assignment"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="animate-spin" size={13} />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      Simpan Pemetaan Rute
                    </>
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
