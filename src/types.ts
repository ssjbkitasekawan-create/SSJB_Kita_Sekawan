/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CustomerStatus =
  | 'NOT_REGISTERED'
  | 'PENDING_SPV'
  | 'PENDING_ADM'
  | 'APPROVED_FOR_SURVEY'
  | 'LAYAK_CAIR'
  | 'TIDAK_LAYAK'
  | 'ACTIVE_LOAN'
  | 'PAID_OFF'
  | 'MACET_KABUR';

export interface Customer {
  id: string;
  name: string;
  nik: string;
  alamat: string;
  pekerjaan: string;
  status: CustomerStatus;
  is_new_member: boolean;
  group_id: string | null;
  assigned_user_id?: string | null;
  kantor_cabang?: 'PUSAT' | 'KC_MATIM';
  is_lari?: boolean;
}

export interface Region {
  id: string;
  name: string;
}

export interface Group {
  id: string;
  name: string;
  sistem_tanggung_renteng: boolean;
  survey_status: 'NOT_SURVEYED' | 'LAYAK' | 'TIDAK_LAYAK';
  survey_notes: string;
  created_at: string;
  region_id?: string;
  cycle_start_date?: string;
  tenor?: number;
  assigned_user_id?: string;
  hari_penagihan?: 'SENIN' | 'SELASA' | 'RABU' | 'KAMIS' | 'JUMAT' | 'SABTU';
  petugas_assigned_id?: string | null;
  urutan_rute?: number;
  jam_setoran?: string | null;
  is_tanggung_renteng?: boolean;
  kantor_cabang?: 'PUSAT' | 'KC_MATIM';
}

export interface GroupSurvey {
  id: string;
  group_id: string;
  petugas_id?: string;
  status: 'LAYAK' | 'TIDAK_LAYAK';
  notes: string;
  created_at: string;
  
  // New rich quantitative parameters
  id_kelompok: string;
  nama_kelompok: string;
  wilayah: string;
  tanggal_pertemuan: string;
  jumlah_anggota: number;
  jumlah_pokok_pinjaman_kelompok: number;
  foto_kelompok?: string;

  inisiatif_ketua?: 'BAIK' | 'CUKUP' | 'KURANG';
  jarak_domisili?: 'BAIK' | 'CUKUP' | 'KURANG';
  kelengkapan_dokumen_dasar?: 'BAIK' | 'CUKUP' | 'KURANG';
  ketepatan_waktu?: 'BAIK' | 'CUKUP' | 'KURANG';
  pemahaman_tanggung_renteng?: 'BAIK' | 'CUKUP' | 'KURANG';
  penentuan_ketua_kelompok?: 'BAIK' | 'CUKUP' | 'KURANG';
  pengaruh_ketua?: 'BAIK' | 'CUKUP' | 'KURANG';
  saling_kenal_antar_anggota?: 'BAIK' | 'CUKUP' | 'KURANG';
  tingkat_kehadiran?: 'BAIK' | 'CUKUP' | 'KURANG';

  total_skor?: number;
  keputusan_otomatis?: 'LAYAK' | 'TIDAK_LAYAK';
  kantor_cabang?: 'PUSAT' | 'KC_MATIM';
}

export interface IndividualSurvey {
  id: string;
  customer_id: string;
  petugas_id?: string;
  alamat_sesuai: boolean;
  kondisi_rumah: string;
  pendapatan_bulanan: number;
  status_kelayakan: 'LAYAK_CAIR' | 'TIDAK_LAYAK';
  notes: string;
  created_at: string;
  
  // New rich parameters matching expo client & backend prisma
  application_id?: string;
  tanggal_survei?: string;
  jam_survei?: string;
  pendapatan_usaha?: number;
  pengeluaran_rumah_tangga?: number;
  tanggungan_koperasi_lain?: number;
  nama_koperasi?: string;
  foto_jaminan?: string;
  foto_anggota?: string;
  rekomendasi_petugas?: string;
  kordinat_lokasi?: string;
  status_approval?: 'LAYAK_CAIR' | 'TIDAK_LAYAK';
  kantor_cabang?: 'PUSAT' | 'KC_MATIM';
}

export interface Loan {
  id: string;
  customer_id: string;
  plafon: number;
  status: 'ACTIVE_LOAN' | 'PAID_OFF' | 'MACET_KABUR';
  tanggal_cair: string;
  petugas_id?: string;
  created_at?: string;
  kantor_cabang?: 'PUSAT' | 'KC_MATIM';
  installment_paid?: number;
  minggu_terbayar?: number;
}

export interface BillingSchedule {
  id: string;
  loan_id: string;
  customer_id: string;
  term: number; // e.g. Mingguan 1 sampai 5
  parent_group_id?: string; // added to help link back to group
  tanggal_jatuh_tempo: string;
  pokok: number;
  jasa: number;
  total_tagihan: number;
  bayar_pokok: number;
  bayar_jasa: number;
  status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'MENUNGGAK';
  hari_penagihan?: string;
  petugas_penagihan_id?: string;
  petugas_penagihan_name?: string;
  assigned_user_id?: string;
  petugas_assigned_id?: string | null;
  urutan_rute?: number;
  jam_setoran?: string | null;
  is_tanggung_renteng?: boolean;
  kantor_cabang?: 'PUSAT' | 'KC_MATIM';
}

export interface Deposit {
  id: string;
  customer_id: string;
  loan_id?: string;
  nominal: number;
  tanggal_mulai?: string;
  jatuh_tempo?: string;
  tanggal_potong?: string;
  tanggal_jatuh_tempo?: string;
  tanggal_dikembalikan?: string;
  status: 'ACTIVE' | 'WITHDRAWN' | 'HOLD' | 'RELEASED';
  kantor_cabang?: 'PUSAT' | 'KC_MATIM';
}

export interface FeeCollection {
  id: string;
  loan_id: string;
  customer_id: string;
  jenis_potongan: 'UANG_PANGKAL' | 'ADMINISTRASI';
  nominal: number;
  tanggal_potong: string;
  kantor_cabang?: 'PUSAT' | 'KC_MATIM';
}

export interface Payment {
  id: string;
  billing_schedule_id: string;
  customer_id: string;
  petugas_id: string;
  nominal_bayar: number;
  tanggal_bayar: string;
  status: 'PENDING_SETORAN' | 'SETORAN_APPROVED' | 'REVISION_REQUIRED' | 'LUNAS_TALANGAN';
  catatan_revisi: string | null;
  is_offline_logged: boolean;
  payment_method?: 'TUNAI' | 'TRANSFER';
  is_menunggak?: boolean;
  is_lari?: boolean;
}

export interface COA {
  code: string;
  name: string;
  type: 'ASET' | 'KEWAJIBAN' | 'MODAL' | 'PENDAPATAN' | 'BEBAN';
  normal_balance: 'DR' | 'CR';
}

export interface JournalEntry {
  id: string;
  reference: string;
  description: string;
  date: string;
}

export interface JournalEntryLine {
  id: string;
  entry_id: string;
  account_code: string;
  debit: number;
  credit: number;
}

export interface User {
  id: string;
  nik: string;
  nama: string;
  role: 'petugas' | 'spv' | 'admin' | 'kasir' | 'super_admin';
  password_hash: string; // bcrypt or similar SHA256 simulation hash
  offline_pin_hash: string; // offline code validation hash (SHA256 representation)
  device_id: string | null; // binds physical device ID representing Expo/Mobile uuid
  status_aktif?: 'AKTIF' | 'NON_AKTIF'; // "super_admin" can manage active status
  kantor_cabang?: 'PUSAT' | 'KC_MATIM';
  cabang_id?: string;
  cabang_id_local?: string;
  employee_id?: string;
  email?: string;
}

export interface JointLiability {
  id: string;
  lender_id: string; // nasabah yang menalangi
  borrower_id: string; // nasabah yang berutang
  nominal_utang: number;
  nominal_terbayar: number;
  status: 'UNPAID' | 'PARTIAL' | 'SETTLED';
  created_at: string;
  is_cash_withdrawn?: boolean; // whether lender withdrew cash from the officer
}

export interface LiabilityPaymentHistory {
  id: string;
  liability_id: string;
  nominal_bayar: number;
  tanggal_bayar: string;
  petugas_id: string;
}

export interface RawCustomer {
  id: string;
  nama_pemohon: string;
  nama_kelompok?: string | null;
  tanggal_pencairan?: string | null;
  tanggal_jatuh_tempo?: string | null;
  panggilan?: string | null;
  tanggal_lahir?: string | null;
  alamat?: string | null;
  petani?: string | null;
  no_hp?: string | null;
  jumlah_tanggungan?: number | null;
  nik?: string | null;
  nama_penjamin?: string | null;
  pekerjaan_penjamin?: string | null;
  hubungan?: string | null;
  no_hp_penjamin?: string | null;
  tahap?: number | null;
  pokok_pinjaman?: number | null;
  tempo_mg?: number | null;
  target?: number | null;
  jumlah?: number | null;
  deposito?: number | null;
  status: string;
  kantor_cabang?: 'PUSAT' | 'KC_MATIM';
}

export interface BerkasMasuk {
  id: string;
  id_kelompok: string;
  nama_kelompok: string;
  wilayah: string;
  nama_pemohon: string;
  nik_pemohon: string;
  tahap_pinjaman: number;
  pengajuan_pinjaman: number;
  tenor_mg: number; // 25, 45, 47, atau 50
  sisa_piutang: number;
  no_telepon_pemohon: string;
  jenis_kelamin_pemohon: string;
  agama: string;
  nama_penjamin: string;
  nik_penjamin: string;
  jenis_kelamin_penjamin: string;
  no_telepon_penjamin: string;
  hubungan: string;
  doc_ktp_pemohon?: string | null;
  doc_ktp_penjamin?: string | null;
  doc_kk?: string | null;
  status: 'DRAFT' | 'PENDING_SPV' | 'PENDING_ADM' | 'APPROVED_FOR_SURVEY' | 'REJECTED';
  petugas_id: string;
  kantor_cabang?: 'PUSAT' | 'KC_MATIM';
  created_at?: string;
  catatan?: string | null;
}

export interface Disbursement {
  id: string;
  id_kelompok: string;
  nama_kelompok: string;
  petugas_pencairan_id: string;
  petugas_penagihan_id: string;
  hari_penagihan: string;
  jumlah_anggota_cair: number;
  total_pencairan_kotor: number;
  potongan_sisa_piutang: number;
  potongan_up: number;
  potongan_deposito: number;
  potongan_administrasi: number;
  total_uang_dikembalikan_ke_kantor: number;
  total_uang_kembali_ke_kantor: number;
  foto_selfie_pencairan: string;
  status_sosialisasi: boolean;
  status_verifikasi: 'SESUAI' | 'DIBATALKAN';
  tanggal_pencairan?: string;
  petugas_id?: string;
  created_at?: string;
  kantor_cabang?: 'PUSAT' | 'KC_MATIM';
}

export interface TrDebt {
  id: string;
  customer_id: string;
  group_id: string;
  nominal_talangan: number;
  status: 'BELUM_DIBAYAR' | 'LUNAS_DIKEMBALIKAN';
  tanggal_kejadian: string;
  created_at: string;
}

export interface SystemState {
  customers: Customer[];
  groups: Group[];
  groupSurveys: GroupSurvey[];
  individualSurveys: IndividualSurvey[];
  loans: Loan[];
  billingSchedules: BillingSchedule[];
  deposits: Deposit[];
  feeCollections?: FeeCollection[];
  payments: Payment[];
  journalEntries: JournalEntry[];
  journalEntryLines: JournalEntryLine[];
  users: User[];
  jointLiabilities?: JointLiability[];
  liabilityPaymentHistories?: LiabilityPaymentHistory[];
  regions?: Region[];
  rawCustomers?: RawCustomer[];
  berkasMasuk?: BerkasMasuk[];
  disbursements?: Disbursement[];
  trDebts?: TrDebt[];
  tr_debts?: TrDebt[];
  billing_logs?: any[];
  approvedGroupIds?: string[];
  opexExpenses?: OpexExpense[];
  fixedAssets?: FixedAsset[];
  liabilitiesCapitalLogs?: LiabilitiesCapitalLog[];
  bankMutations?: BankMutation[];
}

export interface OpexExpense {
  id: string;
  category: 'Bensin' | 'Gaji' | 'ATK' | 'Listrik' | 'Lainnya';
  amount: number;
  description: string;
  date: string;
  petugas_id: string;
}

export interface FixedAsset {
  id: string;
  name: string;
  acquisition_cost: number;
  salvage_value: number;
  useful_life: number; // in months
  purchase_date: string;
  monthly_depreciation: number;
  accumulated_depreciation: number;
  current_value: number;
  status: 'ACTIVE' | 'DISPOSED';
  last_depreservation_date?: string; // last date depreciation was charged
}

export interface LiabilitiesCapitalLog {
  id: string;
  type: 'UTANG' | 'MODAL';
  amount: number;
  source: string;
  date: string;
  description: string;
}

export interface BankMutation {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'CR' | 'DR';
  status: 'UNMATCHED' | 'MATCHED';
  matched_with?: string;
}

