/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  UserCheck, 
  Users, 
  ClipboardCheck, 
  Coins, 
  FileText, 
  TrendingUp, 
  Database, 
  Search,
  CalendarCheck,
  Layers,
  UploadCloud, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  BookOpen, 
  ArrowRightLeft, 
  Info,
  Calendar,
  Wallet,
  TrendingDown,
  Building,
  Plus,
  Trash2,
  Lock,
  Unlock,
  Smartphone,
  Monitor,
  Check,
  X,
  ShieldCheck,
  ShieldAlert,
  Image,
  FileSpreadsheet,
  FolderOpen,
  Camera,
  CheckSquare,
  Download,
  MapPin,
  Printer,
  User,
  ChevronDown,
  ChevronUp,
  Bell,
  Edit2,
  History,
  Route,
  HandCoins,
  Scale,
  PieChart,
  Landmark,
  Calculator,
  Settings,
  Shield
} from 'lucide-react';
import { 
  SystemState, 
  Customer, 
  Group, 
  COA, 
  BillingSchedule, 
  Payment,
  JournalEntry,
  JournalEntryLine
} from './types';
import MobileAuthSimulator from './components/MobileAuthSimulator';
import SettleTalanganScreen from './components/SettleTalanganScreen';
import { OnboardingMigrasiScreen } from './components/OnboardingMigrasiScreen';
import { ManajemenPenagihanScreen } from './components/ManajemenPenagihanScreen';
import ManajemenPenggunaScreen from './components/ManajemenPenggunaScreen';
import RekapanAngsuranHarianScreen from './components/RekapanAngsuranHarianScreen';
import OperasionalScreen from './components/OperasionalScreen';
import AccountingScreen from './components/AccountingScreen';
import { SSJBLogo } from './components/SSJBLogo';
import { jsPDF } from 'jspdf';

// Shadowing outer fetch to automatically append JWT Token based on activeRole
const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const urlStr = typeof input === 'string' ? input : (input as Request).url;
  let newInit = init ? { ...init } : {};
  if (urlStr.startsWith('/api/')) {
    const activeRole = (window as any).activeRole || 'petugas';
    const activeBranch = (window as any).activeBranch || 'PUSAT';
    
    let userId = "USR-03"; // admin default
    if (activeRole === 'petugas') userId = "USR-04"; // Rudi Hermawan
    else if (activeRole === 'spv') userId = "USR-02"; // SPV
    else if (activeRole === 'kasir') userId = "USR-13"; // Kasir
    else if (activeRole === 'super_admin') userId = "SUPER_ADMIN"; // Super Admin

    const stateUsers = (window as any).stateUsers;
    if (stateUsers && Array.isArray(stateUsers)) {
      const u = stateUsers.find((usr: any) => usr.role === activeRole);
      if (u) userId = u.id;
    }

    const payload = { userId, role: activeRole, cabang_id: activeBranch };
    const token = "sim-jwt." + btoa(JSON.stringify(payload));

    const headers = new Headers(newInit.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    newInit.headers = headers;
  }
  return window.fetch(input, newInit);
};

const formatRupiah = (val: number | string | null | undefined) => {
  if (val === null || val === undefined || isNaN(Number(val))) return "Rp 0";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(val));
};

const formatDateIndo = (dateStr: string | null | undefined) => {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  } catch (e) {
    return dateStr;
  }
};

const formatTanggal = (dateStr?: string) => {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "-";
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch(e) {
    return "-";
  }
};

const formatJam = (dateStr?: string) => {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "-";
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes} WIB`;
  } catch(e) {
    return "-";
  }
};

export default function App() {
  // Roles definition
  const roles = [
    { id: 'petugas', name: 'Petugas Lapangan', device: 'Mobile', desc: 'Akses Survei, Berkas Masuk, input Penagihan (Dukung Offline)' },
    { id: 'spv', name: 'Supervisor (SPV)', device: 'Web', desc: 'Akses Verifikasi Berkas & Eksekutor Tunggal Pencairan' },
    { id: 'admin', name: 'Administrator (Admin)', device: 'Web', desc: 'Approval Berkas Akhir, Laporan Akuntansi. No Pencairan' },
    { id: 'kasir', name: 'Kasir', device: 'Web', desc: 'Eksekutor Tunggal Setoran Harian Kasir' },
    { id: 'super_admin', name: 'Super Admin', device: 'Web', desc: 'Manajemen Pengguna, Hak Akses, Matrix Penugasan Kelompok Harian' }
  ];

  const [activeRole, setActiveRole] = useState<'petugas' | 'spv' | 'admin' | 'kasir' | 'super_admin'>('petugas');
  const [activeBranch, setActiveBranch] = useState<'ALL' | 'PUSAT' | 'KC_MATIM'>('PUSAT');
  const [state, setState] = useState<SystemState | null>(null);
  const [coa, setCoa] = useState<COA[]>([]);
  const [rawCustomers, setRawCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorString, setErrorString] = useState<string | null>(null);
  const [successString, setSuccessString] = useState<string | null>(null);

  // Offline Simulator State for "Petugas"
  const [isOffline, setIsOffline] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<{
    collections: { billing_schedule_id: string; customer_id: string; nominal_bayar: number; customer_name: string }[];
    group_id: string;
  } | null>(null);

  // Sirkulasi Penagihan Mobile States
  const [selectedMobileHari, setSelectedMobileHari] = useState<string>(() => {
    const indonesianDays = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"];
    const currentDayName = indonesianDays[new Date().getDay()];
    return currentDayName === "MINGGU" ? "SENIN" : currentDayName;
  });
  const [selectedMobileGroupId, setSelectedMobileGroupId] = useState<string | null>(null);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>({});
  const [activeHistoryGroup, setActiveHistoryGroup] = useState<Group | null>(null);
  const [activeHistoryCustomer, setActiveHistoryCustomer] = useState<Customer | null>(null);
  const [expandedHistories, setExpandedHistories] = useState<Record<string, boolean>>({});
  const [paymentMethods, setPaymentMethods] = useState<Record<string, 'TUNAI' | 'TRANSFER'>>({});
  const [markedAbserMenunggak, setMarkedAbserMenunggak] = useState<Record<string, boolean>>({});
  const [markedLari, setMarkedLari] = useState<Record<string, boolean>>({});

  // Date filters for real-time reports
  const [reportStartDate, setReportStartDate] = useState('2026-06-01');
  const [reportEndDate, setReportEndDate] = useState('2026-06-30');
  const [accountingReports, setAccountingReports] = useState<any>(null);

  // Form states
  // Menu 1 New Group Form
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupTanggungRenteng, setNewGroupTanggungRenteng] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  // Menu 2 Survey states
  const [surveyGroupNotes, setSurveyGroupNotes] = useState('');
  const [surveyMemberStates, setSurveyMemberStates] = useState<{ [custId: string]: {
    alamat_sesuai: boolean;
    kondisi_rumah: string;
    pendapatan_bulanan: number;
    status_kelayakan: 'LAYAK_CAIR' | 'TIDAK_LAYAK';
    notes: string;
    
    // New parameters matching Expo hardware access & Prisma Backend scoring
    pendapatan_usaha?: number;
    pengeluaran_rumah_tangga?: number;
    tanggungan_koperasi_lain?: number;
    nama_koperasi?: string;
    foto_jaminan?: File | null;
    foto_anggota?: File | null;
    rekomendasi_petugas?: string;
    kordinat_lokasi?: string;
  }}>({});

  // Quantitative Group Survey Module State Hooks
  const [surveyActiveSubTab, setSurveyActiveSubTab] = useState<'kelompok' | 'individu'>('kelompok');
  const [selectedSurveyGroupId, setSelectedSurveyGroupId] = useState<string>('');
  const [groupSurveyFields, setGroupSurveyFields] = useState({
    wilayah: 'Sumedang Utara',
    tanggal_pertemuan: '2026-06-05T10:00',
    jumlah_anggota: 5,
    jumlah_pokok_pinjaman_kelompok: 12500000,
    inisiatif_ketua: 'CUKUP' as 'BAIK' | 'CUKUP' | 'KURANG',
    jarak_domisili: 'CUKUP' as 'BAIK' | 'CUKUP' | 'KURANG',
    kelengkapan_dokumen_dasar: 'CUKUP' as 'BAIK' | 'CUKUP' | 'KURANG',
    ketepatan_waktu: 'CUKUP' as 'BAIK' | 'CUKUP' | 'KURANG',
    pemahaman_tanggung_renteng: 'CUKUP' as 'BAIK' | 'CUKUP' | 'KURANG',
    penentuan_ketua_kelompok: 'CUKUP' as 'BAIK' | 'CUKUP' | 'KURANG',
    pengaruh_ketua: 'CUKUP' as 'BAIK' | 'CUKUP' | 'KURANG',
    saling_kenal_antar_anggota: 'CUKUP' as 'BAIK' | 'CUKUP' | 'KURANG',
    tingkat_kehadiran: 'CUKUP' as 'BAIK' | 'CUKUP' | 'KURANG',
    notes: ''
  });
  const [groupSurveyFotoFile, setGroupSurveyFotoFile] = useState<File | null>(null);
  const [isSubmittingGroupSurvey, setIsSubmittingGroupSurvey] = useState(false);
  const [showFailureGroupModal, setShowFailureGroupModal] = useState(false);
  const [failedGroupTotalScore, setFailedGroupTotalScore] = useState(0);
  const [showDisburseSuccessModal, setShowDisburseSuccessModal] = useState(false);
  const [lastDisburseId, setLastDisburseId] = useState<string>('');
  const [lastDisburseGroupId, setLastDisburseGroupId] = useState<string>('');

  // Menu 6 Payment Collection Form
  const [paymentInputs, setPaymentInputs] = useState<{ [schedId: string]: number }>({});
  const [surplusAllocation, setSurplusAllocation] = useState<{ [schedId: string]: number }>({});

  // MODUL 7 Setoran Harian Kasir extra states
  const [cashierActivePetugas, setCashierActivePetugas] = useState<string | null>(null);
  const [cashierExpandedKelompok, setCashierExpandedKelompok] = useState<{ [groupId: string]: boolean }>({});
  const [cashierSelectedPaymentIds, setCashierSelectedPaymentIds] = useState<{ [payId: string]: boolean }>({});
  
  // Correction/Revision edit mode
  const [cashierRevisingPayId, setCashierRevisingPayId] = useState<string | null>(null);
  const [cashierRevisingAmount, setCashierRevisingAmount] = useState<number>(0);
  const [cashierRevisingMethod, setCashierRevisingMethod] = useState<'TUNAI' | 'TRANSFER'>('TUNAI');
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);

  // Success Receipt popup state
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<{
    noTransaksi: string;
    petugasName: string;
    petugasId: string;
    timestamp: string;
    payments: Array<{
      id: string;
      anggotaName: string;
      kelompokName: string;
      nominal: number;
      metode: string;
    }>;
    totalAmount: number;
  } | null>(null);

  // Real-time notification toaster states
  const [cashierNotifications, setCashierNotifications] = useState<Array<{
    id: string;
    message: string;
    timestamp: string;
    type: 'info' | 'success';
  }>>([]);
  const [knownPaymentIds, setKnownPaymentIds] = useState<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<'database_awal' | 'berkas' | 'survei' | 'pencairan' | 'database_aktif' | 'manajemen_penagihan' | 'penagihan' | 'setoran' | 'laporan' | 'auth_simulator' | 'tanggung_renteng' | 'onboarding_legacy' | 'tracking_up' | 'tracking_deposito' | 'tracking_administrasi' | 'manajemen_pengguna'>('database_awal');

  // Real Raw Customers (Data Warehouse)
  const [dbAwalList, setDbAwalList] = useState<any[]>([]);
  const [dbAwalBranchTab, setDbAwalBranchTab] = useState<'PUSAT' | 'KC_MATIM'>('PUSAT');
  const [isImportExcelModalOpen, setIsImportExcelModalOpen] = useState(false);
  const [importExcelBranch, setImportExcelBranch] = useState<'PUSAT' | 'KC_MATIM' | ''>('');
  const [selectedExcelFile, setSelectedExcelFile] = useState<File | null>(null);
  const [dbAwalTotal, setDbAwalTotal] = useState(0);
  const [dbAwalPage, setDbAwalPage] = useState(1);
  const [dbAwalTotalPages, setDbAwalTotalPages] = useState(1);
  const [dbAwalStatus, setDbAwalStatus] = useState<string>('ALL');
  const [dbAwalSearch, setDbAwalSearch] = useState<string>('');
  const [dbAwalLimit, setDbAwalLimit] = useState<number>(10);
  const [dbAwalLoading, setDbAwalLoading] = useState<boolean>(false);
  const [selectedDetailCustomer, setSelectedDetailCustomer] = useState<any | null>(null);
  const [filterPetugasId, setFilterPetugasId] = useState<string>('ALL');
  const [filterPencairanPetugasId, setFilterPencairanPetugasId] = useState<string>('ALL');
  const [filterSurveyPetugasId, setFilterSurveyPetugasId] = useState<string>('ALL');

  const fetchDbAwalList = async (page: number = 1, statusVal: string = 'ALL', searchVal: string = '', limitVal: number = dbAwalLimit, cabangVal: string = dbAwalBranchTab) => {
    setDbAwalLoading(true);
    try {
      const res = await fetch(`/api/raw-customers?page=${page}&limit=${limitVal}&status=${statusVal}&search=${encodeURIComponent(searchVal)}&cabang=${cabangVal}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDbAwalList(data.data || []);
          setDbAwalTotal(data.total || 0);
          setDbAwalPage(data.page || 1);
          setDbAwalTotalPages(data.totalPages || 1);
        }
      }
    } catch (e) {
      console.error("Gagal mengambil data arsip", e);
    } finally {
      setDbAwalLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'database_awal') {
      fetchDbAwalList(dbAwalPage, dbAwalStatus, dbAwalSearch, dbAwalLimit, dbAwalBranchTab);
    }
  }, [activeTab, dbAwalPage, dbAwalStatus, dbAwalSearch, dbAwalLimit, dbAwalBranchTab]);

  // === TRACKING STATES & FETCH HANDLERS ===
  const [trackingUpData, setTrackingUpData] = useState<any[]>([]);
  const [trackingUpTotal, setTrackingUpTotal] = useState(0);
  const [trackingUpSearch, setTrackingUpSearch] = useState('');
  const [trackingUpStartDate, setTrackingUpStartDate] = useState('');
  const [trackingUpEndDate, setTrackingUpEndDate] = useState('');
  const [trackingUpLoading, setTrackingUpLoading] = useState(false);

  const [trackingDepData, setTrackingDepData] = useState<any[]>([]);
  const [trackingDepSearch, setTrackingDepSearch] = useState('');
  const [trackingDepStartDate, setTrackingDepStartDate] = useState('');
  const [trackingDepEndDate, setTrackingDepEndDate] = useState('');
  const [trackingDepStatus, setTrackingDepStatus] = useState('ALL'); // ALL, HOLD, RELEASED
  const [trackingDepLoading, setTrackingDepLoading] = useState(false);
  const [trackingDepTab, setTrackingDepTab] = useState<'all' | 'due_this_month'>('all');
  const [depReleaseConfirmItem, setDepReleaseConfirmItem] = useState<any | null>(null);
  const [doubleConfirmChecked1, setDoubleConfirmChecked1] = useState(false);
  const [doubleConfirmChecked2, setDoubleConfirmChecked2] = useState(false);

  // COLLECTIVE DISBURSEMENT FORM STATES
  const [disburseGroupId, setDisburseGroupId] = useState('');
  const [disbursePetugasPencairanId, setDisbursePetugasPencairanId] = useState('');
  const [disbursePetugasPenagihanId, setDisbursePetugasPenagihanId] = useState('');
  const [disburseHariPenagihan, setDisburseHariPenagihan] = useState('Senin');
  const [disburseSopCheck, setDisburseSopCheck] = useState(false);
  const [disburseCancelledMembers, setDisburseCancelledMembers] = useState<Record<string, boolean>>({});
  const [disburseSelfieUrl, setDisburseSelfieUrl] = useState('');
  const [disburseUploading, setDisburseUploading] = useState(false);

  // Load field collection drafts on mount (Offline Resiliency)
  useEffect(() => {
    try {
      const cachedInputs = localStorage.getItem('field_collection_payment_inputs');
      if (cachedInputs) {
        setPaymentInputs(JSON.parse(cachedInputs));
      }
      const cachedMethods = localStorage.getItem('field_collection_payment_methods');
      if (cachedMethods) {
        setPaymentMethods(JSON.parse(cachedMethods));
      }
      const cachedAbsen = localStorage.getItem('field_collection_absen');
      if (cachedAbsen) {
        setMarkedAbserMenunggak(JSON.parse(cachedAbsen));
      }
      const cachedLari = localStorage.getItem('field_collection_lari');
      if (cachedLari) {
        setMarkedLari(JSON.parse(cachedLari));
      }
    } catch (err) {
      console.error('Failed to load draft from localStorage:', err);
    }
  }, []);

  useEffect(() => {
    if (state?.customers && state?.groups) {
      const pendingGroups = state.groups.filter(grp =>
        state.customers.some(c => c.group_id === grp.id && c.status === 'LAYAK_CAIR')
      );
      if (pendingGroups.length > 0 && !disburseGroupId) {
        setDisburseGroupId(pendingGroups[0].id);
      }
    }
  }, [state, disburseGroupId]);

  useEffect(() => {
    if (state?.users) {
      const fieldStaffs = state.users.filter(u => u.role === 'petugas');
      if (fieldStaffs.length > 0) {
        if (!disbursePetugasPencairanId) setDisbursePetugasPencairanId(fieldStaffs[0].id);
        if (!disbursePetugasPenagihanId) setDisbursePetugasPenagihanId(fieldStaffs[0].id);
      }
    }
  }, [state, disbursePetugasPencairanId, disbursePetugasPenagihanId]);

  const [trackingAdmData, setTrackingAdmData] = useState<any[]>([]);
  const [trackingAdmTotal, setTrackingAdmTotal] = useState(0);
  const [trackingAdmSearch, setTrackingAdmSearch] = useState('');
  const [trackingAdmStartDate, setTrackingAdmStartDate] = useState('');
  const [trackingAdmEndDate, setTrackingAdmEndDate] = useState('');
  const [trackingAdmLoading, setTrackingAdmLoading] = useState(false);

  const fetchTrackingUp = async () => {
    setTrackingUpLoading(true);
    try {
      const q = new URLSearchParams();
      if (trackingUpSearch) q.append('search', trackingUpSearch);
      if (trackingUpStartDate) q.append('startDate', trackingUpStartDate);
      if (trackingUpEndDate) q.append('endDate', trackingUpEndDate);
      const res = await fetch(`/api/tracking/uang-pangkal?${q.toString()}`);
      if (res.ok) {
        const d = await res.json();
        if (d.success) {
          setTrackingUpData(d.data || []);
          setTrackingUpTotal(d.total_up || 0);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTrackingUpLoading(false);
    }
  };

  const fetchTrackingDep = async () => {
    setTrackingDepLoading(true);
    try {
      const q = new URLSearchParams();
      if (trackingDepSearch) q.append('search', trackingDepSearch);
      if (trackingDepStartDate) q.append('startDate', trackingDepStartDate);
      if (trackingDepEndDate) q.append('endDate', trackingDepEndDate);
      if (trackingDepStatus !== 'ALL') q.append('status', trackingDepStatus);
      const res = await fetch(`/api/tracking/deposito?${q.toString()}`);
      if (res.ok) {
        const d = await res.json();
        if (d.success) {
          setTrackingDepData(d.data || []);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTrackingDepLoading(false);
    }
  };

  const fetchTrackingAdm = async () => {
    setTrackingAdmLoading(true);
    try {
      const q = new URLSearchParams();
      if (trackingAdmSearch) q.append('search', trackingAdmSearch);
      if (trackingAdmStartDate) q.append('startDate', trackingAdmStartDate);
      if (trackingAdmEndDate) q.append('endDate', trackingAdmEndDate);
      const res = await fetch(`/api/tracking/administrasi?${q.toString()}`);
      if (res.ok) {
        const d = await res.json();
        if (d.success) {
          setTrackingAdmData(d.data || []);
          setTrackingAdmTotal(d.total_admin || 0);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTrackingAdmLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'tracking_up') {
      fetchTrackingUp();
    } else if (activeTab === 'tracking_deposito') {
      fetchTrackingDep();
    } else if (activeTab === 'tracking_administrasi') {
      fetchTrackingAdm();
    }
  }, [activeTab, trackingUpSearch, trackingUpStartDate, trackingUpEndDate, trackingDepSearch, trackingDepStartDate, trackingDepEndDate, trackingDepStatus, trackingAdmSearch, trackingAdmStartDate, trackingAdmEndDate]);

  // MANUAL FORM & FAST-TRACK OPERATIONS FOR REFERENCE TABLE (DATABASE AWAL)
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false);
  const [isUploadingExcel, setIsUploadingExcel] = useState(false);
  const [isMigratingCustomer, setIsMigratingCustomer] = useState<string | null>(null);

  // === BERKAS MASUK STATE & HANDLERS ===
  const [berkasSubTab, setBerkasSubTab] = useState<'mobile' | 'web'>('mobile');
  const [berkasFiles, setBerkasFiles] = useState<{
    doc_ktp_pemohon: File | null;
    doc_ktp_penjamin: File | null;
    doc_kk: File | null;
  }>({
    doc_ktp_pemohon: null,
    doc_ktp_penjamin: null,
    doc_kk: null
  });
  const [berkasSearchQuery, setBerkasSearchQuery] = useState('');
  const [berkasSearchResults, setBerkasSearchResults] = useState<any[]>([]);
  const [isSearchingBerkas, setIsSearchingBerkas] = useState(false);
  const [showBerkasSearchResults, setShowBerkasSearchResults] = useState(false);

  const [berkasFormData, setBerkasFormData] = useState({
    id_kelompok: '',
    nama_kelompok: '',
    wilayah: 'Wilayah Pusat',
    nama_pemohon: '',
    nik_pemohon: '',
    tahap_pinjaman: 1,
    pengajuan_pinjaman: 5000000,
    tenor_mg: 25,
    sisa_piutang: 0,
    no_telepon_pemohon: '',
    jenis_kelamin_pemohon: 'Perempuan',
    agama: 'Islam',
    nama_penjamin: '',
    nik_penjamin: '',
    jenis_kelamin_penjamin: 'Laki-laki',
    no_telepon_penjamin: '',
    hubungan: 'Suami',
    doc_ktp_pemohon: '',
    doc_ktp_penjamin: '',
    doc_kk: '',
    status: 'PENDING_SPV'
  });

  const [rejectingBerkasId, setRejectingBerkasId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [isSubmittingBerkas, setIsSubmittingBerkas] = useState(false);

  const handleQueryBerkasSearch = async (query: string) => {
    setBerkasSearchQuery(query);
    if (!query.trim()) {
      setBerkasSearchResults([]);
      setShowBerkasSearchResults(false);
      return;
    }
    setIsSearchingBerkas(true);
    try {
      const res = await fetch(`/api/raw-customers/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setBerkasSearchResults(data.data || []);
          setShowBerkasSearchResults(true);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearchingBerkas(false);
    }
  };

  const handleSelectOldMemberForBerkas = (rc: any) => {
    setBerkasFormData(prev => ({
      ...prev,
      id_kelompok: rc.id || '',
      nama_kelompok: rc.nama_kelompok || '',
      nama_pemohon: rc.nama_pemohon || '',
      nik_pemohon: rc.nik || '',
      tahap_pinjaman: (Number(rc.tahap) || 0) + 1,
      pengajuan_pinjaman: Number(rc.pokok_pinjaman) || 5000000,
      tenor_mg: Number(rc.tempo_mg) || 25,
      sisa_piutang: 0,
      no_telepon_pemohon: rc.no_hp || '',
      nama_penjamin: rc.nama_penjamin || '',
      nik_penjamin: rc.nik_penjamin || '',
      no_telepon_penjamin: rc.no_hp_penjamin || '',
      hubungan: rc.hubungan || 'Suami',
      jenis_kelamin_pemohon: 'Perempuan',
      agama: 'Islam'
    }));
    setShowBerkasSearchResults(false);
    setBerkasSearchQuery('');
    triggerSuccess(`Auto-fill sukses! Memuat data lama ${rc.nama_pemohon}. Tahap pinjaman otomatis naik ke Tahap ${(Number(rc.tahap) || 0) + 1}.`);
  };

  const handleFileUploadBerkas = (e: React.ChangeEvent<HTMLInputElement>, fieldName: 'doc_ktp_pemohon' | 'doc_ktp_penjamin' | 'doc_kk') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBerkasFiles(prev => ({
      ...prev,
      [fieldName]: file
    }));

    setBerkasFormData(prev => ({
      ...prev,
      [fieldName]: file.name
    }));

    triggerSuccess(`Kamera Mobile (Expo): Berhasil memotret berkas ${fieldName.replace('doc_', '').toUpperCase().replaceAll('_', ' ')}: ${file.name}`);
  };

  const handleSubmitBerkasForm = async (e: React.FormEvent, isDraft: boolean = false) => {
    e.preventDefault();
    if (!berkasFormData.nama_pemohon.trim()) {
      triggerError("Nama Pemohon wajib diisi.");
      return;
    }
    if (!berkasFormData.nik_pemohon.trim()) {
      triggerError("NIK Pemohon wajib diisi.");
      return;
    }
    if (!berkasFormData.nama_kelompok.trim()) {
      triggerError("Nama Kelompok wajib diisi.");
      return;
    }

    setIsSubmittingBerkas(true);
    try {
      const currentOfficerId = 'petugas-01';
      const formData = new FormData();

      // Append textual fields
      Object.entries(berkasFormData).forEach(([key, val]) => {
        if (key !== 'doc_ktp_pemohon' && key !== 'doc_ktp_penjamin' && key !== 'doc_kk') {
          formData.append(key, String(val));
        }
      });

      // Override status and officer ID
      formData.append('status', isDraft ? 'DRAFT' : 'PENDING_SPV');
      formData.append('petugas_id', currentOfficerId);

      // Append raw files for standard GCS middleware handling
      if (berkasFiles.doc_ktp_pemohon) {
        formData.append('doc_ktp_pemohon', berkasFiles.doc_ktp_pemohon);
      }
      if (berkasFiles.doc_ktp_penjamin) {
        formData.append('doc_ktp_penjamin', berkasFiles.doc_ktp_penjamin);
      }
      if (berkasFiles.doc_kk) {
        formData.append('doc_kk', berkasFiles.doc_kk);
      }

      const res = await fetch("/api/berkas-masuk", {
        method: "POST",
        // Do NOT set Content-Type header. The browser automatically sets boundary for multipart/form-data.
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal mendaftarkan berkas.");
      }

      triggerSuccess(isDraft ? "Draft formulir berhasil disimpan!" : "Formulir berhasil diajukan ke Supervisor (PENDING_SPV) & diunggah ke Google Cloud Storage!");
      
      setBerkasFormData({
        id_kelompok: '',
        nama_kelompok: '',
        wilayah: 'Wilayah Pusat',
        nama_pemohon: '',
        nik_pemohon: '',
        tahap_pinjaman: 1,
        pengajuan_pinjaman: 5000000,
        tenor_mg: 25,
        sisa_piutang: 0,
        no_telepon_pemohon: '',
        jenis_kelamin_pemohon: 'Perempuan',
        agama: 'Islam',
        nama_penjamin: '',
        nik_penjamin: '',
        jenis_kelamin_penjamin: 'Laki-laki',
        no_telepon_penjamin: '',
        hubungan: 'Suami',
        doc_ktp_pemohon: '',
        doc_ktp_penjamin: '',
        doc_kk: '',
        status: 'PENDING_SPV'
      });

      setBerkasFiles({
        doc_ktp_pemohon: null,
        doc_ktp_penjamin: null,
        doc_kk: null
      });

      fetchState();
    } catch (err: any) {
      triggerError(err.message);
    } finally {
      setIsSubmittingBerkas(false);
    }
  };

  const handleApproveBerkas = async (id: string) => {
    try {
      const res = await fetch(`/api/berkas-masuk/${id}/approve`, {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal memproses persetujuan berkas.");
      }
      triggerSuccess(data.message || "Persetujuan berkas sukses diproses!");
      fetchState();
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  const handleRejectBerkas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingBerkasId) return;
    try {
      const res = await fetch(`/api/berkas-masuk/${rejectingBerkasId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catatan: rejectNotes })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal menolak berkas.");
      }
      triggerSuccess(data.message || "Berkas berhasil ditolak ke status REJECTED.");
      setRejectingBerkasId(null);
      setRejectNotes('');
      fetchState();
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  const handleDeleteBerkas = async (id: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus pengajuan berkas masuk ini?")) return;
    try {
      const res = await fetch(`/api/berkas-masuk/${id}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal menghapus berkas.");
      }
      triggerSuccess(data.message || "Berkas berhasil dihapus dari sistem!");
      fetchState();
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  const [addCustomerFormData, setAddCustomerFormData] = useState({
    nama_kelompok: '',
    tanggal_pencairan: new Date().toISOString().substring(0, 10),
    tanggal_jatuh_tempo: new Date(Date.now() + 70 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
    nama_pemohon: '',
    panggilan: '',
    tanggal_lahir: '1990-01-01',
    alamat: '',
    petani: 'Pertanian',
    no_hp: '',
    jumlah_tanggungan: 1,
    nik: '',
    nama_penjamin: '',
    pekerjaan_penjamin: '',
    hubungan: 'Suami',
    no_hp_penjamin: '',
    tahap: 1,
    pokok_pinjaman: 5000000,
    tempo_mg: 10,
    target: 550000,
    jumlah: 5500000,
    deposito: 250000,
    status: 'AKTIF',
    kantor_cabang: 'PUSAT' as 'PUSAT' | 'KC_MATIM'
  });

  const handleAddManualCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addCustomerFormData.nama_pemohon.trim()) {
      triggerError("Nama Pemohon wajib diisi.");
      return;
    }
    if (!addCustomerFormData.nik.trim()) {
      triggerError("NIK wajib diisi.");
      return;
    }
    if (!addCustomerFormData.nama_kelompok.trim()) {
      triggerError("Nama Kelompok wajib diisi.");
      return;
    }

    try {
      const res = await fetch("/api/raw-customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addCustomerFormData)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal menambahkan data.");
      }

      triggerSuccess(data.message || "Data arsip manual berhasil ditambahkan!");
      setIsAddCustomerModalOpen(false);
      // Reset form
      setAddCustomerFormData({
        nama_kelompok: '',
        tanggal_pencairan: new Date().toISOString().substring(0, 10),
        tanggal_jatuh_tempo: new Date(Date.now() + 70 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
        nama_pemohon: '',
        panggilan: '',
        tanggal_lahir: '1990-01-01',
        alamat: '',
        petani: 'Pertanian',
        no_hp: '',
        jumlah_tanggungan: 1,
        nik: '',
        nama_penjamin: '',
        pekerjaan_penjamin: '',
        hubungan: 'Suami',
        no_hp_penjamin: '',
        tahap: 1,
        pokok_pinjaman: 5000000,
        tempo_mg: 10,
        target: 550000,
        jumlah: 5500000,
        deposito: 250000,
        status: 'AKTIF',
        kantor_cabang: 'PUSAT'
      });
      fetchDbAwalList(dbAwalPage, dbAwalStatus, dbAwalSearch);
      fetchState();
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  const handleModalExcelUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importExcelBranch) {
      triggerError("Gagal: Tujuan Cabang wajib dipilih!");
      return;
    }
    if (!selectedExcelFile) {
      triggerError("Gagal: File Excel (.xlsx/.xls) wajib dipilih!");
      return;
    }

    setIsUploadingExcel(true);
    const formData = new FormData();
    formData.append("file", selectedExcelFile);
    formData.append("kantor_cabang", importExcelBranch);

    try {
      const res = await fetch("/api/raw-customers/import", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal mengimpor file Excel.");
      }
      
      triggerSuccess(data.message || `Arsip Excel sukses diimpor ke Cabang: ${importExcelBranch === "PUSAT" ? "Pusat" : "KC Manggarai Timur"}`);
      setDbAwalBranchTab(importExcelBranch);
      setDbAwalStatus('ALL');
      setDbAwalSearch('');
      setIsImportExcelModalOpen(false);
      setSelectedExcelFile(null);
      setImportExcelBranch('');
      
      fetchDbAwalList(1, 'ALL', '', dbAwalLimit, importExcelBranch);
      fetchState();
    } catch (err: any) {
      triggerError(err.message);
    } finally {
      setIsUploadingExcel(false);
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingExcel(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/raw-customers/import", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal mengimpor file Excel.");
      }
      triggerSuccess(data.message || "Excel sukses diimpor ke sistem!");
      setDbAwalStatus('ALL');
      setDbAwalSearch('');
      fetchDbAwalList(1, 'ALL', '');
      fetchState();
    } catch (err: any) {
      triggerError(err.message);
    } finally {
      setIsUploadingExcel(false);
      // Reset file input value
      e.target.value = '';
    }
  };

  const handleFastTrackDisburse = async (customer: any) => {
    if (isMigratingCustomer) return;
    setIsMigratingCustomer(customer.id);
    try {
      const res = await fetch(`/api/raw-customers/${customer.id}/cairkan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal memproses cairkan cepat.");
      }
      triggerSuccess(data.message || "Fast-track pencairan sukses disimpan!");
      fetchDbAwalList(dbAwalPage, dbAwalStatus, dbAwalSearch);
      fetchState();
    } catch (err: any) {
      triggerError(err.message);
    } finally {
      setIsMigratingCustomer(null);
    }
  };

  const handleRepeatOrder = (customer: any) => {
    // Fill Berkas Masuk form fields
    setNewGroupName(customer.nama_kelompok || '');
    setNewGroupTanggungRenteng(true); // Default to true or customizable
    setSelectedMembers([customer.id]);

    // Go to Berkas tab
    setActiveTab('berkas');

    triggerSuccess(`Form Repeat Order untuk nasabah ${customer.nama_pemohon || customer.name || 'N/A'} dari kelompok ${customer.nama_kelompok} berhasil dimuat di tab Berkas Masuk.`);
  };

  const getAccountBalance = (sysState: SystemState, code: string): number => {
    const coaItem = coa.find(c => c.code === code);
    if (!coaItem) return 0;

    let balance = 0;
    sysState.journalEntryLines.forEach(line => {
      if (line.account_code === code) {
        if (coaItem.normal_balance === 'DR') {
          balance += (line.debit - line.credit);
        } else {
          balance += (line.credit - line.debit);
        }
      }
    });
    return balance;
  };

  // Load state from server
  const fetchState = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error('Gagal mengambil data dari server');
      const data = await res.json();
      setState(data.state);
      setCoa(data.coa);
      setRawCustomers(data.raw_customers_2026);
      setErrorString(null);
    } catch (err: any) {
      setErrorString(err.message || 'Gagal memuat sistem');
    } finally {
      setLoading(false);
    }
  };

  // Load accounting reports
  const fetchReports = async () => {
    try {
      const res = await fetch(`/api/accounting/reports?startDate=${reportStartDate}&endDate=${reportEndDate}`);
      if (res.ok) {
        const data = await res.json();
        setAccountingReports(data);
      }
    } catch (err) {
      console.error('Gagal mengambil laporan akuntansi', err);
    }
  };

  useEffect(() => {
    (window as any).activeRole = activeRole;
  }, [activeRole]);

  useEffect(() => {
    (window as any).activeBranch = activeBranch;
  }, [activeBranch]);

  useEffect(() => {
    if (state?.users) {
      (window as any).stateUsers = state.users;
    }
  }, [state]);

  useEffect(() => {
    fetchState();
  }, [activeRole, activeBranch]);

  // Real-time sync & polling for cashier
  useEffect(() => {
    if (activeTab !== 'setoran' || !state) return;

    // Initialize knownPaymentIds on first load of Setoran tab
    if (knownPaymentIds.size === 0) {
      const initialIds = new Set<string>();
      state.payments.forEach(p => initialIds.add(p.id));
      setKnownPaymentIds(initialIds);
    }

    const interval = setInterval(async () => {
      try {
        const res = await window.fetch('/api/state');
        if (res.ok) {
          const data = await res.json();
          const newState = data.state;
          
          if (newState && newState.payments) {
            // Find if there are any new PENDING_SETORAN payments
            const newPayments = newState.payments.filter((p: any) => 
              p.status === 'PENDING_SETORAN' && !knownPaymentIds.has(p.id)
            );

            if (newPayments.length > 0) {
              const updatedKnownIds = new Set(knownPaymentIds);
              newPayments.forEach((p: any) => {
                updatedKnownIds.add(p.id);
                
                // Construct a neat notification message
                const cust = newState.customers?.find((c: any) => c.id === p.customer_id);
                const grp = newState.groups?.find((g: any) => g.id === cust?.group_id);
                const petugasName = newState.users?.find((u: any) => u.id === p.petugas_id)?.nama || p.petugas_id;
                const groupName = grp?.name || "Koleksi Lapangan";
                const amountStr = p.nominal_bayar.toLocaleString('id-ID');

                const newNotif = {
                  id: `NOTIF-${Date.now()}-${p.id}`,
                  message: `🔔 ${petugasName} baru saja mengirim setoran Kelompok ${groupName} (Rp ${amountStr}).`,
                  timestamp: new Date().toLocaleTimeString('id-ID'),
                  type: 'info' as const
                };

                setCashierNotifications(prev => [newNotif, ...prev].slice(0, 5)); // Keep last 5
              });
              setKnownPaymentIds(updatedKnownIds);
              
              // Automatically update state for real-time vibe
              setState(newState);
            }
          }
        }
      } catch (err) {
        console.error("Gagal melakukan sinkronisasi otomatis kasir:", err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [activeTab, state, knownPaymentIds]);

  useEffect(() => {
    if (state) {
      fetchReports();
    }
  }, [state, reportStartDate, reportEndDate]);

  useEffect(() => {
    if (state?.groups && state.groups.length > 0 && !selectedSurveyGroupId) {
      setSelectedSurveyGroupId(state.groups[0].id);
    }
  }, [state?.groups, selectedSurveyGroupId]);

  // Load offline queue from localStorage on mount
  useEffect(() => {
    const savedQueue = localStorage.getItem('offline_payment_queue');
    if (savedQueue) {
      try {
        setOfflineQueue(JSON.parse(savedQueue));
      } catch (e) {
        console.error("Failed to parse offline payment queue", e);
      }
    }
  }, []);

  // Save offline queue whenever it changes
  useEffect(() => {
    if (offlineQueue) {
      localStorage.setItem('offline_payment_queue', JSON.stringify(offlineQueue));
    } else {
      localStorage.removeItem('offline_payment_queue');
    }
  }, [offlineQueue]);

  // Handle errors & success auto-dismissal
  const triggerSuccess = (msg: string) => {
    setSuccessString(msg);
    setTimeout(() => setSuccessString(null), 5000);
  };

  const triggerError = (msg: string) => {
    setErrorString(msg);
    setTimeout(() => setErrorString(null), 6000);
  };

  // Reset system db
  const resetDatabase = async () => {
    if (!confirm('Apakah Anda yakin ingin me-reset seluruh database ke setoran awal modal 75 juta rupiah?')) return;
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
        triggerSuccess('Database berhasil di-reset ke kondisi seeder wajib SAK!');
      }
    } catch (err) {
      triggerError('Gagal me-reset database.');
    }
  };

  // Action: Submit Group + Members (Berkas Masuk)
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) {
      triggerError('Nama Kelompok tidak boleh kosong.');
      return;
    }
    if (selectedMembers.length === 0) {
      triggerError('Pilih minimal 1 orang nasabah anggota kelompok.');
      return;
    }

    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName,
          sistem_tanggung_renteng: newGroupTanggungRenteng,
          member_ids: selectedMembers
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membuat berkas kelompok');
      
      setState(data.state);
      setNewGroupName('');
      setSelectedMembers([]);
      triggerSuccess(`Kelompok "${data.group.name}" berhasil didaftarkan. Alur dialihkan ke PENDING_SPV!`);
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  // Action: State Machine transitions
  const advanceWorkflow = async (customerId: string, targetStatus: string) => {
    try {
      const res = await fetch('/api/workflow/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, targetStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setState(data.state);
      triggerSuccess(`Nasabah ${data.customer.name} berhasil diperbarui statusnya menjadi ${targetStatus}`);
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  // Action: Group Survey Submit (Quantitative & Auto-Scoring with Media Support)
  const handleQuantitativeGroupSurveySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSurveyGroupId) {
      triggerError('Silakan pilih salah satu kelompok yang siap disurvei.');
      return;
    }

    setIsSubmittingGroupSurvey(true);
    try {
      const formData = new FormData();
      formData.append('group_id', selectedSurveyGroupId);
      formData.append('wilayah', groupSurveyFields.wilayah);
      formData.append('tanggal_pertemuan', groupSurveyFields.tanggal_pertemuan);
      formData.append('jumlah_anggota', String(groupSurveyFields.jumlah_anggota));
      formData.append('jumlah_pokok_pinjaman_kelompok', String(groupSurveyFields.jumlah_pokok_pinjaman_kelompok));
      formData.append('notes', groupSurveyFields.notes || `Penilaian Kuantitatif Otomatis Lapangan`);
      
      // Enums assessment parameters (Criteria selection)
      formData.append('inisiatif_ketua', groupSurveyFields.inisiatif_ketua);
      formData.append('jarak_domisili', groupSurveyFields.jarak_domisili);
      formData.append('kelengkapan_dokumen_dasar', groupSurveyFields.kelengkapan_dokumen_dasar);
      formData.append('ketepatan_waktu', groupSurveyFields.ketepatan_waktu);
      formData.append('pemahaman_tanggung_renteng', groupSurveyFields.pemahaman_tanggung_renteng);
      formData.append('penentuan_ketua_kelompok', groupSurveyFields.penentuan_ketua_kelompok);
      formData.append('pengaruh_ketua', groupSurveyFields.pengaruh_ketua);
      formData.append('saling_kenal_antar_anggota', groupSurveyFields.saling_kenal_antar_anggota);
      formData.append('tingkat_kehadiran', groupSurveyFields.tingkat_kehadiran);

      if (groupSurveyFotoFile) {
        formData.append('foto_kelompok', groupSurveyFotoFile);
      }

      const res = await fetch('/api/surveys/group', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal memproses hasil survei kelompok.");
      }

      const outcome = data.keputusan_otomatis; // 'LAYAK' | 'TIDAK_LAYAK'
      const totalScore = data.total_skor;

      setState(data.state);

      if (outcome === 'LAYAK') {
        triggerSuccess(`✓ KELOMPOK LAYAK! Skor Penilaian Otomatis: ${totalScore}/27 (>= 18). Layar survei individu terbuka!`);
        // Select tab and group immediately
        setSurveyActiveSubTab('individu');
      } else {
        // TIDAK_LAYAK - Pop-up peringatan merah / modal
        setFailedGroupTotalScore(totalScore);
        setShowFailureGroupModal(true);
        triggerError(`⚠️ TIDAK LAYAK! Skor total kelompok hanya ${totalScore}/27 (< 18). Berkas seluruh anggota otomatis digugurkan.`);
      }

      // Reset file and form notes
      setGroupSurveyFotoFile(null);
      setGroupSurveyFields(prev => ({
        ...prev,
        notes: ''
      }));

      // Pull fresh DB state
      fetchState();
    } catch (err: any) {
      triggerError(err.message);
    } finally {
      setIsSubmittingGroupSurvey(false);
    }
  };

  // Keep compatibility/fallback handler
  const handleGroupSurveySubmit = async (groupId: string, status: 'LAYAK' | 'TIDAK_LAYAK') => {
    try {
      const res = await fetch('/api/surveys/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: groupId,
          status,
          notes: surveyGroupNotes || "Hasil verifikasi survei kelompok lapangan"
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setState(data.state);
      setSurveyGroupNotes('');
      triggerSuccess(`Survei kelompok untuk ${groupId} disetujui ${status}. Survei Individu sekarang terbuka!`);
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  // Action: Individual Survey Submit
  const handleIndividualSurveySubmit = async (customerId: string) => {
    const sState = surveyMemberStates[customerId] || {
      alamat_sesuai: true,
      kondisi_rumah: 'Baik',
      pendapatan_bulanan: 3000000,
      status_kelayakan: 'LAYAK_CAIR',
      notes: 'Lolos uji kualifikasi kelayakan pendapatan mikro'
    };

    try {
      const formData = new FormData();
      formData.append('customer_id', customerId);
      formData.append('alamat_sesuai', String(sState.alamat_sesuai !== false));
      formData.append('kondisi_rumah', sState.kondisi_rumah || 'Baik');
      formData.append('pendapatan_bulanan', String(sState.pendapatan_bulanan ?? 3000000));
      formData.append('notes', sState.notes || '');
      
      formData.append('pendapatan_usaha', String(sState.pendapatan_usaha ?? 3000000));
      formData.append('pengeluaran_rumah_tangga', String(sState.pengeluaran_rumah_tangga ?? 1500000));
      formData.append('tanggungan_koperasi_lain', String(sState.tanggungan_koperasi_lain ?? 0));
      formData.append('nama_koperasi', sState.nama_koperasi || '');
      formData.append('rekomendasi_petugas', sState.rekomendasi_petugas || sState.notes || '');
      formData.append('kordinat_lokasi', sState.kordinat_lokasi || '-6.200000, 106.816666');

      if (sState.foto_jaminan) {
        formData.append('foto_jaminan', sState.foto_jaminan);
      }
      if (sState.foto_anggota) {
        formData.append('foto_anggota', sState.foto_anggota);
      }

      const res = await fetch('/api/surveys/individual', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setState(data.state);
      triggerSuccess(`Survei individu berhasil terekam dengan keputusan otomatis: ${data.status_approval}`);
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  // Action: Spv disbursement
  const handleDisburseLoan = async (customerId: string) => {
    try {
      const res = await fetch('/api/loans/disburse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setState(data.state);
      triggerSuccess(data.message || 'Pencairan dana berhasil dibukukan ke jurnal utama!');
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  const handleSelfieUpload = async (file: File) => {
    if (!file) return;
    setDisburseUploading(true);
    try {
      const formData = new FormData();
      formData.append('foto_selfie_pencairan', file);
      
      const res = await fetch('/api/pencairan/upload-selfie', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengunggah foto');
      
      setDisburseSelfieUrl(data.url);
      triggerSuccess('Foto selfie pencairan berhasil diunggah ke Google Cloud Storage!');
    } catch (err: any) {
      triggerError(err.message || 'Gagal mengunggah foto');
    } finally {
      setDisburseUploading(false);
    }
  };

  const handleCollectiveDisburseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (activeRole !== 'admin' && activeRole !== 'spv' && activeRole !== 'super_admin') {
      triggerError("Gagal: Hanya role Admin dan Supervisor (SPV) yang berhak melakukan eksekusi pencairan kolektif.");
      return;
    }

    if (!disburseGroupId) {
      triggerError("Silakan pilih Kelompok terlebih dahulu.");
      return;
    }

    if (!disbursePetugasPencairanId || !disbursePetugasPenagihanId) {
      triggerError("Silakan tentukan Petugas Pencairan dan Petugas Penagihan.");
      return;
    }

    if (!disburseSopCheck) {
      triggerError("Verifikasi gagal: Anda wajib mencentang persetujuan SOP.");
      return;
    }

    const groupMembers = state?.customers.filter(c => c.group_id === disburseGroupId && c.status === 'LAYAK_CAIR') || [];
    const validMembers = groupMembers.filter(m => !disburseCancelledMembers[m.id]);

    if (validMembers.length === 0) {
      triggerError("Tidak ada anggota valid yang terpilih untuk dicairkan dana (Seluruh anggota dibatalkan/belum layak).");
      return;
    }

    try {
      // Calculate totals
      const totalKotor = validMembers.length * 5000000;
      const totalDeposito = validMembers.length * 250000;
      const totalAdmin = validMembers.length * 50000;
      const totalUP = validMembers.reduce((sum, m) => sum + (m.is_new_member ? 100000 : 0), 0);
      const totalSisaPiutang = validMembers.reduce((sum, m) => {
        const bk = state?.berkasMasuk?.find(b => b.nik_pemohon === m.nik);
        return sum + (bk ? Number(bk.sisa_piutang) : 0);
      }, 0);
      const totalPotongan = totalSisaPiutang + totalUP + totalDeposito + totalAdmin;

      const res = await fetch('/api/loans/collective-disburse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_kelompok: disburseGroupId,
          nama_kelompok: state?.groups.find(g => g.id === disburseGroupId)?.name || "Kelompok",
          petugas_pencairan_id: disbursePetugasPencairanId,
          petugas_penagihan_id: disbursePetugasPenagihanId,
          hari_penagihan: disburseHariPenagihan,
          jumlah_anggota_cair: validMembers.length,
          total_pencairan_kotor: totalKotor,
          potongan_sisa_piutang: totalSisaPiutang,
          potongan_up: totalUP,
          potongan_deposito: totalDeposito,
          potongan_administrasi: totalAdmin,
          total_uang_dikembalikan_ke_kantor: totalPotongan,
          total_uang_kembali_ke_kantor: totalPotongan,
          foto_selfie_pencairan: disburseSelfieUrl,
          status_sosialisasi: disburseSopCheck,
          status_verifikasi: "SESUAI",
          cancelled_customer_ids: Object.keys(disburseCancelledMembers).filter(id => disburseCancelledMembers[id]),
          valid_customer_ids: validMembers.map(m => m.id)
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setState(data.state);
      triggerSuccess(data.message || 'Pencairan Kolektif berhasil diproses secara aman!');
      
      const latestDisb = data.state?.disbursements?.reduce((prev: any, current: any) => {
        return (!prev || current.id > prev.id) ? current : prev;
      }, null);

      if (latestDisb) {
        setLastDisburseId(latestDisb.id);
        setLastDisburseGroupId(latestDisb.id_kelompok);
        setShowDisburseSuccessModal(true);
      }

      // Reset Form States
      setDisburseSopCheck(false);
      setDisburseCancelledMembers({});
      setDisburseSelfieUrl('');
    } catch (err: any) {
      triggerError(err.message || "Gagal melakukan pencairan kolektif.");
    }
  };

  const handleExportBankTransfer = (itemsToExport: any[]) => {
    if (itemsToExport.length === 0) {
      triggerError("Tidak ada data deposito yang dapat diekspor.");
      return;
    }
    
    // Generate standard Cash Management System (CMS) ready CSV file for corporate banking upload
    let csvContent = "\ufeffNo,Rekening_Tujuan,Nama_Penerima,Bank_Tujuan,Nominal_Transfer,Referensi,Tanggal_Transfer\n";
    
    itemsToExport.forEach((item, idx) => {
      // Mock bank account number based on customer NIK/ID or a generated standard corporate format
      const cleanId = (item.customer_id || '').replace(/\D/g, '') || String(idx);
      const mockAccount = `900-${(item.customer_nik || '123456').substring(0, 4)}-${cleanId.substring(Math.max(0, cleanId.length - 6))}`;
      // Distribute a set of major indonesian banks if not saved
      const mockBanks = ["BANK BRI", "BANK MANDIRI", "BANK BNI", "BANK BCA"];
      const mockBank = mockBanks[idx % mockBanks.length];
      
      const row = [
        idx + 1,
        mockAccount,
        `"${(item.customer_name || '').replace(/"/g, '""')}"`,
        mockBank,
        Number(item.nominal || 250000),
        `"RILIS DEPOSITO JAMINAN ${item.id}"`,
        new Date().toISOString().substring(0, 10)
      ].join(",");
      csvContent += row + "\n";
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `CMS_Transfer_Format_Deposito_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerSuccess(`Berhasil mengekspor format transfer massal bank untuk ${itemsToExport.length} data deposito!`);
  };

  const handleReleaseDeposit = async (depId: string) => {
    try {
      const res = await fetch(`/api/deposito/${depId}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal merilis deposito.");
      triggerSuccess(data.message || "Deposito berhasil dirilis!");
      fetchTrackingDep();
    } catch (err: any) {
      triggerError(err.message || "Gagal memproses rilisan deposito.");
    }
  };

  // Offline-first collection generator (Petugas)
  const executeCollection = async (groupId: string, list: any[]) => {
    if (isOffline) {
      // Simulate Offline Database Save in State Offline Queue (append style)
      const existingCollections = offlineQueue?.collections || [];
      const updatedCollections = [...existingCollections];
      
      // Prevent duplicates in queue by removing existing ones with same billing_schedule_id
      list.forEach(item => {
        const dupIdx = updatedCollections.findIndex(c => c.billing_schedule_id === item.billing_schedule_id);
        if (dupIdx !== -1) {
          updatedCollections.splice(dupIdx, 1);
        }
        updatedCollections.push(item);
      });

      const newQueue = {
        collections: updatedCollections,
        group_id: groupId
      };

      setOfflineQueue(newQueue);

      // CRITICAL: Update local frontend in-memory state instantly so the user sees progress and PAID indicator right away!
      if (state) {
        const nextState = JSON.parse(JSON.stringify(state));
        list.forEach(col => {
          const sched = nextState.billingSchedules.find((s: any) => s.id === col.billing_schedule_id);
          
          if (col.is_lari) {
            const cust = nextState.customers.find((c: any) => c.id === col.customer_id);
            if (cust) {
              cust.status = 'MACET_KABUR';
              cust.is_lari = true;
            }
            const loan = nextState.loans.find((l: any) => l.customer_id === col.customer_id && l.status === 'ACTIVE_LOAN');
            if (loan) {
              loan.status = 'MACET_KABUR';
            }
            if (sched) sched.status = 'UNPAID';
          } else if (col.is_menunggak) {
            if (sched) sched.status = 'MENUNGGAK';
          } else {
            if (sched) {
              // Allocate portion of interest (Jasa) and principal (Pokok) locally
              const interestOwed = sched.jasa - sched.bayar_jasa;
              const interestPaid = Math.min(col.nominal_bayar, interestOwed);
              const principalOwed = sched.pokok - sched.bayar_pokok;
              const principalPaid = Math.min(col.nominal_bayar - interestPaid, principalOwed);

              sched.bayar_jasa += interestPaid;
              sched.bayar_pokok += principalPaid;
              
              const totalPaidSoFar = sched.bayar_pokok + sched.bayar_jasa;
              if (totalPaidSoFar >= sched.total_tagihan) {
                sched.status = 'PAID';
              } else if (totalPaidSoFar > 0) {
                sched.status = 'PARTIAL';
              }
            }
          }

          // Also record a payment record with status PENDING_SETORAN
          nextState.payments.push({
            id: `PAY-OFFLINE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            billing_schedule_id: col.billing_schedule_id,
            customer_id: col.customer_id,
            petugas_id: "Petugas Lapangan (Offline)",
            nominal_bayar: col.nominal_bayar,
            tanggal_bayar: new Date().toISOString(),
            status: 'PENDING_SETORAN',
            is_offline_logged: true,
            payment_method: col.payment_method || 'TUNAI',
            is_menunggak: !!col.is_menunggak,
            is_lari: !!col.is_lari
          });
        });
        setState(nextState);
      }

      setPaymentInputs({});
      setSurplusAllocation({});
      setMarkedAbserMenunggak({});
      setMarkedLari({});
      try {
        localStorage.removeItem('field_collection_payment_inputs');
        localStorage.removeItem('field_collection_payment_methods');
        localStorage.removeItem('field_collection_absen');
        localStorage.removeItem('field_collection_lari');
      } catch (e) {
        console.error('Error removing local draft keys:', e);
      }
      triggerSuccess('Setoran disimpan di STORAGE LOKAL (Offline Mode) & UI Berhasil diperbarui!');
    } else {
      // Direct Online sync
      try {
        const res = await fetch('/api/payments/collect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            collections: list,
            group_id: groupId,
            is_offline: false
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        setState(data.state);
        setPaymentInputs({});
        setSurplusAllocation({});
        setMarkedAbserMenunggak({});
        setMarkedLari({});
        try {
          localStorage.removeItem('field_collection_payment_inputs');
          localStorage.removeItem('field_collection_payment_methods');
          localStorage.removeItem('field_collection_absen');
          localStorage.removeItem('field_collection_lari');
        } catch (e) {
          console.error('Error removing local draft keys:', e);
        }
        triggerSuccess(`Berhasil menyetor ${list.length} pembayaran angsuran ke kasir! Status: PENDING_SETORAN.`);
      } catch (err: any) {
        triggerError(err.message || 'Gagal memproses setoran online.');
      }
    }
  };

  const handleSaveDraft = (groupId: string, activeMembers: Customer[]) => {
    try {
      localStorage.setItem('field_collection_payment_inputs', JSON.stringify(paymentInputs));
      localStorage.setItem('field_collection_payment_methods', JSON.stringify(paymentMethods));
      localStorage.setItem('field_collection_absen', JSON.stringify(markedAbserMenunggak));
      localStorage.setItem('field_collection_lari', JSON.stringify(markedLari));
      triggerSuccess("Draft berhasil disimpan lokal. Data Anda aman meskipun aplikasi tertutup.");
    } catch (err) {
      console.error('Failed to save draft to localStorage:', err);
      triggerError("Gagal menyimpan draft secara lokal.");
    }
  };

  const handleCollectSinglePayment = async (groupId: string, member: Customer, bill: BillingSchedule, options?: { is_menunggak?: boolean; is_lari?: boolean; payment_method?: 'TUNAI' | 'TRANSFER' }) => {
    const customPayment = options?.is_menunggak || options?.is_lari ? 0 : (paymentInputs[bill.id] !== undefined ? paymentInputs[bill.id] : bill.total_tagihan);
    const list = [{
      billing_schedule_id: bill.id,
      customer_id: member.id,
      customer_name: member.name,
      nominal_bayar: Number(customPayment),
      is_menunggak: !!options?.is_menunggak,
      is_lari: !!options?.is_lari,
      payment_method: options?.payment_method || paymentMethods[bill.id] || 'TUNAI'
    }];
    await executeCollection(groupId, list);
  };

  const handleCollectPayments = async (groupId: string, members: Customer[]) => {
    const list: any[] = [];
    
    // Check if system_tanggung_renteng is true
    const group = state?.groups.find(g => g.id === groupId);
    const isTR = group?.sistem_tanggung_renteng;

    // Filter out members with MACET_KABUR (permanently runaway)
    const activeMembers = members.filter(m => m.status !== 'MACET_KABUR');

    // 1. If TR, we validate the total target is exactly gathered across active group members
    if (isTR) {
      const activeGroupBills = state?.billingSchedules.filter(b => b.status !== 'PAID' && activeMembers.some(m => m.id === b.customer_id)) || [];
      const totalExpectedGroup = activeGroupBills.reduce((sum, b) => sum + b.total_tagihan, 0);

      let totalEnteredGroup = 0;
      activeMembers.forEach(member => {
        const bill = activeGroupBills.find(b => b.customer_id === member.id);
        if (bill) {
          const isM = markedAbserMenunggak[bill.id];
          const isL = markedLari[bill.id];
          if (!isM && !isL) {
            const val = paymentInputs[bill.id] !== undefined ? paymentInputs[bill.id] : bill.total_tagihan;
            totalEnteredGroup += Number(val);
          }
        }
      });

      if (totalEnteredGroup !== totalExpectedGroup) {
        const diff = totalExpectedGroup - totalEnteredGroup;
        if (diff > 0) {
          triggerError(`Gagal Submit: Setoran kelompok TR kurang -Rp ${diff.toLocaleString('id-ID')}. Petugas wajib mengalokasikan talangan tanggung renteng (beban dibagi bersama) sehingga total uang terkumpul tepat Rp ${totalExpectedGroup.toLocaleString('id-ID')}!`);
          return;
        } else {
          triggerError(`Gagal Submit: Setoran kelompok TR lebih +Rp ${Math.abs(diff).toLocaleString('id-ID')}. Total terkumpul wajib pas dengan target Rp ${totalExpectedGroup.toLocaleString('id-ID')}!`);
          return;
        }
      }
    }

    activeMembers.forEach(member => {
      const bill = state?.billingSchedules.find(b => b.customer_id === member.id && b.status !== 'PAID');
      if (bill) {
        const isM = markedAbserMenunggak[bill.id];
        const isL = markedLari[bill.id];
        const customPayment = isM || isL ? 0 : (paymentInputs[bill.id] !== undefined ? paymentInputs[bill.id] : bill.total_tagihan);
        const extra = isM || isL ? 0 : (surplusAllocation[bill.id] || 0);

        list.push({
          billing_schedule_id: bill.id,
          customer_id: member.id,
          customer_name: member.name,
          nominal_bayar: Number(customPayment) + Number(extra),
          is_menunggak: !!isM,
          is_lari: !!isL,
          payment_method: paymentMethods[bill.id] || 'TUNAI'
        });
      }
    });

    if (list.length === 0) {
      triggerError('Tidak ada jadwal tagihan aktif yang perlu dikoleksi.');
      return;
    }

    await executeCollection(groupId, list);
  };

  // Sync Offline queue to Server
  const handleOfflineSync = async () => {
    if (!offlineQueue) return;

    try {
      const res = await fetch('/api/payments/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collections: offlineQueue.collections,
          group_id: offlineQueue.group_id,
          is_offline: true
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setState(data.state);
      setOfflineQueue(null);
      setPaymentInputs({});
      setSurplusAllocation({});
      triggerSuccess('SINKRONISASI SUKSES! Data offline tagihan berhasil didepositkan ke server (PENDING_SETORAN).');
    } catch (err: any) {
      triggerError(err.message || 'Sinkronisasi gagal');
    }
  };

  // Action: Kasir Setoran
  const handleCashierVerify = async (paymentIds: string[], action: 'APPROVE' | 'REJECT', memo: string) => {
    try {
      // Find payments being processed before we clear or update state
      const paymentsToVerify = state?.payments.filter(p => paymentIds.includes(p.id)) || [];

      const res = await fetch('/api/cashier/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_ids: paymentIds,
          action,
          memo
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Save receipt data on APPROVE
      if (action === 'APPROVE' && paymentsToVerify.length > 0) {
        const mappedList = paymentsToVerify.map(p => {
          const cust = state?.customers.find(c => c.id === p.customer_id);
          const grp = state?.groups.find(g => g.id === cust?.group_id);
          return {
            id: p.id,
            anggotaName: cust?.name || 'Anggota',
            kelompokName: grp?.name || 'Kelompok',
            nominal: p.nominal_bayar,
            metode: p.payment_method || 'TUNAI'
          };
        });

        const totalAmount = mappedList.reduce((sum, item) => sum + item.nominal, 0);
        const refPetugasId = paymentsToVerify[0]?.petugas_id || 'Petugas';
        const refPetugasName = state?.users.find(u => u.id === refPetugasId)?.nama || refPetugasId;

        setReceiptData({
          noTransaksi: `TX-KASIR-${Date.now()}`,
          petugasName: refPetugasName,
          petugasId: refPetugasId,
          timestamp: new Date().toLocaleString('id-ID'),
          payments: mappedList,
          totalAmount: totalAmount
        });
        
        setReceiptModalOpen(true);
      }

      setState(data.state);
      triggerSuccess(`Berhasil memproses setoran dengan aksi ${action}!`);
      
      // Clean selected item checkmarks
      const cleanSelected = { ...cashierSelectedPaymentIds };
      paymentIds.forEach(id => {
        delete cleanSelected[id];
      });
      setCashierSelectedPaymentIds(cleanSelected);

    } catch (err: any) {
      triggerError(err.message);
    }
  };

  // Action: Correction / Revisi Nominal Setoran directly by Kasir
  const handleUpdatePaymentValue = async (paymentId: string, nominal: number, method: 'TUNAI' | 'TRANSFER') => {
    setIsUpdatingPayment(true);
    try {
      const res = await fetch('/api/cashier/update-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: paymentId,
          nominal_bayar: nominal,
          payment_method: method
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setState(data.state);
      setCashierRevisingPayId(null);
      triggerSuccess(data.message);
    } catch (err: any) {
      triggerError(err.message || 'Gagal mengupdate nominal setoran');
    } finally {
      setIsUpdatingPayment(false);
    }
  };

  // Fast calculations
  const calculateBalance = (code: string): number => {
    if (!state) return 0;
    return getAccountBalance(state, code);
  };

  const cashierPendingPayments = state?.payments.filter(p => p.status === 'PENDING_SETORAN') || [];
  
  // Group payments by petugas_id map
  const petugasMap: { [petugasId: string]: typeof cashierPendingPayments } = {};
  cashierPendingPayments.forEach(p => {
    if (!petugasMap[p.petugas_id]) {
      petugasMap[p.petugas_id] = [];
    }
    petugasMap[p.petugas_id].push(p);
  });

  // Toggles for cashier grid selection
  const toggleSelectPayment = (payId: string) => {
    setCashierSelectedPaymentIds(prev => ({
      ...prev,
      [payId]: !prev[payId]
    }));
  };

  const toggleSelectGroup = (payments: any[]) => {
    const allSelected = payments.every(p => cashierSelectedPaymentIds[p.id]);
    const next = { ...cashierSelectedPaymentIds };
    payments.forEach(p => {
      if (allSelected) {
        delete next[p.id];
      } else {
        next[p.id] = true;
      }
    });
    setCashierSelectedPaymentIds(next);
  };

  const toggleSelectPetugas = (payments: any[]) => {
    const allSelected = payments.every(p => cashierSelectedPaymentIds[p.id]);
    const next = { ...cashierSelectedPaymentIds };
    payments.forEach(p => {
      if (allSelected) {
        delete next[p.id];
      } else {
        next[p.id] = true;
      }
    });
    setCashierSelectedPaymentIds(next);
  };

  // Receipt printing helper (Continuous 80mm format for direct cashier validation feedback)
  const handlePrintReceipt = () => {
    if (!receiptData) {
      triggerError("Data kwitansi harian kosong.");
      return;
    }
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, 160] // Continuous roll dimensions
      });

      // Simple elegant typography pairing matching SEKAWAN MIKRO thermal expectations
      doc.setFont("courier", "bold");
      doc.setFontSize(10);
      doc.text("SSJB SEKAWAN SISTEM", 40, 8, { align: "center" });
      doc.setFont("courier", "normal");
      doc.setFontSize(8);
      doc.text("KWITANSI SETORAN HARIAN (KASIR)", 40, 12, { align: "center" });
      doc.text("---------------------------------", 40, 15, { align: "center" });

      doc.text(`Ref No  : ${receiptData.noTransaksi}`, 5, 20);
      doc.text(`Waktu   : ${receiptData.timestamp}`, 5, 24);
      doc.text(`Kolektor: ${receiptData.petugasName.substring(0, 18)}`, 5, 28);
      doc.text("---------------------------------", 40, 32, { align: "center" });

      let currentY = 37;
      doc.setFont("courier", "bold");
      doc.text("DETAIL TERIMA DANA:", 5, currentY);
      doc.setFont("courier", "normal");
      
      receiptData.payments.forEach((p, idx) => {
        currentY += 4.5;
        if (currentY > 145) {
          doc.addPage();
          currentY = 10;
        }
        const textRow = `${idx + 1}. [${p.kelompokName.substring(0, 8)}] ${p.anggotaName.substring(0, 10)}`;
        const amtRow = `Rp ${p.nominal.toLocaleString('id-ID')}`;
        doc.text(textRow, 5, currentY);
        doc.text(amtRow, 52, currentY);
      });

      currentY += 6;
      doc.text("---------------------------------", 40, currentY, { align: "center" });
      currentY += 4.5;
      doc.setFont("courier", "bold");
      doc.text(`TOTAL TERIMA KAS: Rp ${receiptData.totalAmount.toLocaleString('id-ID')}`, 5, currentY);

      currentY += 10;
      doc.setFont("courier", "normal");
      doc.text("Status: VALID & BUKU JURNAL OK", 40, currentY, { align: "center" });
      currentY += 4;
      doc.text("KASIR SSJB SEKAWAN", 40, currentY, { align: "center" });

      doc.save(`kwitansi_setoran_${receiptData.noTransaksi}.pdf`);
      triggerSuccess("Kwitansi PDF sukses disimpan!");
    } catch (err: any) {
      triggerError("Gagal mencetak PDF: " + err.message);
    }
  };

  const totalRawPendingSPV = state?.customers.filter(c => c.status === 'PENDING_SPV').length || 0;
  const totalPendingADM = state?.customers.filter(c => c.status === 'PENDING_ADM').length || 0;
  const totalApprovedSurvey = state?.customers.filter(c => c.status === 'APPROVED_FOR_SURVEY').length || 0;
  const totalLayakCair = state?.customers.filter(c => c.status === 'LAYAK_CAIR').length || 0;

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#333333] font-sans flex flex-col selection:bg-blue-100 selection:text-blue-900" id="app_root">
      
      {/* Top Banner Control Panel for Role Customisation and Seed Management */}
      <header className="bg-[#0F172A] text-white py-4 px-6 shadow-md border-b-4 border-[#3B82F6] shrink-0" id="header_section">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4" id="header_container">
          <div className="flex items-center gap-3" id="header_text_group">
            <div className="bg-[#3B82F6] rounded-xl p-2.5 text-white shadow-md shadow-blue-500/10" id="header_icon_circle">
              <Building size={22} className="animate-pulse" />
            </div>
            <div className="flex flex-col select-none" id="ssjb_text_info_micro">
              <span className="font-black font-display text-xl tracking-tight uppercase leading-none text-white">
                SSJB SEKAWAN SISTEM
              </span>
              <span className="font-mono text-[9px] font-bold tracking-widest text-[#38BDF8] uppercase leading-none mt-1.5">
                LOS & ERP System
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3" id="database_controls">
            {activeRole === 'super_admin' ? (
              <div className="flex items-center gap-2" id="branch_switcher_wrapper">
                <span className="text-[10px] text-slate-300 font-bold uppercase font-mono tracking-wide">Workspace:</span>
                <select
                  id="workspace_branch_selector"
                  value={activeBranch}
                  onChange={(e) => setActiveBranch(e.target.value as any)}
                  className="bg-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 rounded border border-slate-800 focus:outline-none focus:border-[#3B82F6] transition cursor-pointer"
                >
                  <option value="ALL">🔍 [Semua Cabang]</option>
                  <option value="PUSAT">🏢 Pusat</option>
                  <option value="KC_MATIM">📍 KC MATIM</option>
                </select>
              </div>
            ) : (
              <span 
                id="static_branch_badge"
                className="text-xs font-semibold px-3 py-1.5 bg-slate-900 text-slate-100 rounded border border-slate-800 flex items-center gap-1.5"
              >
                <Building size={12} className="text-[#3B82F6]" />
                <span>Cabang: <span className="text-[#3B82F6] font-mono font-bold">{activeBranch === 'KC_MATIM' ? 'KC MATIM' : 'KANTOR PUSAT'}</span></span>
              </span>
            )}
            <div className="h-5 w-px bg-slate-800" />
            <button 
              id="btn_reset_db"
              onClick={resetDatabase}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/80 hover:bg-red-900 text-red-200 rounded text-xs font-semibold border border-red-900 transition"
              title="Reset data ke setup awal untuk pengujian bersih"
            >
              <RefreshCw size={14} />
              Reset DB
            </button>
            <div className="h-5 w-px bg-slate-800" />
            <div className="text-xs font-mono bg-slate-900 text-stone-200 px-3 py-1.5 rounded border border-slate-800 flex items-center gap-2" id="ledger_balance_pill">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#3B82F6] animate-pulse" />
              Kas Bank: <span className="text-[#38BDF8] font-bold">Rp {state ? getAccountBalance(state, '1112').toLocaleString('id-ID') : '0'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Role Play Console (The Simulator Toolbar) */}
      <section className="bg-slate-800 text-slate-200 py-3 px-6 shadow border-b border-slate-750" id="role_selector_bar">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <UserCheck size={16} className="text-emerald-400" />
              <span>LOGGED USER SIMULATOR (RBAC ENFORCED):</span>
            </div>
            {activeRole !== 'super_admin' && (
              <div className="flex items-center gap-1.5 bg-slate-900/60 px-2.5 py-1 rounded border border-slate-700 hover:border-slate-600 transition" id="simulator_branch_toggle">
                <span>CABANG PETUGAS:</span>
                <select
                  id="simulator_branch_selector"
                  value={activeBranch}
                  onChange={(e) => setActiveBranch(e.target.value as any)}
                  className="bg-transparent text-emerald-400 font-bold border-none focus:outline-none focus:ring-0 text-xs px-1 cursor-pointer"
                >
                  <option value="PUSAT" className="bg-slate-800 text-slate-200">🏢 PUSAT</option>
                  <option value="KC_MATIM" className="bg-slate-800 text-slate-200">📍 KC MATIM</option>
                </select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 lg:flex lg:items-center gap-2" id="role_grid">
            {roles.map(r => (
              <button
                key={r.id}
                id={`role_btn_${r.id}`}
                onClick={() => {
                  setActiveRole(r.id as any);
                  if (r.id === 'super_admin') {
                    setActiveBranch('ALL');
                  } else if (activeBranch === 'ALL') {
                    setActiveBranch('PUSAT');
                  }
                  // Auto redirect appropriate tabs based on role permissions
                  if (r.id === 'petugas') setActiveTab('berkas');
                  if (r.id === 'spv') setActiveTab('berkas');
                  if (r.id === 'admin') setActiveTab('laporan');
                  if (r.id === 'kasir') setActiveTab('setoran');
                  if (r.id === 'super_admin') setActiveTab('manajemen_pengguna');
                }}
                className={`px-3 py-2 rounded text-xs font-medium text-left transition flex items-center gap-2 border ${
                  activeRole === r.id
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow'
                    : 'bg-slate-900/60 hover:bg-slate-900 text-slate-300 border-transparent hover:border-slate-700'
                }`}
              >
                {r.device === 'Mobile' ? <Smartphone size={14} /> : <Monitor size={14} />}
                <div>
                  <div className="font-bold leading-none">{r.name}</div>
                  <span className="text-[10px] opacity-75">{r.device} Access</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Main Alert Banner space */}
      <div className="max-w-7xl mx-auto w-full px-4 pt-4 shrink-0" id="alerts_canvas">
        {successString && (
          <div className="bg-emerald-50 text-emerald-900 border border-emerald-250 p-3 rounded-lg flex items-center gap-2.5 animate-fadeIn" id="success_banner">
            <CheckCircle2 className="text-emerald-600 shrink-0" size={18} />
            <span className="text-xs font-medium">{successString}</span>
          </div>
        )}
        {errorString && (
          <div className="bg-rose-50 text-rose-900 border border-rose-250 p-3 rounded-lg flex items-center gap-2.5 animate-fadeIn" id="error_banner">
            <XCircle className="text-rose-600 shrink-0" size={18} />
            <span className="text-xs font-medium">{errorString}</span>
          </div>
        )}
      </div>

      {/* Unified Working Slate Layout */}
      <main className="grow max-w-7xl w-full mx-auto p-4 flex flex-col lg:flex-row gap-6 min-h-0" id="main_workspace">
        
        {/* Navigation Sidebar based on Role Permitted rules */}
        <aside className="w-full lg:w-64 shrink-0 flex flex-col gap-4" id="sidebar_nav">
          
          {/* Current Role Card Status */}
          <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm border border-slate-800" id="current_role_card">
            <span className="text-[11px] font-mono uppercase text-slate-400 tracking-widest block mb-1">Akun Simulasi</span>
            <div className="font-bold font-display text-lg text-emerald-400 flex items-center gap-2">
              {activeRole === 'petugas' && 'Petugas (Mobile)'}
              {activeRole === 'spv' && 'Supervisor (SPV)'}
              {activeRole === 'admin' && 'Administrator'}
              {activeRole === 'kasir' && 'Kasir Harian'}
            </div>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
              {roles.find(r => r.id === activeRole)?.desc}
            </p>

            {activeRole === 'petugas' && (
              <div className="mt-4 pt-4 border-t border-slate-800" id="offline_toggles">
                <div className="flex items-center justify-between text-xs mb-3">
                  <span className="text-slate-400 font-medium">Koneksi Lapangan:</span>
                  <div className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold flex items-center gap-1 ${
                    isOffline ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  }`}>
                    {isOffline ? <WifiOff size={10} /> : <Wifi size={10} />}
                    {isOffline ? 'OFFLINE' : 'ONLINE'}
                  </div>
                </div>
                <button
                  id="btn_toggle_offline"
                  onClick={() => setIsOffline(!isOffline)}
                  className={`w-full py-2 px-3 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    isOffline 
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                      : 'bg-amber-600 hover:bg-amber-500 text-white'
                  }`}
                >
                  {isOffline ? <Wifi size={14} /> : <WifiOff size={14} />}
                  {isOffline ? 'Beralih ke Online' : 'Aktifkan Mode Offline'}
                </button>

                {offlineQueue && (
                  <div className="mt-3 p-2 bg-amber-950/40 border border-amber-900/50 rounded text-xs text-amber-205" id="offline_sync_widget">
                    <span className="font-bold flex items-center gap-1 text-amber-400">
                      <AlertCircle size={12} />
                      Ada 1 transaksi antrian offline
                    </span>
                    <button
                      id="btn_sync_now"
                      onClick={handleOfflineSync}
                      className="mt-2 w-full py-1 px-2.5 bg-amber-500 text-slate-950 rounded text-[11px] font-bold tracking-wide hover:bg-amber-400 flex items-center justify-center gap-1 transition"
                    >
                      <UploadCloud size={12} />
                      Sinkronkan Sekarang
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Nav List Filtered strictly per rules */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden" id="menu_navigation_list">
            <div className="px-4 py-2.5 bg-[#004494] border-b-2 border-[#00C853] text-white flex items-center justify-between">
              <span className="text-[10.5px] font-bold font-display tracking-wider uppercase text-white">SSJB KOPERASI ERP</span>
              <span className="text-[9px] bg-[#00C853]/20 text-[#00C853] font-mono font-bold px-1.5 rounded border border-[#00C853]/30 uppercase">SSJB AKTIF</span>
            </div>
            <nav className="flex flex-col p-2 gap-1.5" id="nav_scroller">
              
              {/* SECTION: ALUR PROSES KREDIT (LOS) */}
              <div className="px-3 py-1.5 bg-slate-50/80 rounded border-y border-slate-150 my-1 text-[10px] font-bold text-slate-500 tracking-wider font-display uppercase">
                ALUR PROSES KREDIT (LOS)
              </div>

              {/* Menu 1: DATABASE AWAL */}
              <button
                id="tab_btn_database_awal"
                onClick={() => {
                  if (activeRole !== 'admin' && activeRole !== 'super_admin') {
                    triggerError('Akses Menu DATABASE AWAL dibatasi khusus Administrator.');
                    return;
                  }
                  setActiveTab('database_awal');
                }}
                className={`px-3 py-2 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between ${
                  activeRole !== 'admin' && activeRole !== 'super_admin' ? 'opacity-40 cursor-not-allowed' : ''
                } ${
                  activeTab === 'database_awal' 
                    ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white font-bold shadow-sm' 
                    : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Database size={15} className={activeTab === 'database_awal' ? 'text-[#0066CC]' : 'text-slate-400'} />
                  <span>1. DATABASE AWAL</span>
                </span>
                <span className="px-1 py-0.5 bg-slate-100 text-slate-600 text-[8px] font-mono font-bold rounded border border-slate-200">ADM</span>
              </button>

              {/* Menu 2: BERKAS MASUK */}
              <button
                id="tab_btn_berkas"
                onClick={() => {
                  if (activeRole !== 'petugas' && activeRole !== 'spv' && activeRole !== 'admin' && activeRole !== 'super_admin') {
                    triggerError('Akses Menu BERKAS MASUK khusus untuk Petugas, SPV, dan Admin.');
                    return;
                  }
                  setActiveTab('berkas');
                }}
                className={`px-3 py-2 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between ${
                  activeRole !== 'petugas' && activeRole !== 'spv' && activeRole !== 'admin' && activeRole !== 'super_admin' ? 'opacity-40 cursor-not-allowed' : ''
                } ${
                  activeTab === 'berkas' 
                    ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white font-bold shadow-sm' 
                    : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <FolderOpen size={15} className={activeTab === 'berkas' ? 'text-[#0066CC]' : 'text-slate-400'} />
                  <span>2. BERKAS MASUK</span>
                </span>
                {totalRawPendingSPV > 0 && (
                  <span className="px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-mono font-bold rounded-full">
                    {totalRawPendingSPV}
                  </span>
                )}
              </button>

              {/* Menu 3: SURVEI */}
              <button
                id="tab_btn_survei"
                onClick={() => {
                  if (activeRole !== 'petugas' && activeRole !== 'super_admin') {
                    triggerError('Akses Menu SURVEI dibatasi khusus Petugas Lapangan.');
                    return;
                  }
                  setActiveTab('survei');
                }}
                className={`px-3 py-2 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between ${
                  activeRole !== 'petugas' && activeRole !== 'super_admin' ? 'opacity-40 cursor-not-allowed' : ''
                } ${
                  activeTab === 'survei' 
                    ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white font-bold shadow-sm' 
                    : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <ClipboardCheck size={15} className={activeTab === 'survei' ? 'text-[#0066CC]' : 'text-slate-400'} />
                  <span>3. SURVEI</span>
                </span>
                {totalApprovedSurvey > 0 && (
                  <span className="px-1.5 py-0.5 bg-amber-500 text-slate-950 text-[9px] font-mono font-bold rounded-full">
                    {totalApprovedSurvey}
                  </span>
                )}
              </button>

              {/* Menu 4: PENCAIRAN KOLEKTIF */}
              <button
                id="tab_btn_pencairan"
                onClick={() => {
                  if (activeRole !== 'admin' && activeRole !== 'spv' && activeRole !== 'super_admin') {
                    triggerError('Akses Menu PENCAIRAN khusus untuk Administrator dan SPV.');
                    return;
                  }
                  setActiveTab('pencairan');
                }}
                className={`px-3 py-2 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between ${
                  activeRole !== 'admin' && activeRole !== 'spv' && activeRole !== 'super_admin' ? 'opacity-40 cursor-not-allowed' : ''
                } ${
                  activeTab === 'pencairan' 
                    ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white font-bold shadow-sm' 
                    : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Coins size={15} className={activeTab === 'pencairan' ? 'text-[#0066CC]' : 'text-slate-400'} />
                  <span>4. PENCAIRAN KOLEKTIF</span>
                </span>
                {totalLayakCair > 0 && (
                  <span className="px-1.5 py-0.5 bg-emerald-500 text-white text-[9px] font-mono font-bold rounded-full animate-bounce">
                    {totalLayakCair}
                  </span>
                )}
              </button>

              {/* Menu 4B: INFO PENCAIRAN (READ-ONLY) */}
              {(activeRole === 'petugas' || activeRole === 'super_admin') && (
                <button
                  id="tab_btn_info_pencairan"
                  onClick={() => {
                    setActiveTab('info_pencairan');
                  }}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between ${
                    activeTab === 'info_pencairan' 
                      ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white font-bold shadow-sm' 
                      : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Info size={15} className="text-blue-500" />
                    <span>📱 INFO PENCAIRAN</span>
                  </span>
                  <span className="px-1 py-0.5 bg-blue-105 text-blue-800 text-[8px] font-mono font-bold rounded-full border border-blue-200">R/O</span>
                </button>
              )}

              {/* SUB-MENUS FOR TRACKING DEDUCTION */}
              {(((activeRole === 'admin' || activeRole === 'spv' || activeRole === 'super_admin')) && (
                <div className="pl-3 mt-1 space-y-1 border-l border-slate-200 ml-2 py-1 bg-slate-50 rounded-r-md">
                  <div className="px-2 py-0.5 text-[9px] font-mono uppercase font-bold text-slate-400">
                    Pelacakan Potongan
                  </div>
                  
                  <button
                    id="sub_tab_tracking_up"
                    onClick={() => {
                      if (activeRole !== 'admin' && activeRole !== 'spv' && activeRole !== 'super_admin') {
                        triggerError('Akses Menu TRACKING UANG PANGKAL dibatasi khusus Admin dan SPV.');
                        return;
                      }
                      setActiveTab('tracking_up');
                    }}
                    className={`w-full px-2 py-1 rounded text-[11px] font-semibold text-left transition flex items-center justify-between ${
                      activeTab === 'tracking_up'
                        ? 'bg-[#0066CC] border-l-2 border-[#00C853] text-white font-bold shadow-xs'
                        : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                    }`}
                  >
                    <span>↳ UANG PANGKAL (UP)</span>
                  </button>

                  <button
                    id="sub_tab_tracking_deposito"
                    onClick={() => {
                      if (activeRole !== 'admin' && activeRole !== 'spv' && activeRole !== 'super_admin') {
                        triggerError('Akses Menu TRACKING DEPOSITO dibatasi khusus Admin dan SPV.');
                        return;
                      }
                      setActiveTab('tracking_deposito');
                    }}
                    className={`w-full px-2 py-1 rounded text-[11px] font-semibold text-left transition flex items-center justify-between ${
                      activeTab === 'tracking_deposito'
                        ? 'bg-[#0066CC] border-l-2 border-[#00C853] text-white font-bold shadow-xs'
                        : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                    }`}
                  >
                    <span>↳ DEPOSITO (HOLD)</span>
                  </button>

                  <button
                    id="sub_tab_tracking_administrasi"
                    onClick={() => {
                      if (activeRole !== 'admin' && activeRole !== 'spv' && activeRole !== 'super_admin') {
                        triggerError('Akses Menu TRACKING BIAYA ADMINISTRASI dibatasi khusus Admin dan SPV.');
                        return;
                      }
                      setActiveTab('tracking_administrasi');
                    }}
                    className={`w-full px-2 py-1 rounded text-[11px] font-semibold text-left transition flex items-center justify-between ${
                      activeTab === 'tracking_administrasi'
                        ? 'bg-[#0066CC] border-l-2 border-[#00C853] text-white font-bold shadow-xs'
                        : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                    }`}
                  >
                    <span>↳ ADMINISTRASI (FEE)</span>
                  </button>
                </div>
              ))}

              {/* Menu 5: DATABASE AKTIF */}
              <button
                id="tab_btn_database_aktif"
                onClick={() => {
                  if (activeRole !== 'admin' && activeRole !== 'spv' && activeRole !== 'super_admin') {
                    triggerError('Akses Menu DATABASE AKTIF dibatasi khusus Admin dan SPV.');
                    return;
                  }
                  setActiveTab('database_aktif');
                }}
                className={`px-3 py-2 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between ${
                  activeRole !== 'admin' && activeRole !== 'spv' && activeRole !== 'super_admin' ? 'opacity-40 cursor-not-allowed' : ''
                } ${
                  activeTab === 'database_aktif' 
                    ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white font-bold shadow-sm' 
                    : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Layers size={15} className={activeTab === 'database_aktif' ? 'text-[#0066CC]' : 'text-slate-400'} />
                  <span>5. DATABASE AKTIF</span>
                </span>
                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[8px] font-mono font-bold rounded border border-emerald-150">LIVE</span>
              </button>

              {/* MODUL 11: ONBOARDING DATA LEGACY */}
              <button
                id="tab_btn_onboarding_legacy"
                onClick={() => setActiveTab('onboarding_legacy')}
                className={`px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between border ${
                  activeTab === 'onboarding_legacy' 
                    ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white font-bold shadow-sm' 
                    : 'border-slate-100 text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <FileSpreadsheet size={15} className={activeTab === 'onboarding_legacy' ? 'text-[#0066CC]' : 'text-slate-400'} />
                  <span>Onboarding Legacy Excel</span>
                </span>
                <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-[8px] font-mono rounded font-bold border border-indigo-200">
                  BULK CSV
                </span>
              </button>


              {/* ==================== [GROUP 1] PENGELOLAAN TAGIHAN ==================== */}
              <div className="px-3 py-1.5 bg-[#0066CC]/5 rounded-lg my-1 text-[10px] font-bold text-[#0066CC] tracking-wider font-display uppercase border-l-2 border-[#00C853]">
                PENGELOLAAN TAGIHAN
              </div>

              {/* Peta Wilayah Operasional */}
              <button
                id="tab_btn_manajemen_penagihan"
                onClick={() => {
                  if (activeRole !== 'admin' && activeRole !== 'super_admin') {
                    triggerError('Akses Peta Wilayah Operasional dibatasi khusus Administrator.');
                    return;
                  }
                  setActiveTab('manajemen_penagihan');
                }}
                className={`px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between ${
                  activeRole !== 'admin' && activeRole !== 'super_admin' ? 'opacity-40 cursor-not-allowed' : ''
                } ${
                  activeTab === 'manajemen_penagihan' 
                    ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white font-bold shadow-sm' 
                    : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <MapPin size={15} className={activeTab === 'manajemen_penagihan' ? 'text-[#0066CC]' : 'text-slate-450'} />
                  <span>Peta Wilayah Operasional</span>
                </span>
                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 text-[8px] font-mono font-bold rounded">ADM</span>
              </button>

              {/* Manajemen Pengguna & Hak Access */}
              <button
                id="tab_btn_manajemen_pengguna"
                onClick={() => {
                  if (activeRole !== 'super_admin') {
                    triggerError('Akses Menu MANAJEMEN PENGGUNA & HAK AKSES dibatasi khusus Super Admin.');
                    return;
                  }
                  setActiveTab('manajemen_pengguna');
                }}
                className={`px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between ${
                  activeRole !== 'super_admin' ? 'opacity-40 cursor-not-allowed' : ''
                } ${
                  activeTab === 'manajemen_pengguna' 
                    ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white font-bold shadow-sm' 
                    : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    <Users size={15} className={activeTab === 'manajemen_pengguna' ? 'text-[#0066CC]' : 'text-purple-600'} />
                    <Settings size={10} className="text-slate-400 -ml-1 text-[8px]" />
                  </div>
                  <span>Manajemen Pengguna & Hak Akses</span>
                </span>
                <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 font-bold text-[8px] font-mono rounded border border-purple-200">SUPER</span>
              </button>


              {/* ==================== [GROUP 2] PETUGAS LAPANGAN DAN KASIR ==================== */}
              <div className="px-3 py-1.5 bg-[#0066CC]/5 rounded-lg my-1 text-[10px] font-bold text-[#0066CC] tracking-wider font-display uppercase border-l-2 border-[#00C853]">
                PETUGAS LAPANGAN DAN KASIR
              </div>

              {/* Penagihan Lapangan */}
              <button
                id="tab_btn_penagihan"
                onClick={() => {
                  if (activeRole !== 'petugas' && activeRole !== 'super_admin') {
                    triggerError('Modul Penagihan Lapangan khusus Petugas Mobile.');
                    return;
                  }
                  setActiveTab('penagihan');
                }}
                className={`px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between ${
                  activeRole !== 'petugas' && activeRole !== 'super_admin' ? 'opacity-40 cursor-not-allowed' : ''
                } ${
                  activeTab === 'penagihan' 
                    ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white font-bold shadow-sm' 
                    : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Smartphone size={15} className={activeTab === 'penagihan' ? 'text-[#0066CC]' : 'text-slate-400'} />
                  <span>Penagihan Lapangan</span>
                </span>
              </button>

              {/* Setoran Harian Kasir */}
              <button
                id="tab_btn_setoran"
                onClick={() => {
                  if (activeRole !== 'kasir' && activeRole !== 'super_admin') {
                    triggerError('Modul Setoran Harian khusus diselesaikan oleh Kasir.');
                    return;
                  }
                  setActiveTab('setoran');
                }}
                className={`px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between ${
                  activeRole !== 'kasir' && activeRole !== 'super_admin' ? 'opacity-40 cursor-not-allowed' : ''
                } ${
                  activeTab === 'setoran' 
                    ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white font-bold shadow-sm' 
                    : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Calculator size={15} className={activeTab === 'setoran' ? 'text-[#0066CC]' : 'text-slate-400'} />
                  <span>Setoran Harian Kasir</span>
                </span>
              </button>

              {/* Rekapan Penerimaan Kas */}
              {(activeRole === 'kasir' || activeRole === 'admin' || activeRole === 'super_admin') && (
                <button
                  id="tab_btn_rekapan_penerimaan_kas"
                  onClick={() => {
                    setActiveTab('penerimaan_kas');
                  }}
                  className={`px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between ${
                    activeTab === 'penerimaan_kas' 
                      ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white font-bold shadow-sm' 
                      : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <FileSpreadsheet size={15} className={activeTab === 'penerimaan_kas' ? 'text-[#0066CC]' : 'text-slate-400'} />
                    <span>Rekapan Penerimaan Kas</span>
                  </span>
                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-750 font-bold border border-emerald-150 text-[8px] font-mono rounded">KASIR</span>
                </button>
              )}

              {/* Keamanan & Auth Mobile */}
              <button
                id="tab_btn_auth_simulator"
                onClick={() => setActiveTab('auth_simulator')}
                className={`px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between border ${
                  activeTab === 'auth_simulator' 
                    ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white shadow-sm font-bold' 
                    : 'border-slate-100 text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Shield size={15} className={activeTab === 'auth_simulator' ? 'text-[#0066CC]' : 'text-slate-400'} />
                  <span>Keamanan & Auth Mobile</span>
                </span>
                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 font-bold border border-blue-150 text-[8px] font-mono rounded">
                  SYNC
                </span>
              </button>

              {/* Pelunasan Talangan (TR) */}
              <button
                id="tab_btn_tanggung_renteng"
                onClick={() => setActiveTab('tanggung_renteng')}
                className={`px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between border ${
                  activeTab === 'tanggung_renteng' 
                    ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white shadow-sm font-bold' 
                    : 'border-slate-100 text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <HandCoins size={15} className={activeTab === 'tanggung_renteng' ? 'text-[#0066CC]' : 'text-slate-400'} />
                  <span>Pelunasan Talangan (TR)</span>
                </span>
                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 font-bold border border-amber-150 text-[8px] font-mono rounded">
                  MOBILE TR
                </span>
              </button>


              {/* ==================== [GROUP 3] AKUNTANSI & KEUANGAN ==================== */}
              <div className="px-3 py-1.5 bg-[#0066CC]/5 rounded-lg my-1 text-[10px] font-bold text-[#0066CC] tracking-wider font-display uppercase border-l-2 border-[#00C853]">
                AKUNTANSI & KEUANGAN
              </div>

              {(activeRole === 'kasir' || activeRole === 'admin' || activeRole === 'super_admin') && (
                <>
                  {/* 1. Buku Kas & Bank */}
                  <button
                    id="tab_btn_accounting_buku_kas"
                    onClick={() => setActiveTab('accounting_buku_kas')}
                    className={`px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between ${
                      activeTab === 'accounting_buku_kas' 
                        ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white font-bold shadow-sm' 
                        : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Landmark size={15} className={activeTab === 'accounting_buku_kas' ? 'text-[#0066CC]' : 'text-slate-400'} />
                      <span>Buku Kas & Bank</span>
                    </span>
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 text-[8px] font-mono font-bold rounded">ACT</span>
                  </button>

                  {/* 2. Piutang Tak Tertagih */}
                  <button
                    id="tab_btn_accounting_piutang_tak_tertagih"
                    onClick={() => setActiveTab('accounting_piutang_tak_tertagih')}
                    className={`px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between ${
                      activeTab === 'accounting_piutang_tak_tertagih' 
                        ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white font-bold shadow-sm' 
                        : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <TrendingDown size={15} className={activeTab === 'accounting_piutang_tak_tertagih' ? 'text-[#0066CC]' : 'text-slate-400'} />
                      <span>Piutang Tak Tertagih</span>
                    </span>
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 text-[8px] font-mono font-bold rounded">ACT</span>
                  </button>

                  {/* 3. General Ledger */}
                  <button
                    id="tab_btn_accounting_general_ledger"
                    onClick={() => setActiveTab('accounting_general_ledger')}
                    className={`px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between ${
                      activeTab === 'accounting_general_ledger' 
                        ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white font-bold shadow-sm' 
                        : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <BookOpen size={15} className={activeTab === 'accounting_general_ledger' ? 'text-[#0066CC]' : 'text-slate-400'} />
                      <span>General Ledger</span>
                    </span>
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 text-[8px] font-mono font-bold rounded">ACT</span>
                  </button>

                  {/* 4. Aset Tetap */}
                  <button
                    id="tab_btn_accounting_aset_tetap"
                    onClick={() => setActiveTab('accounting_aset_tetap')}
                    className={`px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between ${
                      activeTab === 'accounting_aset_tetap' 
                        ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white font-bold shadow-sm' 
                        : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Layers size={15} className={activeTab === 'accounting_aset_tetap' ? 'text-[#0066CC]' : 'text-slate-400'} />
                      <span>Aset Tetap</span>
                    </span>
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 text-[8px] font-mono font-bold rounded">ACT</span>
                  </button>

                  {/* 5. Utang & Modal */}
                  <button
                    id="tab_btn_accounting_utang_modal"
                    onClick={() => setActiveTab('accounting_utang_modal')}
                    className={`px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between ${
                      activeTab === 'accounting_utang_modal' 
                        ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white font-bold shadow-sm' 
                        : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Scale size={15} className={activeTab === 'accounting_utang_modal' ? 'text-[#0066CC]' : 'text-slate-400'} />
                      <span>Utang & Modal</span>
                    </span>
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 text-[8px] font-mono font-bold rounded">ACT</span>
                  </button>

                  {/* 6. Laporan */}
                  <button
                    id="tab_btn_accounting_laporan"
                    onClick={() => setActiveTab('accounting_laporan')}
                    className={`px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between ${
                      activeTab === 'accounting_laporan' 
                        ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white font-bold shadow-sm' 
                        : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <PieChart size={15} className={activeTab === 'accounting_laporan' ? 'text-[#0066CC]' : 'text-slate-400'} />
                      <span>Laporan</span>
                    </span>
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 text-[8px] font-mono font-bold rounded">ACT</span>
                  </button>

                  {/* Extra: Pengeluaran & OPEX */}
                  <button
                    id="tab_btn_operasional_kategori"
                    onClick={() => {
                      setActiveTab('operasional');
                    }}
                    className={`px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition flex items-center justify-between ${
                      activeTab === 'operasional' 
                        ? 'bg-[#0066CC] border-l-4 border-[#00C853] text-white font-bold shadow-sm' 
                        : 'text-slate-600 hover:bg-blue-50/80 hover:text-[#0066CC]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <TrendingDown size={15} className={activeTab === 'operasional' ? 'text-[#0066CC]' : 'text-rose-400'} />
                      <span>Pengeluaran & OPEX</span>
                    </span>
                    <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-250 text-[8px] font-mono font-bold rounded">OPS</span>
                  </button>
                </>
              )}
            </nav>
          </div>

          {/* Quick Ledger COA References Card */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 mt-auto" id="coa_schema_references">
            <span className="text-[10px] font-bold text-slate-450 uppercase tracking-widest font-mono">STANDAR SEEDER COA SAK</span>
            <div className="flex flex-col gap-1.5 mt-2" id="coa_mini_list">
              {coa.map(ac => (
                <div key={ac.code} className="flex justify-between items-center text-[10px]" id={`coa_row_${ac.code}`}>
                  <span className="text-slate-500 font-mono">{ac.code}</span>
                  <span className="font-semibold text-slate-755 truncate max-w-[110px]" title={ac.name}>{ac.name}</span>
                  <span className={`px-1 text-[9px] font-mono rounded ${ac.normal_balance === 'DR' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                    {ac.normal_balance}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Tab Slates (Dynamic Container) */}
        <div className="grow bg-white rounded-2xl p-6 shadow-sm border border-slate-200 overflow-auto flex flex-col" id="content_canvas">
          
          {loading ? (
            <div className="grow flex flex-col justify-center items-center gap-2" id="ui_loader">
              <RefreshCw className="animate-spin text-emerald-500" size={32} />
              <p className="text-sm text-slate-500 font-medium font-mono">Memuat database pembiayaan mikro...</p>
            </div>
          ) : (
            <>
              {/* MODUL 9: KEAMANAN & MOBILE AUTH */}
              {activeTab === 'auth_simulator' && (
                <MobileAuthSimulator 
                  onRefreshParent={fetchState}
                  systemState={state}
                />
              )}

              {/* MODUL 10: PEER-TO-PEER TANGGUNG RENTENG */}
              {activeTab === 'tanggung_renteng' && (
                <SettleTalanganScreen 
                  onRefreshParent={fetchState}
                  systemState={state}
                  activeUser={state && state.users ? (state.users.find(u => u.role === activeRole) || null) : null}
                />
              )}

              {/* MODUL 11: ONBOARDING DATA LEGACY */}
              {activeTab === 'onboarding_legacy' && (
                <OnboardingMigrasiScreen 
                  onRefreshParent={fetchState}
                  systemState={state}
                  activeRole={activeRole}
                />
              )}

              {/* MODUL 12: MANAJEMEN PENGGUNA & HAK AKSES */}
              {activeTab === 'manajemen_pengguna' && (
                <ManajemenPenggunaScreen 
                  systemState={state}
                  onRefreshParent={fetchState}
                  triggerSuccess={triggerSuccess}
                  triggerError={triggerError}
                  activeRole={activeRole}
                  activeBranch={activeBranch}
                  setActiveBranch={setActiveBranch}
                />
              )}

              {/* Menu 1: DATABASE AWAL */}
              {activeTab === 'database_awal' && (
                <div className="space-y-6 animate-fade-in" id="database_awal_view">
                  <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-205">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2.5 py-0.5 bg-slate-100 text-slate-800 text-[10px] font-mono font-bold rounded-full uppercase tracking-wider">
                        Archive Data (2022-2026)
                      </span>
                      <span className="text-slate-400">•</span>
                      <span className="text-xs font-mono text-slate-500">Read-Only Static Reference Table</span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2 font-display">
                      <Database className="text-slate-800" size={22} />
                      1. DATABASE AWAL REFERENCE
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Menampilkan data historis nasabah terdahulu dari database staging 2022-2026. Tabel ini bersifat read-only dan berfungsi eksklusif sebagai basis referensi pencarian validasi saat petugas menginput berkas masuk baru.
                    </p>
                  </div>

                  {/* Branch Navigation Pills (Modern styled) */}
                  <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl w-fit border border-slate-200/60 shadow-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setDbAwalBranchTab('PUSAT');
                        setDbAwalPage(1);
                      }}
                      className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        dbAwalBranchTab === 'PUSAT'
                          ? 'bg-white text-slate-900 shadow-xs border border-slate-200/40'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-white/40'
                      }`}
                    >
                      <span>🏢</span>
                      <span>Pusat</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDbAwalBranchTab('KC_MATIM');
                        setDbAwalPage(1);
                      }}
                      className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        dbAwalBranchTab === 'KC_MATIM'
                          ? 'bg-white text-slate-900 shadow-xs border border-slate-200/40'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-white/40'
                      }`}
                    >
                      <span>📍</span>
                      <span>Kantor Cabang Manggarai Timur (KC MATIM)</span>
                    </button>
                  </div>

                  {/* Table with filtering */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col xl:flex-row justify-between xl:items-center gap-3">
                      <span className="text-[11px] font-mono font-bold text-slate-600 uppercase tracking-widest">
                        Arsip Statis Terdaftar ({dbAwalTotal} Records)
                      </span>
                      
                      <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full xl:w-auto items-stretch sm:items-center">
                        {/* Custom Hidden Input for XLS upload */}
                        <input 
                          type="file"
                          id="excel_file_upload_input"
                          className="hidden"
                          accept=".xlsx, .xls, .csv"
                          onChange={handleExcelUpload}
                        />

                        {/* Top Action Buttons requested */}
                        <button
                          type="button"
                          id="btn_add_database_awal"
                          onClick={() => setIsAddCustomerModalOpen(true)}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                        >
                          <Plus size={14} />
                          Tambah Data
                        </button>

                        <button
                          type="button"
                          id="btn_import_excel_db_awal"
                          disabled={isUploadingExcel}
                          onClick={() => {
                            if (activeRole !== 'super_admin') {
                              setImportExcelBranch(activeBranch);
                            } else {
                              setImportExcelBranch('');
                            }
                            setSelectedExcelFile(null);
                            setIsImportExcelModalOpen(true);
                          }}
                          className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-blue-50/80 disabled:opacity-55 disabled:cursor-not-allowed text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          {isUploadingExcel ? (
                            <RefreshCw size={14} className="animate-spin text-slate-500" />
                          ) : (
                            <UploadCloud size={14} className="text-indigo-600" />
                          )}
                          📥 Impor Excel
                        </button>

                        <div className="border-l border-slate-200 h-6 hidden sm:block mx-1"></div>

                        {/* Status Filter Dropdown */}
                        <select
                          id="filter_status_db_awal"
                          value={dbAwalStatus}
                          onChange={(e) => {
                            setDbAwalStatus(e.target.value);
                            setDbAwalPage(1);
                          }}
                          className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-mono bg-white focus:outline-none focus:border-slate-500 text-slate-700"
                        >
                          <option value="ALL">Semua Status</option>
                          <option value="AKTIF">Aktif</option>
                          <option value="SELESAI">Selesai</option>
                        </select>

                        <div className="relative w-full sm:w-64">
                          <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                          <input
                            type="text"
                            id="search_db_awal"
                            placeholder="Cari Nama/NIK..."
                            value={dbAwalSearch}
                            onChange={(e) => {
                              setDbAwalSearch(e.target.value);
                              setDbAwalPage(1);
                            }}
                            className="w-full pl-9 pr-4 py-1.5 border border-slate-200 rounded-xl text-xs font-mono placeholder:text-slate-400 focus:outline-none focus:border-slate-500 bg-white"
                          />
                        </div>
                      </div>
                    </div>
                            {dbAwalLimit >= 1000 && (
                      <div className="px-5 py-2.5 bg-amber-55/80 border-b border-amber-200 text-[11px] text-amber-800 font-mono flex items-center gap-2 animate-pulse">
                        <span>⚠️</span>
                        <span><strong>Performance Notice:</strong> Rendering {dbAwalLimit} baris/baris sekaligus dapat mematikan performa peramban lama. Mohon tunggu dengan sabar selagi sistem selesai me-render data tabel.</span>
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-600 font-mono">
                        <thead>
                          <tr className="bg-slate-50/70 border-b border-slate-150 uppercase text-[9px] text-slate-500 font-bold tracking-wider">
                            <th className="px-5 py-3">Nama Lengkap</th>
                            <th className="px-5 py-3">Nomor NIK</th>
                            <th className="px-5 py-3">Alamat Domisili</th>
                            <th className="px-5 py-3">Pekerjaan</th>
                            <th className="px-5 py-3 text-center">Prior Status</th>
                            <th className="px-5 py-3 text-center font-bold text-slate-700">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {dbAwalLoading ? (
                            <tr>
                              <td colSpan={6} className="text-center py-12">
                                <div className="flex flex-col items-center justify-center gap-2">
                                  <RefreshCw size={24} className="animate-spin text-blue-600" />
                                  <span className="text-slate-500 font-semibold text-[11px] uppercase tracking-wider">Memuat Data Warehouse ({dbAwalLimit} Baris)...</span>
                                  {dbAwalLimit >= 1000 && <span className="text-slate-400 text-[10px]">Optimisasi Memori Aktif</span>}
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <>
                              {dbAwalList.map((rc, index) => {
                                const displayName = rc.nama_pemohon || rc.name || 'N/A';
                                const displayPekerjaan = rc.petani || rc.pekerjaan || 'Pekerja Mandiri';
                                const displayStatus = rc.status || 'AKTIF';
                                const isSelesai = displayStatus === 'SELESAI';
                                
                                return (
                                  <tr key={rc.id || index} className="hover:bg-blue-50/80/50 transition">
                                    <td className="px-5 py-3.5 text-[13px]">
                                      <button
                                        type="button"
                                        onClick={() => setSelectedDetailCustomer(rc)}
                                        className="font-bold text-blue-600 hover:text-blue-800 hover:underline text-left focus:outline-none transition-colors cursor-pointer"
                                      >
                                        {displayName}
                                      </button>
                                    </td>
                                    <td className="px-5 py-3.5 text-slate-600 font-semibold">{rc.nik}</td>
                                    <td className="px-5 py-3.5 text-slate-500 max-w-xs truncate">{rc.alamat}</td>
                                    <td className="px-5 py-3.5 text-slate-550">{displayPekerjaan}</td>
                                    <td className="px-5 py-3.5 text-center font-mono">
                                      <span className={`py-1 px-2.5 rounded-full font-bold text-[9px] uppercase tracking-wider ${
                                        isSelesai 
                                          ? 'bg-slate-100 text-slate-700 border border-slate-205'
                                          : 'bg-emerald-50 text-emerald-700 border border-emerald-150'
                                      }`}>
                                        {displayStatus}
                                      </span>
                                    </td>
                                    <td className="px-5 py-3.5 text-center font-mono">
                                      {isSelesai ? (
                                        <button
                                          type="button"
                                          onClick={() => handleRepeatOrder(rc)}
                                          className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[10px] uppercase rounded-lg shadow-2xs transition cursor-pointer"
                                        >
                                          Repeat Order
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          disabled={isMigratingCustomer !== null}
                                          onClick={() => handleFastTrackDisburse(rc)}
                                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-[10px] uppercase rounded-lg shadow-2xs transition cursor-pointer inline-flex items-center gap-1 mx-auto"
                                        >
                                          {isMigratingCustomer === rc.id ? (
                                            <RefreshCw size={10} className="animate-spin" />
                                          ) : null}
                                          Cairkan / Migrasi
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                              {dbAwalList.length === 0 && (
                                <tr>
                                  <td colSpan={6} className="text-center py-8 text-slate-400 italic">
                                    {dbAwalTotal === 0 ? (
                                      "Data arsip kosong. Silakan gunakan tombol Impor Excel untuk memasukkan data historis."
                                    ) : (
                                      "Tidak ada data arsip nasabah yang cocok dengan pencarian Anda."
                                    )}
                                  </td>
                                </tr>
                              )}
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
 
                    {/* Pagination & Limits Controls */}
                    {dbAwalTotal > 0 && (
                      <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 font-bold text-[11px] uppercase">Tampilkan:</span>
                          <select
                            id="limit_db_awal"
                            value={dbAwalLimit}
                            onChange={(e) => {
                              const newLimit = parseInt(e.target.value);
                              setDbAwalLimit(newLimit);
                              setDbAwalPage(1);
                              fetchDbAwalList(1, dbAwalStatus, dbAwalSearch, newLimit);
                            }}
                            className="px-2 py-1 border border-slate-200 rounded-lg bg-white text-slate-700 font-bold focus:outline-none focus:border-slate-400 cursor-pointer text-[11px]"
                          >
                            <option value={10}>10 Baris</option>
                            <option value={50}>50 Baris</option>
                            <option value={100}>100 Baris</option>
                            <option value={1000}>1000 Baris</option>
                            <option value={5000}>5000 Baris</option>
                          </select>
                          <span className="text-slate-400">| Dari {dbAwalTotal} data</span>
                        </div>

                        {dbAwalTotalPages > 1 && (
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setDbAwalPage(p => Math.max(1, p - 1))}
                              disabled={dbAwalPage <= 1 || dbAwalLoading}
                              className="px-3 py-1 border border-slate-200 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-50 transition cursor-pointer"
                            >
                              Sebelumnya
                            </button>
                            <span className="text-slate-500">
                              Halaman {dbAwalPage} dari {dbAwalTotalPages}
                            </span>
                            <button
                              onClick={() => setDbAwalPage(p => Math.min(dbAwalTotalPages, p + 1))}
                              disabled={dbAwalPage >= dbAwalTotalPages || dbAwalLoading}
                              className="px-3 py-1 border border-slate-200 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-50 transition cursor-pointer"
                            >
                              Berikutnya
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* IMPORT EXCEL MODAL WITH BRANCH TAGGING (MANDATORY) */}
                  {isImportExcelModalOpen && (
                    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md animate-in fade-in zoom-in duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                          <div>
                            <h3 className="text-sm font-bold text-slate-950 flex items-center gap-2">
                              <UploadCloud className="text-indigo-600" size={18} />
                              Impor Database Excel
                            </h3>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5 uppercase tracking-wider">BATCH UPLOAD & BRANCH SEGMENTATION</p>
                          </div>
                          <button 
                            type="button"
                            onClick={() => setIsImportExcelModalOpen(false)}
                            className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition"
                          >
                            <X size={16} />
                          </button>
                        </div>

                        <form onSubmit={handleModalExcelUpload} className="p-6 space-y-4">
                          {/* Dropdown Cabang Wajib Isi (Mandatory) */}
                          <div className="space-y-1.5">
                            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                              Pilih Tujuan Cabang: <span className="text-rose-500 font-mono text-xs">*</span>
                            </label>
                            <select
                              value={importExcelBranch}
                              onChange={(e) => setImportExcelBranch(e.target.value as any)}
                              className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                              required
                              disabled={activeRole !== 'super_admin'}
                            >
                              <option value="">-- Pilih Kantor Cabang Penerima --</option>
                              <option value="PUSAT">🏢 Pusat</option>
                              <option value="KC_MATIM">📍 Kantor Cabang Manggarai Timur (KC MATIM)</option>
                            </select>
                            <p className="text-[10px] text-slate-400 italic mt-1 font-sans">
                              * Seluruh baris data dalam file Excel ini akan secara otomatis dilabeli dan disekat ke kantor cabang yang dipilih saat dimasukkan.
                            </p>
                          </div>

                          {/* Upload File Zone */}
                          <div className="space-y-1.5">
                            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                              Pilih File Excel: <span className="text-rose-500 font-mono text-xs">*</span>
                            </label>
                            
                            <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-xl p-6 bg-slate-50/50 flex flex-col items-center justify-center text-center cursor-pointer transition relative gap-2">
                              <input 
                                type="file"
                                accept=".xlsx, .xls"
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    setSelectedExcelFile(e.target.files[0]);
                                  }
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                required
                              />
                              <UploadCloud className="text-slate-450" size={32} />
                              <div className="space-y-1">
                                <p className="text-xs font-bold text-slate-700">
                                  {selectedExcelFile ? selectedExcelFile.name : "Klik atau seret file ke sini"}
                                </p>
                                <p className="text-[10px] text-slate-450 font-mono">
                                  {selectedExcelFile ? `${(selectedExcelFile.size / 1024).toFixed(1)} KB` : "Mendukung format .xlsx dan .xls"}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Footer Actions */}
                          <div className="pt-2 flex justify-end gap-2 text-xs font-bold font-sans">
                            <button
                              type="button"
                              onClick={() => {
                                setIsImportExcelModalOpen(false);
                                setSelectedExcelFile(null);
                                setImportExcelBranch('');
                              }}
                              className="px-4 py-2 border border-slate-250 hover:bg-blue-50/80 text-slate-600 rounded-xl transition"
                            >
                              Batal
                            </button>
                            <button
                              type="submit"
                              disabled={isUploadingExcel}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:cursor-not-allowed"
                            >
                              {isUploadingExcel ? (
                                <>
                                  <RefreshCw size={14} className="animate-spin" />
                                  <span>Memproses...</span>
                                </>
                              ) : (
                                <>
                                  <UploadCloud size={14} />
                                  <span>Impor Sekarang</span>
                                </>
                              )}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}

                  {/* INTERACTIVE MANUAL ADD MODAL FORM */}
                  {isAddCustomerModalOpen && (
                    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                          <div>
                            <h3 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
                              <Database className="text-emerald-600" size={18} />
                              Tambah Data Arsip Nasabah Baru
                            </h3>
                            <p className="text-xs text-slate-500">Mendaftarkan data lama / penulisan manual baru ke basis data induk</p>
                          </div>
                          <button 
                            type="button"
                            onClick={() => setIsAddCustomerModalOpen(false)}
                            className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition"
                          >
                            <X size={18} />
                          </button>
                        </div>

                        <form onSubmit={handleAddManualCustomer} className="p-6 space-y-6">
                          {/* Section 1: Identitas Nasabah */}
                          <div>
                            <span className="text-[10px] font-mono font-bold uppercase text-slate-400 tracking-wider block mb-3 border-b pb-1">
                              I. Identitas Pribadi Nasabah
                            </span>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div className="md:col-span-4">
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Kantor Cabang Pemilik Data <span className="text-rose-500">*</span></label>
                                <select 
                                  value={addCustomerFormData.kantor_cabang}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, kantor_cabang: e.target.value as any})}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                  required
                                >
                                  <option value="PUSAT">Pusat</option>
                                  <option value="KC_MATIM">Kantor Cabang Manggarai Timur (KC MATIM)</option>
                                </select>
                              </div>

                              <div className="md:col-span-2">
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Nama Pemohon (Sesuai KTP) <span className="text-rose-500">*</span></label>
                                <input 
                                  type="text"
                                  required
                                  value={addCustomerFormData.nama_pemohon}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, nama_pemohon: e.target.value})}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                  placeholder="Contoh: Rina Herawati"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Panggilan</label>
                                <input 
                                  type="text"
                                  value={addCustomerFormData.panggilan}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, panggilan: e.target.value})}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                  placeholder="Contoh: Rina"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Nomor NIK (16 Digit) <span className="text-rose-500">*</span></label>
                                <input 
                                  type="text"
                                  required
                                  maxLength={16}
                                  value={addCustomerFormData.nik}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, nik: e.target.value.replace(/\D/g, '')})}
                                  className="w-full text-[13px] font-mono px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                  placeholder="320102xxxxxxxx"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Tanggal Lahir <span className="text-rose-500">*</span></label>
                                <input 
                                  type="date"
                                  required
                                  value={addCustomerFormData.tanggal_lahir}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, tanggal_lahir: e.target.value})}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Nomor HP</label>
                                <input 
                                  type="text"
                                  value={addCustomerFormData.no_hp}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, no_hp: e.target.value})}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                  placeholder="081xxxxxxxx"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Sektor Usaha / Pekerjaan <span className="text-rose-500">*</span></label>
                                <input 
                                  type="text"
                                  required
                                  value={addCustomerFormData.petani}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, petani: e.target.value})}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                  placeholder="Pertanian / Pedagang Jamu"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Jumlah Tanggungan</label>
                                <input 
                                  type="number"
                                  min={0}
                                  value={addCustomerFormData.jumlah_tanggungan}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, jumlah_tanggungan: parseInt(e.target.value) || 0})}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                />
                              </div>
                              <div className="md:col-span-4">
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Alamat Lengkap Domisili <span className="text-rose-500">*</span></label>
                                <textarea 
                                  required
                                  rows={2}
                                  value={addCustomerFormData.alamat}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, alamat: e.target.value})}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                  placeholder="Kampung Baru RT 01/01, Bojong Gede"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Section 2: Penjamin */}
                          <div>
                            <span className="text-[10px] font-mono font-bold uppercase text-slate-400 tracking-wider block mb-3 border-b pb-1">
                              II. Informasi Penjamin Nasabah
                            </span>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Nama Penjamin</label>
                                <input 
                                  type="text"
                                  value={addCustomerFormData.nama_penjamin}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, nama_penjamin: e.target.value})}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                  placeholder="Nama Penjamin"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Pekerjaan Penjamin</label>
                                <input 
                                  type="text"
                                  value={addCustomerFormData.pekerjaan_penjamin}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, pekerjaan_penjamin: e.target.value})}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                  placeholder="Buruh Harian Lepas"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Hubungan</label>
                                <select 
                                  value={addCustomerFormData.hubungan}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, hubungan: e.target.value})}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                >
                                  <option value="Suami">Suami</option>
                                  <option value="Istri">Istri</option>
                                  <option value="Orang Tua">Orang Tua</option>
                                  <option value="Anak">Anak</option>
                                  <option value="Saudara">Saudara</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">No HP Penjamin</label>
                                <input 
                                  type="text"
                                  value={addCustomerFormData.no_hp_penjamin}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, no_hp_penjamin: e.target.value})}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                  placeholder="085xxxxxxxx"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Section 3: Kelompok & Status Pinjaman */}
                          <div>
                            <span className="text-[10px] font-mono font-bold uppercase text-slate-400 tracking-wider block mb-3 border-b pb-1">
                              III. Informasi Pembiayaan & Kelompok
                            </span>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Nama Kelompok <span className="text-rose-500">*</span></label>
                                <input 
                                  type="text"
                                  required
                                  value={addCustomerFormData.nama_kelompok}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, nama_kelompok: e.target.value})}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                  placeholder="Kelompok Anggrek"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Tahap Pinjaman Ke-</label>
                                <input 
                                  type="number"
                                  min={1}
                                  value={addCustomerFormData.tahap}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, tahap: parseInt(e.target.value) || 1})}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Tenor Pembiayaan (Minggu) <span className="text-rose-500">*</span></label>
                                <input 
                                  type="number"
                                  required
                                  min={1}
                                  value={addCustomerFormData.tempo_mg}
                                  onChange={e => {
                                    const durationVal = parseInt(e.target.value) || 10;
                                    const calculatedSum = addCustomerFormData.pokok_pinjaman * 1.1;
                                    const computedTarget = Math.round(calculatedSum / durationVal);
                                    setAddCustomerFormData({
                                      ...addCustomerFormData,
                                      tempo_mg: durationVal,
                                      jumlah: calculatedSum,
                                      target: computedTarget
                                    });
                                  }}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Pokok Pinjaman (Rupiah) <span className="text-rose-500">*</span></label>
                                <input 
                                  type="number"
                                  required
                                  min={50000}
                                  step={50000}
                                  value={addCustomerFormData.pokok_pinjaman}
                                  onChange={e => {
                                    const principalVal = parseInt(e.target.value) || 0;
                                    const calculatedSum = principalVal * 1.1;
                                    const computedTarget = Math.round(calculatedSum / addCustomerFormData.tempo_mg);
                                    setAddCustomerFormData({
                                      ...addCustomerFormData,
                                      pokok_pinjaman: principalVal,
                                      jumlah: calculatedSum,
                                      target: computedTarget
                                    });
                                  }}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Deposito / Simpanan Pokok</label>
                                <input 
                                  type="number"
                                  min={0}
                                  value={addCustomerFormData.deposito}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, deposito: parseInt(e.target.value) || 0})}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Total Pengembalian (Jumlah)</label>
                                <input 
                                  type="number"
                                  required
                                  value={addCustomerFormData.jumlah}
                                  onChange={e => {
                                    const sumValue = parseInt(e.target.value) || 0;
                                    const targetWeekly = Math.round(sumValue / addCustomerFormData.tempo_mg);
                                    setAddCustomerFormData({...addCustomerFormData, jumlah: sumValue, target: targetWeekly});
                                  }}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Angsuran per Minggu (Target)</label>
                                <input 
                                  type="number"
                                  required
                                  value={addCustomerFormData.target}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, target: parseInt(e.target.value) || 0})}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Status Reference</label>
                                <select 
                                  value={addCustomerFormData.status}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, status: e.target.value})}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                >
                                  <option value="AKTIF">AKTIF (Dapat Dicairkan / Migrasi Cepat)</option>
                                  <option value="SELESAI">SELESAI (Picu Repeat Order)</option>
                                </select>
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Tanggal Pencairan Dana</label>
                                <input 
                                  type="date"
                                  value={addCustomerFormData.tanggal_pencairan}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, tanggal_pencairan: e.target.value})}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                />
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Tanggal Jatuh Tempo Terakhir</label>
                                <input 
                                  type="date"
                                  value={addCustomerFormData.tanggal_jatuh_tempo}
                                  onChange={e => setAddCustomerFormData({...addCustomerFormData, tanggal_jatuh_tempo: e.target.value})}
                                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="pt-4 border-t flex justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => setIsAddCustomerModalOpen(false)}
                              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition cursor-pointer"
                            >
                              Batalkan
                            </button>
                            <button
                              type="submit"
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition shadow-sm cursor-pointer flex items-center gap-1.5"
                            >
                              <Check size={14} />
                              Simpan Data Arsip
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}

                  {/* DETAIL ARSIP NASABAH MODAL (22 Atribut Excel-DB) */}
                  {selectedDetailCustomer && (
                    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4">
                      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl sticky top-0 z-10">
                          <div>
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-mono font-bold rounded-full uppercase tracking-wider block w-fit mb-1">
                              Informasi Detail Nasabah Staging
                            </span>
                            <h3 className="text-lg font-bold text-slate-900 font-display flex items-center gap-2">
                              <User className="text-blue-600" size={20} />
                              {selectedDetailCustomer.nama_pemohon || selectedDetailCustomer.name || "N/A"}
                            </h3>
                          </div>
                          <button 
                            type="button"
                            onClick={() => setSelectedDetailCustomer(null)}
                            className="bg-white text-slate-400 hover:text-slate-600 p-2 border border-slate-200 hover:border-slate-300 rounded-xl transition cursor-pointer"
                          >
                            <X size={18} />
                          </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-6">
                          {/* Section 1: Info Personal */}
                          <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                            <span className="text-[11px] font-mono font-bold uppercase text-blue-600 tracking-wider block mb-4 border-b border-blue-100 pb-1.5 flex items-center gap-1.5">
                              <span>👤</span> [Info Personal]
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Nama Lengkap</span>
                                <span className="text-slate-800 font-bold block mt-1 text-[13px]">
                                  {selectedDetailCustomer.nama_pemohon || "N/A"}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Panggilan</span>
                                <span className="text-slate-800 block mt-1 font-semibold">
                                  {selectedDetailCustomer.panggilan || "-"}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">NIK Pemohon</span>
                                <span className="text-slate-800 block mt-1 font-semibold">
                                  {selectedDetailCustomer.nik || "-"}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Tanggal Lahir</span>
                                <span className="text-slate-800 block mt-1 font-semibold">
                                  {formatDateIndo(selectedDetailCustomer.tanggal_lahir)}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Sektor Pekerjaan / Tani</span>
                                <span className="text-slate-800 block mt-1 font-semibold">
                                  {selectedDetailCustomer.petani || selectedDetailCustomer.pekerjaan || "-"}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Nomor HP</span>
                                <span className="text-slate-800 block mt-1 font-semibold">
                                  {selectedDetailCustomer.no_hp || "-"}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Jumlah Tanggungan</span>
                                <span className="text-slate-800 block mt-1 font-semibold">
                                  {selectedDetailCustomer.jumlah_tanggungan || 0} Orang
                                </span>
                              </div>
                              <div className="sm:col-span-2 md:col-span-4">
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Alamat Rumah Tinggal</span>
                                <span className="text-slate-700 block mt-1 leading-relaxed text-[11px] bg-white p-2 rounded-lg border border-slate-200">
                                  {selectedDetailCustomer.alamat || "-"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Section 2: Info Pinjaman */}
                          <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                            <span className="text-[11px] font-mono font-bold uppercase text-emerald-600 tracking-wider block mb-4 border-b border-emerald-100 pb-1.5 flex items-center gap-1.5">
                              <span>💰</span> [Info Pinjaman]
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Nama Kelompok</span>
                                <span className="text-emerald-800 font-bold block mt-1 text-[13px]">
                                  {selectedDetailCustomer.nama_kelompok || "-"}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Prior Status</span>
                                <span className="block mt-1">
                                  <span className={`py-0.5 px-2 rounded-full font-bold text-[9px] uppercase tracking-wider inline-block ${
                                    selectedDetailCustomer.status === 'SELESAI'
                                      ? 'bg-slate-100 text-slate-700 border border-slate-205'
                                      : 'bg-emerald-50 text-emerald-700 border border-emerald-150'
                                  }`}>
                                    {selectedDetailCustomer.status || "AKTIF"}
                                  </span>
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Tanggal Pencairan</span>
                                <span className="text-slate-800 block mt-1 font-semibold">
                                  {formatDateIndo(selectedDetailCustomer.tanggal_pencairan)}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Tanggal Jatuh Tempo</span>
                                <span className="text-slate-800 block mt-1 font-semibold">
                                  {formatDateIndo(selectedDetailCustomer.tanggal_jatuh_tempo)}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Pinjaman Tahap-Ke</span>
                                <span className="text-slate-800 block mt-1 font-bold text-[13px]">
                                  Ke-{selectedDetailCustomer.tahap || 1}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Pokok Pinjaman Platfon</span>
                                <span className="text-slate-800 block mt-1 font-bold">
                                  {formatRupiah(selectedDetailCustomer.pokok_pinjaman)}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Tenor Waktu</span>
                                <span className="text-slate-800 block mt-1 font-semibold">
                                  {selectedDetailCustomer.tempo_mg || 0} Minggu
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Deposito Ditahan</span>
                                <span className="text-slate-800 block mt-1 font-bold">
                                  {formatRupiah(selectedDetailCustomer.deposito)}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Kewajiban (Jumlah)</span>
                                <span className="text-indigo-800 block mt-1 font-bold text-[13px]">
                                  {formatRupiah(selectedDetailCustomer.jumlah)}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Angsuran Mingguan (Target)</span>
                                <span className="text-indigo-800 block mt-1 font-bold text-[13px]">
                                  {formatRupiah(selectedDetailCustomer.target)} /mg
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Section 3: Info Penjamin */}
                          <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                            <span className="text-[11px] font-mono font-bold uppercase text-amber-600 tracking-wider block mb-4 border-b border-amber-100 pb-1.5 flex items-center gap-1.5">
                              <span>🛡️</span> [Info Penjamin]
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Nama Penjamin Ka-Keluarga</span>
                                <span className="text-slate-800 font-bold block mt-1 text-[13px]">
                                  {selectedDetailCustomer.nama_penjamin || "-"}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Hubungan Keluarga</span>
                                <span className="text-slate-800 block mt-1 font-semibold">
                                  {selectedDetailCustomer.hubungan || "-"}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Pekerjaan Penjamin</span>
                                <span className="text-slate-800 block mt-1 font-semibold">
                                  {selectedDetailCustomer.pekerjaan_penjamin || "-"}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">No. HP Penjamin</span>
                                <span className="text-slate-800 block mt-1 font-semibold">
                                  {selectedDetailCustomer.no_hp_penjamin || "-"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-slate-100 flex justify-end bg-slate-50 rounded-b-2xl">
                          <button
                            type="button"
                            onClick={() => setSelectedDetailCustomer(null)}
                            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold font-mono transition cursor-pointer shadow-sm hover:shadow-md"
                          >
                            Tutup Detail
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Menu 5: DATABASE AKTIF */}
              {activeTab === 'database_aktif' && (
                <div className="space-y-6 animate-fade-in" id="database_aktif_view">
                  <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-205">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2.5 py-0.5 bg-green-50 text-green-800 border border-green-200 text-[10px] font-mono font-bold rounded-full uppercase tracking-wider">
                        Active Portfolios
                      </span>
                      <span className="text-slate-400">•</span>
                      <span className="text-xs font-mono text-slate-500">Live Lending Monitoring</span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2 font-display">
                      <Layers className="text-green-700" size={22} />
                      5. DATABASE PORTFOLIO AKTIF
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Menampilkan repositori nasabah dengan status pinjaman pembiayaan kelompok aktif (melalui tahap pencairan dana yang disetujui SPV).
                    </p>
                  </div>

                  {/* Active list table */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-3">
                      <span className="text-[11px] font-mono font-bold text-slate-650 uppercase tracking-widest">
                        Nasabah Pembiayaan Aktif ({state?.customers?.filter(c => c.status === 'ACTIVE_LOAN').length || 0} Persons)
                      </span>
                      <div className="relative w-full sm:w-80">
                        <Search className="absolute left-3 top-2.5 text-slate-405" size={14} />
                        <input
                          type="text"
                          id="search_db_aktif"
                          placeholder="Cari berdasarkan nama nasabah..."
                          onChange={(e) => {
                            (window as any).dbAktifQuery = e.target.value;
                            fetchState();
                          }}
                          defaultValue={(window as any).dbAktifQuery || ''}
                          className="w-full pl-9 pr-4 py-1.5 border border-slate-200 rounded-xl text-xs font-mono placeholder:text-slate-400 focus:outline-none focus:border-slate-500 bg-white"
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-600 font-mono">
                        <thead>
                          <tr className="bg-slate-50/70 border-b border-slate-150 uppercase text-[9px] text-slate-500 font-bold tracking-wider">
                            <th className="px-5 py-3">Nama Lengkap</th>
                            <th className="px-5 py-3">No NIK / Alamat</th>
                            <th className="px-5 py-3">Kelompok Kerja</th>
                            <th className="px-5 py-3">Plafon Cair</th>
                            <th className="px-5 py-3">Petugas Lapangan</th>
                            <th className="px-5 py-3 text-right">Loan Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {(state?.customers || [])
                            .filter(cust => cust.status === 'ACTIVE_LOAN')
                            .filter(cust => {
                              const q = ((window as any).dbAktifQuery || '').toLowerCase();
                              if (!q) return true;
                              return cust.name.toLowerCase().includes(q) || cust.nik.toLowerCase().includes(q);
                            })
                            .map(cust => {
                              const linkedLoan = state?.loans?.find(l => l.customer_id === cust.id && l.status === 'ACTIVE_LOAN');
                              const linkedGroup = state?.groups?.find(g => g.id === cust.group_id);
                              const assignedPetugas = state?.users?.find(u => u.id === cust.assigned_user_id);

                              return (
                                <tr key={cust.id} className="hover:bg-blue-50/80/50 transition">
                                  <td className="px-5 py-3.5">
                                    <div className="font-bold text-slate-800 text-[13px]">{cust.name}</div>
                                  </td>
                                  <td className="px-5 py-3.5 text-slate-550 max-w-xs truncate">
                                    <div className="font-semibold">{cust.nik}</div>
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{cust.alamat}</div>
                                  </td>
                                  <td className="px-5 py-3.5 text-slate-600">
                                    <span className="font-bold text-slate-800">{linkedGroup?.name || 'Individual'}</span>
                                    {linkedGroup?.tenor && (
                                      <div className="text-[10px] text-zinc-400">Tenor: {linkedGroup?.tenor} Minggu</div>
                                    )}
                                  </td>
                                  <td className="px-5 py-3.5 font-bold text-emerald-700">
                                    Rp {(linkedLoan?.plafon || 5000000).toLocaleString('id-ID')}
                                  </td>
                                  <td className="px-5 py-3.5">
                                    {assignedPetugas ? (
                                      <span className="text-indigo-800 font-bold bg-indigo-50 border border-indigo-150 px-2 py-0.5 rounded-full text-[10px]">
                                        {assignedPetugas.nama}
                                      </span>
                                    ) : (
                                      <span className="text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full text-[10px] italic">
                                        unassigned
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-5 py-3.5 text-right">
                                    <span className="bg-green-100 text-green-800 py-1 px-2.5 rounded-full font-bold text-[10px] uppercase tracking-wide">
                                      {cust.status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          {(state?.customers || []).filter(c => c.status === 'ACTIVE_LOAN').length === 0 && (
                            <tr>
                              <td colSpan={6} className="text-center py-8 text-slate-400 italic">
                                Belum ada nasabah berkas cair dengan pinjaman berkelompok aktif saat ini.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Menu 'MANAJEMEN PENAGIHAN' */}
              {activeTab === 'manajemen_penagihan' && (
                <ManajemenPenagihanScreen 
                  onRefreshParent={fetchState}
                  systemState={state}
                  activeRole={activeRole}
                  activeBranch={activeBranch}
                  setActiveBranch={setActiveBranch}
                />
              )}

              {/* RE-ROUTED: REKAPAN PENERIMAAN KAS */}
              {activeTab === 'penerimaan_kas' && (
                <RekapanAngsuranHarianScreen
                  onRefreshParent={fetchState}
                  activeUser={state && state.users ? (state.users.find(u => u.role === activeRole) || null) : null}
                />
              )}

              {/* OPERASIONAL & OPEX SCREEN */}
              {activeTab === 'operasional' && (
                <OperasionalScreen
                  onRefreshParent={fetchState}
                  activeUser={state && state.users ? (state.users.find(u => u.role === activeRole) || null) : null}
                  forcedSubTab="OPEX"
                />
              )}

              {/* ACCOUNTING STACKED PAGES RENDERING */}
              {activeTab === 'accounting_buku_kas' && (
                <OperasionalScreen
                  onRefreshParent={fetchState}
                  activeUser={state && state.users ? (state.users.find(u => u.role === activeRole) || null) : null}
                  forcedSubTab="RECONCILIATION"
                />
              )}

              {activeTab === 'accounting_piutang_tak_tertagih' && (
                <AccountingScreen
                  onRefreshParent={fetchState}
                  activeUser={state && state.users ? (state.users.find(u => u.role === activeRole) || null) : null}
                  forcedSubTab="BADDEBT"
                />
              )}

              {activeTab === 'accounting_general_ledger' && (
                <AccountingScreen
                  onRefreshParent={fetchState}
                  activeUser={state && state.users ? (state.users.find(u => u.role === activeRole) || null) : null}
                  forcedSubTab="LEDGER"
                />
              )}

              {activeTab === 'accounting_aset_tetap' && (
                <AccountingScreen
                  onRefreshParent={fetchState}
                  activeUser={state && state.users ? (state.users.find(u => u.role === activeRole) || null) : null}
                  forcedSubTab="ASSETS"
                />
              )}

              {activeTab === 'accounting_utang_modal' && (
                <AccountingScreen
                  onRefreshParent={fetchState}
                  activeUser={state && state.users ? (state.users.find(u => u.role === activeRole) || null) : null}
                  forcedSubTab="FUNDING"
                />
              )}

              {activeTab === 'accounting_laporan' && (
                <AccountingScreen
                  onRefreshParent={fetchState}
                  activeUser={state && state.users ? (state.users.find(u => u.role === activeRole) || null) : null}
                  forcedSubTab="REPORTS"
                />
              )}

              {/* MENU 1: BERKAS MASUK */}
              {activeTab === 'berkas' && (
                <div className="space-y-6" id="berkas_tab_view">
                  {/* Header/Banner */}
                  <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-5 rounded-2xl border border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold font-display flex items-center gap-2">
                        <FolderOpen className="text-indigo-400" size={24} />
                        Modul Berkas Masuk (Loan Applications)
                      </h2>
                      <p className="text-xs text-slate-300 mt-1 max-w-xl">
                        Registrasi formulir pengajuan pembiayaan dari anggota lama (Auto-Fill) atau baru lewat Aplikasi Mobile Petugas, verifikasi dokumen pendukung (KTP & KK), dan kelola persetujuan State Machine berjenjang.
                      </p>
                    </div>
                    
                    {/* Alur flow diagram */}
                    <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 max-w-sm">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                        <span>Workflow State Machine</span>
                        <span className="text-emerald-400 font-mono text-[9px] lowercase">active</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-200">
                        <span className="bg-slate-700 Richmond-Grey px-1.5 py-0.5 rounded text-slate-300 border border-slate-600">INPUT / DRAFT</span>
                        <span>→</span>
                        <span className="bg-amber-950/70 border border-amber-800 px-1.5 py-0.5 rounded text-amber-300">SPV</span>
                        <span>→</span>
                        <span className="bg-indigo-950/70 border border-indigo-800 px-1.5 py-0.5 rounded text-indigo-300">ADM</span>
                        <span>→</span>
                        <span className="bg-emerald-950/70 border border-emerald-800 px-1.5 py-0.5 rounded text-emerald-300">SURVEY</span>
                      </div>
                    </div>
                  </div>

                  {/* Toggle Sub-tab and Role Info */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
                    {/* Toggle Selector */}
                    <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 self-start sm:self-auto">
                      <button
                        onClick={() => setBerkasSubTab('mobile')}
                        className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-md transition duration-150 ${
                          berkasSubTab === 'mobile' 
                            ? 'bg-white text-slate-900 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Smartphone size={14} />
                        📱 Aplikasi Mobile (Simulasi Petugas)
                      </button>
                      <button
                        onClick={() => setBerkasSubTab('web')}
                        className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-md transition duration-150 ${
                          berkasSubTab === 'web' 
                            ? 'bg-white text-slate-900 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Monitor size={14} />
                        🖥️ Web Dashboard (SPV & Admin Approval)
                      </button>
                    </div>

                    {/* Role Control Widget */}
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-150 py-1.5 px-3 rounded-lg">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Role Anda Saat Ini:</span>
                      <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded ${
                        activeRole === 'petugas' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                        activeRole === 'spv' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                        activeRole === 'admin' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {activeRole === 'petugas' ? 'Petugas Lapangan' :
                         activeRole === 'spv' ? 'Supervisor (SPV)' :
                         activeRole === 'admin' ? 'Administrator' :
                         activeRole}
                      </span>
                    </div>
                  </div>

                  {/* SUB-TABCONTENT: MOBILE APPLICATION SIMULATOR */}
                  {berkasSubTab === 'mobile' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                      
                      {/* Left: Beautiful Simulated Phone Container Frame */}
                      <div className="lg:col-span-8 bg-slate-950 p-4 rounded-[40px] border-4 border-slate-850 shadow-2xl relative max-w-2xl mx-auto w-full">
                        {/* Speaker & Camera Grill on Phone Top */}
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-32 h-4 bg-slate-900 rounded-full flex items-center justify-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-slate-800"></div>
                          <div className="w-12 h-1 bg-slate-800 rounded-full"></div>
                        </div>

                        {/* Phone Screen Screen inside frame */}
                        <div className="bg-slate-50 rounded-[32px] overflow-hidden border border-slate-800 text-slate-900 min-h-[700px] flex flex-col pt-4">
                          
                          {/* Inner Mobile Navbar */}
                          <div className="bg-indigo-900 text-white px-5 py-4 flex items-center justify-between border-b border-indigo-950">
                            <div className="flex items-center gap-2">
                              <div className="bg-indigo-800 p-1.5 rounded-lg">
                                <FileText size={16} className="text-white" />
                              </div>
                              <div>
                                <h4 className="text-xs font-extrabold tracking-tight font-display">Aplikasi Lapangan (Expo)</h4>
                                <p className="text-[9px] text-indigo-200">Form Pengajuan Berkas Masuk</p>
                              </div>
                            </div>
                            
                            {/* Connection Indicator */}
                            <div className="flex items-center gap-1 bg-indigo-950/60 px-2 py-0.5 rounded-full text-[9px] font-bold text-emerald-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                              CONNECTED
                            </div>
                          </div>

                          {/* App Content */}
                          <div className="p-4 flex-1 space-y-4 max-h-[640px] overflow-y-auto">
                            
                            {/* 1. AUTO-FILL COMPONENT */}
                            <div className="bg-indigo-50 border border-indigo-150 p-3 rounded-2xl relative">
                              <div className="absolute top-2.5 right-3 text-[9px] font-bold text-indigo-600 bg-white border border-indigo-150 px-1.5 py-0.5 rounded-full">
                                Auto-Fill Database Awal
                              </div>
                              <h5 className="text-[11px] font-bold text-slate-700 uppercase mb-2 flex items-center gap-1">
                                <Search size={12} className="text-indigo-600" />
                                Cari Anggota Lama
                              </h5>
                              <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">
                                Cari berdasarkan NIK/Nama dari data warehouse awal. Memilih nasabah akan otomatis mengisi semua formulir & menaikkan tahap pinjaman <strong>(+1 Tahap)</strong>.
                              </p>

                              {/* Search Bar Input */}
                              <div className="relative">
                                <input
                                  type="text"
                                  value={berkasSearchQuery}
                                  onChange={(e) => handleQueryBerkasSearch(e.target.value)}
                                  placeholder="Ketik NIK atau Nama Nasabah..."
                                  className="w-full text-xs pl-8 pr-3 py-2 border rounded-xl bg-white text-slate-800 border-slate-250 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                                
                                {isSearchingBerkas && (
                                  <div className="absolute right-2.5 top-2">
                                    <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                  </div>
                                )}
                              </div>

                              {/* Search Results Dropdown */}
                              {showBerkasSearchResults && (
                                <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto divide-y divide-slate-100 p-1">
                                  {berkasSearchResults.length === 0 ? (
                                    <div className="p-3 text-center text-xs text-slate-500 italic">Nasabah lama tidak ditemukan.</div>
                                  ) : (
                                    berkasSearchResults.map(rc => (
                                      <button
                                        type="button"
                                        key={rc.id}
                                        onClick={() => handleSelectOldMemberForBerkas(rc)}
                                        className="w-full text-left p-2.5 hover:bg-blue-50/80 rounded-lg transition duration-150 flex flex-col"
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="font-bold text-xs text-slate-800">{rc.nama_pemohon}</span>
                                          <span className="text-[9px] text-indigo-750 font-bold bg-indigo-50 px-1.5 py-0.2 rounded-full">Tahap {rc.tahap}</span>
                                        </div>
                                        <span className="text-[9.5px] text-slate-500 mt-0.5">NIK: {rc.nik}</span>
                                        <span className="text-[9.5px] text-slate-400 mt-0.5 truncate">Kelompok: {rc.nama_kelompok} • Plafon Lama: Rp {(Number(rc.pokok_pinjaman) || 0).toLocaleString('id-ID')}</span>
                                      </button>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>

                            {/* 2. MAIN FORM */}
                            <form onSubmit={(e) => handleSubmitBerkasForm(e, false)} className="space-y-4">
                              
                              {/* Section A: Informasi Kelompok & Wilayah */}
                              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-2.5">
                                <h6 className="text-[10px] font-extrabold text-indigo-750 uppercase tracking-widest border-b pb-1 mb-2">A. Informasi Kelompok</h6>
                                
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Nama Kelompok *</label>
                                    <input
                                      type="text"
                                      value={berkasFormData.nama_kelompok}
                                      onChange={(e) => setBerkasFormData({...berkasFormData, nama_kelompok: e.target.value})}
                                      placeholder="Nama Kelompok..."
                                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-200"
                                      required
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Wilayah Operasional</label>
                                    <input
                                      type="text"
                                      value={berkasFormData.wilayah}
                                      onChange={(e) => setBerkasFormData({...berkasFormData, wilayah: e.target.value})}
                                      placeholder="Wilayah..."
                                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-200"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Section B: Data Diri Pemohon */}
                              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-2.5">
                                <h6 className="text-[10px] font-extrabold text-indigo-750 uppercase tracking-widest border-b pb-1 mb-2">B. Data Diri Pemohon</h6>
                                
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="col-span-2">
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Nama Lengkap Pemohon *</label>
                                    <input
                                      type="text"
                                      value={berkasFormData.nama_pemohon}
                                      onChange={(e) => setBerkasFormData({...berkasFormData, nama_pemohon: e.target.value})}
                                      placeholder="Nama Lengkap..."
                                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-200"
                                      required
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">NIK Pemohon (KTP) *</label>
                                    <input
                                      type="text"
                                      maxLength={16}
                                      value={berkasFormData.nik_pemohon}
                                      onChange={(e) => setBerkasFormData({...berkasFormData, nik_pemohon: e.target.value.replace(/[^0-9]/g, '')})}
                                      placeholder="16 digit NIK..."
                                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-200 font-mono"
                                      required
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">No Telepon Pemohon *</label>
                                    <input
                                      type="text"
                                      value={berkasFormData.no_telepon_pemohon}
                                      onChange={(e) => setBerkasFormData({...berkasFormData, no_telepon_pemohon: e.target.value})}
                                      placeholder="No Handphone..."
                                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-200"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Jenis Kelamin</label>
                                    <select
                                      value={berkasFormData.jenis_kelamin_pemohon}
                                      onChange={(e) => setBerkasFormData({...berkasFormData, jenis_kelamin_pemohon: e.target.value})}
                                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-200"
                                    >
                                      <option value="Perempuan">Perempuan</option>
                                      <option value="Laki-laki">Laki-laki</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Agama</label>
                                    <select
                                      value={berkasFormData.agama}
                                      onChange={(e) => setBerkasFormData({...berkasFormData, agama: e.target.value})}
                                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-200"
                                    >
                                      <option value="Islam">Islam</option>
                                      <option value="Kristen">Kristen</option>
                                      <option value="Katolik">Katolik</option>
                                      <option value="Hindu">Hindu</option>
                                      <option value="Buddha">Buddha</option>
                                      <option value="Konghucu">Konghucu</option>
                                    </select>
                                  </div>
                                </div>
                              </div>

                              {/* Section C: Plafon Pengajuan */}
                              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-2.5">
                                <h6 className="text-[10px] font-extrabold text-indigo-750 uppercase tracking-widest border-b pb-1 mb-2">C. Parameter Pengajuan</h6>
                                
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Tahap Pinjaman Ke- *</label>
                                    <input
                                      type="number"
                                      value={berkasFormData.tahap_pinjaman}
                                      onChange={(e) => setBerkasFormData({...berkasFormData, tahap_pinjaman: Number(e.target.value)})}
                                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-200 font-bold"
                                      required
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Plafon Diajukan (Rp) *</label>
                                    <input
                                      type="number"
                                      value={berkasFormData.pengajuan_pinjaman}
                                      onChange={(e) => setBerkasFormData({...berkasFormData, pengajuan_pinjaman: Number(e.target.value)})}
                                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-200 font-mono text-emerald-700 font-bold"
                                      required
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Tenor Pembiayaan *</label>
                                    <select
                                      value={berkasFormData.tenor_mg}
                                      onChange={(e) => setBerkasFormData({...berkasFormData, tenor_mg: Number(e.target.value)})}
                                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-200 font-bold text-blue-700"
                                      required
                                    >
                                      <option value={25}>25 Minggu</option>
                                      <option value={45}>45 Minggu</option>
                                      <option value={47}>47 Minggu</option>
                                      <option value={50}>50 Minggu</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Sisa Piutang Lama (Rp)</label>
                                    <input
                                      type="number"
                                      value={berkasFormData.sisa_piutang}
                                      onChange={(e) => setBerkasFormData({...berkasFormData, sisa_piutang: Number(e.target.value)})}
                                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-200 text-rose-600 font-mono"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Section D: Data Penjamin */}
                              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-2.5">
                                <h6 className="text-[10px] font-extrabold text-indigo-750 uppercase tracking-widest border-b pb-1 mb-2">D. Data Penjamin</h6>
                                
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="col-span-2">
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Nama Lengkap Penjamin *</label>
                                    <input
                                      type="text"
                                      value={berkasFormData.nama_penjamin}
                                      onChange={(e) => setBerkasFormData({...berkasFormData, nama_penjamin: e.target.value})}
                                      placeholder="Nama Penjamin..."
                                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-200"
                                      required
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">NIK Penjamin *</label>
                                    <input
                                      type="text"
                                      maxLength={16}
                                      value={berkasFormData.nik_penjamin}
                                      onChange={(e) => setBerkasFormData({...berkasFormData, nik_penjamin: e.target.value.replace(/[^0-9]/g, '')})}
                                      placeholder="NIK Penjamin..."
                                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-200 font-mono"
                                      required
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Hubungan</label>
                                    <select
                                      value={berkasFormData.hubungan}
                                      onChange={(e) => setBerkasFormData({...berkasFormData, hubungan: e.target.value})}
                                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-200 font-bold"
                                    >
                                      <option value="Suami">Suami</option>
                                      <option value="Istri">Istri</option>
                                      <option value="Orang Tua">Orang Tua</option>
                                      <option value="Anak">Anak</option>
                                      <option value="Saudara">Saudara</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Jenis Kelamin Penjamin</label>
                                    <select
                                      value={berkasFormData.jenis_kelamin_penjamin}
                                      onChange={(e) => setBerkasFormData({...berkasFormData, jenis_kelamin_penjamin: e.target.value})}
                                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-200"
                                    >
                                      <option value="Laki-laki">Laki-laki</option>
                                      <option value="Perempuan">Perempuan</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">No Telepon Penjamin</label>
                                    <input
                                      type="text"
                                      value={berkasFormData.no_telepon_penjamin}
                                      onChange={(e) => setBerkasFormData({...berkasFormData, no_telepon_penjamin: e.target.value})}
                                      placeholder="No Handphone..."
                                      className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-200"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Section E: Foto Dokumen Multipart */}
                              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-2.5">
                                <h6 className="text-[10px] font-extrabold text-indigo-750 uppercase tracking-widest border-b pb-1 mb-2">E. Unggah Dokumen Pendukung</h6>
                                <p className="text-[9px] text-slate-400 mt-1">Menggunakan simulasi Expo Camera & ImagePicker API. Klik untuk memilih foto berkas asli.</p>
                                
                                <div className="space-y-2.5">
                                  {/* Doc 1 KTP Pemohon */}
                                  <div className="flex items-center justify-between gap-2 p-2 border border-slate-200 rounded-xl bg-slate-50">
                                    <div className="min-w-0 flex-1">
                                      <span className="block text-[10px] font-bold text-slate-700">KTP Pemohon *</span>
                                      {berkasFormData.doc_ktp_pemohon ? (
                                        <a href={berkasFormData.doc_ktp_pemohon} target="_blank" rel="noreferrer" className="text-[9px] text-indigo-600 font-medium underline truncate block">
                                          {berkasFormData.doc_ktp_pemohon}
                                        </a>
                                      ) : (
                                        <span className="text-[8.5px] text-rose-500 italic">Belum ada foto</span>
                                      )}
                                    </div>
                                    <label className="shrink-0 bg-slate-900 hover:bg-slate-800 text-white cursor-pointer py-1 px-2.5 rounded-lg text-[9.5px] font-bold flex items-center gap-1">
                                      <Camera size={11} />
                                      Ambil Foto KTP Pemohon
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => handleFileUploadBerkas(e, 'doc_ktp_pemohon')}
                                      />
                                    </label>
                                  </div>

                                  {/* Doc 2 KTP Penjamin */}
                                  <div className="flex items-center justify-between gap-2 p-2 border border-slate-200 rounded-xl bg-slate-50">
                                    <div className="min-w-0 flex-1">
                                      <span className="block text-[10px] font-bold text-slate-700">KTP Penjamin *</span>
                                      {berkasFormData.doc_ktp_penjamin ? (
                                        <a href={berkasFormData.doc_ktp_penjamin} target="_blank" rel="noreferrer" className="text-[9px] text-indigo-600 font-medium underline truncate block">
                                          {berkasFormData.doc_ktp_penjamin}
                                        </a>
                                      ) : (
                                        <span className="text-[8.5px] text-rose-500 italic">Belum ada foto</span>
                                      )}
                                    </div>
                                    <label className="shrink-0 bg-slate-900 hover:bg-slate-800 text-white cursor-pointer py-1 px-2.5 rounded-lg text-[9.5px] font-bold flex items-center gap-1">
                                      <Camera size={11} />
                                      Ambil Foto KTP Penjamin
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => handleFileUploadBerkas(e, 'doc_ktp_penjamin')}
                                      />
                                    </label>
                                  </div>

                                  {/* Doc 3 KK */}
                                  <div className="flex items-center justify-between gap-2 p-2 border border-slate-200 rounded-xl bg-slate-50">
                                    <div className="min-w-0 flex-1">
                                      <span className="block text-[10px] font-bold text-slate-700">Kartu Keluarga (KK) *</span>
                                      {berkasFormData.doc_kk ? (
                                        <a href={berkasFormData.doc_kk} target="_blank" rel="noreferrer" className="text-[9px] text-indigo-600 font-medium underline truncate block">
                                          {berkasFormData.doc_kk}
                                        </a>
                                      ) : (
                                        <span className="text-[8.5px] text-rose-500 italic">Belum ada foto</span>
                                      )}
                                    </div>
                                    <label className="shrink-0 bg-slate-900 hover:bg-slate-800 text-white cursor-pointer py-1 px-2.5 rounded-lg text-[9.5px] font-bold flex items-center gap-1">
                                      <Camera size={11} />
                                      Ambil Foto KK
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => handleFileUploadBerkas(e, 'doc_kk')}
                                      />
                                    </label>
                                  </div>
                                </div>
                              </div>

                              {/* Form submit actions based on Petugas activeRole */}
                              <div className="bg-slate-100 p-3 rounded-2xl border border-slate-205 flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={(activeRole !== 'petugas' && activeRole !== 'super_admin') || isSubmittingBerkas}
                                  onClick={(e) => handleSubmitBerkasForm(e, true)}
                                  className={`grow py-2 bg-slate-200 text-slate-700 hover:bg-slate-300 font-bold rounded-xl text-[11px] transition ${
                                    activeRole !== 'petugas' && activeRole !== 'super_admin' ? 'opacity-40 cursor-not-allowed' : ''
                                  }`}
                                >
                                  Simpan Draft
                                </button>
                                <button
                                  type="submit"
                                  disabled={(activeRole !== 'petugas' && activeRole !== 'super_admin') || isSubmittingBerkas}
                                  className={`grow py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-[11px] transition flex items-center justify-center gap-1 shadow-sm ${
                                    activeRole !== 'petugas' && activeRole !== 'super_admin' ? 'opacity-40 cursor-not-allowed' : ''
                                  }`}
                                >
                                  {isSubmittingBerkas ? 'Proses...' : 'Kirim Ke SPV (PENDING_SPV)'}
                                </button>
                              </div>
                            </form>
                          </div>
                        </div>
                      </div>

                      {/* Right: Explanatory & quick guides */}
                      <div className="lg:col-span-4 space-y-4">
                        <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                          <h5 className="font-bold text-amber-900 text-xs flex items-center gap-1 mb-2">
                            <Smartphone size={14} />
                            Expo Simulator Guide
                          </h5>
                          <ul className="text-[10.5px] text-amber-800 space-y-2 list-disc pl-3">
                            <li>Format form ini murni dikembangkan dengan spesifikasi sistem file & data <strong>Prisma Schema (berkas_masuk)</strong>.</li>
                            <li>Fitur <strong>Cari Anggota Lama</strong> akan memanggil API search, dan menyuntikkan data lama anggota ke form dengan instan.</li>
                            <li>Sebagai bonus validasi, form otomatis menganalisis baris legasi data dan menetapkan <strong>tahap pinjaman baru otomatis naik: Tahap n + 1</strong>.</li>
                            <li>Silakan lakukan simulasi pemotretan KTP/KK dengan melampirkan berkas gambar lokal Anda. Sistem akan menyimpan file di folder static <code>uploads/</code> backend Anda.</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUB-TABCONTENT: WEB DASHBOARD STATE MACHINE APPROVAL */}
                  {berkasSubTab === 'web' && (
                    <div className="space-y-4" id="web_view_block">
                      
                      {/* Search & Filter Bar */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 bg-gradient-to-r from-white to-slate-50">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5 grow">
                          <CheckSquare className="text-indigo-600" size={16} />
                          Antrian Validasi & State Machine Berkas Masuk
                        </h4>

                        {/* Dropdown Filter Petugas PIC for Admin */}
                        {activeRole === 'admin' && (
                          <div className="flex items-center gap-2 bg-white border border-slate-200 shadow-3xs px-3 py-1.5 rounded-xl text-xs font-mono">
                            <span className="font-bold text-slate-500 uppercase">Saring Petugas:</span>
                            <select
                              id="admin_berkas_petugas_filter"
                              value={filterPetugasId}
                              onChange={(e) => setFilterPetugasId(e.target.value)}
                              className="bg-transparent border-0 font-bold text-slate-800 outline-none focus:ring-0 cursor-pointer text-xs"
                            >
                              <option value="ALL">-- SANGKUT PIC (SEMUA) --</option>
                              {(state?.users || []).filter((u: any) => u.role === 'petugas').map((u: any) => (
                                <option key={u.id} value={u.id}>{u.nama} ({u.id})</option>
                              ))}
                            </select>
                          </div>
                        )}
                        
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-[10.5px] bg-slate-50 border py-1.5 px-3 rounded-xl flex items-center gap-1.5 shadow-2xs">
                            <span className="font-bold text-slate-500 uppercase tracking-wide">ROLE SIMULATION:</span>
                            <button 
                              type="button"
                              onClick={() => setActiveRole('petugas')}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase transition ${activeRole === 'petugas' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                            >
                              PETUGAS (Mobile)
                            </button>
                            <button 
                              type="button"
                              onClick={() => setActiveRole('spv')}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase transition ${activeRole === 'spv' ? 'bg-amber-600 text-white shadow-xs' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                            >
                              SPV (Web)
                            </button>
                            <button 
                              type="button"
                              onClick={() => setActiveRole('admin')}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase transition ${activeRole === 'admin' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                            >
                              ADMIN (Web)
                            </button>
                            <button 
                              type="button"
                              onClick={() => setActiveRole('kasir')}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase transition ${activeRole === 'kasir' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                            >
                              KASIR (Web)
                            </button>
                            <button 
                              type="button"
                              onClick={() => setActiveRole('super_admin')}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase transition ${activeRole === 'super_admin' ? 'bg-purple-600 text-white shadow-xs' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                            >
                              SUPER ADMIN
                            </button>
                          </div>

                          <div className="text-[10.5px] bg-slate-50 border py-1.5 px-3 rounded-xl flex items-center gap-1.5 shadow-2xs">
                            <span className="font-bold text-slate-500 uppercase tracking-wide">CABANG SIMULATION:</span>
                            <button 
                              type="button"
                              onClick={() => setActiveBranch('PUSAT')}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase transition ${activeBranch === 'PUSAT' ? 'bg-slate-800 text-white shadow-xs' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                            >
                              🏢 PUSAT
                            </button>
                            <button 
                              type="button"
                              onClick={() => setActiveBranch('KC_MATIM')}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase transition ${activeBranch === 'KC_MATIM' ? 'bg-rose-600 text-white shadow-xs' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                            >
                              📍 KC MATIM
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Reject Form Modal Overlay (if active) */}
                      {rejectingBerkasId && (
                        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
                          <form onSubmit={handleRejectBerkas} className="bg-white p-5 rounded-2xl border max-w-md w-full shadow-2xl space-y-4">
                            <h5 className="font-bold text-slate-950 text-sm">Masukan Catatan Penolakan (Reject)</h5>
                            <p className="text-xs text-slate-500">Catatan penolakan ini akan disinkronisasikan ke dalam status REJECTED berkas agar petugas lapangan dapat memperbaiki di aplikasi mobile mereka.</p>
                            
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Catatan Keterangan Penolakan *</label>
                              <textarea
                                value={rejectNotes}
                                onChange={(e) => setRejectNotes(e.target.value)}
                                placeholder="Tulis alasan penolakan, misal: Foto KK buram / NIK salah..."
                                rows={3}
                                className="w-full text-xs p-2.5 border rounded-lg bg-white text-slate-850"
                                required
                              />
                            </div>

                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setRejectingBerkasId(null)}
                                className="px-3 py-1.5 bg-slate-105 text-slate-700 hover:bg-slate-150 rounded-lg text-xs font-bold"
                              >
                                Batal
                              </button>
                              <button
                                type="submit"
                                className="px-3 py-1.5 bg-rose-600 text-white hover:bg-rose-700 rounded-lg text-xs font-bold"
                              >
                                Simpan Penolakan
                              </button>
                            </div>
                          </form>
                        </div>
                      )}

                      {/* Main List Table */}
                      <div className="overflow-x-auto border border-slate-205 bg-white rounded-xl">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 text-slate-500 text-[9.5px] uppercase tracking-wider font-mono border-b">
                            <tr>
                              {activeRole === 'admin' && (
                                <>
                                  <th className="py-3 px-4 text-left font-black text-indigo-900 bg-indigo-50/30">Nama Petugas</th>
                                  <th className="py-3 px-4 text-left font-black text-indigo-900 bg-indigo-50/30">Tanggal Upload</th>
                                  <th className="py-3 px-4 text-left font-black text-indigo-900 bg-indigo-50/30">Jam Upload</th>
                                </>
                              )}
                              <th className="py-3 px-4">Detail Pemohon</th>
                              <th className="py-3 px-4">Kelompok & Wilayah</th>
                              <th className="py-3 px-4">Detail Pinjaman</th>
                              <th className="py-3 px-4">Data Penjamin</th>
                              <th className="py-3 px-4">Dokumen Unggahan</th>
                              <th className="py-3 px-4 text-center">Status</th>
                              <th className="py-3 px-4 text-right">Opsi Tindakan (RBAC State Machine)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150">
                            {(!state?.berkasMasuk || state.berkasMasuk.length === 0) ? (
                              <tr>
                                <td colSpan={activeRole === 'admin' ? 10 : 7} className="py-12 px-4 text-center text-slate-400 italic font-medium">
                                  Belum ada berkas masuk yang terdaftar. Gunakan Tab "Aplikasi Mobile" untuk menginput atau mensimulasikan pengajuan baru!
                                </td>
                              </tr>
                            ) : (
                              state.berkasMasuk
                                .filter((b: any) => {
                                  if (activeRole === 'admin' && filterPetugasId !== 'ALL') {
                                    return b.petugas_id === filterPetugasId;
                                  }
                                  return true;
                                })
                                .map((b: any) => {
                                  const petugasNama = b.petugas?.nama_lengkap || state?.users?.find((u: any) => u.id === b.petugas_id)?.nama || 'Admin / Pusat';
                                  
                                  return (
                                    <tr key={b.id} className="hover:bg-blue-50/80/40">
                                      {activeRole === 'admin' && (
                                        <>
                                          <td className="py-3 px-4 font-bold text-slate-800 bg-indigo-50/10 border-r border-dashed border-slate-100">
                                            {petugasNama}
                                          </td>
                                          <td className="py-3 px-4 font-mono font-bold text-slate-600 bg-indigo-50/5">
                                            {formatTanggal(b.created_at || b.tanggal_masuk)}
                                          </td>
                                          <td className="py-3 px-4 font-mono font-bold text-slate-600 bg-indigo-50/5">
                                            {formatJam(b.created_at || b.tanggal_masuk)}
                                          </td>
                                        </>
                                      )}
                                  {/* Detail Pemohon */}
                                  <td className="py-3 px-4">
                                    <div className="font-bold text-slate-900">{b.nama_pemohon}</div>
                                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">NIK: {b.nik_pemohon}</div>
                                    <div className="text-[10.5px] text-slate-500 mt-1">Telp: {b.no_telepon_pemohon || '-'}</div>
                                    <div className="text-[9.5px] text-slate-400 mt-0.5">{b.jenis_kelamin_pemohon} • {b.agama}</div>
                                  </td>

                                  {/* Kelompok & Wilayah */}
                                  <td className="py-3 px-4">
                                    <div className="font-semibold text-slate-850">{b.nama_kelompok}</div>
                                    <div className="text-[10px] font-semibold text-slate-500 font-mono mt-0.5 bg-slate-100 rounded px-1 inline-block">{b.wilayah}</div>
                                  </td>

                                  {/* Detail Pinjaman */}
                                  <td className="py-3 px-4">
                                    <div className="font-bold text-emerald-700">Rp {(b.pengajuan_pinjaman || 0).toLocaleString('id-ID')}</div>
                                    <div className="text-[10px] mt-0.5 text-slate-500 font-semibold">{b.tenor_mg} Minggu</div>
                                    {b.sisa_piutang > 0 && (
                                      <div className="text-[9.5px] mt-1 text-rose-600 bg-rose-50 px-1 py-0.2 rounded inline-block font-mono">Tunggakan: Rp {b.sisa_piutang.toLocaleString('id-ID')}</div>
                                    )}
                                    <div className="text-[9px] text-indigo-700 font-bold mt-1">Tahap ke-{b.tahap_pinjaman}</div>
                                  </td>

                                  {/* Data Penjamin */}
                                  <td className="py-3 px-4">
                                    <div className="font-medium text-slate-800">{b.nama_penjamin || '-'}</div>
                                    <div className="text-[9.5px] text-slate-400 font-mono">NIK: {b.nik_penjamin}</div>
                                    <div className="text-[9.5px] text-slate-500 mt-0.5">Hubungan: <strong className="text-slate-705">{b.hubungan}</strong></div>
                                  </td>

                                  {/* Dokumen Unggahan */}
                                  <td className="py-3 px-4">
                                    <div className="space-y-1">
                                      {/* KTP Pemohon */}
                                      <div className="flex items-center gap-1">
                                        <span className="text-[9.5px] text-slate-500 w-16">KTP Pem.</span>
                                        {b.doc_ktp_pemohon ? (
                                          <a href={b.doc_ktp_pemohon} target="_blank" rel="noreferrer" className="text-[9.5px] text-indigo-650 hover:underline font-bold bg-indigo-50 px-1 py-0.2 rounded truncate max-w-[80px]">
                                            Open View
                                          </a>
                                        ) : (
                                          <span className="text-[9.5px] text-rose-500 italic">None</span>
                                        )}
                                      </div>
                                      
                                      {/* KTP Penjamin */}
                                      <div className="flex items-center gap-1">
                                        <span className="text-[9.5px] text-slate-500 w-16">KTP Penj.</span>
                                        {b.doc_ktp_penjamin ? (
                                          <a href={b.doc_ktp_penjamin} target="_blank" rel="noreferrer" className="text-[9.5px] text-indigo-650 hover:underline font-bold bg-indigo-50 px-1 py-0.2 rounded truncate max-w-[80px]">
                                            Open View
                                          </a>
                                        ) : (
                                          <span className="text-[9.5px] text-rose-500 italic">None</span>
                                        )}
                                      </div>

                                      {/* KK */}
                                      <div className="flex items-center gap-1">
                                        <span className="text-[9.5px] text-slate-500 w-16">Doc KK</span>
                                        {b.doc_kk ? (
                                          <a href={b.doc_kk} target="_blank" rel="noreferrer" className="text-[9.5px] text-indigo-650 hover:underline font-bold bg-indigo-50 px-1 py-0.2 rounded truncate max-w-[80px]">
                                            Open View
                                          </a>
                                        ) : (
                                          <span className="text-[9.5px] text-rose-500 italic">None</span>
                                        )}
                                      </div>
                                    </div>
                                  </td>

                                  {/* Status */}
                                  <td className="py-3 px-4 text-center">
                                    <div className="inline-block">
                                      <span className={`px-2.5 py-1 text-[9.5px] font-bold font-mono rounded-full ${
                                        b.status === 'DRAFT' ? 'bg-slate-100 text-slate-800 border' :
                                        b.status === 'PENDING_SPV' ? 'bg-amber-100 text-amber-900 border border-amber-200' :
                                        b.status === 'PENDING_ADM' ? 'bg-indigo-100 text-indigo-900 border border-indigo-200' :
                                        b.status === 'APPROVED_FOR_SURVEY' ? 'bg-emerald-100 text-emerald-900 border border-emerald-200' :
                                        b.status === 'REJECTED' ? 'bg-rose-100 text-rose-900 border border-rose-200' :
                                        'bg-slate-100 text-slate-700'
                                      }`}>
                                        {b.status}
                                      </span>
                                    </div>
                                    {b.catatan && (
                                      <div className="text-[9.5px] text-rose-600 max-w-[130px] mx-auto mt-1 line-clamp-2 leading-tight italic" title={b.catatan}>
                                        "{b.catatan}"
                                      </div>
                                    )}
                                  </td>

                                  {/* Actions */}
                                  <td className="py-3 px-4 text-right">
                                    <div className="flex flex-col gap-1 items-end">
                                      
                                      {/* SPV ACC ACTION */}
                                      {b.status === "PENDING_SPV" && (
                                        <div className="flex flex-col gap-1 w-full max-w-[150px]">
                                          <button
                                            disabled={activeRole !== 'spv' && activeRole !== 'super_admin'}
                                            onClick={() => handleApproveBerkas(b.id)}
                                            className={`px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-[10px] transition text-center ${
                                              activeRole !== 'spv' && activeRole !== 'super_admin' ? 'opacity-30 cursor-not-allowed' : ''
                                            }`}
                                            title="Ubah status ke PENDING_ADM"
                                          >
                                            SPV Approve Ke ADM
                                          </button>
                                          <button
                                            disabled={activeRole !== 'spv' && activeRole !== 'super_admin'}
                                            onClick={() => {
                                              setRejectingBerkasId(b.id);
                                              setRejectNotes('');
                                            }}
                                            className={`px-2.5 py-1 bg-rose-105 hover:bg-rose-150 text-rose-700 font-bold rounded-lg text-[10px] transition text-center ${
                                              activeRole !== 'spv' && activeRole !== 'super_admin' ? 'opacity-30 cursor-not-allowed' : ''
                                            }`}
                                          >
                                            SPV Tolak (Reject)
                                          </button>
                                        </div>
                                      )}

                                      {/* ADMIN FINAL ACC ACTION */}
                                      {b.status === "PENDING_ADM" && (
                                        <div className="flex flex-col gap-1 w-full max-w-[150px]">
                                          <button
                                            disabled={activeRole !== 'admin' && activeRole !== 'super_admin'}
                                            onClick={() => handleApproveBerkas(b.id)}
                                            className={`px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] transition text-center ${
                                              activeRole !== 'admin' && activeRole !== 'super_admin' ? 'opacity-30 cursor-not-allowed' : ''
                                            }`}
                                            title="Ubah status ke APPROVED_FOR_SURVEY"
                                          >
                                            Admin Approve Final
                                          </button>
                                          <button
                                            disabled={activeRole !== 'admin' && activeRole !== 'super_admin'}
                                            onClick={() => {
                                              setRejectingBerkasId(b.id);
                                              setRejectNotes('');
                                            }}
                                            className={`px-2.5 py-1 bg-rose-105 hover:bg-rose-150 text-rose-700 font-bold rounded-lg text-[10px] transition text-center ${
                                              activeRole !== 'admin' && activeRole !== 'super_admin' ? 'opacity-30 cursor-not-allowed' : ''
                                            }`}
                                          >
                                            Admin Tolak (Reject)
                                          </button>
                                        </div>
                                      )}

                                      {/* PETUGAS DELETE ACTION */}
                                      {(b.status === "DRAFT" || b.status === "REJECTED") ? (
                                        <button
                                          disabled={activeRole !== 'petugas' && activeRole !== 'super_admin'}
                                          onClick={() => handleDeleteBerkas(b.id)}
                                          className={`px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-[10px] transition ${
                                            activeRole !== 'petugas' && activeRole !== 'super_admin' ? 'opacity-30 cursor-not-allowed' : ''
                                          }`}
                                          title="Petugas menghapus draft atau berkas yang direject"
                                        >
                                          Hapus Pengajuan
                                        </button>
                                      ) : (
                                        /* Hide delete button entirely if in SPV/Admin processing */
                                        null
                                      )}

                                      {/* Approved Final Notice */}
                                      {b.status === 'APPROVED_FOR_SURVEY' && (
                                        <div className="text-[9px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-150 px-2 py-1 rounded-lg">
                                          ✓ Akses Survei Kelompok Terbuka!
                                        </div>
                                      )}
                                      
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MENU 2: SURVEI - Khusus Petugas */}
              {activeTab === 'survei' && (
                <div className="space-y-6 animate-fade-in" id="survei_tab_view">
                  
                  {/* Header */}
                  <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-6 rounded-2xl shadow-md border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                          Modul Lapangan
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                        <span className="text-slate-300 text-[11px] font-mono">Mobile & Sync Authorized</span>
                      </div>
                      <h2 className="text-xl font-bold font-display text-white">Survei Kelayakan Kelompok & Individu</h2>
                      <p className="text-xs text-slate-350 max-w-xl">
                        Aturan ketat: Lakukan persetujuan survei kelompok terlebih dahulu guna membuka form survei jaminan mikro untuk masing-masing individu anggota.
                      </p>
                    </div>

                    {/* Group Selection Dropdown */}
                    <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl w-full md:w-auto min-w-[280px]">
                      <label className="block text-[10px] font-bold text-indigo-300 uppercase mb-1.5 tracking-wider flex items-center gap-1.5">
                        <Users size={12} />
                        Pilih Kelompok Sasaran
                      </label>
                      <select
                        id="survey_group_id_select"
                        value={selectedSurveyGroupId}
                        onChange={(e) => setSelectedSurveyGroupId(e.target.value)}
                        className="w-full text-xs p-2 bg-slate-900 text-slate-100 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                      >
                        <option value="">-- Silakan Pilih Kelompok --</option>
                        {state?.groups.map(g => (
                          <option key={g.id} value={g.id}>
                            {g.name} ({g.survey_status === 'NOT_SURVEYED' ? 'BELUM SURVEI' : g.survey_status})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* ADMIN SURVEI LOG & PIC TRACKING TABLE */}
                  {activeRole === 'admin' && (
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4" id="admin_survei_audit_log">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 uppercase font-mono tracking-wider flex items-center gap-1.5">
                            📊 Log Penilaian Hasil Survei & PIC Tracking (Admin Only)
                          </h3>
                          <p className="text-[11px] text-slate-500">Memantau rekam jejak survei kelayakan (Kelompok & Jaminan Mikro Individu) yang diupload oleh petugas lapangan.</p>
                        </div>

                        {/* Saring Petugas Dropdown */}
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 shadow-3xs px-3 py-1.5 rounded-xl text-xs font-mono">
                          <span className="font-bold text-slate-500 uppercase text-[10px]">Filter PIC:</span>
                          <select
                            id="admin_survey_petugas_filter"
                            value={filterSurveyPetugasId}
                            onChange={(e) => setFilterSurveyPetugasId(e.target.value)}
                            className="bg-transparent border-0 font-bold text-slate-800 outline-none focus:ring-0 cursor-pointer text-xs"
                          >
                            <option value="ALL">-- SEMUA PETUGAS --</option>
                            {(state?.users || []).filter((u: any) => u.role === 'petugas').map((u: any) => (
                              <option key={u.id} value={u.id}>{u.nama} ({u.id})</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="overflow-x-auto border border-slate-205 rounded-xl text-xs bg-white">
                        <table className="w-full text-left" id="admin_survei_history_table">
                          <thead className="bg-slate-50 border-b">
                            <tr>
                              <th className="py-2 px-3 text-left font-black text-indigo-900 bg-indigo-50/30">Nama Petugas</th>
                              <th className="py-2 px-3 text-left font-black text-indigo-900 bg-indigo-50/30">Tanggal Upload</th>
                              <th className="py-2 px-3 text-left font-black text-indigo-900 bg-indigo-50/30">Jam Upload</th>
                              <th className="py-2 px-3 font-semibold text-slate-700">Tipe Survei</th>
                              <th className="py-2 px-3 font-semibold text-slate-700">Nama Kelompok / Anggota</th>
                              <th className="py-2 px-3 font-semibold text-slate-700 text-center">Rincian Skor / Penghasilan</th>
                              <th className="py-2 px-3 font-semibold text-slate-700 text-center">Hasil Keputusan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150">
                            {(() => {
                              const listGS = (state?.groupSurveys || []).map((gs: any) => ({
                                id: `GS-${gs.id || gs.group_id}`,
                                type: 'Kelompok Sasaran',
                                target: gs.nama_kelompok || state?.groups?.find((g: any) => g.id === gs.group_id)?.name || `ID: ${gs.group_id}`,
                                petugasId: gs.petugas_id || 'USR-04',
                                createdAt: gs.created_at || new Date().toISOString(),
                                score: `Skor: ${gs.total_skor || gs.total_score || '0'}/27`,
                                status: gs.keputusan_otomatis || 'LAYAK'
                              }));

                              const listIS = (state?.individualSurveys || []).map((is: any) => {
                                const m = state?.customers?.find((c: any) => c.id === is.customer_id);
                                return {
                                  id: `IS-${is.id}`,
                                  type: 'Mikro Anggota',
                                  target: m?.nama_pemohon || `Anggota ID: ${is.customer_id}`,
                                  petugasId: is.petugas_id || 'USR-04',
                                  createdAt: is.created_at || new Date().toISOString(),
                                  score: `Pendapatan: Rp ${Number(is.pendapatan_bulanan || 3000000).toLocaleString('id-ID')}`,
                                  status: is.status_kelayakan || 'LAYAK_CAIR'
                                };
                              });

                              const merged = [...listGS, ...listIS];
                              const filtered = merged.filter((item: any) => {
                                if (filterSurveyPetugasId !== 'ALL') {
                                  return item.petugasId === filterSurveyPetugasId;
                                }
                                return true;
                              });

                              if (filtered.length === 0) {
                                return (
                                  <tr>
                                    <td colSpan={7} className="py-8 text-center text-slate-400 italic">Belum ada data survei yang cocok dengan filter.</td>
                                  </tr>
                                );
                              }

                              return filtered.map((item: any) => {
                                const petName = state?.users?.find(u => u.id === item.petugasId)?.nama || 'Rudi Hermawan';
                                const isLayak = item.status === 'LAYAK' || item.status === 'LAYAK_CAIR';
                                
                                return (
                                  <tr key={item.id} className="hover:bg-blue-50/80/50">
                                    <td className="py-2.5 px-3 font-bold text-slate-800 bg-indigo-50/10 border-r border-dashed border-slate-100">{petName}</td>
                                    <td className="py-2.5 px-3 font-mono font-bold text-slate-605 bg-indigo-50/5">{formatTanggal(item.createdAt)}</td>
                                    <td className="py-2.5 px-3 font-mono font-bold text-slate-605 bg-indigo-50/5">{formatJam(item.createdAt)}</td>
                                    <td className="py-2.5 px-3 font-semibold text-indigo-700 font-mono text-[10px]">{item.type}</td>
                                    <td className="py-2.5 px-3 font-bold text-slate-900">{item.target}</td>
                                    <td className="py-2.5 px-3 text-center font-mono text-slate-600 font-bold">{item.score}</td>
                                    <td className="py-2.5 px-3 text-center">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                        isLayak ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                                      }`}>
                                        {item.status}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* If no selected group */}
                  {!selectedSurveyGroupId ? (
                    <div className="bg-slate-50 border border-slate-200 text-slate-500 p-12 rounded-2xl text-center shadow-xs">
                      <div className="max-w-md mx-auto space-y-3">
                        <div className="inline-flex p-3 bg-indigo-50 text-indigo-600 rounded-full">
                          <Users size={24} />
                        </div>
                        <h3 className="font-bold text-slate-805 text-sm">Belum Ada Kelompok Terpilih</h3>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Silakan tentukan salah satu kelompok pada menu dropdown kanan atas untuk melakukan Survei Kelompok (Automated Scoring) ataupun Survei Individu.
                        </p>
                      </div>
                    </div>
                  ) : (() => {
                    const grp = state?.groups.find(g => g.id === selectedSurveyGroupId);
                    if (!grp) return null;

                    const groupMembers = state?.customers.filter(c => c.group_id === grp.id) || [];
                    const approvedMembersCount = groupMembers.filter(m => m.status === 'APPROVED_FOR_SURVEY' || m.status === 'LAYAK_CAIR' || m.status === 'TIDAK_LAYAK').length;

                    // Real-time score calculator constants
                    const scoringWeights: Record<string, number> = { 'BAIK': 3, 'CUKUP': 2, 'KURANG': 1 };
                    const currentTotalLiveScore = 
                      (scoringWeights[groupSurveyFields.inisiatif_ketua] || 2) +
                      (scoringWeights[groupSurveyFields.jarak_domisili] || 2) +
                      (scoringWeights[groupSurveyFields.kelengkapan_dokumen_dasar] || 2) +
                      (scoringWeights[groupSurveyFields.ketepatan_waktu] || 2) +
                      (scoringWeights[groupSurveyFields.pemahaman_tanggung_renteng] || 2) +
                      (scoringWeights[groupSurveyFields.penentuan_ketua_kelompok] || 2) +
                      (scoringWeights[groupSurveyFields.pengaruh_ketua] || 2) +
                      (scoringWeights[groupSurveyFields.saling_kenal_antar_anggota] || 2) +
                      (scoringWeights[groupSurveyFields.tingkat_kehadiran] || 2);

                    const isLiveLayak = currentTotalLiveScore >= 18;

                    return (
                      <div className="space-y-6" id={`survey_workspace_${grp.id}`}>
                        
                        {/* Selected Group Quick Metrics Card */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                          <div className="flex items-center gap-3">
                            <div className="bg-indigo-50 text-indigo-700 p-2.5 rounded-xl border border-indigo-100 hidden sm:block">
                              <Building size={20} />
                            </div>
                            <div>
                              <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">PROFIL KELOMPOK AKTIF</span>
                              <h3 className="font-bold text-slate-900 text-base leading-tight">{grp.name} ({grp.id})</h3>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Tenor: 50 Minggu • Tanggung Renteng: <span className="font-bold text-sky-850">{grp.sistem_tanggung_renteng ? 'AKTIF (Sirkuler Mandiri)' : 'TIDAK (Independen)'}</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right hidden sm:block">
                              <span className="block text-[9px] font-bold text-slate-400 uppercase">Anggota Terdaftar</span>
                              <span className="text-xs text-slate-700 font-bold font-mono">{approvedMembersCount} dari {groupMembers.length} Orang</span>
                            </div>
                            <div className="h-8 w-px bg-slate-205 hidden sm:block"></div>
                            <div>
                              <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Status Survey Khas</span>
                              <span className={`px-3 py-1 rounded-full text-xs font-bold font-mono border ${
                                grp.survey_status === 'NOT_SURVEYED' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                                grp.survey_status === 'LAYAK' ? 'bg-emerald-50 text-emerald-700 border-emerald-150' :
                                'bg-rose-50 text-rose-700 border-rose-150'
                              }`}>
                                {grp.survey_status === 'NOT_SURVEYED' ? 'BELUM DISURVEI' : grp.survey_status}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* WORKFLOW TAB NAVIGATION BAR (Kunci Layar Enforcement) */}
                        <div className="flex border-b border-slate-250 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                          <button
                            type="button"
                            onClick={() => setSurveyActiveSubTab('kelompok')}
                            className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition duration-150 flex items-center justify-center gap-2 ${
                              surveyActiveSubTab === 'kelompok'
                                ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            <span className="font-mono text-[10px] bg-slate-200/80 px-1.5 py-0.2 rounded-full">Menu 1</span>
                            📋 Survei Kelompok (Automated Scoring)
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (grp.survey_status === 'NOT_SURVEYED') {
                                triggerError('🔒 AKSES DIKUNCI: Anda wajib menyelesaikan kuisioner Survei Kelompok dan meloloskannya terlebih dahulu!');
                                return;
                              }
                              if (grp.survey_status === 'TIDAK_LAYAK') {
                                triggerError('❌ AKSES DITOLAK PERMANEN: Kelompok ini dinyatakan TIDAK LAYAK. Form survei anggota ditutup otomatis.');
                                return;
                              }
                              setSurveyActiveSubTab('individu');
                            }}
                            className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition duration-150 flex items-center justify-center gap-2 relative ${
                              surveyActiveSubTab === 'individu'
                                ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                                : ''
                            } ${
                              grp.survey_status === 'LAYAK' 
                                ? 'text-slate-650 hover:text-slate-900' 
                                : 'text-slate-400 cursor-not-allowed opacity-60'
                            }`}
                            title={grp.survey_status !== 'LAYAK' ? "Kunci layar aktif - Isi survei kelompok dahulu" : "Daftar survei individu terbuka"}
                          >
                            <span className="font-mono text-[10px] bg-slate-200/80 px-1.5 py-0.2 rounded-full">Menu 2</span>
                            👥 Survei Individu Anggota
                            {grp.survey_status !== 'LAYAK' ? (
                              <Lock size={12} className="text-red-500 ml-1 block" />
                            ) : (
                              <CheckCircle2 size={13} className="text-emerald-500 ml-1 block" />
                            )}
                          </button>
                        </div>

                        {/* SUB-TAB 1: FORMULIR SURVEI KELOMPOK */}
                        {surveyActiveSubTab === 'kelompok' && (
                          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6" id="group_survey_form_container">
                            
                            {/* Enforced Status Info Overlay for Already Surveyed groups */}
                            {grp.survey_status !== 'NOT_SURVEYED' && (
                              <div className={`p-4 rounded-xl border ${
                                grp.survey_status === 'LAYAK' 
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                                  : 'bg-rose-50 border-rose-200 text-rose-800'
                              } flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4`}>
                                <div className="space-y-1">
                                  <div className="font-bold text-sm flex items-center gap-1.5">
                                    <Check size={16} />
                                    Hasil Keputusan Survei Kelompok Terkunci
                                  </div>
                                  <p className="text-xs opacity-90 leading-normal">
                                    Hasil penilaian telah terekam di sistem. {grp.survey_notes}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Let officers reset status for testing
                                    grp.survey_status = 'NOT_SURVEYED';
                                    fetchState();
                                    triggerSuccess('Sistem mereset status kelompok untuk keperluan pengujian ulang (testing).');
                                  }}
                                  className="px-3.5 py-1 text-xs font-bold rounded bg-white hover:bg-slate-100 shadow-xs border border-transparent transition text-slate-800 text-center"
                                >
                                  Mulai Survei Ulang (Uji Coba UI)
                                </button>
                              </div>
                            )}

                            {/* Active Data Input Form */}
                            {grp.survey_status === 'NOT_SURVEYED' && (
                              <form onSubmit={handleQuantitativeGroupSurveySubmit} className="space-y-6">
                                
                                <div className="border-b border-slate-100 pb-3">
                                  <h4 className="text-sm font-bold text-slate-850 flex items-center gap-1.5 uppercase tracking-wide">
                                    <ClipboardCheck className="text-indigo-600" size={16} />
                                    Kuisioner Kepatuhan Kuantitatif Lapangan
                                  </h4>
                                  <p className="text-xs text-slate-400 mt-0.5">Sembilan parameter jaminan tanggung renteng yang dinilai langsung di lokasi oleh petugas harian.</p>
                                </div>

                                {/* The 9 Parameters Assessment Grid (Bento style) */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="assessment_fields_bento">
                                  
                                  {/* 1. INISIATIF KETUA */}
                                  <div className="bg-slate-50 p-4 border border-slate-200/80 rounded-xl space-y-3.5 flex flex-col justify-between">
                                    <div>
                                      <h5 className="text-[11.5px] font-bold text-slate-800 uppercase tracking-tight">1. Inisiatif Ketua</h5>
                                      <p className="text-[10px] text-slate-450 mt-1 leading-relaxed">Keaktifan membimbing pengisian form biodata & dokumen syarat anggotanya.</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1 text-[10px] uppercase font-bold text-center mt-2">
                                      {['BAIK', 'CUKUP', 'KURANG'].map(kw => (
                                        <button
                                          type="button"
                                          key={kw}
                                          onClick={() => setGroupSurveyFields(prev => ({ ...prev, inisiatif_ketua: kw as any }))}
                                          className={`py-1.5 rounded-lg border transition ${
                                            groupSurveyFields.inisiatif_ketua === kw
                                              ? kw === 'BAIK' ? 'bg-emerald-600 border-emerald-600 text-white' :
                                                kw === 'CUKUP' ? 'bg-amber-500 border-amber-500 text-white' :
                                                'bg-rose-600 border-rose-600 text-white'
                                              : 'bg-white border-slate-250 text-slate-600 hover:bg-slate-100'
                                          }`}
                                        >
                                          {kw}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* 2. JARAK DOMISILI */}
                                  <div className="bg-slate-50 p-4 border border-slate-200/80 rounded-xl space-y-3.5 flex flex-col justify-between">
                                    <div>
                                      <h5 className="text-[11.5px] font-bold text-slate-800 uppercase tracking-tight">2. Jarak Domisili</h5>
                                      <p className="text-[10px] text-slate-450 mt-1 leading-relaxed">BAIK = Bertetangga dekat/berdekatan, KURANG = Berjauhan terpencar beda wilayah.</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1 text-[10px] uppercase font-bold text-center mt-2">
                                      {['BAIK', 'CUKUP', 'KURANG'].map(kw => (
                                        <button
                                          type="button"
                                          key={kw}
                                          onClick={() => setGroupSurveyFields(prev => ({ ...prev, jarak_domisili: kw as any }))}
                                          className={`py-1.5 rounded-lg border transition ${
                                            groupSurveyFields.jarak_domisili === kw
                                              ? kw === 'BAIK' ? 'bg-emerald-600 border-emerald-600 text-white' :
                                                kw === 'CUKUP' ? 'bg-amber-500 border-amber-500 text-white' :
                                                'bg-rose-600 border-rose-600 text-white'
                                              : 'bg-white border-slate-250 text-slate-600 hover:bg-slate-100'
                                          }`}
                                        >
                                          {kw}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* 3. KELENGKAPAN DOKUMEN DASAR */}
                                  <div className="bg-slate-50 p-4 border border-slate-200/80 rounded-xl space-y-3.5 flex flex-col justify-between">
                                    <div>
                                      <h5 className="text-[11.5px] font-bold text-slate-800 uppercase tracking-tight">3. Kelengkapan Dokumen</h5>
                                      <p className="text-[10px] text-slate-450 mt-1 leading-relaxed">Kelengkapan fisik berkas KTP pemohon, KTP penjamin, dan KK orisinil.</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1 text-[10px] uppercase font-bold text-center mt-2">
                                      {['BAIK', 'CUKUP', 'KURANG'].map(kw => (
                                        <button
                                          type="button"
                                          key={kw}
                                          onClick={() => setGroupSurveyFields(prev => ({ ...prev, kelengkapan_dokumen_dasar: kw as any }))}
                                          className={`py-1.5 rounded-lg border transition ${
                                            groupSurveyFields.kelengkapan_dokumen_dasar === kw
                                              ? kw === 'BAIK' ? 'bg-emerald-600 border-emerald-600 text-white' :
                                                kw === 'CUKUP' ? 'bg-amber-500 border-amber-500 text-white' :
                                                'bg-rose-600 border-rose-600 text-white'
                                              : 'bg-white border-slate-250 text-slate-600 hover:bg-slate-100'
                                          }`}
                                        >
                                          {kw}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* 4. KETEPATAN WAKTU KUMPO */}
                                  <div className="bg-slate-50 p-4 border border-slate-200/80 rounded-xl space-y-3.5 flex flex-col justify-between">
                                    <div>
                                      <h5 className="text-[11.5px] font-bold text-slate-800 uppercase tracking-tight">4. Ketepatan Waktu</h5>
                                      <p className="text-[10px] text-slate-450 mt-1 leading-relaxed">Ketaatan waktu berkumpul semua calon anggota saat petugas tiba di titik kumpul.</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1 text-[10px] uppercase font-bold text-center mt-2">
                                      {['BAIK', 'CUKUP', 'KURANG'].map(kw => (
                                        <button
                                          type="button"
                                          key={kw}
                                          onClick={() => setGroupSurveyFields(prev => ({ ...prev, ketepatan_waktu: kw as any }))}
                                          className={`py-1.5 rounded-lg border transition ${
                                            groupSurveyFields.ketepatan_waktu === kw
                                              ? kw === 'BAIK' ? 'bg-emerald-600 border-emerald-600 text-white' :
                                                kw === 'CUKUP' ? 'bg-amber-500 border-amber-500 text-white' :
                                                'bg-rose-600 border-rose-600 text-white'
                                              : 'bg-white border-slate-250 text-slate-600 hover:bg-slate-100'
                                          }`}
                                        >
                                          {kw}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* 5. PEMAHAMAN TANGGUNG RENTENG */}
                                  <div className="bg-slate-50 p-4 border border-slate-200/80 rounded-xl space-y-3.5 flex flex-col justify-between">
                                    <div>
                                      <h5 className="text-[11.5px] font-bold text-slate-800 uppercase tracking-tight">5. Paham Tanggung Renteng</h5>
                                      <p className="text-[10px] text-slate-450 mt-1 leading-relaxed">Pemahaman bersama terkait konsep saling patungan jika anggota berkendala bayar.</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1 text-[10px] uppercase font-bold text-center mt-2">
                                      {['BAIK', 'CUKUP', 'KURANG'].map(kw => (
                                        <button
                                          type="button"
                                          key={kw}
                                          onClick={() => setGroupSurveyFields(prev => ({ ...prev, pemahaman_tanggung_renteng: kw as any }))}
                                          className={`py-1.5 rounded-lg border transition ${
                                            groupSurveyFields.pemahaman_tanggung_renteng === kw
                                              ? kw === 'BAIK' ? 'bg-emerald-600 border-emerald-600 text-white' :
                                                kw === 'CUKUP' ? 'bg-amber-500 border-amber-500 text-white' :
                                                'bg-rose-600 border-rose-600 text-white'
                                              : 'bg-white border-slate-250 text-slate-600 hover:bg-slate-100'
                                          }`}
                                        >
                                          {kw}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* 6. PENENTUAN KETUA KELOMPOK */}
                                  <div className="bg-slate-50 p-4 border border-slate-200/80 rounded-xl space-y-3.5 flex flex-col justify-between">
                                    <div>
                                      <h5 className="text-[11.5px] font-bold text-slate-800 uppercase tracking-tight">6. Penentuan Ketua</h5>
                                      <p className="text-[10px] text-slate-450 mt-1 leading-relaxed">BAIK = Hasil musyawarah murni kelompok, KURANG = Ditunjuk paksa petugas.</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1 text-[10px] uppercase font-bold text-center mt-2">
                                      {['BAIK', 'CUKUP', 'KURANG'].map(kw => (
                                        <button
                                          type="button"
                                          key={kw}
                                          onClick={() => setGroupSurveyFields(prev => ({ ...prev, penentuan_ketua_kelompok: kw as any }))}
                                          className={`py-1.5 rounded-lg border transition ${
                                            groupSurveyFields.penentuan_ketua_kelompok === kw
                                              ? kw === 'BAIK' ? 'bg-emerald-600 border-emerald-600 text-white' :
                                                kw === 'CUKUP' ? 'bg-amber-500 border-amber-500 text-white' :
                                                'bg-rose-600 border-rose-600 text-white'
                                              : 'bg-white border-slate-250 text-slate-600 hover:bg-slate-100'
                                          }`}
                                        >
                                          {kw}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* 7. PENGARUH KETUA */}
                                  <div className="bg-slate-50 p-4 border border-slate-200/80 rounded-xl space-y-3.5 flex flex-col justify-between">
                                    <div>
                                      <h5 className="text-[11.5px] font-bold text-slate-800 uppercase tracking-tight">7. Pengaruh Ketua</h5>
                                      <p className="text-[10px] text-slate-450 mt-1 leading-relaxed">Wibawa ketua kelompok memediasi kesepakatan mufakat anggotanya.</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1 text-[10px] uppercase font-bold text-center mt-2">
                                      {['BAIK', 'CUKUP', 'KURANG'].map(kw => (
                                        <button
                                          type="button"
                                          key={kw}
                                          onClick={() => setGroupSurveyFields(prev => ({ ...prev, pengaruh_ketua: kw as any }))}
                                          className={`py-1.5 rounded-lg border transition ${
                                            groupSurveyFields.pengaruh_ketua === kw
                                              ? kw === 'BAIK' ? 'bg-emerald-600 border-emerald-600 text-white' :
                                                kw === 'CUKUP' ? 'bg-amber-500 border-amber-500 text-white' :
                                                'bg-rose-600 border-rose-600 text-white'
                                              : 'bg-white border-slate-250 text-slate-600 hover:bg-slate-100'
                                          }`}
                                        >
                                          {kw}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* 8. SALING KENAL ANTAR ANGGOTA */}
                                  <div className="bg-slate-50 p-4 border border-slate-200/80 rounded-xl space-y-3.5 flex flex-col justify-between">
                                    <div>
                                      <h5 className="text-[11.5px] font-bold text-slate-800 uppercase tracking-tight">8. Saling Kenal Anggota</h5>
                                      <p className="text-[10px] text-slate-450 mt-1 leading-relaxed">Tingkat pemahaman latar belakang keluarga & karakter sesama calon anggota.</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1 text-[10px] uppercase font-bold text-center mt-2">
                                      {['BAIK', 'CUKUP', 'KURANG'].map(kw => (
                                        <button
                                          type="button"
                                          key={kw}
                                          onClick={() => setGroupSurveyFields(prev => ({ ...prev, saling_kenal_antar_anggota: kw as any }))}
                                          className={`py-1.5 rounded-lg border transition ${
                                            groupSurveyFields.saling_kenal_antar_anggota === kw
                                              ? kw === 'BAIK' ? 'bg-emerald-600 border-emerald-600 text-white' :
                                                kw === 'CUKUP' ? 'bg-amber-500 border-amber-500 text-white' :
                                                'bg-rose-600 border-rose-600 text-white'
                                              : 'bg-white border-slate-250 text-slate-600 hover:bg-slate-100'
                                          }`}
                                        >
                                          {kw}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* 9. TINGKAT KEHADIRAN LATIHAN */}
                                  <div className="bg-slate-50 p-4 border border-slate-200/80 rounded-xl space-y-3.5 flex flex-col justify-between">
                                    <div>
                                      <h5 className="text-[11.5px] font-bold text-slate-800 uppercase tracking-tight">9. Tingkat Kehadiran</h5>
                                      <p className="text-[10px] text-slate-450 mt-1 leading-relaxed">Persentase kehadiran fisik kumpul lengkap calon anggota saat survei.</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1 text-[10px] uppercase font-bold text-center mt-2">
                                      {['BAIK', 'CUKUP', 'KURANG'].map(kw => (
                                        <button
                                          type="button"
                                          key={kw}
                                          onClick={() => setGroupSurveyFields(prev => ({ ...prev, tingkat_kehadiran: kw as any }))}
                                          className={`py-1.5 rounded-lg border transition ${
                                            groupSurveyFields.tingkat_kehadiran === kw
                                              ? kw === 'BAIK' ? 'bg-emerald-600 border-emerald-600 text-white' :
                                                kw === 'CUKUP' ? 'bg-amber-500 border-amber-500 text-white' :
                                                'bg-rose-600 border-rose-600 text-white'
                                              : 'bg-white border-slate-250 text-slate-600 hover:bg-slate-100'
                                          }`}
                                        >
                                          {kw}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                </div>

                                {/* General Fields Block (Wilayah, Pertemuan, Anggota, Ceiling) */}
                                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 md:grid-cols-4 gap-4">
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                      <MapPin size={10} className="text-slate-400" />
                                      Wilayah Evaluasi
                                    </label>
                                    <input
                                      type="text"
                                      value={groupSurveyFields.wilayah}
                                      onChange={(e) => setGroupSurveyFields(prev => ({ ...prev, wilayah: e.target.value }))}
                                      className="w-full text-xs p-2 border rounded-lg bg-white text-slate-800 border-slate-250 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                      required
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                      <Calendar size={10} className="text-slate-400" />
                                      Tanggal Pertemuan
                                    </label>
                                    <input
                                      type="datetime-local"
                                      value={groupSurveyFields.tanggal_pertemuan}
                                      onChange={(e) => setGroupSurveyFields(prev => ({ ...prev, tanggal_pertemuan: e.target.value }))}
                                      className="w-full text-xs p-2 border rounded-lg bg-white text-slate-805 border-slate-250 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                      required
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Jumlah Anggota Kelompok</label>
                                    <input
                                      type="number"
                                      value={groupSurveyFields.jumlah_anggota}
                                      onChange={(e) => setGroupSurveyFields(prev => ({ ...prev, jumlah_anggota: Number(e.target.value) }))}
                                      className="w-full text-xs p-2 border rounded-lg bg-white text-slate-805 border-slate-250 focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono"
                                      required
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Plafon Kelompok (Ceiling)</label>
                                    <input
                                      type="number"
                                      value={groupSurveyFields.jumlah_pokok_pinjaman_kelompok}
                                      onChange={(e) => setGroupSurveyFields(prev => ({ ...prev, jumlah_pokok_pinjaman_kelompok: Number(e.target.value) }))}
                                      className="w-full text-xs p-2 border rounded-lg bg-white text-slate-805 border-slate-250 focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono"
                                      required
                                    />
                                  </div>
                                </div>

                                {/* Drag & Drop Media Upload Card with Local Preview */}
                                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                                  <label className="block text-[10.5px] font-bold text-slate-705 uppercase mb-2 flex items-center gap-1.5">
                                    <Camera size={13} className="text-slate-500" />
                                    Foto Pertemuan Fisik Kelompok (Bukti Lapangan)
                                  </label>

                                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                                    {/* Drag Drop Area */}
                                    <div 
                                      className="md:col-span-7 bg-white border-2 border-dashed border-slate-300 hover:border-indigo-400 p-6 rounded-xl text-center cursor-pointer transition relative"
                                      onDragOver={(e) => e.preventDefault()}
                                      onDrop={(e) => {
                                        e.preventDefault();
                                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                          setGroupSurveyFotoFile(e.dataTransfer.files[0]);
                                        }
                                      }}
                                    >
                                      <input 
                                        type="file" 
                                        accept="image/*"
                                        id="foto_kelompok_input"
                                        onChange={(e) => {
                                          if (e.target.files && e.target.files[0]) {
                                            setGroupSurveyFotoFile(e.target.files[0]);
                                          }
                                        }}
                                        className="hidden"
                                      />
                                      <label htmlFor="foto_kelompok_input" className="cursor-pointer space-y-2 block w-full">
                                        <div className="inline-flex p-2 bg-indigo-50 text-indigo-650 rounded-full">
                                          <UploadCloud size={20} />
                                        </div>
                                        <div className="text-xs font-bold text-slate-700">Tarik gambar kemari atau klik untuk memilih</div>
                                        <p className="text-[10px] text-slate-400 leading-normal">
                                          Pilih foto riil mufakat bersama anggota (Kamera/Galeri). Bypass GCS aktif, file aman tersimpan di sandbox local storage.
                                        </p>
                                      </label>
                                    </div>

                                    {/* Local Photo Preview Panel */}
                                    <div className="md:col-span-5 flex flex-col items-center justify-center border border-slate-200 rounded-xl p-3 bg-white h-full min-h-[140px]">
                                      {groupSurveyFotoFile ? (
                                        <div className="text-center space-y-2">
                                          <img 
                                            src={URL.createObjectURL(groupSurveyFotoFile)} 
                                            alt="Preview Foto Kelompok" 
                                            className="h-24 w-auto rounded-lg shadow-xs object-cover border border-slate-150 mx-auto"
                                            referrerPolicy="no-referrer"
                                          />
                                          <div className="text-[10px] font-mono text-emerald-600 font-bold">
                                            ✓ {groupSurveyFotoFile.name} ({(groupSurveyFotoFile.size / 1024).toFixed(1)} KB)
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => setGroupSurveyFotoFile(null)}
                                            className="text-[9.5px] font-bold text-rose-600 hover:underline"
                                          >
                                            Hapus Foto
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="text-center text-slate-400">
                                          <div className="text-lg mb-1">🖼️</div>
                                          <div className="text-[10px] italic">Silihkan pilih foto untuk melihat pratinjau (preview).</div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Text Notes Area */}
                                <div>
                                  <label className="block text-[10.5px] font-bold text-slate-700 uppercase mb-1.5">Catatan/Rekomendasi Tambahan Petugas</label>
                                  <textarea
                                    value={groupSurveyFields.notes}
                                    onChange={(e) => setGroupSurveyFields(prev => ({ ...prev, notes: e.target.value }))}
                                    placeholder="Tulis alasan, catatan, atau rincian tambahan hasil verifikasi kelompok di sini..."
                                    className="w-full text-xs p-2.5 border rounded-xl bg-white text-slate-805 border-slate-250 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                    rows={2}
                                  />
                                </div>

                                {/* Real-Time Automated Scoring Predictor Panel */}
                                <div className="p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-slate-900 text-slate-100 border-slate-800">
                                  <div className="space-y-1">
                                    <div className="text-[10px] font-mono font-bold text-indigo-400 tracking-wider uppercase">Live Automated Scoring Predictor</div>
                                    <div className="flex items-baseline gap-2">
                                      <span className="text-2xl font-extrabold font-mono text-white">{currentTotalLiveScore}</span>
                                      <span className="text-xs text-slate-400">dari maksimal 27 parameter poin</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 leading-relaxed">
                                      Formula: BAIK = 3, CUKUP = 2, KURANG = 1. Batas kelolosan minimal adalah 18 poin (70%).
                                    </p>
                                  </div>

                                  <div className={`p-3 rounded-lg flex items-center justify-center text-center font-bold text-xs ${
                                    isLiveLayak
                                      ? 'bg-emerald-950/70 border border-emerald-850/80 text-emerald-450'
                                      : 'bg-rose-950/75 border border-rose-850/80 text-rose-450'
                                  }`}>
                                    {isLiveLayak ? (
                                      <span className="flex items-center gap-1.5 uppercase">
                                        <CheckCircle2 size={15} />
                                        PREDIKSI: LAYAK KELOMPOK
                                      </span>
                                    ) : (
                                      <span className="flex items-center gap-1.5 uppercase">
                                        <AlertCircle size={15} />
                                        PREDIKSI: TIDAK LAYAK
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex justify-end gap-2.5 pt-3">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      // Cancel or Reset
                                      setSelectedSurveyGroupId('');
                                    }}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-150 text-slate-700 font-bold rounded-lg text-xs transition border border-slate-200"
                                  >
                                    Batalkan
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={isSubmittingGroupSurvey}
                                    id="btn_submit_group_survey"
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                                  >
                                    {isSubmittingGroupSurvey ? (
                                      <>
                                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                        Mengunggah & Memproses...
                                      </>
                                    ) : (
                                      <>
                                        <CheckCircle2 size={14} />
                                        Kirim Hasil & Hitung Kelayakan
                                      </>
                                    )}
                                  </button>
                                </div>
                              </form>
                            )}

                          </div>
                        )}

                        {/* SUB-TAB 2: DAFTAR SURVEI INDIVIDU */}
                        {surveyActiveSubTab === 'individu' && (
                          <div className="space-y-4" id="individual_surveys_container">
                            <div className="bg-emerald-50 border border-emerald-150 p-4 rounded-xl text-emerald-800 text-xs flex gap-2.5 items-start">
                              <Info size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                              <div>
                                <strong>✓ Survei Kelompok Terverifikasi LAYAK:</strong> Menu pengisian survei individu anggota telah aktif. Anda dapat mengisi evaluasi jaminan mikro, pendapatan, dan kesesuaian KTP masing-masing anggota di bawah ini untuk didaftarkan rekomendasi cair.
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="member_surveys_grid">
                              {groupMembers.map(member => {
                                const berkas = state?.berkasMasuk?.find(b => b.nik_pemohon === member.nik);
                                const defaultPlafon = Number(berkas?.pengajuan_pinjaman) || 5000000;
                                const defaultTenor = Number(berkas?.tenor_mg) || 50;
                                const defaultAngsuran = (defaultPlafon * 1.1) / defaultTenor;

                                const mState = surveyMemberStates[member.id] || {
                                  alamat_sesuai: true,
                                  kondisi_rumah: 'Baik',
                                  pendapatan_bulanan: 3000000,
                                  status_kelayakan: 'LAYAK_CAIR',
                                  notes: '',
                                  
                                  pendapatan_usaha: 3000000,
                                  pengeluaran_rumah_tangga: 1500000,
                                  tanggungan_koperasi_lain: 0,
                                  nama_koperasi: '',
                                  rekomendasi_petugas: 'Lulus uji kelayakan kapasitas bayar',
                                  kordinat_lokasi: '-6.858902, 107.921345',
                                  foto_jaminan: null,
                                  foto_anggota: null
                                };

                                const updateState = (key: string, val: any) => {
                                  setSurveyMemberStates({
                                    ...surveyMemberStates,
                                    [member.id]: {
                                      ...mState,
                                      [key]: val
                                    }
                                  });
                                };

                                // Live dynamic calculations for decision preview
                                const pUsaha = Number(mState.pendapatan_usaha ?? 3000000);
                                const pPengeluaran = Number(mState.pengeluaran_rumah_tangga ?? 1500000);
                                const pTanggungan = Number(mState.tanggungan_koperasi_lain ?? 0);
                                const sisaPendapatanBersih = pUsaha - pPengeluaran - pTanggungan;
                                const isLayakCairLive = sisaPendapatanBersih > defaultAngsuran;

                                const fetchGPSLocation = () => {
                                  if (navigator.geolocation) {
                                    navigator.geolocation.getCurrentPosition(
                                      (position) => {
                                        const coordsStr = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
                                        updateState('kordinat_lokasi', coordsStr);
                                        triggerSuccess(`GPS Geotagging Berhasil: ${coordsStr}`);
                                      },
                                      (err) => {
                                        const randLat = (-6.859 + (Math.random() - 0.5) * 0.01).toFixed(6);
                                        const randLng = (107.921 + (Math.random() - 0.5) * 0.01).toFixed(6);
                                        const coordsStr = `${randLat}, ${randLng}`;
                                        updateState('kordinat_lokasi', coordsStr);
                                        triggerSuccess(`Mock Native Geotag (GPS Satelit): ${coordsStr}`);
                                      }
                                    );
                                  } else {
                                    const coordsStr = `-6.858902, 107.921345`;
                                    updateState('kordinat_lokasi', coordsStr);
                                  }
                                };

                                return (
                                  <div key={member.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between" id={`member_survey_card_${member.id}`}>
                                    
                                    {/* Card Header matching mobile feel */}
                                    <div className="flex justify-between items-start border-b border-slate-100 pb-3.5">
                                      <div>
                                        <div className="font-bold text-slate-900 text-sm">{member.name}</div>
                                        <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                          NIK: {member.nik} • {member.pekerjaan || "Pertanian"}
                                        </div>
                                      </div>
                                      <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded border ${
                                        member.status === 'APPROVED_FOR_SURVEY' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                        member.status === 'LAYAK_CAIR' ? 'bg-emerald-50 text-emerald-700 border-emerald-250 animate-pulse' :
                                        'bg-rose-50 text-rose-700 border-rose-250'
                                      }`}>
                                        {member.status === 'APPROVED_FOR_SURVEY' ? 'BELUM DINILAI' : member.status}
                                      </span>
                                    </div>

                                    {member.status !== 'APPROVED_FOR_SURVEY' ? (
                                      <div className="p-4 bg-slate-50 border border-slate-150 rounded-xl text-xs text-slate-500 italic text-center space-y-1">
                                        <div>Status Survei Akhir Terkunci: <strong>{member.status}</strong></div>
                                        <div className="text-[10px] text-slate-400 font-mono">Hasil terekam di pusat mikro-financing</div>
                                      </div>
                                    ) : (
                                      <div className="space-y-4 text-xs" id={`fields_container_${member.id}`}>
                                        
                                        {/* SECTION A: AUTO-FILL READ-ONLY SECTION From Loan Admission */}
                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-205 space-y-2">
                                          <div className="text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1 flex items-center gap-1">
                                            <Info size={12} className="text-slate-400" />
                                            Data Pengisian Berkas (Read-Only)
                                          </div>
                                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                                            <div>
                                              <span className="text-slate-400">Nama Penjamin:</span>
                                              <div className="font-semibold text-slate-700 truncate">{berkas?.nama_penjamin || "Tidak Ada"}</div>
                                            </div>
                                            <div>
                                              <span className="text-slate-400">Plafon Pengajuan:</span>
                                              <div className="font-semibold text-slate-700">Rp {defaultPlafon.toLocaleString('id-ID')}</div>
                                            </div>
                                            <div>
                                              <span className="text-slate-400">Tenor:</span>
                                              <div className="font-semibold text-slate-700">{defaultTenor} Minggu</div>
                                            </div>
                                            <div>
                                              <span className="text-slate-400 font-bold">Angsuran / Minggu:</span>
                                              <div className="font-bold text-indigo-700">Rp {Math.round(defaultAngsuran).toLocaleString('id-ID')}</div>
                                            </div>
                                          </div>
                                        </div>

                                        {/* SECTION B: INDIVIDUAL REAL INCOME & EXPENSES */}
                                        <div className="space-y-2.5">
                                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Kuesioner Finansial Individu</div>
                                          
                                          <div className="grid grid-cols-2 gap-3 text-xs">
                                            <div>
                                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Pendapatan Usaha (Rp)</label>
                                              <input
                                                type="number"
                                                value={mState.pendapatan_usaha ?? 3000000}
                                                onChange={(e) => updateState('pendapatan_usaha', Number(e.target.value))}
                                                className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-805 font-mono"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Pengeluaran RT (Rp)</label>
                                              <input
                                                type="number"
                                                value={mState.pengeluaran_rumah_tangga ?? 1500500}
                                                onChange={(e) => updateState('pengeluaran_rumah_tangga', Number(e.target.value))}
                                                className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-805 font-mono"
                                              />
                                            </div>
                                          </div>

                                          <div className="grid grid-cols-2 gap-3 text-xs">
                                            <div>
                                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tanggungan Koperasi Lain (Rp)</label>
                                              <input
                                                type="number"
                                                value={mState.tanggungan_koperasi_lain ?? 0}
                                                onChange={(e) => updateState('tanggungan_koperasi_lain', Number(e.target.value))}
                                                className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-805 font-mono"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nama Koperasi</label>
                                              <input
                                                type="text"
                                                placeholder="Kosong jika tidak ada"
                                                value={mState.nama_koperasi || ''}
                                                onChange={(e) => updateState('nama_koperasi', e.target.value)}
                                                required={Number(mState.tanggungan_koperasi_lain) > 0}
                                                disabled={Number(mState.tanggungan_koperasi_lain) <= 0}
                                                className={`w-full text-xs p-2 bg-white border rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-805 ${
                                                  Number(mState.tanggungan_koperasi_lain) > 0 ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200 opacity-60'
                                                }`}
                                              />
                                            </div>
                                          </div>
                                        </div>

                                        {/* SECTION C: EXPO PHOTO UPLOADS WITH LOCAL FILE OBJECT */}
                                        <div className="grid grid-cols-2 gap-3">
                                          <div>
                                            <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                              <Camera size={11} /> Foto Jaminan
                                            </span>
                                            <div className="flex items-center gap-2">
                                              <input
                                                type="file"
                                                accept="image/*"
                                                onChange={(e) => updateState('foto_jaminan', e.target.files?.[0] || null)}
                                                className="hidden"
                                                id={`cam_jaminan_${member.id}`}
                                              />
                                              <label
                                                htmlFor={`cam_jaminan_${member.id}`}
                                                className="flex-1 flex flex-col items-center justify-center py-2.5 border border-dashed border-slate-300 hover:border-indigo-500 rounded-xl cursor-pointer text-[10px] font-semibold text-slate-600 hover:text-indigo-600 transition"
                                              >
                                                {mState.foto_jaminan ? "✓ Terlampir" : "Ambil Foto"}
                                              </label>
                                              {mState.foto_jaminan && (
                                                <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-205 shrink-0">
                                                  <img src={URL.createObjectURL(mState.foto_jaminan)} alt="Jaminan" className="w-full h-full object-cover" />
                                                </div>
                                              )}
                                            </div>
                                          </div>

                                          <div>
                                            <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                              <Camera size={11} /> Foto Bersama
                                            </span>
                                            <div className="flex items-center gap-2">
                                              <input
                                                type="file"
                                                accept="image/*"
                                                onChange={(e) => updateState('foto_anggota', e.target.files?.[0] || null)}
                                                className="hidden"
                                                id={`cam_bersama_${member.id}`}
                                              />
                                              <label
                                                htmlFor={`cam_bersama_${member.id}`}
                                                className="flex-1 flex flex-col items-center justify-center py-2.5 border border-dashed border-slate-300 hover:border-indigo-500 rounded-xl cursor-pointer text-[10px] font-semibold text-slate-600 hover:text-indigo-600 transition"
                                              >
                                                {mState.foto_anggota ? "✓ Terlampir" : "Ambil Foto"}
                                              </label>
                                              {mState.foto_anggota && (
                                                <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-205 shrink-0">
                                                  <img src={URL.createObjectURL(mState.foto_anggota)} alt="Bersama" className="w-full h-full object-cover" />
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        {/* SECTION D: NATIVE GPS LOCATIONS & EXP O LOCATION INTERACTION */}
                                        <div className="space-y-1.5">
                                          <span className="block text-[10px] font-bold text-slate-500 uppercase">Input GPS Geotagging</span>
                                          <div className="flex gap-2">
                                            <input
                                              type="text"
                                              value={mState.kordinat_lokasi || ''}
                                              onChange={(e) => updateState('kordinat_lokasi', e.target.value)}
                                              placeholder="Lat, Lng"
                                              className="flex-1 p-2 bg-slate-50 border border-slate-200 text-[11px] font-mono rounded-lg focus:outline-none"
                                            />
                                            <button
                                              type="button"
                                              onClick={fetchGPSLocation}
                                              className="px-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold border border-indigo-200 shrink-0 flex items-center gap-1"
                                            >
                                              <MapPin size={12} />
                                              Get GPS
                                            </button>
                                          </div>
                                        </div>

                                        {/* SECTION E: TEXT RECOMMENDATION & TEXTAREA REKOMENDASI */}
                                        <div>
                                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Rekomendasi Petugas Lapangan</label>
                                          <textarea
                                            value={mState.rekomendasi_petugas || ''}
                                            onChange={(e) => updateState('rekomendasi_petugas', e.target.value)}
                                            placeholder="Tulis alasan kelayakan jaminan atau kondisi usaha"
                                            className="w-full p-2 bg-white border border-slate-200 text-[11px] rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-805 h-16 resize-none"
                                          />
                                        </div>

                                        {/* AUTOMATED DECISION CALCULATION PREVIEW BOX */}
                                        <div className="bg-slate-900 text-slate-100 p-3.5 rounded-xl space-y-1.5 border border-slate-800">
                                          <div className="flex justify-between text-[11px] text-slate-400">
                                            <span>Sisa Pendapatan Bersih:</span>
                                            <span className="font-mono font-bold text-white">Rp {sisaPendapatanBersih.toLocaleString('id-ID')}</span>
                                          </div>
                                          <div className="flex justify-between text-[11px] text-slate-400">
                                            <span>Kategori Syarat Angsuran:</span>
                                            <span className="font-mono text-slate-300">Rp {Math.round(defaultAngsuran).toLocaleString('id-ID')} /minggu</span>
                                          </div>
                                          <div className="border-t border-slate-800 my-1 pb-1"></div>
                                          <div className="flex justify-between items-center text-[11px]">
                                            <span className="font-bold uppercase tracking-wider text-slate-300">Keputusan Sistem Otomatis:</span>
                                            <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] text-white border ${
                                              isLayakCairLive 
                                                ? 'bg-emerald-600 border-emerald-500 text-white' 
                                                : 'bg-rose-600 border-rose-500 text-white'
                                            }`}>
                                              {isLayakCairLive ? 'LAYAK CAIR' : 'TIDAK LAYAK'}
                                            </span>
                                          </div>
                                        </div>

                                        <button
                                          type="button"
                                          id={`btn_member_survey_submit_${member.id}`}
                                          onClick={() => handleIndividualSurveySubmit(member.id)}
                                          className="w-full py-2.5 bg-indigo-600 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                                        >
                                          <CheckCircle2 size={13} />
                                          Kirim Hasil Survei Anggota {member.name.split(' ')[0]}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* HIGH-FIDELITY RED WARNING POP-UP MODAL (REJECTION OUTCOME DISMISSER) */}
                        {showFailureGroupModal && (
                          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
                            <div className="bg-white border-2 border-rose-200 rounded-3xl p-6 shadow-2xl max-w-md w-full text-center space-y-4 animate-scale-in">
                              
                              <div className="inline-flex p-4 bg-rose-50 text-rose-600 rounded-full border border-rose-100">
                                <AlertCircle size={36} className="animate-bounce" />
                              </div>

                              <div className="space-y-1.5">
                                <h3 className="text-lg font-black text-rose-800 uppercase tracking-tight font-display">
                                  Kelompok Tidak Memenuhi Standar Kelayakan
                                </h3>
                                <div className="text-[11px] bg-rose-50 border border-rose-150 px-2.5 py-1 rounded-lg text-rose-800 font-bold inline-block font-mono">
                                  Skor Nilai: {failedGroupTotalScore} / 27 (Gagal - Butuh Min. 18)
                                </div>
                              </div>

                              <p className="text-xs text-slate-600 leading-relaxed text-left bg-slate-50 p-4 border border-slate-150 rounded-2xl">
                                Hasil Automated Scoring dari 9 indikator menunjukkan kelompok harian tidak lulus standar kelayakan minimal (70%). 
                                <br /><br />
                                ❌ <strong>Efek Sistem Otomatis:</strong>
                                <br />
                                • Status kelompok diubah menjadi <strong>TIDAK LAYAK</strong>.
                                <br />
                                • Seluruh berkas anggota kelompok ini resmi <strong>DIGUGURKAN</strong> (Status berubah menjadi <strong>REJECTED</strong>).
                                <br />
                                • Akses pengisian form survei individu dikunci permanen.
                              </p>

                              <button
                                type="button"
                                onClick={() => setShowFailureGroupModal(false)}
                                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs tracking-wide transition shadow-md"
                              >
                                Mengerti & Tutup
                              </button>

                            </div>
                          </div>
                        )}

                        {/* HIGH-FIDELITY DISBURSEMENT SUCCESS MODAL WITH DYNAMIC PDF PRINT LINKS */}
                        {showDisburseSuccessModal && (() => {
                          const disb = state?.disbursements?.find(d => d.id === lastDisburseId);
                          const groupMembers = state?.customers.filter(c => c.group_id === lastDisburseGroupId && (c.status === 'ACTIVE_LOAN' || c.status === 'PAID_OFF')) || [];
                          
                          return (
                            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4" id="disburse_success_modal">
                              <div className="bg-white border text-left shadow-2xl rounded-3xl p-6 max-w-lg w-full space-y-6 animate-scale-in">
                                
                                {/* Header */}
                                <div className="text-center space-y-3">
                                  <div className="inline-flex p-4 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 shadow-sm shadow-emerald-200">
                                    <Check size={36} className="animate-pulse" />
                                  </div>
                                  <div className="space-y-1">
                                    <h3 className="text-xl font-black text-slate-800 tracking-tight font-display">
                                      Pencairan Kolektif Sukses!
                                    </h3>
                                    <p className="text-xs text-slate-500 font-sans">
                                      Dokumen SPK dan Jurnal Keuangan SAK Mandiri telah diproses secara real-time.
                                    </p>
                                  </div>
                                </div>

                                {/* Financial Summary */}
                                {disb && (
                                  <div className="bg-slate-50 border rounded-2xl p-4 text-xs font-mono division text-slate-700 space-y-1.5 shadow-3xs">
                                    <div className="border-b pb-1 mb-2 font-bold text-[10px] text-slate-400 uppercase tracking-widest persistent_summary">
                                      IKHTISAR KEUANGAN CABANG (MANGGARAI)
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Kelompok Harian:</span>
                                      <span className="font-bold text-slate-900">{disb.nama_kelompok}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Jumlah Anggota Cair:</span>
                                      <span className="font-bold text-slate-900">{disb.jumlah_anggota_cair} Orang</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Total Plafon Kotor:</span>
                                      <span className="font-bold text-slate-950">Rp {Number(disb.total_pencairan_kotor).toLocaleString('id-ID')}</span>
                                    </div>
                                    <div className="flex justify-between text-rose-600 font-bold">
                                      <span>Total Potongan & UP:</span>
                                      <span>- Rp {Number(disb.total_uang_kembali_ke_kantor).toLocaleString('id-ID')}</span>
                                    </div>
                                    <div className="flex justify-between text-emerald-600 border-t pt-1.5 mt-1 font-bold text-sm">
                                      <span>Dana Bersih Terserah:</span>
                                      <span>Rp {(Number(disb.total_pencairan_kotor) - Number(disb.total_uang_kembali_ke_kantor)).toLocaleString('id-ID')}</span>
                                    </div>
                                  </div>
                                )}

                                {/* Main Bundled Download Buttons */}
                                <div className="space-y-2">
                                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                                    EKSPOR DOKUMEN FISIK LAPANGAN (PDF):
                                  </span>
                                  
                                  <a
                                    href={`/api/pencairan/${lastDisburseId}/cetak-spk`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs sm:text-sm tracking-wide transition shadow-md shadow-emerald-700/15 flex items-center justify-center gap-2 decoration-none"
                                  >
                                    <FileSpreadsheet size={16} />
                                    <span>Unduh Seluruh SPK & Kuitansi (PDF Bundel)</span>
                                  </a>
                                </div>

                                {/* Individual Members Download Collapse */}
                                <div className="space-y-2.5">
                                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                                    UNDUH SPK PERORANGAN (INDIVIDU):
                                  </span>
                                  
                                  <div className="max-h-36 overflow-y-auto border rounded-2xl p-2.5 bg-slate-50/50 space-y-1.5 scrollbar-thin">
                                    {groupMembers.length === 0 ? (
                                      <div className="p-4 text-center text-slate-400 italic text-[11px]">
                                        Tidak ada nasabah aktif terdaftar dalam kelompok ini.
                                      </div>
                                    ) : (
                                      groupMembers.map(m => (
                                        <div key={m.id} className="flex items-center justify-between bg-white border border-slate-100 hover:border-slate-200 px-3 py-1.5 rounded-xl shadow-3xs transition">
                                          <div className="space-y-0.5" style={{ textAlign: 'left' }}>
                                            <div className="text-xs font-bold text-slate-800 leading-none">{m.name}</div>
                                            <div className="text-[9px] font-mono text-slate-400">NIK: {m.nik}</div>
                                          </div>
                                          <a
                                            href={`/api/pencairan/${lastDisburseId}/cetak-spk?customerId=${m.id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-2.5 py-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-150 rounded-lg inline-flex items-center gap-1 transition decoration-none"
                                          >
                                            <FileSpreadsheet size={10} />
                                            <span>SPK PDF</span>
                                          </a>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>

                                {/* Close Button */}
                                <button
                                  type="button"
                                  onClick={() => setShowDisburseSuccessModal(false)}
                                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs tracking-wide transition shadow-md cursor-pointer"
                                >
                                  Selesai & Selesaikan Administrasi
                                </button>

                              </div>
                            </div>
                          );
                        })()}

                      </div>
                    );
                  })()}

                </div>
              )}

              {/* MENU 3: PENCAIRAN - Khusus Admin & SPV */}
              {activeTab === 'pencairan' && (
                <div className="space-y-6" id="pencairan_tab_view">
                  <div className="border-b border-slate-150 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 font-display">Modul Pencairan Kolektif (Kebijakan SAK Mandiri)</h2>
                      <p className="text-xs text-slate-500">Mencairkan dana pinjaman kelompok berstatus LAYAK_CAIR secara massal dengan pemotongan deposit, penyusunan rute petugas penagihan, dan pencatatan kas otomatis.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${(activeRole === 'admin' || activeRole === 'spv' || activeRole === 'super_admin') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                        Mode: {(activeRole === 'admin' || activeRole === 'spv' || activeRole === 'super_admin') ? '✍ PENCAIRAN AKTIF (EDIT/EXECUTE)' : '👁 READ-ONLY MONITOR'}
                      </span>
                    </div>
                  </div>

                  {/* Main Form container */}
                  {activeRole !== 'admin' && activeRole !== 'spv' && activeRole !== 'super_admin' ? (
                    <div className="p-8 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-3" id="spv_read_only_alert">
                      <ShieldAlert size={36} className="text-slate-400 mx-auto" />
                      <div className="space-y-1">
                        <h3 className="font-bold text-slate-800 text-sm">Hak Akses Pencairan Terbatas</h3>
                        <p className="text-slate-505 text-slate-500 text-xs max-w-md mx-auto">
                          Sesuai Business Rule terbaru, eksekusi pemotongan dan pencairan dana pinjaman ini hanya diperbolehkan untuk peran **Administrator** dan **Supervisor (SPV)**.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleCollectiveDisburseSubmit} className="space-y-6 bg-white border border-slate-200 p-6 rounded-2xl shadow-xs" id="collective_disbursement_form">
                      {/* BAGIAN 1: PENUGASAN & JADWAL */}
                      <div className="space-y-3" id="form_pencairan_bagian_1">
                        <div className="flex items-center gap-1.5 pb-1 border-b border-slate-100">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white font-mono text-[10px] font-bold">1</span>
                          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Bagian 1: Penugasan & Jadwal</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="text-slate-505 font-bold text-[11px] block">Nama Petugas Pencairan</label>
                            <select
                              value={disbursePetugasPencairanId}
                              onChange={e => setDisbursePetugasPencairanId(e.target.value)}
                              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 font-medium text-slate-800"
                              required
                            >
                              <option value="">-- Pilih Petugas Pencairan --</option>
                              {state?.users.filter(u => u.role === 'petugas').map(u => (
                                <option key={u.id} value={u.id}>{u.nama} (ID: {u.id})</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-slate-505 font-bold text-[11px] block">Nama Petugas Penagihan</label>
                            <select
                              value={disbursePetugasPenagihanId}
                              onChange={e => setDisbursePetugasPenagihanId(e.target.value)}
                              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 font-medium text-slate-800"
                              required
                            >
                              <option value="">-- Pilih Petugas Penagihan --</option>
                              {state?.users.filter(u => u.role === 'petugas').map(u => (
                                <option key={u.id} value={u.id}>{u.nama} (ID: {u.id})</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-slate-505 font-bold text-[11px] block">Hari Penagihan Mingguan</label>
                            <select
                              value={disburseHariPenagihan}
                              onChange={e => setDisburseHariPenagihan(e.target.value)}
                              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 font-bold text-indigo-700"
                              required
                            >
                              {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'].map(h => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* BAGIAN 2: INFO KELOMPOK */}
                      <div className="space-y-3" id="form_pencairan_bagian_2">
                        <div className="flex items-center gap-1.5 pb-1 border-b border-slate-100">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white font-mono text-[10px] font-bold">2</span>
                          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Bagian 2: Info Kelompok</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-slate-505 font-bold text-[11px] block">Pilih Kelompok Penerima</label>
                            <select
                              value={disburseGroupId}
                              onChange={e => {
                                setDisburseGroupId(e.target.value);
                                setDisburseCancelledMembers({}); // reset cancellations on group swap
                              }}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white font-black text-slate-800 text-xs"
                              required
                            >
                              <option value="">-- Pilih Kelompok Pendanaan --</option>
                              {state?.groups.filter(grp => state?.customers.some(c => c.group_id === grp.id && c.status === 'LAYAK_CAIR')).map(grp => (
                                <option key={grp.id} value={grp.id}>{grp.name} ({grp.id})</option>
                              ))}
                            </select>
                          </div>
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                            <span className="text-[10px] font-bold font-mono text-slate-400 uppercase">Jumlah Anggota Terdaftar (Di Survei)</span>
                            <div className="text-lg font-black text-slate-800">
                              {state?.customers.filter(c => c.group_id === disburseGroupId && c.status === 'LAYAK_CAIR').length || 0} Anggota
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* BAGIAN 3: VERIFIKASI LAPANGAN (CHECKLIST) */}
                      <div className="space-y-3" id="form_pencairan_bagian_3">
                        <div className="flex items-center gap-1.5 pb-1 border-b border-slate-100">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white font-mono text-[10px] font-bold">3</span>
                          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Bagian 3: Verifikasi Lapangan (SOP)</h3>
                        </div>
                        <div className="p-4 bg-amber-50 border border-amber-150 rounded-xl">
                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={disburseSopCheck}
                              onChange={e => setDisburseSopCheck(e.target.checked)}
                              className="mt-1 h-4 w-4 text-slate-900 border-slate-300 rounded focus:ring-slate-900 accent-slate-900"
                              required
                            />
                            <div className="text-xs text-amber-900 font-bold leading-relaxed">
                              Saya telah mengecek kembali formulir survei dan melakukan sosialisasi langsung kepada anggota.
                            </div>
                          </label>
                        </div>
                      </div>

                      {/* BAGIAN 4: PEMBATALAN (DROP-OUT) */}
                      <div className="space-y-3" id="form_pencairan_bagian_4">
                        <div className="flex items-center gap-1.5 pb-1 border-b border-slate-100">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white font-mono text-[10px] font-bold">4</span>
                          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Bagian 4: Ketentuan Drop-Out & Pembatalan</h3>
                        </div>
                        <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                          <table className="w-full text-left font-sans" id="dropout_verification_table">
                            <thead className="bg-slate-50 border-b">
                              <tr>
                                <th className="py-2 px-3">Nama Anggota</th>
                                <th className="py-2 px-3">Status Survei</th>
                                <th className="py-2 px-3 text-right">Piutang Pembiayaan</th>
                                <th className="py-2 px-3 text-center">Status Kelayakan Final (Drop-out)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-150 bg-white">
                              {state?.customers.filter(c => c.group_id === disburseGroupId && c.status === 'LAYAK_CAIR').length === 0 ? (
                                <tr>
                                  <td colSpan={4} className="py-4 text-center text-slate-400 italic font-medium">Buka menu Dropdown Bagian 2 untuk memilih kelompok terpilih.</td>
                                </tr>
                              ) : (
                                state?.customers.filter(c => c.group_id === disburseGroupId && c.status === 'LAYAK_CAIR').map(member => {
                                  const isCancelled = !!disburseCancelledMembers[member.id];
                                  const bk = state?.berkasMasuk?.find(b => b.nik_pemohon === member.nik);
                                  const sisaPiutang = bk ? Number(bk.sisa_piutang) : 0;
                                  return (
                                    <tr key={member.id} className={isCancelled ? "bg-rose-50/50" : "hover:bg-blue-50/80/20"}>
                                      <td className="py-3 px-3">
                                        <div className={`font-bold ${isCancelled ? 'text-rose-900 line-through' : 'text-slate-900'}`}>{member.name}</div>
                                        <span className="text-[10px] text-slate-400 font-mono">ID: {member.id} | NIK: {member.nik}</span>
                                      </td>
                                      <td className="py-3 px-3">
                                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-[9px] font-bold uppercase">LAYAK CAIR</span>
                                        {member.is_new_member && (
                                          <span className="ml-1 px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[9px] font-bold uppercase">Anggota Baru</span>
                                        )}
                                      </td>
                                      <td className="py-3 px-3 text-right font-mono font-bold">
                                        <div className={isCancelled ? "text-rose-400" : "text-emerald-700"}>Rp {(5000000 - sisaPiutang - (member.is_new_member ? 100000 : 0) - 250000 - 50000).toLocaleString('id-ID')} (Net)</div>
                                        <div className="text-[9px] text-slate-400">Plafon: Rp 5.000.000</div>
                                        {sisaPiutang > 0 && <div className="text-[9px] text-rose-600 font-medium font-mono">(-) Potong Piutang Lama: Rp {sisaPiutang.toLocaleString('id-ID')}</div>}
                                      </td>
                                      <td className="py-3 px-3 text-center">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setDisburseCancelledMembers(prev => ({ ...prev, [member.id]: !isCancelled }));
                                          }}
                                          className={`py-1 px-3 text-[10px] font-mono font-bold rounded shadow-2xs transition ${
                                            isCancelled 
                                              ? "bg-rose-600 text-white border border-rose-600 hover:bg-rose-500" 
                                              : "bg-slate-100 text-slate-600 border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-150"
                                          }`}
                                        >
                                          {isCancelled ? "❌ BATALKAN PENCAIRAN" : "🟢 AKTIF (Klik Batalkan)"}
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* BAGIAN 5: KALKULASI PENCAIRAN KOLEKTIF (AUTO-HITUNG) */}
                      <div className="space-y-3" id="form_pencairan_bagian_5">
                        <div className="flex items-center gap-1.5 pb-1 border-b border-slate-100">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white font-mono text-[10px] font-bold">5</span>
                          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Bagian 5: Kalkulasi Pencairan Kolektif (Auto-Hitung)</h3>
                        </div>
                        {(() => {
                          const groupMembers = state?.customers.filter(c => c.group_id === disburseGroupId && c.status === 'LAYAK_CAIR') || [];
                          const validMembers = groupMembers.filter(m => !disburseCancelledMembers[m.id]);
                          const countActive = validMembers.length;
                          const totalPlafon = countActive * 5000000;
                          const totalDeposito = countActive * 250000;
                          const totalAdmin = countActive * 50000;
                          const totalUP = validMembers.reduce((sum, m) => sum + (m.is_new_member ? 100000 : 0), 0);
                          const totalSisaPiutang = validMembers.reduce((sum, m) => {
                            const bk = state?.berkasMasuk?.find(b => b.nik_pemohon === m.nik);
                            return sum + (bk ? Number(bk.sisa_piutang) : 0);
                          }, 0);
                          const totalKantorDeducted = totalSisaPiutang + totalUP + totalDeposito + totalAdmin;
                          const totalNetCair = totalPlafon - totalKantorDeducted;

                          return (
                            <div className="bg-slate-900 text-slate-100 p-5 rounded-2xl md:grid md:grid-cols-2 gap-6 space-y-4 md:space-y-0 shadow-2xs font-mono text-xs">
                              <div className="space-y-2 border-r border-slate-800 pr-4">
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pb-1 border-b border-slate-800">Uraian Kredit Nominal</div>
                                <div className="flex justify-between items-center text-slate-300">
                                  <span>Jumlah Anggota Valid Cair:</span>
                                  <span className="font-bold text-white text-sm">{countActive} Nasabah</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-300">
                                  <span>Total Plafon Pinjaman:</span>
                                  <span className="font-bold text-white text-sm">Rp {totalPlafon.toLocaleString('id-ID')}</span>
                                </div>
                                <div className="flex justify-between items-center text-emerald-400 font-bold border-t border-slate-800 pt-2 text-sm">
                                  <span>Total Hasil Cair Bersih (Net):</span>
                                  <span>Rp {totalNetCair.toLocaleString('id-ID')}</span>
                                </div>
                              </div>
                              <div className="space-y-2 pl-2">
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pb-1 border-b border-slate-800">Uraian Potongan (Kantor Return)</div>
                                <div className="flex justify-between items-center text-slate-400">
                                  <span>Potongan Sisa Piutang:</span>
                                  <span className="text-rose-400">- Rp {totalSisaPiutang.toLocaleString('id-ID')}</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-400">
                                  <span>Uang Pangkal (UP) Baru:</span>
                                  <span className="text-slate-200">- Rp {totalUP.toLocaleString('id-ID')}</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-400">
                                  <span>Pemotongan Deposito Wajib SAK:</span>
                                  <span className="text-slate-200">- Rp {totalDeposito.toLocaleString('id-ID')}</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-400">
                                  <span>Biaya Administrasi Flat Kantor:</span>
                                  <span className="text-slate-200">- Rp {totalAdmin.toLocaleString('id-ID')}</span>
                                </div>
                                <div className="flex justify-between items-center text-indigo-400 font-bold border-t border-slate-800 pt-2 text-sm">
                                  <span>Total Kembali Ke Kantor:</span>
                                  <span>Rp {totalKantorDeducted.toLocaleString('id-ID')}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* BAGIAN 6: UPLOAD BUKTI */}
                      <div className="space-y-3" id="form_pencairan_bagian_6">
                        <div className="flex items-center gap-1.5 pb-1 border-b border-slate-100">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white font-mono text-[10px] font-bold">6</span>
                          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Bagian 6: Upload Bukti Kelengkapan</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                          <div className="space-y-2">
                            <span className="text-[11px] font-bold text-slate-505 block">Foto Selfie bersama Seluruh Anggota Kelompok</span>
                            <div className="flex items-center gap-3">
                              <label className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 shadow-2xs transition">
                                <Camera size={14} />
                                Pilih Foto Bukti Selfie
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={e => {
                                    if (e.target.files && e.target.files[0]) {
                                      handleSelfieUpload(e.target.files[0]);
                                    }
                                  }}
                                  className="hidden"
                                  disabled={disburseUploading}
                                />
                              </label>
                              {disburseUploading && (
                                <span className="text-xs text-slate-500 font-medium animate-pulse">Menghubungi Google Cloud Storage...</span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 leading-normal">Kewajiban SOP audit SAK: Mengunggah swafoto formal bersama anggota kelompok di lokasi balai dewan/tempat disburse diselenggarakan.</p>
                          </div>
                          <div className="p-3 border border-slate-200 rounded-xl bg-slate-50 h-32 flex items-center justify-center overflow-hidden">
                            {disburseSelfieUrl ? (
                              <div className="relative w-full h-full">
                                <img
                                  src={disburseSelfieUrl}
                                  alt="Selfie Bukti Pencairan"
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover rounded-lg"
                                />
                                <span className="absolute bottom-1 right-1 bg-indigo-600 text-white text-[8px] font-bold font-mono px-1 rounded uppercase tracking-wider">GCS SECURE LINK</span>
                              </div>
                            ) : (
                              <div className="text-center text-slate-400 space-y-1">
                                <Image size={24} className="mx-auto" />
                                <span className="text-[10px] font-bold block font-sans">Preview Bukti GCS Kosong</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Form Action Submit */}
                      <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3" id="form_pencairan_actions">
                        <button
                          type="button"
                          onClick={() => {
                            setDisburseGroupId('');
                            setDisburseCancelledMembers({});
                            setDisburseSelfieUrl('');
                            setDisburseSopCheck(false);
                          }}
                          className="px-4 py-2 border border-slate-200 hover:bg-blue-50/80 text-slate-600 font-bold font-mono text-xs rounded-xl transition"
                        >
                          Reset Formulir SAK
                        </button>
                        <button
                          type="submit"
                          disabled={state?.customers.filter(c => c.group_id === disburseGroupId && c.status === 'LAYAK_CAIR').length === 0 || !disburseSopCheck || disburseUploading}
                          className={`px-5 py-2.5 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 shadow-sm transition ${
                            state?.customers.filter(c => c.group_id === disburseGroupId && c.status === 'LAYAK_CAIR').length === 0 || !disburseSopCheck || disburseUploading
                              ? "bg-slate-100 text-slate-400 cursor-not-allowed border" 
                              : "bg-slate-900 border border-slate-950 text-white hover:bg-slate-800"
                          }`}
                        >
                          <Coins size={14} />
                          Selesaikan & Cairkan Dana Kolektif SAK
                        </button>
                      </div>
                    </form>
                  )}

                  {/* LOG TRANSACTION HISTORY */}
                  <div className="space-y-3" id="disbursement_archives_container">
                    <div className="border-b border-slate-100 pb-1.5 flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-505 uppercase tracking-widest font-mono">Arsip Sejarah Pencairan Kolektif (Audit Jurnal)</h3>
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] text-slate-500 font-semibold">{state?.disbursements?.length || 0} Pencairan</span>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white text-xs">
                      <table className="w-full text-left font-sans" id="disbursements_history_table">
                        <thead className="bg-slate-50 border-b">
                          <tr>
                            <th className="py-2 px-3">ID Log</th>
                            <th className="py-2 px-3">Kelompok Pinjaman</th>
                            <th className="py-2 px-3">Petugas Penjawab</th>
                            <th className="py-2 px-3">Hari Tagih</th>
                            <th className="py-2 px-3 text-right">Gross Plafon</th>
                            <th className="py-2 px-3 text-right">Potongan SAK</th>
                            <th className="py-2 px-3 text-center">Foto Selfie (GCS)</th>
                            <th className="py-2 px-3 text-center font-mono">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150">
                          {!state?.disbursements || state.disbursements.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="py-8 text-center text-slate-405 font-medium">Belum ada transaksi pencairan kolektif yang terekam di sistem.</td>
                            </tr>
                          ) : (
                            state.disbursements.map(d => {
                              const petCair = state.users.find(u => u.id === d.petugas_pencairan_id)?.nama || 'Unknown';
                              const petTagih = state.users.find(u => u.id === d.petugas_penagihan_id)?.nama || 'Unknown';
                              
                              return (
                                <tr key={d.id} className="hover:bg-blue-50/80/50">
                                  <td className="py-2.5 px-3 font-mono font-bold text-slate-600">{d.id}</td>
                                  <td className="py-2.5 px-3">
                                    <div className="font-bold text-slate-900">{d.nama_kelompok}</div>
                                    <span className="text-[10px] text-slate-400 font-mono">Kelompok Code: {d.id_kelompok} | Cair: {d.jumlah_anggota_cair} Orang</span>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="text-slate-700">Cair oleh: <strong>{petCair}</strong></div>
                                    <div className="text-[10px] text-slate-500">Penagih: <strong>{petTagih}</strong></div>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-150 rounded font-bold text-[10px]">{d.hari_penagihan}</span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                                    Rp {Number(d.total_pencairan_kotor).toLocaleString('id-ID')}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-slate-600 space-y-0.5">
                                    <div>Dep: Rp {Number(d.potongan_deposito).toLocaleString('id-ID')}</div>
                                    <div>Adm: Rp {Number(d.potongan_administrasi).toLocaleString('id-ID')}</div>
                                    {Number(d.potongan_up) > 0 && <div>UP: Rp {Number(d.potongan_up).toLocaleString('id-ID')}</div>}
                                    {Number(d.potongan_sisa_piutang) > 0 && <div>Sisa: Rp {Number(d.potongan_sisa_piutang).toLocaleString('id-ID')}</div>}
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    {d.foto_selfie_pencairan ? (
                                      <a
                                        href={d.foto_selfie_pencairan}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-2 py-0.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded text-[10px] font-bold border border-indigo-200 inline-flex items-center gap-1.5"
                                      >
                                        <Camera size={11} />
                                        Lihat GCS
                                      </a>
                                    ) : (
                                      <span className="text-slate-400 italic font-mono">-</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <a
                                      href={`/api/pencairan/${d.id}/cetak-spk`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-150 rounded font-bold text-[10.5px] inline-flex items-center gap-1 transition cursor-pointer decoration-none"
                                      title="Cetak SPK & Kuitansi (PDF)"
                                    >
                                      <Printer size={11} />
                                      <span>Cetak SPK</span>
                                    </a>
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

              {/* MENU 3B: INFO PENCAIRAN (READ-ONLY) - MOBILE DEVICE FOR PETUGAS */}
              {activeTab === 'info_pencairan' && (
                <div className="space-y-6" id="info_pencairan_tab_view">
                  <div className="border-b border-indigo-100 pb-4 bg-gradient-to-r from-slate-900 to-indigo-950 p-6 rounded-2xl text-white shadow-sm shadow-indigo-950/20">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="px-2 py-0.5 bg-indigo-500 text-white rounded text-[9px] font-bold font-mono uppercase tracking-widest">Aplikasi Mobile R/O</span>
                      <span className="px-2 py-0.5 bg-indigo-450/20 text-indigo-300 border border-indigo-500/30 rounded text-[9px] font-bold font-mono uppercase">Audit Ready</span>
                    </div>
                    <h2 className="text-xl font-black font-display flex items-center gap-2">
                      <span>📱 Rincian Pencairan Dana Lapangan (Petugas Only)</span>
                    </h2>
                    <p className="text-xs text-indigo-200 mt-1 max-w-2xl leading-relaxed font-sans">
                      Sesuai prosedur SAK Mandiri dan RBAC, layar ini disediakan khusus untuk **Petugas Lapangan** sebagai acuan serah terima dana fisik di balai kelompok, bersifat **100% Read-Only** untuk mencegah manipulasi data di lapangan.
                    </p>
                  </div>

                  {/* Summary grid of what matches the logged-in petugas */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="petugas_info_stats_grid">
                    <div className="bg-white border rounded-xl p-4 space-y-1 shadow-xs">
                      <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">Tugas Pencairan Kelompok</span>
                      <div className="text-xl font-black text-slate-800">
                        {state?.disbursements?.length || 0} Kelompok
                      </div>
                    </div>
                    <div className="bg-white border rounded-xl p-4 space-y-1 shadow-xs">
                      <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">Tugas Rutinitas Penagihan</span>
                      <div className="text-xl font-black text-slate-800">
                        {state?.disbursements?.length || 0} Rute Kelompok
                      </div>
                    </div>
                    <div className="bg-white border rounded-xl p-4 space-y-1 shadow-xs">
                      <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">Total Dana Tersalurkan</span>
                      <div className="text-xl font-black text-emerald-600">
                        Rp {state?.disbursements?.reduce((sum, d) => sum + Number(d.total_pencairan_kotor), 0).toLocaleString('id-ID') || 0}
                      </div>
                    </div>
                  </div>

                  {/* Table List of disbursements for the Petugas */}
                  <div className="space-y-3" id="petugas_readonly_pencairan_list">
                    <h3 className="text-xs font-bold text-slate-505 uppercase tracking-widest font-mono">Daftar Serah Terima Dana Kelompok</h3>
                    
                    <div className="space-y-4">
                      {!state?.disbursements || state.disbursements.length === 0 ? (
                        <div className="p-8 bg-slate-50 border border-dashed rounded-2xl text-center text-slate-405 font-medium">
                          Tidak ada surat pencairan yang diterbitkan oleh Admin untuk kelompok Anda hari ini.
                        </div>
                      ) : (
                        state.disbursements.map(disb => {
                          return (
                            <div key={disb.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4 hover:border-indigo-200 transition" id={`mobile_disb_card_${disb.id}`}>
                              {/* Header Card */}
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                                <div>
                                  <span className="text-[10px] font-mono bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded text-indigo-700 font-bold tracking-wide">
                                    KELOMPOK: {disb.nama_kelompok}
                                  </span>
                                  <h4 className="text-sm font-bold text-slate-900 mt-1 font-display">Kode Kelompok: {disb.id_kelompok}</h4>
                                </div>
                                <div className="flex flex-wrap gap-1.5 items-center">
                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-605 rounded text-[10px] font-mono">
                                    Hari Tagih: <strong>{disb.hari_penagihan}</strong>
                                  </span>
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-mono font-bold">
                                    {disb.jumlah_anggota_cair} Orang Cair
                                  </span>
                                </div>
                              </div>

                              {/* Details Grid */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-sans">
                                <div className="space-y-1">
                                  <span className="text-slate-400 font-mono text-[10px] uppercase font-bold tracking-wider">Perhitungan Finansial SAK</span>
                                  <div className="text-slate-805 leading-relaxed">
                                    <div>Plafon Kotor: <span className="font-bold font-mono">Rp {Number(disb.total_pencairan_kotor).toLocaleString('id-ID')}</span></div>
                                    <div>Potongan Sisa Piutang: <span className="font-bold font-mono text-rose-600">Rp {Number(disb.potongan_sisa_piutang).toLocaleString('id-ID')}</span></div>
                                    <div>Potongan Uang Pangkal: <span className="font-bold font-mono">Rp {Number(disb.potongan_up).toLocaleString('id-ID')}</span></div>
                                    <div>Setor Deposito Wajib: <span className="font-bold font-mono">Rp {Number(disb.potongan_deposito).toLocaleString('id-ID')}</span></div>
                                    <div>Kontribusi Adm: <span className="font-bold font-mono">Rp {Number(disb.potongan_administrasi).toLocaleString('id-ID')}</span></div>
                                  </div>
                                </div>
                                
                                <div className="space-y-1">
                                  <span className="text-slate-400 font-mono text-[10px] uppercase font-bold tracking-wider">Rencana Angsuran</span>
                                  <div className="text-slate-805 space-y-0.5 leading-relaxed">
                                    <div>Angsuran Pokok: <span className="font-bold font-mono">Rp 100.000 / minggu</span></div>
                                    <div>Tenor Pinjaman: <span className="font-bold font-mono">50 Minggu</span></div>
                                    <div className="text-[10px] text-indigo-600 font-bold">Automatic Billing Jurnal SAK: Terbit</div>
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <span className="text-slate-400 font-mono text-[10px] uppercase font-bold tracking-wider">Verifikasi Berkas dng GCS</span>
                                  <div className="space-y-2">
                                    <div className="text-[10px] text-slate-500">Bukti penyerahan fisik disetujui Admin disinkronkan ke Cloud GCS:</div>
                                    {disb.foto_selfie_pencairan ? (
                                      <div className="flex items-center gap-2">
                                        <div className="w-10 h-10 border rounded overflow-hidden">
                                          <img
                                            src={disb.foto_selfie_pencairan}
                                            alt="GCS selfie"
                                            referrerPolicy="no-referrer"
                                            className="w-full h-full object-cover"
                                          />
                                        </div>
                                        <a 
                                          href={disb.foto_selfie_pencairan} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="text-[10px] font-bold text-indigo-600 hover:underline inline-flex items-center gap-1"
                                        >
                                          <Camera size={10} />
                                          Lihat selfie (GCS Link)
                                        </a>
                                      </div>
                                    ) : (
                                      <div className="text-[10px] text-slate-400 italic">Bukti foto tidak diunggah</div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Alert read-only reminder */}
                              <div className="pt-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-[10px] text-slate-500 font-mono flex items-center gap-1.5 leading-normal">
                                <Info size={11} className="text-indigo-400 shrink-0" />
                                <span>KETERANGAN ONLINE: Seluruh rincian pencairan dana ini bersifat mutlak dan telah sah didepositkan secara real-time ke database pusat.</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* MENU: TRACKING UANG PANGKAL (UP) */}
              {activeTab === 'tracking_up' && (
                <div className="space-y-6" id="tracking_up_view">
                  <div className="border-b border-slate-150 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 font-display">Tracking Potongan Uang Pangkal (UP)</h2>
                      <p className="text-xs text-slate-500">Mata rantai pencatatan dana Uang Pangkal dari anggota baru yang dipotong saat pencairan dana pembiayaan mikro.</p>
                    </div>
                    {/* Date filter & Search panel */}
                    <div className="flex flex-wrap gap-2 items-center text-xs">
                      <div className="flex items-center gap-1">
                        <label className="text-slate-505 font-bold">Mulai:</label>
                        <input
                          type="date"
                          value={trackingUpStartDate}
                          onChange={e => setTrackingUpStartDate(e.target.value)}
                          className="px-2 py-1.5 border border-slate-200 rounded font-semibold bg-white text-slate-705"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <label className="text-slate-505 font-bold">Akhir:</label>
                        <input
                          type="date"
                          value={trackingUpEndDate}
                          onChange={e => setTrackingUpEndDate(e.target.value)}
                          className="px-2 py-1.5 border border-slate-200 rounded font-semibold bg-white text-slate-705"
                        />
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Cari Nasabah / Kelompok..."
                          value={trackingUpSearch}
                          onChange={e => setTrackingUpSearch(e.target.value)}
                          className="pl-8 pr-3 py-1.5 border border-slate-200 rounded w-52 text-xs bg-white text-slate-705"
                        />
                        <Search className="absolute left-2.5 top-2.5 text-slate-400" size={13} />
                      </div>
                      <button
                        onClick={() => {
                          setTrackingUpSearch('');
                          setTrackingUpStartDate('');
                          setTrackingUpEndDate('');
                        }}
                        className="px-2.5 py-1.5 bg-slate-105 hover:bg-slate-200 text-slate-600 rounded font-bold transition"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric Block */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-indigo-50 border border-indigo-150 rounded-xl flex items-center gap-3 shadow-2xs">
                      <div className="p-2.5 bg-indigo-600 text-white rounded-lg">
                        <Coins size={20} />
                      </div>
                      <div>
                        <div className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">Total Akumulasi UP</div>
                        <div className="text-xl font-black text-indigo-950">Rp {trackingUpTotal.toLocaleString('id-ID')}</div>
                      </div>
                    </div>
                    <div className="p-4 bg-slate-50 border border-slate-150 rounded-xl flex items-center gap-3">
                      <div className="p-2.5 bg-slate-600 text-white rounded-lg">
                        <Users size={20} />
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Anggota Baru Terpotong</div>
                        <div className="text-xl font-black text-slate-800">{trackingUpData.length} Nasabah</div>
                      </div>
                    </div>
                    <div className="p-4 bg-slate-50 border border-slate-150 rounded-xl flex items-center gap-3">
                      <div className="p-2.5 bg-amber-600 text-white rounded-lg">
                        <ClipboardCheck size={20} />
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Rata-rata UP per Anggota</div>
                        <div className="text-xl font-black text-slate-800">
                          Rp {trackingUpData.length > 0 ? Math.round(trackingUpTotal / trackingUpData.length).toLocaleString('id-ID') : '0'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Data Table */}
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-mono tracking-wider border-b">
                        <tr>
                          <th className="py-3 px-4 text-center w-12 border-r">No</th>
                          <th className="py-3 px-4">Nasabah</th>
                          <th className="py-3 px-4">Kelompok</th>
                          <th className="py-3 px-4">ID Pembiayaan</th>
                          <th className="py-3 px-4 text-center">Tanggal Potong</th>
                          <th className="py-3 px-4 text-right">Nominal UP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trackingUpLoading ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">Memuat data log Potongan UP...</td>
                          </tr>
                        ) : trackingUpData.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-400 font-bold">Tidak ada data potongan Uang Pangkal yang terekam.</td>
                          </tr>
                        ) : (
                          trackingUpData.map((item, idx) => (
                            <tr key={item.id} className="border-b border-slate-100 hover:bg-blue-50/80/80 transition">
                              <td className="py-3 px-4 text-center font-mono text-slate-400 border-r">{idx + 1}</td>
                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-900">{item.customer_name}</div>
                                <div className="text-[10px] text-slate-405 font-mono">NIK: {item.customer_nik}</div>
                              </td>
                              <td className="py-3 px-4 font-semibold text-slate-707">{item.group_name}</td>
                              <td className="py-3 px-4 font-mono text-slate-505 text-[11px]">{item.loan_id}</td>
                              <td className="py-3 px-4 text-center font-mono text-slate-606">
                                {new Date(item.tanggal_potong).toLocaleDateString('id-ID', {
                                  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                })}
                              </td>
                              <td className="py-3 px-4 text-right font-black text-indigo-707">Rp {Number(item.nominal).toLocaleString('id-ID')}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* MENU: TRACKING DEPOSITO */}
              {activeTab === 'tracking_deposito' && (
                <div className="space-y-6" id="tracking_deposito_view">
                  <div className="border-b border-slate-150 pb-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 font-display">Tracking Deposito Anggota (HOLD / RELEASED)</h2>
                      <p className="text-xs text-slate-500">Mata rantai penahanan dana simpanan wajib nasabah sebesar Rp 250.000,- sebagai jaminan penjaminan mikro berjangka.</p>
                    </div>
                    {/* Filter Panel */}
                    <div className="flex flex-wrap gap-2 items-center text-xs">
                      <div className="flex items-center gap-1 font-semibold">
                        <label className="text-slate-505 font-bold">Status:</label>
                        <select
                          className="px-2 py-1.5 border border-slate-200 rounded bg-white text-slate-705 text-xs"
                          value={trackingDepStatus}
                          onChange={e => setTrackingDepStatus(e.target.value)}
                        >
                          <option value="ALL">Semua Dokumen</option>
                          <option value="HOLD">Sedang Ditahan (HOLD)</option>
                          <option value="RELEASED">Sudah Dikembalikan (RELEASED)</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-1">
                        <label className="text-slate-505 font-bold">Dari:</label>
                        <input
                          type="date"
                          value={trackingDepStartDate}
                          onChange={e => setTrackingDepStartDate(e.target.value)}
                          className="px-2 py-1.5 border border-slate-200 rounded font-semibold bg-white text-slate-750"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <label className="text-slate-505 font-bold">Hingga:</label>
                        <input
                          type="date"
                          value={trackingDepEndDate}
                          onChange={e => setTrackingDepEndDate(e.target.value)}
                          className="px-2 py-1.5 border border-slate-200 rounded font-semibold bg-white text-slate-750"
                        />
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Cari Nasabah / Kelompok..."
                          value={trackingDepSearch}
                          onChange={e => setTrackingDepSearch(e.target.value)}
                          className="pl-8 pr-3 py-1.5 border border-slate-200 rounded w-48 text-xs bg-white text-slate-755"
                        />
                        <Search className="absolute left-2.5 top-2.5 text-slate-400" size={13} />
                      </div>
                      <button
                        onClick={() => {
                          setTrackingDepSearch('');
                          setTrackingDepStartDate('');
                          setTrackingDepEndDate('');
                          setTrackingDepStatus('ALL');
                        }}
                        className="px-2.5 py-1.5 bg-slate-105 hover:bg-slate-200 text-slate-600 rounded font-bold transition"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  {/* Highlight Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-3">
                      <div className="p-2.5 bg-amber-600 text-white rounded-lg">
                        <Lock size={18} />
                      </div>
                      <div>
                        <div className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Total Ditahan (HOLD)</div>
                        <div className="text-lg font-black text-amber-950">
                          Rp {trackingDepData.filter(d => d.status === 'HOLD').reduce((sum, d) => sum + Number(d.nominal), 0).toLocaleString('id-ID')}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3">
                      <div className="p-2.5 bg-emerald-600 text-white rounded-lg">
                        <Unlock size={18} />
                      </div>
                      <div>
                        <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Total Dikembalikan</div>
                        <div className="text-lg font-black text-emerald-950">
                          Rp {trackingDepData.filter(d => d.status === 'RELEASED').reduce((sum, d) => sum + Number(d.nominal), 0).toLocaleString('id-ID')}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-red-50 border border-red-150 rounded-xl flex items-center gap-3">
                      <div className="p-2.5 bg-red-600 text-white rounded-lg animate-pulse">
                        <AlertCircle size={18} />
                      </div>
                      <div>
                        <div className="text-[10px] text-red-600 font-bold uppercase tracking-wider">Maturity Jatuh Tempo</div>
                        <div className="text-lg font-black text-red-950">
                          {trackingDepData.filter(d => d.status === 'HOLD' && new Date(d.tanggal_jatuh_tempo) <= new Date()).length} Deposito
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 border border-slate-150 rounded-xl flex items-center gap-3">
                      <div className="p-2.5 bg-slate-600 text-white rounded-lg">
                        <Layers size={18} />
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Buku Deposito</div>
                        <div className="text-lg font-black text-slate-800">{trackingDepData.length} Rekor</div>
                      </div>
                    </div>
                  </div>

                  {/* TAB & BULK ACTION BAR */}
                  <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <div className="flex bg-slate-200/60 p-1 rounded-lg self-start text-xs font-semibold gap-1">
                      <button
                        onClick={() => {
                          setTrackingDepTab('all');
                          setTrackingDepStatus('ALL');
                        }}
                        className={`px-3 py-1.5 rounded-md font-bold transition-all duration-200 ${
                          trackingDepTab === 'all'
                            ? 'bg-white text-slate-900 shadow-3xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Semua Deposito ({trackingDepData.length})
                      </button>
                      <button
                        onClick={() => {
                          setTrackingDepTab('due_this_month');
                          setTrackingDepStatus('HOLD');
                        }}
                        className={`px-3 py-1.5 rounded-md font-bold transition-all duration-200 flex items-center gap-1.5 ${
                          trackingDepTab === 'due_this_month'
                            ? 'bg-indigo-600 text-white shadow-3xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <AlertCircle size={13} />
                        Jatuh Tempo Bulan Ini ({
                          trackingDepData.filter(d => {
                            if (d.status !== 'HOLD') return false;
                            const dDate = new Date(d.tanggal_jatuh_tempo);
                            const today = new Date();
                            return dDate.getMonth() === today.getMonth() && dDate.getFullYear() === today.getFullYear();
                          }).length
                        })
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const currentFiltered = trackingDepData.filter(item => {
                            if (trackingDepTab === 'due_this_month') {
                              if (item.status !== 'HOLD') return false;
                              const dDate = new Date(item.tanggal_jatuh_tempo);
                              const today = new Date();
                              return dDate.getMonth() === today.getMonth() && dDate.getFullYear() === today.getFullYear();
                            }
                            return true;
                          });
                          handleExportBankTransfer(currentFiltered);
                        }}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-505 text-white font-bold text-xs rounded-lg shadow-sm hover:shadow transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download size={14} />
                        Export Format Transfer Bank
                      </button>
                    </div>
                  </div>

                  {/* Core Table Grid */}
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-mono tracking-wider border-b">
                        <tr>
                          <th className="py-3 px-4 border-r text-center w-12">No</th>
                          <th className="py-3 px-4">Nama Anggota</th>
                          <th className="py-3 px-4">Kelompok</th>
                          <th className="py-3 px-4 text-right">Nominal SAK</th>
                          <th className="py-3 px-4 text-center">Masa Penahanan</th>
                          <th className="py-3 px-3 text-center">Status</th>
                          <th className="py-3 px-4 text-center">Alur Jatuh Tempo</th>
                          <th className="py-3 px-4 text-center w-40">Aksi Rilis</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trackingDepLoading ? (
                          <tr>
                            <td colSpan={8} className="py-8 text-center text-slate-400 font-medium">Memuat data log Simpanan Deposito...</td>
                          </tr>
                        ) : (() => {
                          const displayedDeposits = trackingDepData.filter(item => {
                            if (trackingDepTab === 'due_this_month') {
                              if (item.status !== 'HOLD') return false;
                              const dDate = new Date(item.tanggal_jatuh_tempo);
                              const today = new Date();
                              return dDate.getMonth() === today.getMonth() && dDate.getFullYear() === today.getFullYear();
                            }
                            return true;
                          });

                          if (displayedDeposits.length === 0) {
                            return (
                              <tr>
                                <td colSpan={8} className="py-8 text-center text-slate-400 font-bold">
                                  {trackingDepTab === 'due_this_month'
                                    ? "Tidak ada data deposito HOLD yang jatuh tempo di bulan berjalan."
                                    : "Tidak ada data penahanan deposito yang terekam."}
                                </td>
                              </tr>
                            );
                          }

                          return displayedDeposits.map((item, idx) => {
                            const isHold = item.status === 'HOLD';
                            const jTempDate = new Date(item.tanggal_jatuh_tempo);
                            const tglPotong = new Date(item.tanggal_potong);
                            const today = new Date();
                            const diffDays = Math.ceil((jTempDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
                            const isPast = diffDays <= 0;
                            const isNearStr = diffDays > 0 && diffDays <= 30;

                            return (
                              <tr key={item.id} className={`border-b border-slate-100 hover:bg-blue-50/80/85 transition ${
                                isHold && isPast ? 'bg-red-50/30' : (isHold && isNearStr ? 'bg-amber-50/30' : '')
                              }`}>
                                <td className="py-3 px-4 text-center font-mono text-slate-400 border-r">{idx + 1}</td>
                                <td className="py-3 px-4">
                                  <div className="font-bold text-slate-950 flex flex-col sm:flex-row sm:items-center gap-1.5">
                                    <span>{item.customer_name}</span>
                                    {item.has_tunggakan && (
                                      <span className="px-1.5 py-0.5 bg-rose-100 text-rose-800 text-[9px] font-bold rounded border border-rose-200 inline-flex items-center gap-0.5 whitespace-nowrap animate-pulse">
                                        ⚠️ Perhatian: Nasabah Memiliki Tunggakan
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono">ID: {item.customer_id}</div>
                                </td>
                                <td className="py-3 px-4 font-semibold text-slate-707">{item.group_name}</td>
                                <td className="py-3 px-4 text-right font-bold text-slate-900">Rp {Number(item.nominal).toLocaleString('id-ID')}</td>
                                <td className="py-3 px-4 text-center font-mono text-slate-606">
                                  <div>{tglPotong.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
                                  <div className="text-[10px] text-slate-404">s/d</div>
                                  <div>{jTempDate.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {isHold ? (
                                    <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-[9px] font-bold rounded-full border border-amber-250 inline-flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                      DITAHAN
                                    </span>
                                  ) : (
                                    <span className="px-2.5 py-1 bg-green-150 text-green-800 text-[9px] font-bold rounded-full border border-green-250 inline-flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                      RELEASED
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-center font-bold">
                                  {isHold && isPast && (
                                    <span className="px-2 py-1 bg-rose-100 text-rose-800 text-[9px] rounded font-mono inline-block border border-rose-250 animate-bounce">
                                      PASSED ({Math.abs(diffDays)} hari)
                                    </span>
                                  )}
                                  {isHold && isNearStr && (
                                    <span className="px-2 py-1 bg-yellow-105 text-yellow-850 text-[9px] rounded font-mono inline-block border border-yellow-250">
                                      NEAR ({diffDays} hr lagi)
                                    </span>
                                  )}
                                  {isHold && !isPast && !isNearStr && (
                                    <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-[9px] rounded font-mono inline-block border border-indigo-150">
                                      AKTIF ({diffDays} hr sisa)
                                    </span>
                                  )}
                                  {!isHold && (
                                    <span className="text-slate-400 font-medium italic text-[10px]">Telah lunas dikembalikan</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  {isHold ? (
                                    <button
                                      id={`btn_release_dep_${item.id}`}
                                      onClick={() => {
                                        setDepReleaseConfirmItem(item);
                                        setDoubleConfirmChecked1(false);
                                        setDoubleConfirmChecked2(false);
                                      }}
                                      title={
                                        item.has_tunggakan
                                          ? "⚠️ Perhatian: Nasabah memiliki tunggakan! Konseptual manual override dengan konfirmasi ganda."
                                          : item.has_active_loan
                                            ? "Perhatian: Nasabah memiliki pinjaman aktif."
                                            : "Kembalikan dana jaminan deposito"
                                      }
                                      className={`py-1 px-2.5 font-bold text-[10px] rounded shadow-xs transition inline-flex items-center gap-1 cursor-pointer ${
                                        item.has_tunggakan
                                          ? 'bg-rose-600 hover:bg-rose-500 text-white'
                                          : item.has_active_loan
                                            ? 'bg-amber-600 hover:bg-amber-500 text-white'
                                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                      }`}
                                    >
                                      <Unlock size={11} />
                                      {item.has_tunggakan 
                                        ? "Rilis (Ada Tunggakan)" 
                                        : item.has_active_loan 
                                          ? "Rilis (Ada Pinjaman)" 
                                          : "Kembalikan (Release)"}
                                    </button>
                                  ) : (
                                    <span className="text-slate-400 font-bold text-[11px] inline-flex items-center gap-1">
                                      ✓ Selesai
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* DUAL CONFIRMATION OVERRIDE MODAL */}
                  {depReleaseConfirmItem && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[1000] flex items-center justify-center p-4">
                      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl max-w-lg w-full space-y-4 animate-scale-in">
                        <div className="flex items-start gap-3">
                          <div className={`p-2.5 rounded-full ${
                            depReleaseConfirmItem.has_tunggakan 
                              ? 'bg-rose-50 text-rose-600 border border-rose-100' 
                              : depReleaseConfirmItem.has_active_loan 
                                ? 'bg-amber-50 text-amber-600 border border-amber-100'
                                : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                          }`}>
                            <AlertCircle size={24} />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-sm font-bold text-slate-900 font-display">
                              Konfirmasi Manual Pengembalian Deposito (Manual Override)
                            </h3>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Pelepasan dana jaminan SAK Deposito untuk Nasabah: <strong className="text-slate-800">{depReleaseConfirmItem.customer_name}</strong> (ID: {depReleaseConfirmItem.customer_id})
                            </p>
                          </div>
                        </div>

                        {/* WARNING CALLOUTS */}
                        {depReleaseConfirmItem.has_tunggakan ? (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-1">
                            <div className="text-red-800 font-bold text-xs flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>
                              STATUS KRITIS: Nasabah Memiliki Tunggakan Kredit!
                            </div>
                            <p className="text-[11px] text-red-700 leading-relaxed">
                              Sistem mendeteksi nasabah memiliki <strong>{depReleaseConfirmItem.overdue_count || "beberapa"} jadwal tagihan yang tertunggak (Overdue)</strong>. Berdasarkan kebijakan tata kelola, saldo deposito harus tetap terekam utuh dan <strong>TIDAK BOLEH dipotong otomatis (auto-debet) untuk melunasi tunggakan tersebut</strong>. Segala pelepasan harus melalui verifikasi SOP lapangan secara ketat.
                            </p>
                          </div>
                        ) : depReleaseConfirmItem.has_active_loan ? (
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                            <div className="text-amber-800 font-bold text-xs flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse"></span>
                              PERINGATAN: Nasabah Memiliki Pinjaman Aktif
                            </div>
                            <p className="text-[11px] text-amber-700 leading-relaxed">
                              Meskipun saat ini tidak terekam jadwal tunggakan yang tertunda, nasabah masih memiliki <strong>Pinjaman Aktif (ACTIVE_LOAN)</strong> yang belum lunas (PAID_OFF). Memulangkan dana titipan deposito sebelum pinjaman lunas meningkatkan risiko gagal bayar di masa mendatang.
                            </p>
                          </div>
                        ) : (
                          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl space-y-1">
                            <div className="text-emerald-800 font-bold text-xs flex items-center gap-1.5">
                              ✓ Nasabah Berstatus Bersih (Clear)
                            </div>
                            <p className="text-[11px] text-emerald-700 leading-relaxed">
                              Nasabah tidak memiliki tunggakan murni murni dan tidak ada pinjaman aktif berisiko tinggi. Transaksi pelepasan ini aman diproses sesuai alur standar.
                            </p>
                          </div>
                        )}

                        {/* DOUBLE CHECKBOXES FOR MANDATORY SOP VERIFICATION */}
                        <div className="bg-slate-50 border border-slate-150 rounded-xl p-3.5 space-y-3">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                            Verifikasi Syarat & Ketentuan SOP Internal (Konfirmasi Ganda)
                          </div>
                          
                          <label className="flex gap-2.5 cursor-pointer items-start">
                            <input 
                              type="checkbox" 
                              checked={doubleConfirmChecked1} 
                              onChange={(e) => setDoubleConfirmChecked1(e.target.checked)}
                              className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className="text-[11px] text-slate-700 font-medium leading-normal select-none">
                              Saya menyatakan bahwa pengembalian jaminan ini telah melalui <strong>pemeriksaan SOP manual</strong> bersama Pimpinan/Supervisor Cabang dan penanganan tunggakan (jika ada) dilakukan terpisah secara manual tanpa menggunakan auto-debet saldo deposito.
                            </span>
                          </label>

                          <label className="flex gap-2.5 cursor-pointer items-start">
                            <input 
                              type="checkbox" 
                              checked={doubleConfirmChecked2} 
                              onChange={(e) => setDoubleConfirmChecked2(e.target.checked)}
                              className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className="text-[11px] text-slate-700 font-medium leading-normal select-none">
                              Saya mengonfirmasi pelepasan status HOLD dana senilai <strong>Rp {Number(depReleaseConfirmItem.nominal).toLocaleString('id-ID')}</strong> untuk ditransfer kembali ke nasabah, serta menyetujui pembuatan pencatatan jurnal akuntansi otomatis (Debit 2110, Kredit 1112).
                            </span>
                          </label>
                        </div>

                        {/* MODAL FOOTER ACTIONS */}
                        <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => {
                              setDepReleaseConfirmItem(null);
                              setDoubleConfirmChecked1(false);
                              setDoubleConfirmChecked2(false);
                            }}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            disabled={!doubleConfirmChecked1 || !doubleConfirmChecked2}
                            onClick={async () => {
                              const itemToRelease = depReleaseConfirmItem;
                              setDepReleaseConfirmItem(null);
                              setDoubleConfirmChecked1(false);
                              setDoubleConfirmChecked2(false);
                              await handleReleaseDeposit(itemToRelease.id);
                            }}
                            className={`px-4 py-1.5 text-xs font-bold rounded-lg shadow-xs transition flex items-center gap-1.5 ${
                              doubleConfirmChecked1 && doubleConfirmChecked2
                                ? 'bg-indigo-600 hover:bg-indigo-510 text-white cursor-pointer'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            <CheckCircle2 size={13} />
                            Ya, Tetap Cairkan Deposito (Override)
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MENU: TRACKING BIAYA ADMINISTRASI */}
              {activeTab === 'tracking_administrasi' && (
                <div className="space-y-6" id="tracking_administrasi_view">
                  <div className="border-b border-slate-150 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 font-display">Tracking Biaya Administrasi Kredit</h2>
                      <p className="text-xs text-slate-500">Mata rantai pencatatan dana administrasi tetap sebesar Rp 50.000,- yang dipotong saat pencairan pembiayaan.</p>
                    </div>
                    {/* Date filters and search query */}
                    <div className="flex flex-wrap gap-2 items-center text-xs">
                      <div className="flex items-center gap-1">
                        <label className="text-slate-505 font-bold">Mulai:</label>
                        <input
                          type="date"
                          value={trackingAdmStartDate}
                          onChange={e => setTrackingAdmStartDate(e.target.value)}
                          className="px-2 py-1.5 border border-slate-200 rounded font-semibold bg-white text-slate-705"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <label className="text-slate-505 font-bold">Akhir:</label>
                        <input
                          type="date"
                          value={trackingAdmEndDate}
                          onChange={e => setTrackingAdmEndDate(e.target.value)}
                          className="px-2 py-1.5 border border-slate-200 rounded font-semibold bg-white text-slate-705"
                        />
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Cari Nasabah / Kelompok..."
                          value={trackingAdmSearch}
                          onChange={e => setTrackingAdmSearch(e.target.value)}
                          className="pl-8 pr-3 py-1.5 border border-slate-200 rounded w-52 text-xs bg-white text-slate-705"
                        />
                        <Search className="absolute left-2.5 top-2.5 text-slate-400" size={13} />
                      </div>
                      <button
                        onClick={() => {
                          setTrackingAdmSearch('');
                          setTrackingAdmStartDate('');
                          setTrackingAdmEndDate('');
                        }}
                        className="px-2.5 py-1.5 bg-slate-105 hover:bg-slate-200 text-slate-605 rounded font-bold transition"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-teal-50 border border-teal-100 rounded-xl flex items-center gap-3 shadow-2xs">
                      <div className="p-2.5 bg-teal-600 text-white rounded-lg">
                        <BookOpen size={20} />
                      </div>
                      <div>
                        <div className="text-[10px] text-teal-600 font-bold uppercase tracking-wider">Total Pendapatan Administrasi</div>
                        <div className="text-xl font-black text-teal-950">Rp {trackingAdmTotal.toLocaleString('id-ID')}</div>
                      </div>
                    </div>
                    <div className="p-4 bg-slate-50 border border-slate-150 rounded-xl flex items-center gap-3">
                      <div className="p-2.5 bg-slate-600 text-white rounded-lg">
                        <Layers size={20} />
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Pemotongan Log</div>
                        <div className="text-xl font-black text-slate-800">{trackingAdmData.length} Kali</div>
                      </div>
                    </div>
                    <div className="p-4 bg-slate-50 border border-slate-150 rounded-xl flex items-center gap-3">
                      <div className="p-2.5 bg-violet-600 text-white rounded-lg">
                        <ClipboardCheck size={20} />
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Kontribusi Net per Berkas</div>
                        <div className="text-xl font-black text-slate-800">
                          Rp {trackingAdmData.length > 0 ? Math.round(trackingAdmTotal / trackingAdmData.length).toLocaleString('id-ID') : '0'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Core Collection Table */}
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-mono tracking-wider border-b">
                        <tr>
                          <th className="py-3 px-4 border-r text-center w-12">No</th>
                          <th className="py-3 px-4">Nama Nasabah</th>
                          <th className="py-3 px-4">Kelompok</th>
                          <th className="py-3 px-4">ID Pembiayaan</th>
                          <th className="py-3 px-4 text-center">Tanggal Transaksi</th>
                          <th className="py-3 px-4 text-right">Potongan Admin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trackingAdmLoading ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">Memuat data log Biaya Administrasi...</td>
                          </tr>
                        ) : trackingAdmData.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-400">Tidak ada data biaya admin yang terekam.</td>
                          </tr>
                        ) : (
                          trackingAdmData.map((item, idx) => (
                            <tr key={item.id} className="border-b border-slate-100 hover:bg-blue-50/80/80 transition">
                              <td className="py-3 px-4 text-center font-mono text-slate-400 border-r">{idx + 1}</td>
                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-900">{item.customer_name}</div>
                                <div className="text-[10px] text-slate-404 font-mono">NIK: {item.customer_nik}</div>
                              </td>
                              <td className="py-3 px-4 font-semibold text-slate-707">{item.group_name}</td>
                              <td className="py-3 px-4 font-mono text-slate-505 text-[11px]">{item.loan_id}</td>
                              <td className="py-3 px-4 text-center font-mono text-slate-606">
                                {new Date(item.tanggal_potong).toLocaleDateString('id-ID', {
                                  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                })}
                              </td>
                              <td className="py-3 px-4 text-right font-black text-teal-707">Rp {Number(item.nominal).toLocaleString('id-ID')}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* MODUL 6: PENAGIHAN - Mobile Offline first */}
              {activeTab === 'penagihan' && (
                <div className="space-y-6" id="penagihan_tab_view">
                  
                  {/* LEVEL 1: HEADER & ROUTE CALENDAR */}
                  <div className="flex flex-col gap-4 bg-slate-900 text-white p-5 rounded-2xl shadow-sm border border-slate-800" id="mobile_collection_header">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-850">
                      <div>
                        <h2 className="text-base font-black text-emerald-400 font-display uppercase tracking-tight flex items-center gap-2">
                          ⚡ Sirkulasi Penagihan Lapangan (PWA Mobile)
                        </h2>
                        <p className="text-xs text-slate-400 leading-relaxed font-sans mt-0.5">
                          Sinkronisasi penagihan angsuran kredit secara real-time dan luring (offline-first caching).
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isOffline && (
                          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] py-1 px-3 rounded-full font-mono font-bold flex items-center gap-1.5 animate-pulse">
                            <WifiOff size={11} /> App Sedang Offline
                          </span>
                        )}
                        {!isOffline && (
                          <span className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[10px] py-1 px-3 rounded-full font-mono font-bold flex items-center gap-1.5">
                            <Wifi size={11} /> App Online
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest font-black block">📅 JADWAL KOLEKSI BARANG BUKTI</span>
                        <div className="text-sm font-bold font-mono text-white">
                          Rute Hari ini: <span className="text-amber-400 font-sans text-sm font-black uppercase">{selectedMobileHari}</span>, {new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </div>
                      </div>
                      
                      {/* Connection Toggle & Queue Status */}
                      <div className="flex items-center gap-2 self-stretch sm:self-auto">
                        {offlineQueue && (
                          <div className="text-[10px] bg-amber-950/40 border border-amber-900/50 p-2 rounded-lg flex items-center gap-2">
                            <span className="text-amber-300 font-mono font-bold">
                              {offlineQueue.collections.length} Offline Queue
                            </span>
                            <button
                              onClick={handleOfflineSync}
                              className="px-2 py-1 bg-amber-500 text-slate-950 rounded text-[9px] font-bold uppercase tracking-wider hover:bg-amber-400 transition"
                            >
                              Sync Now
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* SPEC 1: Komponen Kalender (Time Now) - Read-Only Date Indicator */}
                  <div className="bg-white border p-4 rounded-xl shadow-xs space-y-2" id="time_now_calendar_indicator">
                    <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">
                      📅 PENUNJUK TANGGAL PENAGIHAN AKTIF (READ-ONLY)
                    </span>
                    <div className="relative w-full">
                      <span className="absolute left-3 top-3 text-slate-400">📅</span>
                      <input
                        type="text"
                        value={new Date().toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) + " (Waktu GPS Terkunci)"}
                        readOnly
                        disabled
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-100 border border-slate-200 text-slate-700 font-mono font-bold rounded-lg cursor-not-allowed text-xs focus:outline-none"
                        id="date_indicator_readonly_gps"
                        title="Tanggal harian terkunci otomatis demi keamanan"
                      />
                      <span className="absolute right-3 top-2.5 bg-slate-800 text-slate-200 text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded-full select-none">
                        🔐 Read-Only
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-450 leading-relaxed font-semibold">
                      *Proteksi Aktif: Petugas dilarang keras mengubah tanggal sirkulasi harian demi validitas laporan kasir lapangan.
                    </p>
                  </div>

                  {/* SPEC 2: Widget Ringkasan & Notifikasi Merah */}
                  {(() => {
                    const activeBranchFilter = activeBranch === 'ALL' ? undefined : activeBranch;
                    const filteredGroupsToday = (state?.groups || [])
                      .filter(grp => {
                        const matchesBranch = !activeBranchFilter || grp.kantor_cabang === activeBranchFilter;
                        const matchesDay = grp.hari_penagihan?.toUpperCase() === selectedMobileHari.toUpperCase();
                        return matchesBranch && matchesDay;
                      });

                    let totalTargetHariIni = 0;
                    let hasAnyTunggakanOrLari = false;

                    filteredGroupsToday.forEach(grp => {
                      const allMembers = (state?.customers || [])
                        .filter(c => c.group_id === grp.id && (c.status === 'ACTIVE_LOAN' || c.status === 'PAID_OFF' || c.status === 'MACET_KABUR'));
                      
                      const activeMembersOfGroup = allMembers.filter(m => m.status !== 'MACET_KABUR');

                      const groupBills = state?.billingSchedules.filter(b => b.status !== 'PAID' && activeMembersOfGroup.some(m => m.id === b.customer_id)) || [];
                      const expectedGroupAmount = groupBills.reduce((sum, b) => sum + b.total_tagihan, 0);
                      totalTargetHariIni += expectedGroupAmount;

                      // Check isM or isL or MACET_KABUR
                      allMembers.forEach(member => {
                        if (member.status === 'MACET_KABUR') {
                          hasAnyTunggakanOrLari = true;
                        }
                        const memberBill = state?.billingSchedules.find(b => b.customer_id === member.id && b.status !== 'PAID');
                        if (memberBill && (markedAbserMenunggak[memberBill.id] || markedLari[memberBill.id])) {
                          hasAnyTunggakanOrLari = true;
                        }
                      });
                    });

                    return (
                      <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-white p-5 rounded-2xl border border-indigo-950 shadow-md relative overflow-hidden" id="global_target_summary_widget">
                        {hasAnyTunggakanOrLari && (
                          <div className="absolute top-4 right-4 animate-bounce" id="global_warning_badge">
                            <span className="inline-flex items-center gap-1.5 bg-red-600 text-white font-extrabold text-[10px] sm:text-xs px-3.5 py-2 rounded-full border border-red-500 shadow-md">
                              ⚠️ Terdapat Tunggakan Tak Tertagih
                            </span>
                          </div>
                        )}
                        <div className="space-y-1">
                          <span className="text-[10px] font-mono tracking-widest text-slate-400 font-black uppercase block">
                            📊 KINERJA PORTAL LAPANGAN PETUGAS ({selectedMobileHari})
                          </span>
                          <h3 className="text-xs sm:text-sm font-semibold text-indigo-305">
                            Target Angsuran Semua Kelompok (Hari Ini)
                          </h3>
                          <div className="flex items-baseline gap-2 mt-2">
                            <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
                              Rp {totalTargetHariIni.toLocaleString('id-ID')}
                            </span>
                            <span className="text-xs text-slate-400 font-mono">
                              /{filteredGroupsToday.length} Kelompok Ditugaskan
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* WEEKDAY SELECTOR BAR FOR PROTOTYPE DRILLDOWN */}
                  <div className="bg-white border text-xs p-4 rounded-xl shadow-xs space-y-2.5">
                    <span className="block text-[10px] font-black text-slate-500 uppercase tracking-wider font-mono">📅 PILIH HARI UNTUK MEMINDAI RUTE PENAGIHAN PETUGAS:</span>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'].map((hari) => (
                        <button
                          key={hari}
                          onClick={() => {
                            setSelectedMobileHari(hari);
                            setSelectedMobileGroupId(null); // Reset detail view when day changes
                          }}
                          className={`py-2 px-1 text-center font-bold font-mono rounded-lg border transition text-xs ${
                            selectedMobileHari === hari
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                          }`}
                        >
                          {hari}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* LEVEL 2 & 3: COMPACT GROUP ACCORDION (IN-LINE ACCORDION OVERVIEW) */}
                  <div className="space-y-4" id="penagihan_groups_accordion">
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="text-[11px] font-mono font-black text-slate-400 uppercase tracking-wider">
                        Daftar Kelompok & Urutan Rute ({selectedMobileHari})
                      </span>
                      <span className="text-xs text-slate-500 font-mono font-medium">Urut Berdasarkan Rute</span>
                    </div>

                    {(() => {
                      const activeBranchFilter = activeBranch === 'ALL' ? undefined : activeBranch;
                      const filteredGroups = (state?.groups || [])
                        .filter(grp => {
                          const matchesBranch = !activeBranchFilter || grp.kantor_cabang === activeBranchFilter;
                          const matchesDay = grp.hari_penagihan?.toUpperCase() === selectedMobileHari.toUpperCase();
                          return matchesBranch && matchesDay;
                        })
                        .sort((a, b) => (a.urutan_rute || 1) - (b.urutan_rute || 1));

                      if (filteredGroups.length === 0) {
                        return (
                          <div className="bg-slate-50 border text-slate-500 p-8 rounded-xl text-center font-medium block">
                            Tidak ada rute penagihan kredit mikro kelompok yang dijadwalkan pada hari <strong className="text-slate-805 uppercase">{selectedMobileHari}</strong> untuk kantor cabang <strong className="text-indigo-650">{activeBranch}</strong>.
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-4">
                          {filteredGroups.map(grp => {
                            const isExpanded = !!expandedGroupIds[grp.id];

                            // All customers belonging to this group
                            const allGroupMembers = (state?.customers || [])
                              .filter(c => c.group_id === grp.id && (c.status === 'ACTIVE_LOAN' || c.status === 'PAID_OFF' || c.status === 'MACET_KABUR'));

                            // Present/active members (who will have input cards rendered)
                            const activeGroupMembers = allGroupMembers.filter(c => c.status !== 'MACET_KABUR');

                            // Find bills for active members of this group
                            const activeGroupBills = state?.billingSchedules.filter(b => b.status !== 'PAID' && activeGroupMembers.some(m => m.id === b.customer_id)) || [];
                            const activeBillsCount = activeGroupBills.length;
                            const totalExpectedGroup = activeGroupBills.reduce((sum, b) => sum + b.total_tagihan, 0);

                            const regionName = state?.regions.find(r => r.id === grp.region_id)?.name || grp.region_id || "Menunggu Pemetaan";

                            return (
                              <div
                                key={grp.id}
                                className="bg-white border border-slate-200 rounded-xl shadow-xs transition-all duration-300 overflow-hidden"
                                id={`accordion_group_container_${grp.id}`}
                              >
                                {/* ACCORDION HEADER (THE GROUP CARD) */}
                                <div
                                  onClick={() => {
                                    setExpandedGroupIds(prev => ({
                                      ...prev,
                                      [grp.id]: !prev[grp.id]
                                    }));
                                  }}
                                  className={`w-full text-left p-4 hover:bg-blue-50/80 transition flex items-center justify-between gap-4 cursor-pointer select-none ${isExpanded ? 'bg-slate-50/50 border-b border-slate-100' : ''}`}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-50 text-indigo-750 font-mono font-black text-xs flex items-center justify-center border border-indigo-200">
                                      {grp.urutan_rute || "1"}
                                    </div>
                                    <div className="min-w-0">
                                      <span className="text-[9px] font-mono tracking-wider font-extrabold text-slate-400 block uppercase">
                                        📍 {regionName}
                                      </span>
                                      <h4 className="text-slate-950 font-bold text-sm tracking-tight transition truncate flex items-center gap-1.5">
                                        {grp.name}
                                      </h4>
                                      <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[9.5px] font-mono text-slate-500 font-bold leading-none">
                                        <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-150 shadow-3xs flex items-center gap-0.5">
                                          🕒 Jam: {grp.jam_setoran || "10:00"}
                                        </span>
                                        <span className={grp.sistem_tanggung_renteng ? "bg-amber-50/60 text-amber-900 px-1.5 py-0.5 rounded border border-amber-250 shadow-3xs" : "bg-slate-50 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 shadow-3xs"}>
                                          {grp.sistem_tanggung_renteng ? "Tanggung Renteng" : "Kas Harian Individu"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex-shrink-0 text-right flex items-center gap-3.5">
                                    <div className="flex flex-col items-end gap-1">
                                      <div className="text-[8px] font-mono text-slate-400 uppercase font-black tracking-widest leading-none">Status</div>
                                      <div className={`text-[10px] font-mono font-bold leading-none px-2.5 py-1 rounded-full border ${
                                        activeBillsCount === 0
                                          ? 'bg-emerald-100 text-emerald-800 border-emerald-250 animate-pulse'
                                          : 'bg-rose-100 text-rose-800 border-rose-250'
                                      }`}>
                                        {activeBillsCount === 0 ? '✓ Selesai' : `⟳ ${activeBillsCount} Tagihan`}
                                      </div>
                                    </div>
                                    <ChevronDown
                                      size={18}
                                      className={`text-slate-400 transition-transform duration-300 transform ${isExpanded ? 'rotate-180 text-indigo-600' : ''}`}
                                    />
                                  </div>
                                </div>

                                {/* ACCORDION CONTENT (EXPANDED TO PREVENT PAGE SWITCHING) */}
                                {isExpanded && (
                                  <div className="bg-slate-50 border-t border-slate-150 p-4 space-y-4 animate-slideDown" id={`accordion_group_content_${grp.id}`}>
                                    {/* Group Stats & History Button */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-3xs items-center">
                                      <div className="text-left leading-none space-y-1">
                                        <span className="text-[9px] uppercase font-mono tracking-wider font-extrabold text-slate-400 block">Total Anggota</span>
                                        <span className="text-xs font-black text-slate-800">{activeGroupMembers.length} Aktif Lapangan (Sisa)</span>
                                      </div>
                                      <div className="text-left leading-none space-y-1">
                                        <span className="text-[9px] uppercase font-mono tracking-wider font-extrabold text-slate-400 block">Total Tagihan Hari Ini</span>
                                        <span className="text-xs font-mono font-black text-teal-700">Rp {totalExpectedGroup.toLocaleString('id-ID')}</span>
                                      </div>
                                      <div className="flex justify-end">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveHistoryGroup(grp);
                                          }}
                                          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 py-2 px-3.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 font-mono font-extrabold text-[10px] rounded-lg tracking-wide uppercase transition shadow-3xs cursor-pointer"
                                        >
                                          <History size={11} className="stroke-[2.5]" />
                                          📄 Riwayat Pembayaran Kelompok
                                        </button>
                                      </div>
                                    </div>

                                    {/* KOTAK TALANGAN TANGGUNG RENTENG */}
                                    {grp.sistem_tanggung_renteng && (() => {
                                      const absentOrLariList: { name: string; target: number; reason: string }[] = [];

                                      allGroupMembers.forEach(m => {
                                        const mBill = state?.billingSchedules.find(b => b.customer_id === m.id && b.status !== 'PAID');
                                        if (mBill) {
                                          const isM = markedAbserMenunggak[mBill.id];
                                          const isL = markedLari[mBill.id] || m.status === 'MACET_KABUR';
                                          if (isM) {
                                            absentOrLariList.push({ name: m.name, target: mBill.total_tagihan, reason: 'Absen/Menunggak' });
                                          } else if (isL) {
                                            absentOrLariList.push({ name: m.name, target: mBill.total_tagihan, reason: m.status === 'MACET_KABUR' ? 'Melarikan Diri (Permanen)' : 'Melarikan Diri (Lari)' });
                                          }
                                        }
                                      });

                                      if (absentOrLariList.length === 0) return null;

                                      const totalShortfall = absentOrLariList.reduce((sum, item) => sum + item.target, 0);
                                      const presentMembers = activeGroupMembers.filter(m => {
                                        const mBill = state?.billingSchedules.find(b => b.customer_id === m.id && b.status !== 'PAID');
                                        if (!mBill) return false;
                                        return !markedAbserMenunggak[mBill.id] && !markedLari[mBill.id];
                                      });
                                      const countPresent = presentMembers.length;
                                      const bailoutShare = countPresent > 0 ? Math.ceil(totalShortfall / countPresent) : 0;

                                      return (
                                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-3" id="tr_bailout_box">
                                          <div className="flex items-center gap-2">
                                            <span className="p-1 px-2 bg-rose-600 text-white font-mono text-[9px] font-bold rounded uppercase">Tanggung Renteng (TR)</span>
                                            <h4 className="text-xs font-bold text-rose-900 leading-none">Kotak Talangan Kolektif</h4>
                                          </div>
                                          <p className="text-xs text-rose-700 font-semibold leading-relaxed">
                                            Ditemukan <strong>{absentOrLariList.length} anggota</strong> berhalangan hadir atau melarikan diri. Total defisit angsuran kelompok yang harus ditalangi sisa anggota kelompok sebesar <strong className="font-mono text-rose-950 text-sm font-bold">Rp {totalShortfall.toLocaleString('id-ID')}</strong>.
                                          </p>

                                          <div className="border-t border-rose-100 pt-2 space-y-1">
                                            {absentOrLariList.map((item, idx) => (
                                              <div key={idx} className="flex justify-between items-center text-[10px] text-rose-800 font-medium">
                                                <span>• {item.name} ({item.reason})</span>
                                                <span className="font-mono font-bold">Rp {item.target.toLocaleString('id-ID')}</span>
                                              </div>
                                            ))}
                                          </div>

                                          <div className="bg-white border border-rose-200 rounded-lg p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                            <div className="space-y-0.5">
                                              <div className="text-[9px] text-slate-400 font-mono font-bold uppercase leading-none">Beban Talangan Sisa Anggota ({countPresent} Orang)</div>
                                              <div className="text-xs font-extrabold text-slate-800 font-mono font-semibold">Rp {bailoutShare.toLocaleString('id-ID')} / Anggota</div>
                                            </div>
                                            {countPresent > 0 && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const inputs = { ...paymentInputs };
                                                  const allocation = { ...surplusAllocation };
                                                  presentMembers.forEach(m => {
                                                    const mBill = state?.billingSchedules.find(b => b.customer_id === m.id && b.status !== 'PAID');
                                                    if (mBill) {
                                                      inputs[mBill.id] = mBill.total_tagihan + bailoutShare;
                                                      allocation[mBill.id] = bailoutShare;
                                                    }
                                                  });
                                                  setPaymentInputs(inputs);
                                                  setSurplusAllocation(allocation);
                                                  triggerSuccess(`Berhasil membagi beban talangan Rp ${bailoutShare.toLocaleString('id-ID')} bersama untuk ${countPresent} anggota!`);
                                                }}
                                                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-[10.5px] transition shadow-2xs flex items-center gap-1 cursor-pointer font-mono uppercase"
                                              >
                                                ⚡ Auto-Talangi Beban
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })()}

                                    {/* COMPACT MEMBERS LIST GIVING DIRECT CONTRAST - SPEC 3: Layout Vertikal */}
                                    <div className="flex flex-col gap-3">
                                      {activeGroupMembers.length === 0 ? (
                                        <div className="bg-slate-100 text-slate-500 p-8 rounded-xl text-center font-medium block">
                                          Tidak ada nasabah aktif dengan kredit bergulir di kelompok ini.
                                        </div>
                                      ) : (
                                        activeGroupMembers.map(member => {
                                          const memberSchedules = state?.billingSchedules.filter(b => b.customer_id === member.id) || [];
                                          const totalTerms = memberSchedules.length || 47;
                                          const paidTermsCount = memberSchedules.filter(b => b.status === 'PAID').length;

                                          // Only show ONE active unpaid bill schedule per customer card (The running bill week only!)
                                          const activeBill = memberSchedules
                                            .filter(b => b.status !== 'PAID')
                                            .sort((a, b) => a.term - b.term)[0];

                                          const isM = activeBill ? !!markedAbserMenunggak[activeBill.id] : false;
                                          const isL = activeBill ? !!markedLari[activeBill.id] : false;

                                          const piutangTakTertagih = memberSchedules
                                            .filter(b => b.status !== 'PAID' && (!activeBill || b.term < activeBill.term))
                                            .reduce((sum, b) => sum + (b.total_tagihan - (b.bayar_pokok + b.bayar_jasa)), 0);

                                          const currentVal = activeBill
                                            ? (paymentInputs[activeBill.id] !== undefined ? paymentInputs[activeBill.id] : activeBill.total_tagihan)
                                            : 0;

                                          const currentMethod = activeBill ? (paymentMethods[activeBill.id] || 'TUNAI') : 'TUNAI';

                                          return (
                                            <div
                                              key={member.id}
                                              className="bg-white rounded-xl border border-slate-200 p-4 shadow-3xs relative overflow-hidden group/card hover:border-slate-300 transition duration-200 flex flex-col justify-between gap-4"
                                            >
                                              {/* Absolute layout button for customer history popup */}
                                              <div className="absolute top-3 right-3">
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveHistoryCustomer(member);
                                                  }}
                                                  title="Lihat Riwayat Pembayaran Anggota"
                                                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-650 transition cursor-pointer"
                                                >
                                                  <History size={14} className="stroke-[2.5]" />
                                                </button>
                                              </div>

                                              {/* Row 1: Member Name & Progress (Requirements details) */}
                                              <div className="space-y-2 pr-7">
                                                {/* (1) Nama Anggota (Tebal/Bold) */}
                                                <h5 className="font-extrabold text-slate-950 text-sm tracking-tight flex items-center gap-1.5 leading-none">
                                                  👤 {member.name}
                                                </h5>

                                                {(() => {
                                                  const activeTRDebt = state?.trDebts?.find(d => d.customer_id === member.id && d.status === 'BELUM_DIBAYAR');
                                                  if (!activeTRDebt) return null;
                                                  return (
                                                    <div className="mt-1 flex flex-col gap-1 bg-amber-50 border border-amber-250 text-slate-900 rounded-lg p-2.5 shadow-3xs" id={`tr_debt_alert_${member.id}`}>
                                                      <span className="text-[10px] sm:text-[11px] text-amber-800 font-extrabold flex items-center gap-1.5">
                                                        ⚠️ Punya Utang Talangan: Rp {activeTRDebt.nominal_talangan.toLocaleString('id-ID')}
                                                      </span>
                                                      <button
                                                        type="button"
                                                        onClick={async (e) => {
                                                          e.stopPropagation();
                                                          if (confirm(`Apakah Anda yakin ingin menerima pelunasan utang talangan Sebesar Rp ${activeTRDebt.nominal_talangan.toLocaleString('id-ID')} dari ${member.name}?`)) {
                                                            try {
                                                              const res = await fetch("/api/tanggung-renteng/bayar-tr-debt", {
                                                                method: "POST",
                                                                headers: { "Content-Type": "application/json" },
                                                                body: JSON.stringify({ tr_debt_id: activeTRDebt.id })
                                                              });
                                                              const json = await res.json();
                                                              if (json.success) {
                                                                triggerSuccess(`Sukses melunasi utang talangan anggota ${member.name}`);
                                                                fetchState();
                                                              } else {
                                                                triggerError(json.error || "Gagal melunasi utang talangan");
                                                              }
                                                            } catch (e) {
                                                              triggerError("Terjadi kesalahan jaringan");
                                                            }
                                                          }
                                                        }}
                                                        className="w-full mt-1 px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[9px] rounded-md tracking-wider uppercase transition shadow-3xs cursor-pointer text-center"
                                                      >
                                                        💰 Terima Pelunasan Talangan
                                                      </button>
                                                    </div>
                                                  );
                                                })()}

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-xs pt-1 border-t border-slate-100/50">
                                                  {/* (2) Mg Berjalan */}
                                                  <div className="text-slate-600 font-semibold font-sans flex items-center gap-1">
                                                    <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 font-extrabold">Mg Berjalan:</span>
                                                    <span className="font-mono text-slate-900 font-bold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-150">
                                                      Minggu-{activeBill ? activeBill.term : totalTerms} dari {totalTerms}
                                                    </span>
                                                  </div>

                                                  {/* (3) Tagihan Normal */}
                                                  <div className="text-slate-650 font-semibold font-sans flex items-center gap-1">
                                                    <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 font-extrabold">Tagihan Normal:</span>
                                                    <span className="font-mono font-black text-slate-800">
                                                      Rp {(activeBill?.total_tagihan || 60000).toLocaleString('id-ID')}
                                                    </span>
                                                  </div>
                                                </div>

                                                {/* (4) Piutang Tak Tertagih - SPEC 4: Plain Red text color for delinquency */}
                                                <div className="pt-1 select-none text-[11px]" id={`delinquency_status_${member.id}`}>
                                                  {piutangTakTertagih > 0 ? (
                                                    <span className="text-slate-700 font-medium font-sans">
                                                      ⚠️ Tunggakan / Piutang: <span className="text-red-600 font-semibold font-mono">Rp {piutangTakTertagih.toLocaleString('id-ID')}</span>
                                                    </span>
                                                  ) : (
                                                    <span className="text-slate-400 font-medium">
                                                      ✓ Tidak ada tunggakan
                                                    </span>
                                                  )}
                                                </div>
                                              </div>

                                              {/* Input Box 'Ambil Uang Fisik' and Opsi 'Tunai/Transfer' */}
                                              {activeBill ? (
                                                <div className="space-y-3 pt-2.5 border-t border-slate-100">
                                                  {/* Form control row for offline, absent or delinquency */}
                                                  <div className="flex flex-wrap gap-1.5 text-[10.5px]">
                                                    {/* Method selector toggle */}
                                                    <div className="flex-1 min-w-[110px] flex items-center gap-1 bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-lg border border-slate-200">
                                                      <span className="text-[8.5px] uppercase font-mono tracking-wider font-extrabold text-slate-400">Cara:</span>
                                                      <button
                                                        type="button"
                                                        onClick={() => setPaymentMethods({ ...paymentMethods, [activeBill.id]: 'TUNAI' })}
                                                        className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${currentMethod === 'TUNAI' ? 'bg-emerald-600 text-white shadow-3xs' : 'bg-white text-slate-600 hover:bg-blue-50/80'}`}
                                                      >
                                                        💵 CO
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={() => setPaymentMethods({ ...paymentMethods, [activeBill.id]: 'TRANSFER' })}
                                                        className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${currentMethod === 'TRANSFER' ? 'bg-blue-600 text-white shadow-3xs' : 'bg-white text-slate-600 hover:bg-blue-50/80'}`}
                                                      >
                                                        🏦 TRF
                                                      </button>
                                                    </div>

                                                    {/* Abser/delinquent toggle */}
                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        const nextM = !isM;
                                                        setMarkedAbserMenunggak({
                                                          ...markedAbserMenunggak,
                                                          [activeBill.id]: nextM
                                                        });
                                                        setPaymentInputs({
                                                          ...paymentInputs,
                                                          [activeBill.id]: nextM ? 0 : activeBill.total_tagihan
                                                        });
                                                      }}
                                                      className={`px-2 py-0.5 rounded-lg border font-mono font-bold text-[9px] tracking-wide uppercase transition ${
                                                        isM
                                                          ? 'bg-rose-600 text-white border-rose-600'
                                                          : 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'
                                                      }`}
                                                    >
                                                      {isM ? '❌ ABSEN' : 'Absen'}
                                                    </button>

                                                    {/* Runaway switch */}
                                                    <button
                                                      type="button"
                                                      onClick={async () => {
                                                        if (confirm(`⚠️ PERINGATAN KASUS LARI: Apakah Anda yakin ingin menandai Nasabah "${member.name}" secara PERMANEN sebagai MELARIKAN DIRI? Tindakan ini langsung memicu penurutsertaan solidary TR.`)) {
                                                          setMarkedLari({ ...markedLari, [activeBill.id]: true });
                                                          await handleCollectSinglePayment(grp.id, member, activeBill, { is_lari: true });
                                                        }
                                                      }}
                                                      className="px-2 py-0.5 rounded-lg border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 font-mono font-bold text-[9px] uppercase"
                                                    >
                                                      🏃 Kabur
                                                    </button>
                                                  </div>

                                                  {/* Ambil Uang Fisik Input Block */}
                                                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1.5 shadow-3xs">
                                                    <div>
                                                      <label className="text-[8.5px] font-extrabold text-slate-450 uppercase tracking-wider font-mono block">
                                                        💵 Ambil Uang Fisik (Rp):
                                                      </label>
                                                      <div className="relative mt-1">
                                                        <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-mono font-bold">Rp</span>
                                                        <input
                                                          type="number"
                                                          placeholder="0"
                                                          value={isM ? 0 : currentVal}
                                                          disabled={isM}
                                                          onChange={(e) => {
                                                            const parsedVal = Math.max(0, Number(e.target.value));
                                                            setPaymentInputs({
                                                              ...paymentInputs,
                                                              [activeBill.id]: parsedVal
                                                            });
                                                          }}
                                                          className={`w-full pl-7 pr-2 py-1 text-xs border rounded-md font-mono font-bold focus:outline-indigo-505 focus:border-indigo-500 ${isM ? 'bg-rose-100/50 text-rose-900 border-rose-250' : 'bg-white'}`}
                                                        />
                                                      </div>
                                                    </div>

                                                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/50 text-[9.5px]">
                                                      <div>
                                                        {isM && <span className="text-rose-600 font-medium font-mono leading-none">Nominal diset Rp 0 otomatis.</span>}
                                                        {!isM && Number(currentVal) < activeBill.total_tagihan && (
                                                          <span className="text-rose-600 font-bold font-mono">Defisit: -Rp {(activeBill.total_tagihan - Number(currentVal)).toLocaleString('id-ID')}</span>
                                                        )}
                                                        {!isM && Number(currentVal) > activeBill.total_tagihan && (
                                                          <span className="text-emerald-600 font-bold font-mono">Surplus: +Rp {(Number(currentVal) - activeBill.total_tagihan).toLocaleString('id-ID')}</span>
                                                        )}
                                                        {!isM && Number(currentVal) === activeBill.total_tagihan && (
                                                          <span className="text-slate-450 font-medium font-mono">Pas Sesuai Tagihan</span>
                                                        )}
                                                      </div>

                                                      <div className="flex items-center gap-1.5">
                                                        {/* ALIKAN TALANGAN ACTION BUTTON */}
                                                        {(grp.sistem_tanggung_renteng || grp.is_tanggung_renteng) && isM && (
                                                          <button
                                                            type="button"
                                                            onClick={async (e) => {
                                                              e.stopPropagation();
                                                              if (confirm(`🔄 Alihkan angsuran ${member.name} ke Talangan (TR) sebesar Rp ${activeBill.total_tagihan.toLocaleString('id-ID')}?`)) {
                                                                try {
                                                                  const res = await fetch("/api/tanggung-renteng/alihkan-talangan", {
                                                                    method: "POST",
                                                                    headers: { "Content-Type": "application/json" },
                                                                    body: JSON.stringify({
                                                                      customer_id: member.id,
                                                                      group_id: grp.id,
                                                                      billing_schedule_id: activeBill.id,
                                                                      nominal_talangan: activeBill.total_tagihan
                                                                    })
                                                                  });
                                                                  const json = await res.json();
                                                                  if (json.success) {
                                                                    triggerSuccess(`Sukses: Angsuran ${member.name} dialihkan ke Talangan (TR).`);
                                                                    fetchState();
                                                                  } else {
                                                                    triggerError(json.error || "Gagal mengalihkan talangan");
                                                                  }
                                                                } catch (err) {
                                                                  triggerError("Kesalahan jaringan saat mengalihkan talangan");
                                                                }
                                                              }
                                                            }}
                                                            className="py-1 px-2 bg-amber-550 hover:bg-amber-600 text-slate-900 font-extrabold rounded text-[9.5px] uppercase tracking-wide transition shadow-3xs cursor-pointer flex items-center gap-1 border border-amber-400"
                                                          >
                                                            🔄 Alihkan ke Talangan (TR)
                                                          </button>
                                                        )}

                                                        <button
                                                          type="button"
                                                          onClick={() => {
                                                            handleCollectSinglePayment(grp.id, member, activeBill, {
                                                              is_menunggak: isM,
                                                              is_lari: isL,
                                                              payment_method: currentMethod
                                                            });
                                                          }}
                                                          className="py-1 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded text-[9.5px] uppercase tracking-wide transition shadow-3xs cursor-pointer"
                                                        >
                                                          Kolek ✓
                                                        </button>
                                                      </div>
                                                    </div>
                                                  </div>
                                                </div>
                                              ) : (
                                                <div className="p-3 bg-emerald-50 border border-emerald-150 rounded-lg text-xs text-emerald-800 font-bold block">
                                                  ✓ Seluruh termin tagihan selesai divalidasi lunas.
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })
                                      )}
                                    </div>

                                    {/* COLLECTIVE SUBMIT FOR SINGLE GROUP - SPEC 5: offline resiliency draft & save */}
                                    {(() => {
                                      const activeBillsInGroup = state?.billingSchedules.filter(b => b.status !== 'PAID' && activeGroupMembers.some(m => m.id === b.customer_id)) || [];
                                      if (activeBillsInGroup.length > 0) {
                                        return (
                                          <div className="pt-3 border-t border-slate-200 grid grid-cols-2 gap-3" id={`collection_footer_actions_${grp.id}`}>
                                            <button
                                              type="button"
                                              onClick={() => handleSaveDraft(grp.id, activeGroupMembers)}
                                              className="py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-750 border border-indigo-200 font-mono font-black text-[11px] rounded-lg tracking-wide uppercase transition hover:shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                                              id={`btn_draft_${grp.id}`}
                                            >
                                              💾 Simpan sebagai Draft
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleCollectPayments(grp.id, activeGroupMembers)}
                                              className="py-2.5 bg-slate-900 hover:bg-slate-850 text-white font-mono font-black text-[11px] rounded-lg transition hover:shadow-md uppercase tracking-wide cursor-pointer flex items-center justify-center gap-1.5 border border-slate-800"
                                              id={`btn_permanen_${grp.id}`}
                                            >
                                              <UploadCloud size={14} />
                                              Simpan Permanen
                                            </button>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* MODAL / BOTTOM SHEET FOR GROUP HISTORY */}
                  {activeHistoryGroup && (() => {
                    const groupMembers = state?.customers.filter(c => c.group_id === activeHistoryGroup.id) || [];
                    const paidSchedules = state?.billingSchedules
                      .filter(b => b.status === 'PAID' && groupMembers.some(m => m.id === b.customer_id))
                      .sort((a, b) => b.term - a.term) || [];

                    return (
                      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-xs transition" id="group_history_modal">
                        <div className="w-full sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[85vh] sm:max-h-[80vh] overflow-hidden border border-slate-100 animate-slideUp">
                          {/* Header */}
                          <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
                            <div>
                              <span className="text-[9px] uppercase tracking-wider font-mono font-black text-indigo-400">Strip Historis Kolektif</span>
                              <h3 className="font-display font-extrabold text-sm">{activeHistoryGroup.name}</h3>
                            </div>
                            <button
                              onClick={() => setActiveHistoryGroup(null)}
                              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                            >
                              <X size={18} />
                            </button>
                          </div>

                          {/* Body */}
                          <div className="p-4 overflow-y-auto space-y-3 shrink grow min-h-0 text-slate-800">
                            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                              Daftar seluruh termin setoran minggu berjalan yang telah disinkronisasikan dan tervalidasi lunas (double-entry ledger):
                            </p>

                            {paidSchedules.length === 0 ? (
                              <div className="text-center p-8 bg-slate-50 text-slate-400 rounded-xl font-mono text-xs italic">
                                Belum ada riwayat transaksi lunas tercatat untuk kelompok ini.
                              </div>
                            ) : (
                              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white max-h-[40vh] overflow-y-auto scrollbar-thin">
                                {paidSchedules.map(sched => {
                                  const cust = groupMembers.find(m => m.id === sched.customer_id);
                                  return (
                                    <div key={sched.id} className="p-3 text-xs flex justify-between items-center gap-4 hover:bg-blue-50/80 transition">
                                      <div className="min-w-0">
                                        <span className="font-extrabold text-slate-900 block truncate">{cust?.name || 'Nasabah'}</span>
                                        <span className="text-[10px] text-slate-400 font-mono">Term-Skenario: Minggu {sched.term}</span>
                                      </div>
                                      <div className="text-right flex-shrink-0 leading-none">
                                        <span className="font-mono font-black text-slate-950 block">Rp {sched.total_tagihan.toLocaleString('id-ID')}</span>
                                        <span className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-150 inline-block mt-1">LUNAS</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Footer */}
                          <div className="p-4 border-t bg-slate-50 flex items-center justify-end">
                            <button
                              onClick={() => setActiveHistoryGroup(null)}
                              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-mono font-black text-xs uppercase rounded-lg tracking-wide transition cursor-pointer"
                            >
                              Tutup Dialog
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* MODAL / BOTTOM SHEET FOR CUSTOMER HISTORY */}
                  {activeHistoryCustomer && (() => {
                    const memberSchedules = state?.billingSchedules
                      .filter(b => b.customer_id === activeHistoryCustomer.id)
                      .sort((a,b) => a.term - b.term) || [];

                    return (
                      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-xs transition" id="customer_history_modal">
                        <div className="w-full sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[85vh] sm:max-h-[80vh] overflow-hidden border border-slate-105 animate-slideUp">
                          {/* Header */}
                          <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
                            <div>
                              <span className="text-[9px] uppercase tracking-wider font-mono font-black text-indigo-400">Buku Paspor Pembayaran Anggota</span>
                              <h3 className="font-display font-extrabold text-sm">{activeHistoryCustomer.name}</h3>
                            </div>
                            <button
                              onClick={() => setActiveHistoryCustomer(null)}
                              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                            >
                              <X size={18} />
                            </button>
                          </div>

                          {/* Body */}
                          <div className="p-4 overflow-y-auto space-y-3 shrink grow min-h-0 text-slate-800">
                            <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 flex items-start gap-2.5">
                              <span className="text-lg leading-none">📖</span>
                              <div className="space-y-0.5">
                                <h4 className="text-xs font-bold text-indigo-900 uppercase font-mono leading-none">Beban Sisa Tenor Berjalan</h4>
                                <p className="text-[11px] text-indigo-750 leading-relaxed mt-1">
                                  Memastikan transparansi penuh untuk meredam perselisihan lapangan. Total termin tenor: <strong>{memberSchedules.length} minggu</strong>.
                                </p>
                              </div>
                            </div>

                            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white max-h-[40vh] overflow-y-auto scrollbar-thin">
                              {memberSchedules.map(sched => {
                                const isPaid = sched.status === 'PAID';
                                return (
                                  <div key={sched.id} className="p-3 text-xs flex justify-between items-center gap-4 hover:bg-blue-50/80 transition">
                                    <div className="min-w-0">
                                      <span className="font-extrabold text-slate-800 block">Termin Minggu ke-{sched.term}</span>
                                      <span className="text-[10px] text-slate-400 font-mono">Jatuh Tempo: {sched.tanggal_jatuh_tempo || '01/06/2026'}</span>
                                    </div>
                                    <div className="text-right flex-shrink-0 leading-none">
                                      <span className="font-mono font-black text-slate-950 block">Rp {sched.total_tagihan.toLocaleString('id-ID')}</span>
                                      <span className={`text-[9px] font-mono font-extrabold block px-2 py-0.5 rounded-full inline-block mt-1 uppercase ${
                                        isPaid
                                          ? 'bg-emerald-105 text-emerald-800 border border-emerald-200'
                                          : 'bg-rose-50 text-rose-700 border border-rose-150 animate-pulse'
                                      }`}>
                                        {isPaid ? 'Lunas ✓' : 'Belum Bayar'}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="p-4 border-t bg-slate-50 flex items-center justify-end">
                            <button
                              onClick={() => setActiveHistoryCustomer(null)}
                              className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-white font-mono font-black text-xs uppercase rounded-lg tracking-wide transition cursor-pointer"
                            >
                              Tutup Dialog
                            </button>
                          </div>
                      </div>
                    </div>
                    );
                  })()}

                </div>
              )}

              {/* MODUL 7: SETORAN HARIAN KASIR */}
              {activeTab === 'setoran' && (
                <div className="space-y-6 animate-fadeIn" id="setoran_tab_view">
                  
                  {/* HEADER BANNER */}
                  <div className="relative bg-[#0D47A1] text-white rounded-3xl p-6 md:p-8 shadow-xl overflow-hidden mb-6" id="cashier_hero">
                    <div className="absolute top-0 right-0 -mt-6 -mr-6 w-48 h-48 rounded-full bg-white/5 blur-xl pointer-events-none"></div>
                    <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-64 h-64 rounded-full bg-[#00C853]/15 blur-2xl pointer-events-none"></div>
                    
                    <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div>
                        <div className="inline-flex items-center gap-1 bg-[#00C853] text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full mb-3 shadow-sm text-white">
                          <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping"></span>
                          Live Sync Active
                        </div>
                        <h2 className="text-2xl md:text-3xl font-bold tracking-tight font-display text-white">
                          Toleransi & Setoran Harian Kasir
                        </h2>
                        <p className="text-sm text-blue-100 mt-1 max-w-2xl font-sans">
                          Sistem Validasi Bertingkat (Kolektor ➔ Kasir). Rekonsiliasi fisik brankas harian dengan otomatisasi double-entry transaksi akuntansi (Debit Kas, Kredit Kas Hand).
                        </p>
                      </div>
                      
                      <div className="shrink-0 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 text-center md:text-right">
                        <div className="text-xs text-blue-200">Total Pending Verifikasi</div>
                        <div className="text-2xl font-bold font-mono tracking-tight text-white mt-1">
                          Rp {state?.payments.filter(p => p.status === 'PENDING_SETORAN').reduce((sum, p) => sum + p.nominal_bayar, 0).toLocaleString('id-ID')}
                        </div>
                        <div className="text-[10px] text-green-300 mt-1 flex items-center justify-center md:justify-end gap-1 font-mono">
                          <RefreshCw size={10} className="animate-spin text-green-300" />
                          Auto-renewing (5s)
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* LEFT / MAIN AREA: HIERARCHICAL VIEW */}
                    <div className="lg:col-span-8 space-y-4" id="cashier_master_hierarchy">
                      
                      {/* BULK ACTIONS BANNER (Sticky trigger on selection) */}
                      {Object.keys(cashierSelectedPaymentIds).filter(id => cashierSelectedPaymentIds[id]).length > 0 && (
                        <div className="sticky top-4 z-20 bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border-l-4 border-[#00C853] flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-slideUp">
                          <div className="flex items-center gap-3">
                            <div className="bg-[#00C853]/10 text-[#00C853] p-2.5 rounded-xl">
                              <CheckCircle2 size={24} />
                            </div>
                            <div>
                              <div className="font-bold text-sm">Validasi Massal Terseleksi</div>
                              <p className="text-xs text-slate-405">
                                Terpilih <strong className="text-green-400">{Object.keys(cashierSelectedPaymentIds).filter(id => cashierSelectedPaymentIds[id]).length}</strong> transaksi setoran dengan total nominal <strong className="text-green-400">Rp {
                                  state?.payments
                                    .filter(p => cashierSelectedPaymentIds[p.id])
                                    .reduce((sum, p) => sum + p.nominal_bayar, 0)
                                    .toLocaleString('id-ID')
                                }</strong>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                const selectedIds = Object.keys(cashierSelectedPaymentIds).filter(id => cashierSelectedPaymentIds[id]);
                                handleCashierVerify(selectedIds, 'APPROVE', 'Persetujuan massal kasir');
                              }}
                              className="px-4 py-2 bg-[#00C853] hover:bg-[#00b049] text-white text-xs font-bold rounded-xl shadow-lg shadow-green-500/10 flex items-center gap-1 transition"
                            >
                              <Check size={14} />
                              Validasi & Terima (Approve)
                            </button>
                            <button
                              onClick={() => {
                                const selectedIds = Object.keys(cashierSelectedPaymentIds).filter(id => cashierSelectedPaymentIds[id]);
                                const memo = prompt("Ketikan alasan penolakan massal:");
                                if (memo) {
                                  handleCashierVerify(selectedIds, 'REJECT', memo);
                                }
                              }}
                              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1"
                            >
                              <X size={14} />
                              Tolak & Revisi (Reject)
                            </button>
                            <button
                              onClick={() => setCashierSelectedPaymentIds({})}
                              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl font-medium"
                            >
                              Batal
                            </button>
                          </div>
                        </div>
                      )}

                      {/* STAGE LEVEL 1: PETUGAS SUMMARY CARDS & ACCORDION CONTROL */}
                      <div className="space-y-4">
                        {state?.payments.filter(p => p.status === 'PENDING_SETORAN').length === 0 ? (
                          <div className="bg-white border rounded-3xl p-12 text-center" id="empty_cashier_state">
                            <div className="w-16 h-16 bg-blue-50 text-[#0D47A1] rounded-full flex items-center justify-center mx-auto mb-4">
                              <CheckCircle2 size={32} />
                            </div>
                            <h3 className="text-lg font-bold font-display text-slate-900">Semua Setoran Klir!</h3>
                            <p className="text-sm text-slate-450 mt-1 max-w-sm mx-auto">
                              Seluruh uang penagihan di lapangan sudah tervalidasi masuk ke Kasir dan tersinkronisasi ke rute jurnal Double-Entry.
                            </p>
                          </div>
                        ) : (
                          Object.keys(petugasMap).map(petugasId => {
                            const pList = petugasMap[petugasId];
                            const isExpanded = cashierActivePetugas === petugasId;
                            
                            // Metrics for Level 1 Card
                            const assocUser = state?.users?.find(u => u.id === petugasId);
                            const petugasNama = assocUser?.nama || petugasId;
                            const totalNominal = pList.reduce((sum, p) => sum + p.nominal_bayar, 0);

                            // Calculate Wilayah coverage
                            const regionIds = new Set<string>();
                            pList.forEach(p => {
                              const cust = state?.customers.find(c => c.id === p.customer_id);
                              const grp = state?.groups.find(g => g.id === cust?.group_id);
                              if (grp?.region_id) regionIds.add(grp.region_id);
                            });
                            const totalReg = regionIds.size;

                            // Calculate assigned vs collected groups
                            const assignedGroups = state?.groups.filter(g => g.petugas_assigned_id === petugasId || g.assigned_user_id === petugasId) || [];
                            const collectedGroupIds = new Set<string>();
                            pList.forEach(p => {
                              const cust = state?.customers.find(c => c.id === p.customer_id);
                              if (cust?.group_id) collectedGroupIds.add(cust.group_id);
                            });
                            const totalAssignedGroups = assignedGroups.length;
                            const totalCollectedGroups = collectedGroupIds.size;

                            // Calculate checked items count under this petugas
                            const checkedCountUnderPetugas = pList.filter(p => cashierSelectedPaymentIds[p.id]).length;
                            const allCheckedUnderPetugas = pList.every(p => cashierSelectedPaymentIds[p.id]);

                            return (
                              <div
                                key={petugasId}
                                className={`bg-white border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 ${
                                  isExpanded ? 'ring-2 ring-[#0D47A1]/20 border-[#0D47A1]' : 'border-slate-100'
                                }`}
                                id={`petugas_card_level1_${petugasId}`}
                              >
                                {/* CARD HEADER (LEVEL 1 ACCORDION MASTER TRIGGER) */}
                                <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
                                  <div className="flex items-start gap-3.5">
                                    <div className="p-1">
                                      <input
                                        type="checkbox"
                                        checked={allCheckedUnderPetugas}
                                        ref={el => {
                                          if (el) {
                                            el.indeterminate = checkedCountUnderPetugas > 0 && checkedCountUnderPetugas < pList.length;
                                          }
                                        }}
                                        onChange={() => toggleSelectPetugas(pList)}
                                        className="w-4 h-4 rounded text-[#0D47A1] focus:ring-[#0D47A1] border-slate-300"
                                        title="Pilih seluruh setoran petugas ini"
                                      />
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <h4 className="text-md font-bold font-display text-slate-900">{petugasNama}</h4>
                                        <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.5 rounded uppercase font-mono">
                                          {petugasId}
                                        </span>
                                      </div>
                                      
                                      {/* Level 1 Sub Metrics */}
                                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
                                        <span className="flex items-center gap-1">
                                          <MapPin size={12} className="text-slate-400" />
                                          {totalReg} Wilayah
                                        </span>
                                        <span className="flex items-center gap-1" title="Mengukur jika ada kelompok terlewat dari rute tugas harian">
                                          <Route size={12} className="text-slate-400" />
                                          Kelompok: <strong>{totalCollectedGroups}</strong> Tertagih / {totalAssignedGroups > 0 ? totalAssignedGroups : '-'} Ditugaskan
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between md:justify-end gap-4 border-t pt-3 md:pt-0 md:border-0">
                                    <div className="text-left md:text-right">
                                      <div className="text-[10px] uppercase tracking-wider font-mono text-slate-400">Total Setoran Fisik</div>
                                      <div className="text-md font-extrabold text-[#0D47A1] font-mono">
                                        Rp {totalNominal.toLocaleString('id-ID')}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => toggleSelectPetugas(pList)}
                                        className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                                      >
                                        {allCheckedUnderPetugas ? 'Kosongkan' : 'Pilih Semua'}
                                      </button>
                                      
                                      <button
                                        onClick={() => setCashierActivePetugas(isExpanded ? null : petugasId)}
                                        className={`p-2 rounded-xl transition ${
                                          isExpanded ? 'bg-[#0D47A1] text-white' : 'bg-slate-150 hover:bg-slate-200 text-slate-700'
                                        }`}
                                        title={isExpanded ? "Sembunyikan rincian kelompok" : "Tampilkan rincian kelompok"}
                                      >
                                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                {/* LEVEL 2: SUB-ACCORDION AREA FOR WILAYAH & KELOMPOK */}
                                {isExpanded && (
                                  <div className="border-t divide-y p-5 bg-white space-y-6">
                                    
                                    {/* Regrouping pending payments under this petugas by region first, then kelompok */}
                                    {(() => {
                                      const mappedRegions: { [regionId: string]: { regionName: string; groups: { [groupId: string]: { groupName: string; payments: typeof pList } } } } = {};
                                      pList.forEach(p => {
                                        const cust = state?.customers.find(c => c.id === p.customer_id);
                                        const grp = state?.groups.find(g => g.id === cust?.group_id);
                                        const reg = state?.regions.find(r => r.id === grp?.region_id);
                                        
                                        const rId = reg?.id || 'NO-REG';
                                        const rName = reg?.name || 'Luar Wilayah';
                                        const gId = grp?.id || 'NO-GRP';
                                        const gName = grp?.name || 'Tanpa Kelompok';

                                        if (!mappedRegions[rId]) {
                                          mappedRegions[rId] = { regionName: rName, groups: {} };
                                        }
                                        if (!mappedRegions[rId].groups[gId]) {
                                          mappedRegions[rId].groups[gId] = { groupName: gName, payments: [] };
                                        }
                                        mappedRegions[rId].groups[gId].payments.push(p);
                                      });

                                      return Object.keys(mappedRegions).map(rId => {
                                        const region = mappedRegions[rId];
                                        return (
                                          <div key={rId} className="space-y-4" id={`region_section_${rId}`}>
                                            
                                            {/* Wilayah Section Label */}
                                            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest border-b pb-1 font-mono">
                                              <Building size={14} className="text-[#0D47A1]" />
                                              Wilayah: {region.regionName}
                                            </div>

                                            {/* Kelompok List - Accordion Cards */}
                                            <div className="space-y-3 pl-2">
                                              {Object.keys(region.groups).map(gId => {
                                                const groupInfo = region.groups[gId];
                                                const gPayments = groupInfo.payments;
                                                const isGroupExpanded = cashierExpandedKelompok[gId] !== false; // Expanded by default

                                                const toggleGroupAccordion = () => {
                                                  setCashierExpandedKelompok(prev => ({
                                                    ...prev,
                                                    [gId]: !isGroupExpanded
                                                  }));
                                                };

                                                // Calculate group metrics
                                                const capKelompok = gPayments.reduce((sum, p) => sum + p.nominal_bayar, 0);
                                                
                                                // Target kelompok
                                                const groupSchedules = state?.billing_schedules?.filter(b => b.parent_group_id === gId || state?.customers.find(c => c.id === b.customer_id)?.group_id === gId) || [];
                                                const tarKelompok = groupSchedules.reduce((sum, b) => sum + b.total_tagihan, 0) || gPayments.reduce((sum, p) => {
                                                  const sched = state?.billing_schedules?.find(b => b.id === p.billing_schedule_id);
                                                  return sum + (sched?.total_tagihan || p.nominal_bayar);
                                                }, 0);

                                                const capPercent = tarKelompok > 0 ? Math.min(100, Math.round((capKelompok / tarKelompok) * 100)) : 100;
                                                
                                                const groupCheckedCount = gPayments.filter(p => cashierSelectedPaymentIds[p.id]).length;
                                                const allCheckedGroup = gPayments.every(p => cashierSelectedPaymentIds[p.id]);

                                                return (
                                                  <div
                                                    key={gId}
                                                    className="border rounded-xl overflow-hidden hover:border-[#0D47A1]/40"
                                                    id={`kelompok_card_level2_${gId}`}
                                                  >
                                                    {/* KELOMPOK ROW HEADER */}
                                                    <div className="p-3.5 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b">
                                                      <div className="flex items-center gap-3">
                                                        <input
                                                          type="checkbox"
                                                          checked={allCheckedGroup}
                                                          ref={el => {
                                                            if (el) {
                                                              el.indeterminate = groupCheckedCount > 0 && groupCheckedCount < gPayments.length;
                                                            }
                                                          }}
                                                          onChange={() => toggleSelectGroup(gPayments)}
                                                          className="w-3.5 h-3.5 rounded text-[#0D47A1] focus:ring-[#0D47A1] border-slate-300"
                                                        />
                                                        
                                                        <div onClick={toggleGroupAccordion} className="cursor-pointer">
                                                          <div className="font-bold flex items-center gap-2 text-slate-800 text-sm">
                                                            <span>Kelompok: {groupInfo.groupName}</span>
                                                            <span className="text-[9px] bg-[#0D47A1]/10 text-[#0D47A1] font-bold px-1.5 py-0.2 rounded font-mono">
                                                              {gId}
                                                            </span>
                                                          </div>
                                                          <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                                                            <span>Koleksi: {gPayments.length} Anggota</span>
                                                            &bull;
                                                            <span>Target Kelompok: Rp {tarKelompok.toLocaleString('id-ID')}</span>
                                                            &bull;
                                                            <span>Setoran Fisik: Rp {capKelompok.toLocaleString('id-ID')}</span>
                                                          </div>
                                                        </div>
                                                      </div>

                                                      {/* ProgressBar Meter and Accordion Switch */}
                                                      <div className="flex items-center gap-4">
                                                        <div className="w-40 hidden md:block">
                                                          <div className="flex items-center justify-between text-[10px] mb-1">
                                                            <span className="font-mono text-slate-500">Capaian Setoran</span>
                                                            <span className="font-bold text-[#00C853]">{capPercent}%</span>
                                                          </div>
                                                          <div className="w-full bg-slate-200 rounded-full h-1.5">
                                                            <div
                                                              className="h-1.5 bg-[#00C853] rounded-full transition-all duration-550"
                                                              style={{ width: `${capPercent}%` }}
                                                            ></div>
                                                          </div>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                          <button
                                                            onClick={() => toggleSelectGroup(gPayments)}
                                                            className="text-[10px] bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded font-semibold text-slate-700"
                                                          >
                                                            {allCheckedGroup ? "Batal Pilih" : "Pilih Semua"}
                                                          </button>
                                                          
                                                          <button
                                                            onClick={toggleGroupAccordion}
                                                            className="p-1 rounded hover:bg-slate-200 text-slate-500"
                                                          >
                                                            {isGroupExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                          </button>
                                                        </div>
                                                      </div>
                                                    </div>

                                                    {/* LEVEL 3: DETAILED MEMBERS TABLE ACCORDION PANEL */}
                                                    {isGroupExpanded && (
                                                      <div className="overflow-x-auto">
                                                        <table className="w-full text-xs text-left" id={`members_table_${gId}`}>
                                                          <thead className="bg-[#0D47A1]/5 text-slate-600 uppercase text-[9px] font-mono tracking-wider border-b">
                                                            <tr>
                                                              <th className="py-2.5 px-3 w-8"></th>
                                                              <th className="py-2.5 px-3">Nama Anggota [NIK]</th>
                                                              <th className="py-2.5 px-3 text-right">Target Angsuran</th>
                                                              <th className="py-2.5 px-3">Uang Fisik Diterima</th>
                                                              <th className="py-2.5 px-3 text-center">Cara Bayar</th>
                                                              <th className="py-2.5 px-3 text-right font-bold text-[#0D47A1]">Aksi Koreksi / Validasi</th>
                                                            </tr>
                                                          </thead>
                                                          <tbody className="divide-y divide-slate-100 font-sans">
                                                            {gPayments.map(pay => {
                                                              const relatedCustomer = state?.customers?.find(c => c.id === pay.customer_id);
                                                              const relatedSchedule = state?.billing_schedules?.find(b => b.id === pay.billing_schedule_id);
                                                              const isRevising = cashierRevisingPayId === pay.id;

                                                              return (
                                                                <tr
                                                                  key={pay.id}
                                                                  className={`hover:bg-blue-50/30 transition-colors ${
                                                                    cashierSelectedPaymentIds[pay.id] ? 'bg-[#0D47A1]/5' : ''
                                                                  }`}
                                                                >
                                                                  {/* Selection Checkbox Column */}
                                                                  <td className="py-3 px-3 text-center">
                                                                    <input
                                                                      type="checkbox"
                                                                      checked={!!cashierSelectedPaymentIds[pay.id]}
                                                                      onChange={() => toggleSelectPayment(pay.id)}
                                                                      className="w-3.5 h-3.5 rounded text-[#0D47A1] focus:ring-[#0D47A1] border-slate-300"
                                                                    />
                                                                  </td>

                                                                  {/* Member profile */}
                                                                  <td className="py-3 px-3">
                                                                    <div className="font-bold text-slate-800">{relatedCustomer?.name || 'Anggota'}</div>
                                                                    <div className="text-[10px] text-slate-400 font-mono tracking-tight flex items-center gap-2 mt-0.5">
                                                                      <span>ID: {pay.customer_id}</span>
                                                                      <span>&bull;</span>
                                                                      <span>NIK: {relatedCustomer?.nik || '-'}</span>
                                                                    </div>
                                                                  </td>

                                                                  {/* Target Schedule */}
                                                                  <td className="py-3 px-3 text-right font-mono font-bold text-slate-600">
                                                                    Rp {(relatedSchedule?.total_tagihan || pay.nominal_bayar).toLocaleString('id-ID')}
                                                                  </td>

                                                                  {/* Physical cash physically received by Officer (with Revision trigger support) */}
                                                                  <td className="py-3 px-3">
                                                                    {isRevising ? (
                                                                      <div className="flex items-center gap-1.5 max-w-[150px]">
                                                                        <span className="text-xs text-slate-400 font-mono">Rp</span>
                                                                        <input
                                                                          type="number"
                                                                          value={cashierRevisingAmount}
                                                                          onChange={e => setCashierRevisingAmount(Number(e.target.value))}
                                                                          className="w-full px-2 py-1 text-xs border rounded-lg focus:outline-[#0D47A1]"
                                                                          autoFocus
                                                                        />
                                                                      </div>
                                                                    ) : (
                                                                      <div>
                                                                        <span className="font-mono font-bold text-slate-900 text-sm">
                                                                          Rp {pay.nominal_bayar.toLocaleString('id-ID')}
                                                                        </span>
                                                                        {pay.nominal_bayar !== (relatedSchedule?.total_tagihan || 0) && (
                                                                          <div className="text-[9px] text-[#00C853] font-semibold mt-0.5">
                                                                            Selisih: Rp {(pay.nominal_bayar - (relatedSchedule?.total_tagihan || 0)).toLocaleString('id-ID')} (Rekonsiliasi Jurnal)
                                                                          </div>
                                                                        )}
                                                                      </div>
                                                                    )}
                                                                  </td>

                                                                  {/* Payment Method Option */}
                                                                  <td className="py-3 px-3 text-center">
                                                                    {isRevising ? (
                                                                      <select
                                                                        value={cashierRevisingMethod}
                                                                        onChange={e => setCashierRevisingMethod(e.target.value as 'TUNAI' | 'TRANSFER')}
                                                                        className="px-1.5 py-1 text-xs border rounded-lg bg-white"
                                                                      >
                                                                        <option value="TUNAI">TUNAI</option>
                                                                        <option value="TRANSFER">TRANSFER</option>
                                                                      </select>
                                                                    ) : (
                                                                      <span className={`inline-block text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                                                        pay.payment_method === 'TRANSFER'
                                                                          ? 'bg-blue-100 text-blue-800'
                                                                          : 'bg-emerald-100 text-emerald-800'
                                                                      }`}>
                                                                        {pay.payment_method || 'TUNAI'}
                                                                      </span>
                                                                    )}
                                                                  </td>

                                                                  {/* Column actions for separate item */}
                                                                  <td className="py-3 px-3 text-right">
                                                                    {isRevising ? (
                                                                      <div className="flex justify-end gap-1.5">
                                                                        <button
                                                                          disabled={isUpdatingPayment}
                                                                          onClick={() => handleUpdatePaymentValue(pay.id, cashierRevisingAmount, cashierRevisingMethod)}
                                                                          className="px-2 py-1 bg-[#00C853] text-white text-[10px] font-bold rounded-lg hover:bg-emerald-600"
                                                                        >
                                                                          {isUpdatingPayment ? 'Simpan...' : 'OK'}
                                                                        </button>
                                                                        <button
                                                                          onClick={() => setCashierRevisingPayId(null)}
                                                                          className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg hover:bg-slate-200"
                                                                        >
                                                                          Batal
                                                                        </button>
                                                                      </div>
                                                                    ) : (
                                                                      <div className="flex justify-end gap-1.5 items-center">
                                                                        {/* EDIT BUTTON (REVISI INPUT BY KASIR) */}
                                                                        <button
                                                                          onClick={() => {
                                                                            setCashierRevisingPayId(pay.id);
                                                                            setCashierRevisingAmount(pay.nominal_bayar);
                                                                            setCashierRevisingMethod(pay.payment_method || 'TUNAI');
                                                                          }}
                                                                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition-all"
                                                                          title="Koreksi Nominal jika Petugas typo atau menyetor tidak sesuai berkas harian"
                                                                        >
                                                                          <Edit2 size={11} className="text-slate-500" />
                                                                          ✏️ Revisi Input
                                                                        </button>

                                                                        {/* APPROVE SINGLE */}
                                                                        <button
                                                                          onClick={() => handleCashierVerify([pay.id], 'APPROVE', 'Sesuai dengan berkas fisik')}
                                                                          className="px-2.5 py-1.5 bg-[#00C853] hover:bg-[#00b049] text-white text-[10.5px] font-bold rounded-lg flex items-center gap-0.5 transition-all shadow-sm"
                                                                        >
                                                                          Terima Kas
                                                                        </button>

                                                                        {/* REJECT SINGLE */}
                                                                        <button
                                                                          onClick={() => {
                                                                            const memo = prompt("Ketikan alasan penolakan revisi setoran harian untuk anggota:", "Uang kertas cacat/sobek tidak diterima kasir");
                                                                            if (memo) {
                                                                              handleCashierVerify([pay.id], 'REJECT', memo);
                                                                            }
                                                                          }}
                                                                          className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-all"
                                                                          title="Reject tolak setoran"
                                                                        >
                                                                          <X size={12} />
                                                                        </button>
                                                                      </div>
                                                                    )}
                                                                  </td>
                                                                </tr>
                                                              );
                                                            })}
                                                          </tbody>
                                                        </table>
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      });
                                    })()}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* RIGHT AREA: REAL-TIME NOTIFICATION EVENT LOGGER FEED */}
                    <div className="lg:col-span-4 space-y-6" id="cashier_notifications_panel">
                      
                      {/* REAL-TIME NOTIFICATIONS */}
                      <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b pb-3">
                          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-display">
                            <Bell size={16} className="text-[#0D47A1] animate-swing" />
                            Live Submissions Log
                          </h3>
                          <span className="inline-block text-[9px] bg-[#00C853]/10 text-[#00C853] font-bold uppercase px-2 py-0.5 rounded-full font-mono animate-pulse">
                            Active Sync
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-500 font-sans">
                          Aktivitas realtime ketika Petugas di m-Banking / HP Lapangan mereka menekan 'Koleksi Penagihan'. Kasir dapat memantau setoran masuk secara live.
                        </p>

                        <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1" id="notif_logs_scroll">
                          {cashierNotifications.length === 0 ? (
                            <div className="py-12 px-4 text-center border-2 border-dashed border-slate-100 rounded-xl">
                              <span className="text-xs text-slate-400 font-mono">Belum ada submit baru harian ini.</span>
                            </div>
                          ) : (
                            cashierNotifications.map(notif => (
                              <div
                                key={notif.id}
                                className="bg-[#0D47A1]/5/40 hover:bg-[#0D47A1]/5 border-l-3 border-[#0D47A1] rounded-xl p-3 text-xs flex flex-col gap-1.5 animate-fadeIn"
                              >
                                <div className="text-slate-750 font-medium font-sans leading-relaxed">
                                  {notif.message}
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                                  <span>Toleransi Auto-refresh</span>
                                  <span>{notif.timestamp}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        {cashierNotifications.length > 0 && (
                          <button
                            onClick={() => setCashierNotifications([])}
                            className="w-full py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs rounded-xl font-bold transition"
                          >
                            Bersihkan Log Notifikasi
                          </button>
                        )}
                      </div>

                      {/* QUICK REFERENCE LEDGERS BRANKAS CHECK */}
                      <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white rounded-2xl p-5 shadow-xl space-y-4">
                        <h4 className="text-sm font-bold text-slate-100 flex items-center gap-1.5 uppercase font-mono tracking-wider">
                          <Coins size={14} className="text-[#00C853]" />
                          Brankas Kasir Ledger
                        </h4>

                        <div className="space-y-3 text-xs leading-relaxed font-sans">
                          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                            <div className="text-white/40 text-[9px] uppercase font-mono">1110 - KAS KECIL (KASIR BRANKAS)</div>
                            <div className="text-lg font-bold text-white font-mono mt-0.5">
                              Rp {calculateBalance('1110').toLocaleString('id-ID')}
                            </div>
                            <div className="text-[9px] text-[#00C853] mt-0.5">&bull; Debit Penyetoran Tunai Diterima</div>
                          </div>

                          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                            <div className="text-white/40 text-[9px] uppercase font-mono">1112 - KAS BANK (SELISIH REKONSILIASI)</div>
                            <div className="text-lg font-bold text-white font-mono mt-0.5">
                              Rp {calculateBalance('1112').toLocaleString('id-ID')}
                            </div>
                            <div className="text-[9px] text-[#3B82F6] mt-0.5">&bull; Debit Penyetoran Transfer Diterima</div>
                          </div>

                          <div className="bg-white/5 rounded-xl p-3 border border-white/5 hover:border-white/10 transition">
                            <div className="text-white/40 text-[9px] uppercase font-mono">1111 - KAS DI TANGAN PETUGAS (LAPANGAN)</div>
                            <div className="text-lg font-bold text-slate-300 font-mono mt-0.5">
                              Rp {calculateBalance('1111').toLocaleString('id-ID')}
                            </div>
                            <div className="text-[9px] text-amber-300 mt-0.5">&bull; Kredit Pengurangan Pertanggungjawaban</div>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* AUTOMATED SUCCESS MULTI-PAY RECEIPT MODAL */}
                  {receiptModalOpen && receiptData && (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" id="success_receipt_modal">
                      <div className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl relative overflow-hidden flex flex-col gap-6 animate-zoomIn">
                        <div className="flex flex-col items-center text-center">
                          <div className="w-14 h-14 bg-emerald-50 text-[#00C853] rounded-full flex items-center justify-center mb-3">
                            <CheckCircle2 size={32} />
                          </div>
                          
                          <h3 className="text-xl font-bold font-display text-slate-900">Setoran Berhasil Divalidasi!</h3>
                          <p className="text-xs text-slate-500 max-w-sm mt-1">
                            Seluruh dana yang divalidasi telah terekam aman ke sistem pembukuan double-entry akuntansi SSJB SEKAWAN SISTEM.
                          </p>
                        </div>

                        {/* RECEIPT PREVIEW CONTENT */}
                        <div className="bg-slate-50 border rounded-2xl p-4.5 text-xs font-mono text-slate-705 divide-y divide-dotted">
                          <div className="py-2 flex items-center justify-between text-slate-500 text-[10px]">
                            <span>NO TRANSAKSI</span>
                            <span className="font-bold text-slate-900">{receiptData.noTransaksi}</span>
                          </div>

                          <div className="py-2 flex items-center justify-between text-slate-500 text-[10px]">
                            <span>TANGGAL & WAKTU</span>
                            <span className="font-bold text-slate-900">{receiptData.timestamp}</span>
                          </div>

                          <div className="py-2 flex items-center justify-between text-slate-500 text-[10px]">
                            <span>PETUGAS LAPANGAN</span>
                            <span className="font-bold text-slate-900">{receiptData.petugasName} ({receiptData.petugasId})</span>
                          </div>

                          <div className="py-3">
                            <div className="font-bold text-[10px] text-slate-400 mb-1.5 uppercase">ANGGOTA DAN KELOMPOK TERBAYAR:</div>
                            <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1 text-[10.5px]">
                              {receiptData.payments.map((p, idx) => (
                                <div key={p.id} className="flex justify-between items-start gap-2">
                                  <span>{idx + 1}. {p.kelompokName} - {p.anggotaName}</span>
                                  <span className="font-bold shrink-0">Rp {p.nominal.toLocaleString('id-ID')} ({p.metode})</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="py-3 flex items-center justify-between font-bold text-slate-900 text-sm">
                            <span>TOTAL KAS DIVERIFIKASI:</span>
                            <span className="text-slate-950 font-bold">Rp {receiptData.totalAmount.toLocaleString('id-ID')}</span>
                          </div>
                        </div>

                        {/* INTERACTIVE ACTIONS */}
                        <div className="flex flex-col sm:flex-row gap-2">
                          <button
                            onClick={handlePrintReceipt}
                            className="flex-1 py-3 bg-[#0D47A1] hover:bg-[#0b3c8a] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition shadow-lg shadow-blue-500/10"
                          >
                            <Printer size={15} />
                            🖨️ Cetak Kwitansi Setoran (Thermal PDF)
                          </button>
                          <button
                            onClick={() => {
                              setReceiptModalOpen(false);
                              setReceiptData(null);
                            }}
                            className="py-3 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
                          >
                            Tutup Selesai
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* MODUL 8: LAPORAN AKUNTANSI Real-time */}
              {activeTab === 'laporan' && (
                <div className="space-y-6 animate-fadeIn" id="laporan_tab_view">
                  <div className="border-b border-slate-150 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 font-display">Laporan Keuangan Real-Time Standar SAK Double-Entry</h2>
                      <p className="text-xs text-slate-500 font-medium">Buku laporan akuntansi yang diekstrak langsung dari entri jurnal balancing log.</p>
                    </div>
                    
                    {/* Date picker filters */}
                    <div className="flex items-center gap-2" id="date_filters">
                      <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border text-xs">
                        <span className="text-[10px] font-mono text-slate-450 uppercase pl-1.5">Rentang:</span>
                        <input
                          type="date"
                          value={reportStartDate}
                          onChange={(e) => setReportStartDate(e.target.value)}
                          className="bg-transparent border-0 py-0.5 px-1 focus:outline-none"
                        />
                        <span className="text-slate-400">s/d</span>
                        <input
                          type="date"
                          value={reportEndDate}
                          onChange={(e) => setReportEndDate(e.target.value)}
                          className="bg-transparent border-0 py-0.5 px-1 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {accountingReports && (
                    <div className="space-y-6" id="reports_grid">
                      
                      {/* BALANCING DEBIT-CREDIT NOTIFIER ACCORDING SAK */}
                      <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-center justify-between gap-4 ${
                        accountingReports.trialBalance.isBalanced 
                          ? 'bg-emerald-50 text-emerald-950 border-emerald-200' 
                          : 'bg-rose-50 text-rose-955 border-rose-200'
                      }`} id="balancing_ledger_card">
                        <div className="flex items-center gap-3">
                          {accountingReports.trialBalance.isBalanced ? (
                            <CheckCircle2 className="text-emerald-600 shrink-0" size={32} />
                          ) : (
                            <XCircle className="text-rose-600 shrink-0" size={32} />
                          )}
                          <div>
                            <div className="font-bold text-sm">Status Entri Jurnal Double-Entry Standar Akuntansi</div>
                            <p className="text-xs opacity-80 mt-0.5">Sistem memvalidasi persamaan dasar akuntansi: Aset + Beban = Kewajiban + Modal + Pendapatan</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-mono font-bold" id="trial_balance_aggregators">
                          <div>
                            <span className="block text-[10px] opacity-75 uppercase">Debit Total</span>
                            <span className="text-slate-900 text-sm">Rp {accountingReports.trialBalance.totalDebits.toLocaleString('id-ID')}</span>
                          </div>
                          <div className={`h-6 w-px ${accountingReports.trialBalance.isBalanced ? 'bg-emerald-200' : 'bg-rose-200'}`} />
                          <div>
                            <span className="block text-[10px] opacity-75 uppercase">Kredit Total</span>
                            <span className="text-slate-900 text-sm">Rp {accountingReports.trialBalance.totalCredits.toLocaleString('id-ID')}</span>
                          </div>
                        </div>
                      </div>

                      {/* 4 LAPORAN UTAMA */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="accounting_statements_quad">
                        
                        {/* 1. NERACA SALDO */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-xs" id="tb_wrapper">
                          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1">
                            <BookOpen size={14} className="text-slate-500" />
                            1. Neraca Saldo (Trial Balance)
                          </h3>
                          <div className="max-h-60 overflow-y-auto border rounded divide-y" id="tb_entries">
                            {accountingReports.trialBalance.accounts.map((acc: any) => (
                              <div key={acc.code} className="p-2 flex justify-between items-center text-[10.5px] hover:bg-blue-50/80" id={`tb_row_${acc.code}`}>
                                <div className="grow min-w-0">
                                  <div className="font-mono text-slate-500">{acc.code}</div>
                                  <div className="font-bold text-slate-800 truncate">{acc.name}</div>
                                </div>
                                <div className="text-right font-mono text-slate-700 font-bold space-y-0.5">
                                  {acc.normal_balance === 'DR' ? (
                                    <div>Dr: Rp {acc.endingBalance.toLocaleString('id-ID')}</div>
                                  ) : (
                                    <div>Cr: Rp {acc.endingBalance.toLocaleString('id-ID')}</div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 2. LAPORAN LABA / RUGI */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-xs" id="income_statement_wrapper">
                          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1">
                            <TrendingUp size={14} className="text-slate-500" />
                            2. Laporan Laba/Rugi (Income Statement)
                          </h3>
                          <div className="space-y-2 border rounded p-3 text-[11px]" id="income_statement_table">
                            <div className="font-bold text-slate-500 border-b pb-1 uppercase tracking-wide">Pendapatan Operasional (Revenue)</div>
                            {accountingReports.incomeStatement.revenues.length === 0 ? (
                              <div className="text-slate-400 py-2 italic text-center">Belum ada pendapatan yang dibukukan.</div>
                            ) : (
                              accountingReports.incomeStatement.revenues.map((item: any) => (
                                <div key={item.code} className="flex justify-between py-1 border-b border-dashed" id={`income_row_${item.code}`}>
                                  <span>{item.name}</span>
                                  <span className="font-mono font-bold text-slate-800">Rp {item.endingBalance.toLocaleString('id-ID')}</span>
                                </div>
                              ))
                            )}
                            <div className="flex justify-between text-xs font-bold pt-2 text-indigo-950 border-t" id="total_revenues_row">
                              <span>Total Pendapatan:</span>
                              <span className="font-mono">Rp {accountingReports.incomeStatement.totalRevenue.toLocaleString('id-ID')}</span>
                            </div>

                            <div className="font-bold text-slate-500 border-b pb-1 mt-4 uppercase tracking-wide">Beban Operasional (Expense)</div>
                            <div className="flex justify-between py-1 border-b border-dashed">
                              <span>Beban Administrasi Mikro</span>
                              <span className="font-mono font-bold text-slate-800">Rp 0</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold pt-2 border-t text-indigo-950" id="total_expenses_row">
                              <span>Total Beban:</span>
                              <span className="font-mono">Rp 0</span>
                            </div>

                            <div className="p-2.5 bg-indigo-50/50 rounded-lg text-xs font-bold text-indigo-950 flex justify-between mt-4 border border-indigo-150" id="net_profit_row">
                              <span>Laba Bersih (Net Profit/Loss):</span>
                              <span className="font-mono text-indigo-800">Rp {accountingReports.incomeStatement.netProfit.toLocaleString('id-ID')}</span>
                            </div>
                          </div>
                        </div>

                        {/* 3. LAPORAN ARUS KAS */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-xs" id="cash_flow_wrapper">
                          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1">
                            <Wallet size={14} className="text-slate-500" />
                            3. Laporan Arus Kas (Cash Flow)
                          </h3>
                          <div className="space-y-2 border rounded p-3 text-[11px]" id="cash_flow_table">
                            <div className="flex justify-between py-1 border-b">
                              <span className="text-slate-550">Kas Masuk (Inflows):</span>
                              <span className="font-mono text-emerald-600 font-bold">Rp {accountingReports.cashFlow.totalInflow.toLocaleString('id-ID')}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b">
                              <span className="text-slate-550">Kas Keluar (Outflows):</span>
                              <span className="font-mono text-rose-600 font-bold">Rp {accountingReports.cashFlow.totalOutflow.toLocaleString('id-ID')}</span>
                            </div>

                            <div className="p-2 bg-slate-50 rounded text-[10px] max-h-36 overflow-y-auto whitespace-pre space-y-1 block" id="cash_flow_logs">
                              <div className="font-bold uppercase font-mono border-b pb-0.5 text-slate-500 mb-1">Rincian Pergerakan Kas (Buku Kas & Bank)</div>
                              {accountingReports.cashFlow.activities.map((act: any, idx: number) => (
                                <div key={idx} className="flex justify-between py-0.5 font-mono text-[9px] text-slate-600 border-b border-slate-100 last:border-0" id={`flow_activity_row_${idx}`}>
                                  <span className="truncate max-w-[170px]" title={act.description}>{act.description}</span>
                                  <span>{act.inflow > 0 ? `+Rp ${act.inflow.toLocaleString('id-ID')}` : `-Rp ${act.outflow.toLocaleString('id-ID')}`}</span>
                                </div>
                              ))}
                            </div>

                            <div className="p-2.5 bg-emerald-50/50 rounded-lg text-xs font-bold text-emerald-950 flex justify-between mt-3 border border-emerald-150" id="net_cash_flow_row">
                              <span>Arus Kas Bersih (Net Cash Flow):</span>
                              <span className="font-mono text-emerald-700">Rp {accountingReports.cashFlow.netCashFlow.toLocaleString('id-ID')}</span>
                            </div>
                          </div>
                        </div>

                        {/* 4. LAPORAN PERUBAHAN MODAL */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-xs" id="capital_statement_wrapper">
                          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1">
                            <ArrowRightLeft size={14} className="text-slate-500" />
                            4. Laporan Perubahan Modal (Changes in Equity)
                          </h3>
                          <div className="space-y-2 border rounded p-3 text-[11px]" id="capital_statement_table">
                            <div className="flex justify-between py-1 border-b">
                              <span className="text-slate-555">Modal Awal Pemilik (3100):</span>
                              <span className="font-mono text-slate-800 font-bold">Rp {accountingReports.capitalStatement.initialCapital.toLocaleString('id-ID')}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b">
                              <span className="text-slate-555">Kenaikan Saldo Laba Bersih (3300):</span>
                              <span className="font-mono text-emerald-600 font-bold">+Rp {accountingReports.capitalStatement.netProfit.toLocaleString('id-ID')}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b">
                              <span className="text-slate-555">Pengambilan Pribadi (Prive / Dividen):</span>
                              <span className="font-mono text-slate-850 font-bold">Rp 0</span>
                            </div>
                            <div className="p-2.5 bg-indigo-50/50 rounded-lg text-xs font-bold text-indigo-950 flex justify-between mt-4 border border-indigo-150" id="ending_capital_row">
                              <span>Modal Akhir Berjalan:</span>
                              <span className="font-mono text-indigo-800">Rp {accountingReports.capitalStatement.endingCapital.toLocaleString('id-ID')}</span>
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>
                  )}
                </div>
              )}

            </>
          )}

        </div>
      </main>

      <footer className="bg-slate-900 text-slate-400 py-3 text-center text-xs border-t border-slate-800 shrink-0 select-none" id="footer_section">
        <span>© 2026 PT Sekawan Sejahtera Bersama. Didesain dengan SAK Akuntansi Standard Double-Entry untuk Koperasi Simpan Pinjam / MFI.</span>
      </footer>
    </div>
  );
}
