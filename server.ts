import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import * as xlsx from "xlsx";
import PdfPrinter from "pdfmake";
import { createServer as createViteServer } from "vite";
import { Storage } from "@google-cloud/storage";
import { settleLiability, withdrawLiabilityCash, alihkanTalangan, getTrDebts, bayarTrDebt } from "./tanggungRenteng";
import { 
  SystemState, 
  Customer, 
  Group, 
  GroupSurvey, 
  IndividualSurvey, 
  Loan, 
  BillingSchedule, 
  Deposit, 
  FeeCollection,
  Payment, 
  COA, 
  JournalEntry, 
  JournalEntryLine,
  User,
  RawCustomer,
  BerkasMasuk,
  Disbursement,
  OpexExpense,
  FixedAsset,
  LiabilitiesCapitalLog,
  BankMutation
} from "./src/types";

// Hashing helper mimicking cryptographic verification
function hashSHA256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/*
IMPORTANT: SECURITY & CORS CONFIGURATION FOR GOOGLE CLOUD STORAGE
To prevent CORS (Cross-Origin Resource Sharing) block issues when rendering GCS images in the Web Dashboard or Mobile App,
set the following CORS policy on your GCP Storage Bucket.
Save this JSON configuration into a file named 'gcs-cors.json':
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD", "OPTIONS"],
    "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"],
    "maxAgeSeconds": 3600
  }
]
Then set the policy on your bucket using gsutil or gcloud command-line:
gsutil cors set gcs-cors.json gs://<your-gcs-bucket-name>
*/

// Lazy-initialization function for GCS Storage so the application boots correctly without crashing if keys are not configured yet
function getGCSStorage(): Storage {
  const projectId = process.env.GCS_PROJECT_ID;
  const credentialsB64 = process.env.GCS_CREDENTIALS;

  if (!projectId || !credentialsB64) {
    throw new Error("GCS setup missing: GCS_PROJECT_ID or GCS_CREDENTIALS environment variable is required.");
  }

  try {
    let credentialsJson: any;
    if (credentialsB64.trim().startsWith('{')) {
      credentialsJson = JSON.parse(credentialsB64);
    } else {
      const decodedString = Buffer.from(credentialsB64, 'base64').toString('utf-8');
      credentialsJson = JSON.parse(decodedString);
    }

    return new Storage({
      projectId,
      credentials: credentialsJson,
    });
  } catch (err: any) {
    throw new Error("GCS Initialization Error: Generic error parsing credentials: " + err.message);
  }
}

function getMimeType(ext: string): string {
  const mapping: { [key: string]: string } = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf"
  };
  return mapping[ext.toLowerCase()] || "application/octet-stream";
}

// Upload buffer helper for GCS
async function uploadToGCS(fileBuffer: Buffer, originalName: string): Promise<string> {
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("GCS_BUCKET_NAME is not configured in environment variables.");
  }

  const storageObj = getGCSStorage();
  const bucket = storageObj.bucket(bucketName);

  const fileExt = path.extname(originalName) || ".jpg";
  const nameWithoutExt = path.basename(originalName, fileExt).replace(/[^a-zA-Z0-9_\-]/g, '_');
  const randomId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();

  const uniqueFileName = `${nameWithoutExt}_${randomId}_${timestamp}${fileExt}`;
  const file = bucket.file(uniqueFileName);

  await file.save(fileBuffer, {
    metadata: {
      contentType: getMimeType(fileExt),
    },
    resumable: false, // Small image/file, no need for chunked sessions
  });

  try {
    // Make file public so it is fetchable via the URL
    await file.makePublic();
  } catch (err: any) {
    console.warn("Failed to set public read permissions on file (standard bucket security or ACL block may apply):", err.message);
  }

  return `https://storage.googleapis.com/${bucketName}/${uniqueFileName}`;
}

// Standard Chart of Accounts (COA) required by SAK Double-Entry rules
const STANDARD_COA: COA[] = [
  { code: '1110', name: 'Kas Kecil', type: 'ASET', normal_balance: 'DR' },
  { code: '1111', name: 'Kas di Tangan Petugas', type: 'ASET', normal_balance: 'DR' },
  { code: '1112', name: 'Kas Bank', type: 'ASET', normal_balance: 'DR' },
  { code: '1210', name: 'Piutang Pokok', type: 'ASET', normal_balance: 'DR' },
  { code: '1220', name: 'Piutang Tunggakan', type: 'ASET', normal_balance: 'DR' },
  { code: '1230', name: 'Piutang Tak Tertagih', type: 'ASET', normal_balance: 'DR' },
  { code: '1310', name: 'Aset Tetap - Peralatan/Inventaris', type: 'ASET', normal_balance: 'DR' },
  { code: '1311', name: 'Akumulasi Penyusutan Aset Tetap', type: 'ASET', normal_balance: 'CR' },
  { code: '2110', name: 'Utang Deposito', type: 'KEWAJIBAN', normal_balance: 'CR' },
  { code: '2120', name: 'Utang Pihak Ketiga', type: 'KEWAJIBAN', normal_balance: 'CR' },
  { code: '2140', name: 'Utang Titipan Kas Kelompok/Anggota', type: 'KEWAJIBAN', normal_balance: 'CR' },
  { code: '3100', name: 'Modal Disetor', type: 'MODAL', normal_balance: 'CR' },
  { code: '3300', name: 'Ikhtisar Laba/Rugi', type: 'MODAL', normal_balance: 'CR' },
  { code: '4110', name: 'Pendapatan Jasa', type: 'PENDAPATAN', normal_balance: 'CR' },
  { code: '4120', name: 'Pendapatan Uang Pangkal (UP)', type: 'PENDAPATAN', normal_balance: 'CR' },
  { code: '5100', name: 'Beban OPEX - Bensin', type: 'BEBAN', normal_balance: 'DR' },
  { code: '5110', name: 'Beban OPEX - Gaji', type: 'BEBAN', normal_balance: 'DR' },
  { code: '5120', name: 'Beban OPEX - ATK', type: 'BEBAN', normal_balance: 'DR' },
  { code: '5130', name: 'Beban OPEX - Listrik & Air', type: 'BEBAN', normal_balance: 'DR' },
  { code: '5140', name: 'Beban OPEX - Lainnya', type: 'BEBAN', normal_balance: 'DR' },
  { code: '5200', name: 'Beban Penyusutan Aset Tetap', type: 'BEBAN', normal_balance: 'DR' }
];

const INITIAL_RAW_CUSTOMERS: RawCustomer[] = [];

// Initial staging raw customers as requested (Read-Only references or used to import)
const STAGING_CUSTOMERS: Customer[] = [
  {
    id: "C2026-001",
    name: "Siti Aminah",
    nik: "3201024508820001",
    alamat: "RT 03/RW 04, Desa Bojong Gede, Bogor",
    pekerjaan: "Warung Bakso Keliling",
    status: "APPROVED_FOR_SURVEY",
    is_new_member: true,
    group_id: "G-001"
  },
  {
    id: "C2026-002",
    name: "Suryani Kulsum",
    nik: "3201026112830002",
    alamat: "RT 01/RW 02, Kampung Baru, Megamendung",
    pekerjaan: "Pembuat Kue Basah",
    status: "APPROVED_FOR_SURVEY",
    is_new_member: true,
    group_id: "G-001"
  },
  {
    id: "C2026-003",
    name: "Rukmini Rahayu",
    nik: "3214055204850003",
    alamat: "RT 05/RW 11, Kelurahan Sukasari, Bandung",
    pekerjaan: "Usaha Menjahit & Konfeksi",
    status: "APPROVED_FOR_SURVEY",
    is_new_member: false,
    group_id: "G-001"
  },
  {
    id: "C2026-004",
    name: "Fatimah Azzahra",
    nik: "3205126805890004",
    alamat: "Kampung Cipancar RT 04/05, Garut",
    pekerjaan: "Produksi Tempe Rumahan",
    status: "PENDING_SPV",
    is_new_member: true,
    group_id: "G-002"
  },
  {
    id: "C2026-005",
    name: "Kusni Ningsih",
    nik: "3207034107810005",
    alamat: "Desa Pamulihan, Sumedang",
    pekerjaan: "Kerajinan Anyaman Bambu",
    status: "PENDING_SPV",
    is_new_member: false,
    group_id: "G-002"
  },
  {
    id: "C2026-006",
    name: "Anisa Hartati",
    nik: "3310125501900006",
    alamat: "Dusun Krajan Lor, Klaten",
    pekerjaan: "Pengepul & Penjual Sayur",
    status: "NOT_REGISTERED",
    is_new_member: true,
    group_id: null
  }
];

const INITIAL_GROUPS: Group[] = [
  {
    id: "G-001",
    name: "Kelompok Melati",
    sistem_tanggung_renteng: true,
    survey_status: "NOT_SURVEYED",
    survey_notes: "",
    created_at: "2026-06-01T08:00:00Z"
  },
  {
    id: "G-002",
    name: "Kelompok Mawar",
    sistem_tanggung_renteng: false,
    survey_status: "NOT_SURVEYED",
    survey_notes: "",
    created_at: "2026-06-02T10:00:00Z"
  }
];

const DB_FILE = path.join(process.cwd(), "database.json");

function getInitialState(): SystemState {
  const state: SystemState = {
    customers: JSON.parse(JSON.stringify(STAGING_CUSTOMERS)),
    groups: JSON.parse(JSON.stringify(INITIAL_GROUPS)),
    regions: [],
    groupSurveys: [],
    individualSurveys: [],
    loans: [],
    billingSchedules: [],
    deposits: [],
    feeCollections: [],
    payments: [],
    journalEntries: [],
    journalEntryLines: [],
    rawCustomers: JSON.parse(JSON.stringify(INITIAL_RAW_CUSTOMERS)),
    berkasMasuk: [],
    disbursements: [],
    jointLiabilities: [
      {
        id: "JL-001",
        lender_id: "C2026-001", // Siti Aminah
        borrower_id: "C2026-002", // Suryani Kulsum
        nominal_utang: 250000,
        nominal_terbayar: 50000,
        status: "PARTIAL",
        created_at: "2026-06-02T10:00:00Z"
      },
      {
        id: "JL-002",
        lender_id: "C2026-003", // Rukmini Rahayu
        borrower_id: "C2026-001", // Siti Aminah
        nominal_utang: 150000,
        nominal_terbayar: 0,
        status: "UNPAID",
        created_at: "2026-06-03T11:00:00Z"
      },
      {
        id: "JL-003",
        lender_id: "C2026-002", // Suryani Kulsum
        borrower_id: "C2026-003", // Rukmini Rahayu
        nominal_utang: 300000,
        nominal_terbayar: 300000,
        status: "SETTLED",
        created_at: "2026-06-04T09:00:00Z"
      }
    ],
    liabilityPaymentHistories: [
      {
        id: "LPH-SEED-01",
        liability_id: "JL-001",
        nominal_bayar: 50000,
        tanggal_bayar: "2026-06-03T14:00:00Z",
        petugas_id: "USR-01"
      }
    ],
    users: [
      {
        id: "USR-01",
        nik: "123456",
        nama: "Budi Santoso (Petugas)",
        role: "petugas",
        password_hash: hashSHA256("petugas123"),
        offline_pin_hash: hashSHA256("123456"),
        device_id: null
      },
      {
        id: "USR-02",
        nik: "sekawan01",
        nama: "Hendri Wijaya (Petugas Senior)",
        role: "petugas",
        password_hash: hashSHA256("sekawan123"),
        offline_pin_hash: hashSHA256("654321"),
        device_id: "DEV-UUID-ANOTHER-777"
      },
      {
        id: "USR-04",
        nik: "petugas03",
        nama: "Rudi Hermawan (Petugas)",
        role: "petugas",
        password_hash: hashSHA256("sekawan123"),
        offline_pin_hash: hashSHA256("111111"),
        device_id: null
      },
      {
        id: "USR-05",
        nik: "petugas04",
        nama: "Lilis Aprilia (Petugas)",
        role: "petugas",
        password_hash: hashSHA256("sekawan123"),
        offline_pin_hash: hashSHA256("222222"),
        device_id: null
      },
      {
        id: "USR-06",
        nik: "petugas05",
        nama: "Agus Salim (Petugas)",
        role: "petugas",
        password_hash: hashSHA256("sekawan123"),
        offline_pin_hash: hashSHA256("333333"),
        device_id: null
      },
      {
        id: "USR-07",
        nik: "petugas06",
        nama: "Irma Susanti (Petugas)",
        role: "petugas",
        password_hash: hashSHA256("sekawan123"),
        offline_pin_hash: hashSHA256("444444"),
        device_id: null
      },
      {
        id: "USR-08",
        nik: "petugas07",
        nama: "Cecep Sunandar (Petugas)",
        role: "petugas",
        password_hash: hashSHA256("sekawan123"),
        offline_pin_hash: hashSHA256("555555"),
        device_id: null
      },
      {
        id: "USR-09",
        nik: "petugas08",
        nama: "Dewi Sartika (Petugas)",
        role: "petugas",
        password_hash: hashSHA256("sekawan123"),
        offline_pin_hash: hashSHA256("666666"),
        device_id: null
      },
      {
        id: "USR-10",
        nik: "petugas09",
        nama: "Eko Prasetyo (Petugas)",
        role: "petugas",
        password_hash: hashSHA256("sekawan123"),
        offline_pin_hash: hashSHA256("777777"),
        device_id: null
      },
      {
        id: "USR-11",
        nik: "petugas10",
        nama: "Fitri Handayani (Petugas)",
        role: "petugas",
        password_hash: hashSHA256("sekawan123"),
        offline_pin_hash: hashSHA256("888888"),
        device_id: null
      },
      {
        id: "USR-12",
        nik: "petugas11",
        nama: "Ginanjar Saputra (Petugas)",
        role: "petugas",
        password_hash: hashSHA256("sekawan123"),
        offline_pin_hash: hashSHA256("999999"),
        device_id: null
      },
      {
        id: "USR-03",
        nik: "admin123",
        nama: "Siti Rahma (Admin)",
        role: "admin",
        password_hash: hashSHA256("admin123"),
        offline_pin_hash: hashSHA256("000000"),
        device_id: null
      }
    ],
    opexExpenses: [],
    fixedAssets: [],
    liabilitiesCapitalLogs: [],
    bankMutations: []
  };

  // Seed capital: 75M to support our lending operations
  const entryId = "JE-SEED-01";
  state.journalEntries.push({
    id: entryId,
    reference: "MODAL_AWAL",
    description: "Setoran Modal Disetor Pemilik (Kas Bank)",
    date: "2026-06-01T00:00:00Z"
  });

  state.journalEntryLines.push({
    id: "JEL-SEED-01",
    entry_id: entryId,
    account_code: "1112", // Kas Bank (Dr)
    debit: 75000000,
    credit: 0
  });

  state.journalEntryLines.push({
    id: "JEL-SEED-02",
    entry_id: entryId,
    account_code: "3100", // Modal Disetor (Cr)
    debit: 0,
    credit: 75000000
  });

  return state;
}

// Read/Write DB helper
function readDB(): SystemState {
  if (!fs.existsSync(DB_FILE)) {
    const initialState = getInitialState();
    fs.writeFileSync(DB_FILE, JSON.stringify(initialState, null, 2));
    return initialState;
  }
  try {
    const data = fs.readFileSync(DB_FILE, "utf-8");
    const parsed = JSON.parse(data);
    const initial = getInitialState();
    const merged = {
      ...initial,
      ...parsed,
      customers: parsed.customers || initial.customers,
      groups: parsed.groups || initial.groups,
      regions: parsed.regions || initial.regions || [],
      groupSurveys: parsed.groupSurveys || initial.groupSurveys,
      individualSurveys: parsed.individualSurveys || initial.individualSurveys,
      loans: parsed.loans || initial.loans,
      billingSchedules: parsed.billingSchedules || initial.billingSchedules,
      deposits: parsed.deposits || initial.deposits,
      feeCollections: parsed.feeCollections || initial.feeCollections || [],
      payments: parsed.payments || initial.payments,
      journalEntries: parsed.journalEntries || initial.journalEntries,
      journalEntryLines: parsed.journalEntryLines || initial.journalEntryLines,
      jointLiabilities: parsed.jointLiabilities || initial.jointLiabilities,
      liabilityPaymentHistories: parsed.liabilityPaymentHistories || initial.liabilityPaymentHistories,
      users: parsed.users || initial.users,
      rawCustomers: parsed.rawCustomers || initial.rawCustomers || [],
      disbursements: parsed.disbursements || initial.disbursements || [],
      opexExpenses: parsed.opexExpenses || initial.opexExpenses || [],
      fixedAssets: parsed.fixedAssets || initial.fixedAssets || [],
      liabilitiesCapitalLogs: parsed.liabilitiesCapitalLogs || initial.liabilitiesCapitalLogs || [],
      bankMutations: parsed.bankMutations || initial.bankMutations || [],
    };
    // If any keys were missing, save them back to DB_FILE so the file remains intact
    if (!parsed.users || !parsed.jointLiabilities || !parsed.liabilityPaymentHistories || !parsed.regions || !parsed.rawCustomers || !parsed.disbursements || !parsed.opexExpenses || !parsed.fixedAssets || !parsed.liabilitiesCapitalLogs || !parsed.bankMutations) {
      fs.writeFileSync(DB_FILE, JSON.stringify(merged, null, 2));
    }
    return merged;
  } catch (err) {
    console.error("Failed to read database file, resetting State", err);
    const initialState = getInitialState();
    fs.writeFileSync(DB_FILE, JSON.stringify(initialState, null, 2));
    return initialState;
  }
}

function writeDB(state: SystemState) {
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2));
}

function getDayNumber(indonesianDay: string): number {
  const normalized = String(indonesianDay).toUpperCase().trim();
  switch (normalized) {
    case 'MINGGU': return 0;
    case 'SENIN': return 1;
    case 'SELASA': return 2;
    case 'RABU': return 3;
    case 'KAMIS': return 4;
    case 'JUMAT': return 5;
    case 'SABTU': return 6;
    default: return 1; // Fallback to Monday (1)
  }
}

function calculateNextTargetDay(tanggalCairStr: string, hariPenagihan: string): Date | null {
  if (!tanggalCairStr) return null;
  const d = new Date(tanggalCairStr);
  if (isNaN(d.getTime())) return null;

  const targetDay = getDayNumber(hariPenagihan);
  const currentDay = d.getDay(); // 0 is Sunday, 1 is Monday...

  let diff = targetDay - currentDay;
  if (diff <= 0) {
    diff += 7; // Find the next occurrence
  }
  const nextTargetDate = new Date(d);
  nextTargetDate.setDate(nextTargetDate.getDate() + diff);
  return nextTargetDate;
}

function calculateDueDates(tanggalPencairan: string, hariPenagihan: string | null | undefined, sisaMinggu: number) {
  if (!tanggalPencairan) return { firstDueDate: null, finalDueDate: null };
  if (!hariPenagihan || hariPenagihan.toUpperCase() === 'BELUM_DIATUR' || hariPenagihan.trim() === '') {
    return { firstDueDate: null, finalDueDate: null };
  }

  const firstDueDate = calculateNextTargetDay(tanggalPencairan, hariPenagihan);
  if (!firstDueDate) return { firstDueDate: null, finalDueDate: null };

  const finalDueDate = new Date(firstDueDate);
  const multiplier = sisaMinggu > 0 ? (sisaMinggu - 1) : 0;
  finalDueDate.setDate(finalDueDate.getDate() + (multiplier * 7));

  return {
    firstDueDate: firstDueDate.toISOString().slice(0, 10),
    finalDueDate: finalDueDate.toISOString().slice(0, 10)
  };
}

// Generate sequential auto-numbering document IDs with concurrency safety
function generateDocumentId(docType: 'BM' | 'KLP' | 'SPK', cabang: string, db: SystemState, date: Date = new Date()): string {
  const codeCabang = (cabang || "PUSAT").toUpperCase() === 'KC_MATIM' ? 'MTM' : 'PST';
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yymm = `${yy}${mm}`;
  const prefix = `${docType}-${codeCabang}-${yymm}-`;

  let maxSeq = 0;

  if (docType === 'BM' && db.berkasMasuk) {
    db.berkasMasuk.forEach(b => {
      if (b.id && b.id.startsWith(prefix)) {
        const indexStr = b.id.slice(prefix.length);
        const seqNum = parseInt(indexStr, 10);
        if (!isNaN(seqNum) && seqNum > maxSeq) {
          maxSeq = seqNum;
        }
      }
    });
  } else if (docType === 'KLP' && db.groups) {
    db.groups.forEach(g => {
      if (g.id && g.id.startsWith(prefix)) {
        const indexStr = g.id.slice(prefix.length);
        const seqNum = parseInt(indexStr, 10);
        if (!isNaN(seqNum) && seqNum > maxSeq) {
          maxSeq = seqNum;
        }
      }
    });
  } else if (docType === 'SPK' && db.loans) {
    db.loans.forEach(l => {
      if (l.id && l.id.startsWith(prefix)) {
        const indexStr = l.id.slice(prefix.length);
        const seqNum = parseInt(indexStr, 10);
        if (!isNaN(seqNum) && seqNum > maxSeq) {
          maxSeq = seqNum;
        }
      }
    });
  }

  const nextSeq = maxSeq + 1;
  const nextSeqStr = String(nextSeq).padStart(4, '0');
  return `${prefix}${nextSeqStr}`;
}

// Generate double entry journal logs with validation
function addJournalEntry(
  state: SystemState, 
  reference: string, 
  description: string, 
  lines: { account_code: string; debit: number; credit: number }[]
) {
  // Validate that Dr == Cr
  const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Double-Entry Error: Debit (Rp ${totalDebit}) must equal Credit (Rp ${totalCredit})!`);
  }

  const entryId = `JE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const journalEntry: JournalEntry = {
    id: entryId,
    reference,
    description,
    date: new Date().toISOString()
  };

  state.journalEntries.push(journalEntry);

  lines.forEach((line, index) => {
    state.journalEntryLines.push({
      id: `JEL-${entryId}-${index}`,
      entry_id: entryId,
      account_code: line.account_code,
      debit: line.debit,
      credit: line.credit
    });
  });
}

// Helper to calculate ledger balance
function getAccountBalance(state: SystemState, code: string): number {
  const coa = STANDARD_COA.find(c => c.code === code);
  if (!coa) return 0;

  let balance = 0;
  state.journalEntryLines.forEach(line => {
    if (line.account_code === code) {
      if (coa.normal_balance === 'DR') {
        balance += (line.debit - line.credit);
      } else {
        balance += (line.credit - line.debit);
      }
    }
  });

  return balance;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  const upload = multer({ storage: multer.memoryStorage() });

  // Middleware Otorisasi dengan Global Bypass SUPER_ADMIN
  const checkRole = (allowedRoles: string[]) => {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const user = getUserFromReq(req);
      // SUPER_ADMIN Bypass: Selalu diizinkan secara penuh tanpa pengecualian
      if (user.role === 'super_admin' || user.role === 'SUPER_ADMIN') {
        return next();
      }
      if (!allowedRoles.map(r => r.toLowerCase()).includes(user.role.toLowerCase())) {
        return res.status(403).json({ success: false, error: "Akses ditolak: Otorisasi tidak memadai." });
      }
      next();
    };
  };

  function getUserFromReq(req: express.Request) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return { id: "USR-03", role: "admin", cabang_id: "PUSAT" };
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return { id: "USR-03", role: "admin", cabang_id: "PUSAT" };
    const token = parts[1];
    if (!token.startsWith("sim-jwt.")) return { id: "USR-03", role: "admin", cabang_id: "PUSAT" };
    try {
      const base64 = token.substring("sim-jwt.".length);
      const decoded = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
      return {
        id: decoded.userId || decoded.id,
        role: (decoded.role || "admin").toLowerCase(),
        cabang_id: (decoded.cabang_id || "PUSAT").toUpperCase()
      };
    } catch (e) {
      return { id: "USR-03", role: "admin", cabang_id: "PUSAT" };
    }
  }

  // API: Get entire application state combined with static references
  app.get("/api/state", (req, res) => {
    const db = readDB();
    const userObj = getUserFromReq(req);

    const userCabang = (userObj.cabang_id || "PUSAT").toUpperCase();
    const isSuperAdmin = userObj.role === "super_admin" || userObj.role === "superadmin";

    // Row-level Security / Branch-level isolation
    const shouldFilter = !isSuperAdmin || userCabang !== "ALL";
    const targetCabang = userCabang === "ALL" ? "PUSAT" : userCabang;

    if (shouldFilter) {
      if (db.rawCustomers) {
        db.rawCustomers = db.rawCustomers.filter((rc: any) => (rc.kantor_cabang || "PUSAT").toUpperCase() === targetCabang);
      }
      
      if (db.customers) {
        db.customers = db.customers.filter((c: any) => {
          if (!c.kantor_cabang) {
            const grp = db.groups?.find((g: any) => g.id === c.group_id);
            c.kantor_cabang = grp?.kantor_cabang || "PUSAT";
          }
          return (c.kantor_cabang || "PUSAT").toUpperCase() === targetCabang;
        });
      }
      const allowedCustIds = new Set((db.customers || []).map((c: any) => c.id));

      if (db.groups) {
        db.groups = db.groups.filter((g: any) => (g.kantor_cabang || "PUSAT").toUpperCase() === targetCabang);
      }
      const allowedGroupIds = new Set((db.groups || []).map((g: any) => g.id));

      if (db.berkasMasuk) {
        db.berkasMasuk = db.berkasMasuk.filter((b: any) => (b.kantor_cabang || "PUSAT").toUpperCase() === targetCabang);
      }

      if (db.groupSurveys) {
        db.groupSurveys = db.groupSurveys.filter((gs: any) => allowedGroupIds.has(gs.group_id) || (gs.kantor_cabang || "PUSAT").toUpperCase() === targetCabang);
      }

      if (db.individualSurveys) {
        db.individualSurveys = db.individualSurveys.filter((is: any) => allowedCustIds.has(is.customer_id) || (is.kantor_cabang || "PUSAT").toUpperCase() === targetCabang);
      }

      if (db.disbursements) {
        db.disbursements = db.disbursements.filter((d: any) => allowedCustIds.has(d.customer_id) || (d.kantor_cabang || "PUSAT").toUpperCase() === targetCabang);
      }

      if (db.billingSchedules) {
        db.billingSchedules = db.billingSchedules.filter((s: any) => allowedCustIds.has(s.customer_id));
      }

      if (db.payments) {
        db.payments = db.payments.filter((p: any) => allowedCustIds.has(p.customer_id));
      }

      if (db.deposits) {
        db.deposits = db.deposits.filter((dep: any) => allowedCustIds.has(dep.customer_id));
      }

      if (db.feeCollections) {
        db.feeCollections = db.feeCollections.filter((f: any) => allowedCustIds.has(f.customer_id));
      }

      if (db.loans) {
        db.loans = db.loans.filter((l: any) => allowedCustIds.has(l.customer_id));
      }

      if (db.trDebts) {
        db.trDebts = db.trDebts.filter((d: any) => allowedCustIds.has(d.customer_id));
      }

      if (db.tr_debts) {
        db.tr_debts = db.tr_debts.filter((d: any) => allowedCustIds.has(d.customer_id));
      }
    }

    // Role-specific filtering for Field Officer (Petugas Lapangan)
    if (userObj.role === "petugas") {
      if (db.berkasMasuk) {
        db.berkasMasuk = db.berkasMasuk.filter((b: any) => b.petugas_id === userObj.id);
      }
      if (db.groupSurveys) {
        db.groupSurveys = db.groupSurveys.filter((gs: any) => gs.petugas_id === userObj.id);
      }
      if (db.individualSurveys) {
        db.individualSurveys = db.individualSurveys.filter((is: any) => is.petugas_id === userObj.id);
      }
      if (db.disbursements) {
        db.disbursements = db.disbursements.filter((d: any) => d.petugas_pencairan_id === userObj.id || d.petugas_id === userObj.id);
      }
    }
    
    const mappedRaw = (db.rawCustomers || []).map(rc => ({
      id: rc.id,
      name: rc.nama_pemohon,
      nik: rc.nik,
      alamat: rc.alamat ?? "-",
      pekerjaan: rc.petani || "Pertanian",
      status: rc.status === "SELESAI" ? "PAID_OFF" as any : "APPROVED_FOR_SURVEY" as any,
      is_new_member: rc.tahap === 1,
      group_id: null
    }));

    res.json({
      state: db,
      coa: STANDARD_COA,
      raw_customers_2026: [...STAGING_CUSTOMERS, ...mappedRaw]
    });
  });

  // TRACKING A: TRACKING UANG PANGKAL (UP)
  app.get("/api/tracking/uang-pangkal", (req, res) => {
    const { startDate, endDate, search } = req.query;
    const db = readDB();
    if (!db.feeCollections) db.feeCollections = [];

    let data = db.feeCollections.filter(f => f.jenis_potongan === 'UANG_PANGKAL');

    // Get enriched info (customer, group)
    let enriched = data.map(item => {
      const customer = db.customers.find(c => c.id === item.customer_id);
      const group = customer?.group_id ? db.groups.find(g => g.id === customer.group_id) : null;
      return {
        ...item,
        customer_name: customer?.name || "Nama Tidak Dikenal",
        customer_nik: customer?.nik || "-",
        group_name: group?.name || "Kelompok Tidak Berasosiasi",
        group_id: customer?.group_id || ""
      };
    });

    // Date range filter
    if (startDate) {
      const sDate = new Date(String(startDate));
      enriched = enriched.filter(item => new Date(item.tanggal_potong) >= sDate);
    }
    if (endDate) {
      const eDate = new Date(String(endDate));
      eDate.setHours(23, 59, 59, 999); // inclusive of end date
      enriched = enriched.filter(item => new Date(item.tanggal_potong) <= eDate);
    }

    // Search query keyword (customer name, group name, customer_id, loan_id etc.)
    if (search) {
      const kw = String(search).toLowerCase();
      enriched = enriched.filter(item => 
        item.customer_name.toLowerCase().includes(kw) ||
        item.group_name.toLowerCase().includes(kw) ||
        item.customer_nik.toLowerCase().includes(kw) ||
        item.loan_id.toLowerCase().includes(kw)
      );
    }

    // Sort by most recent
    enriched.sort((a, b) => new Date(b.tanggal_potong).getTime() - new Date(a.tanggal_potong).getTime());

    // Calculate total UP accumulator
    const totalAccumulation = enriched.reduce((sum, item) => sum + Number(item.nominal), 0);

    res.json({
      success: true,
      data: enriched,
      total_up: totalAccumulation
    });
  });

  // TRACKING B: TRACKING DEPOSITO
  app.get("/api/tracking/deposito", (req, res) => {
    const { startDate, endDate, search, status } = req.query; // status: HOLD / RELEASED
    const db = readDB();
    if (!db.deposits) db.deposits = [];

    let data = db.deposits;

    // Get enriched info
    let enriched = data.map(item => {
      const customer = db.customers.find(c => c.id === item.customer_id);
      const group = customer?.group_id ? db.groups.find(g => g.id === customer.group_id) : null;
      if (!db.loans) db.loans = [];
      const activeLoan = db.loans.find(l => l.customer_id === item.customer_id && l.status === 'ACTIVE_LOAN');
      
      // Let's check for tunggakan (unpaid and overdue billing schedules)
      if (!db.billingSchedules) db.billingSchedules = [];
      const overdueSchedules = db.billingSchedules.filter(s => 
        s.customer_id === item.customer_id && 
        (s.status === 'OVERDUE' || (s.status !== 'PAID' && new Date(s.tanggal_jatuh_tempo) <= new Date()))
      );
      const has_tunggakan = overdueSchedules.length > 0;

      return {
        ...item,
        customer_name: customer?.name || "Nama Tidak Dikenal",
        customer_nik: customer?.nik || "-",
        group_name: group?.name || "Kelompok Tidak Berasosiasi",
        group_id: customer?.group_id || "",
        has_active_loan: !!activeLoan,
        loan_status: activeLoan ? 'ACTIVE_LOAN' : 'PAID_OFF',
        has_tunggakan,
        overdue_count: overdueSchedules.length,
        // support standard fields
        nominal: item.nominal,
        tanggal_potong: item.tanggal_potong || item.tanggal_mulai || new Date().toISOString(),
        tanggal_jatuh_tempo: item.tanggal_jatuh_tempo || item.jatuh_tempo || new Date().toISOString(),
        status: item.status || 'HOLD'
      };
    });

    // Status filter
    if (status) {
      const queryStatus = String(status).toUpperCase();
      enriched = enriched.filter(item => item.status === queryStatus);
    }

    // Date range filter based on tanggal_potong
    if (startDate) {
      const sDate = new Date(String(startDate));
      enriched = enriched.filter(item => new Date(item.tanggal_potong) >= sDate);
    }
    if (endDate) {
      const eDate = new Date(String(endDate));
      eDate.setHours(23, 59, 59, 999);
      enriched = enriched.filter(item => new Date(item.tanggal_potong) <= eDate);
    }

    // Search query keyword
    if (search) {
      const kw = String(search).toLowerCase();
      enriched = enriched.filter(item => 
        item.customer_name.toLowerCase().includes(kw) ||
        item.group_name.toLowerCase().includes(kw) ||
        item.customer_nik.toLowerCase().includes(kw) ||
        item.id.toLowerCase().includes(kw) ||
        (item.loan_id && item.loan_id.toLowerCase().includes(kw))
      );
    }

    // Sort by proximity or creation
    enriched.sort((a, b) => new Date(b.tanggal_potong).getTime() - new Date(a.tanggal_potong).getTime());

    res.json({
      success: true,
      data: enriched
    });
  });

  // TRACKING C: TRACKING BIAYA ADMINISTRASI
  app.get("/api/tracking/administrasi", (req, res) => {
    const { startDate, endDate, search } = req.query;
    const db = readDB();
    if (!db.feeCollections) db.feeCollections = [];

    let data = db.feeCollections.filter(f => f.jenis_potongan === 'ADMINISTRASI');

    // Get enriched info
    let enriched = data.map(item => {
      const customer = db.customers.find(c => c.id === item.customer_id);
      const group = customer?.group_id ? db.groups.find(g => g.id === customer.group_id) : null;
      return {
        ...item,
        customer_name: customer?.name || "Nama Tidak Dikenal",
        customer_nik: customer?.nik || "-",
        group_name: group?.name || "Kelompok Tidak Berasosiasi",
        group_id: customer?.group_id || ""
      };
    });

    // Date range filter
    if (startDate) {
      const sDate = new Date(String(startDate));
      enriched = enriched.filter(item => new Date(item.tanggal_potong) >= sDate);
    }
    if (endDate) {
      const eDate = new Date(String(endDate));
      eDate.setHours(23, 59, 59, 999);
      enriched = enriched.filter(item => new Date(item.tanggal_potong) <= eDate);
    }

    // Search query keyword
    if (search) {
      const kw = String(search).toLowerCase();
      enriched = enriched.filter(item => 
        item.customer_name.toLowerCase().includes(kw) ||
        item.group_name.toLowerCase().includes(kw) ||
        item.customer_nik.toLowerCase().includes(kw) ||
        item.loan_id.toLowerCase().includes(kw)
      );
    }

    enriched.sort((a, b) => new Date(b.tanggal_potong).getTime() - new Date(a.tanggal_potong).getTime());

    const totalAccumulation = enriched.reduce((sum, item) => sum + Number(item.nominal), 0);

    res.json({
      success: true,
      data: enriched,
      total_admin: totalAccumulation
    });
  });

  // RELEASE DEPOSIT (HOLD -> RELEASED) with database ACID transaction simulation
  const releaseDepositHandler = (req: express.Request, res: express.Response) => {
    const deposit_id = req.params.id || req.body.deposit_id;
    if (!deposit_id) {
      return res.status(400).json({ error: "Missing deposit ID parameter." });
    }
    
    const state = readDB();
    if (!state.deposits) state.deposits = [];
    if (!state.loans) state.loans = [];

    const dep = state.deposits.find(d => d.id === deposit_id);
    if (!dep) {
      return res.status(404).json({ error: "Deposit record not found." });
    }

    if (dep.status === 'RELEASED') {
      return res.status(400).json({ error: "Deposito ini sudah berstatus RELEASED (telah dikembalikan)." });
    }

    // Checking if customer has active loans or overdue schedules for the txn meta description
    const customerActiveLoans = state.loans.filter(l => l.customer_id === dep.customer_id && l.status === 'ACTIVE_LOAN');
    const hasActiveLoan = customerActiveLoans.length > 0;
    
    if (!state.billingSchedules) state.billingSchedules = [];
    const overdueSchedules = state.billingSchedules.filter(s => 
      s.customer_id === dep.customer_id && 
      (s.status === 'OVERDUE' || (s.status !== 'PAID' && new Date(s.tanggal_jatuh_tempo) <= new Date()))
    );
    const hasTunggakan = overdueSchedules.length > 0;

    try {
      // Simulation of a transaction using atomic state writing mimicking:
      // await prisma.$transaction(async (tx) => { ... })
      
      // 1. Change status to RELEASED and log tanggal_dikembalikan
      dep.status = 'RELEASED';
      dep.tanggal_dikembalikan = new Date().toISOString();

      // Enriched manual override description for standard ledger clarity
      let entryDesc = `Pengembalian Deposito Jaminan Nasabah ID ${dep.customer_id} (ID Deposito: ${dep.id}) - Manual Override`;
      if (hasTunggakan) {
        entryDesc += " [PERINGATAN: Nasabah Memiliki Tunggakan Kredit]";
      } else if (hasActiveLoan) {
        entryDesc += " [INFO: Nasabah Memiliki Pinjaman Aktif]";
      }

      // 2. Trigger Accounting entries (Dr 2110 / Cr 1112)
      addJournalEntry(
        state,
        `RELEASE-DEP-${dep.id}`,
        entryDesc,
        [
          { account_code: '2110', debit: dep.nominal, credit: 0 }, // Utang Deposito (Dr)
          { account_code: '1112', debit: 0, credit: dep.nominal }  // Kas Bank (Cr)
        ]
      );

      // Save system state representing successfully committed transaction
      writeDB(state);

      res.json({
        success: true,
        message: `Deposito ${dep.id} senilai Rp ${dep.nominal.toLocaleString('id-ID')} berhasil dikembalikan secara manual (Manual Override). Transaksi keuangan pengeluaran kas (Dr 2110, Cr 1112) berhasil dicatat!`,
        data: dep
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Gagal memproses transaksi keuangan pengembalian deposito." });
    }
  };

  app.post("/api/deposito/:id/release", releaseDepositHandler);
  app.post("/api/tracking/deposito/release", releaseDepositHandler);

  // API: Get Raw Customers (Data Warehouse)
  app.get("/api/raw-customers", checkRole(['admin', 'spv', 'super_admin']), (req, res) => {
    const search = req.query.search ? String(req.query.search).trim() : "";
    const statusQuery = req.query.status ? String(req.query.status).trim().toUpperCase() : "";
    let cabangQuery = req.query.cabang ? String(req.query.cabang).trim().toUpperCase() : "PUSAT";
    const page = req.query.page ? parseInt(String(req.query.page)) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit)) : 10;

    const db = readDB();
    if (!db.rawCustomers) {
      db.rawCustomers = [];
    }

    const userObj = getUserFromReq(req);
    // Row-level Security: Enforce branch selection if not super_admin or limited super_admin
    const isSuperAdmin = userObj.role === "super_admin" || userObj.role === "SUPER_ADMIN";
    const uCabang = (userObj.cabang_id || "PUSAT").toUpperCase();
    if (!isSuperAdmin) {
      cabangQuery = uCabang;
    } else if (uCabang !== "ALL") {
      cabangQuery = uCabang;
    }

    let filtered = db.rawCustomers;

    // Filter by branch (cabang), default undefined/null values to PUSAT (Prisma style WHERE)
    if (cabangQuery !== "ALL") {
      filtered = filtered.filter(rc => {
        const dbCabang = rc.kantor_cabang || "PUSAT";
        return dbCabang.toUpperCase() === cabangQuery;
      });
    }

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(rc => 
        (rc.nama_pemohon || "").toLowerCase().includes(q) || 
        (rc.nik || "").toLowerCase().includes(q) || 
        (rc.nama_kelompok || "").toLowerCase().includes(q)
      );
    }

    if (statusQuery && statusQuery !== "ALL") {
      filtered = filtered.filter(rc => {
        const itemStatus = String(rc.status).trim().toUpperCase();
        return itemStatus === statusQuery;
      });
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    res.json({
      success: true,
      data: paginated,
      total,
      page,
      limit,
      totalPages
    });
  });

  // API: Search Raw Customers for Auto-Fill
  app.get("/api/raw-customers/search", checkRole(['admin', 'spv', 'super_admin']), (req, res) => {
    const q = req.query.q ? String(req.query.q).trim().toLowerCase() : "";
    const db = readDB();
    if (!db.rawCustomers) {
      db.rawCustomers = [];
    }

    if (!q) {
      return res.json({ success: true, data: [] });
    }

    const userObj = getUserFromReq(req);
    let filtered = db.rawCustomers.filter(rc => 
      (rc.nama_pemohon || "").toLowerCase().includes(q) || 
      (rc.nik || "").toLowerCase().includes(q)
    );

    // Row-level Security: Enforce branch selection if not super_admin or limited super_admin
    const isSuperAdmin = userObj.role === "super_admin" || userObj.role === "SUPER_ADMIN";
    const userCabang = (userObj.cabang_id || "PUSAT").toUpperCase();
    if (!isSuperAdmin || userCabang !== "ALL") {
      const targetCab = userCabang === "ALL" ? "PUSAT" : userCabang;
      filtered = filtered.filter(rc => (rc.kantor_cabang || "PUSAT").toUpperCase() === targetCab);
    }

    res.json({
      success: true,
      data: filtered.slice(0, 15)
    });
  });

  // API: Upload file for Berkas Masuk
  app.post("/api/berkas-masuk/upload", upload.single("file"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "File tidak boleh kosong atau field name salah (harus 'file')." });
    }

    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileExt = path.extname(req.file.originalname) || ".jpg";
    const filename = `${Date.now()}-${Math.floor(Math.random() * 100000)}${fileExt}`;
    const filePath = path.join(uploadsDir, filename);

    fs.writeFileSync(filePath, req.file.buffer);

    res.json({
      success: true,
      url: `/uploads/${filename}`
    });
  });

  // API: Get Berkas Masuk List
  app.get("/api/berkas-masuk", checkRole(['petugas', 'spv', 'admin', 'super_admin']), (req, res) => {
    const db = readDB();
    if (!db.berkasMasuk) db.berkasMasuk = [];
    const userObj = getUserFromReq(req);

    const statusQuery = req.query.status ? String(req.query.status).trim().toUpperCase() : "";
    const search = req.query.search ? String(req.query.search).trim().toLowerCase() : "";

    let filtered = db.berkasMasuk;

    // Row-level Security / Branch Isolation
    const isSuperAdmin = userObj.role === "super_admin" || userObj.role === "SUPER_ADMIN";
    const uCabang = (userObj.cabang_id || "PUSAT").toUpperCase();
    if (!isSuperAdmin || uCabang !== "ALL") {
      const targetCab = uCabang === "ALL" ? "PUSAT" : uCabang;
      filtered = filtered.filter(b => (b.kantor_cabang || "PUSAT").toUpperCase() === targetCab);
    }

    // Role-based filtering for Field Officer (Petugas Lapangan)
    if (userObj.role === "petugas") {
      filtered = filtered.filter(b => b.petugas_id === userObj.id);
    } else {
      // Simulate Prisma .include({ petugas: { select: { nama_lengkap: true } } })
      filtered = filtered.map(b => {
        const u = db.users?.find((x: any) => x.id === b.petugas_id);
        return {
          ...b,
          petugas: {
            nama_lengkap: u ? u.nama : "Admin / Pusat"
          }
        };
      });
    }

    if (statusQuery) {
      filtered = filtered.filter(b => b.status === statusQuery);
    }
    if (search) {
      filtered = filtered.filter(b => 
        b.nama_pemohon.toLowerCase().includes(search) || 
        b.nik_pemohon.toLowerCase().includes(search) ||
        b.nama_kelompok.toLowerCase().includes(search)
      );
    }

    res.json({
      success: true,
      data: filtered
    });
  });

  // API: Get Surveys (Group & Individual) List with RLS Data Filtering
  app.get("/api/survei", checkRole(['petugas', 'spv', 'admin', 'super_admin']), (req, res) => {
    const userObj = getUserFromReq(req);
    const db = readDB();
    if (!db.groupSurveys) db.groupSurveys = [];
    if (!db.individualSurveys) db.individualSurveys = [];

    let filteredGroup = db.groupSurveys;
    let filteredIndiv = db.individualSurveys;

    // Row-level Security / Branch Isolation
    const isSuperAdmin = userObj.role === "super_admin" || userObj.role === "SUPER_ADMIN";
    const uCabang = (userObj.cabang_id || "PUSAT").toUpperCase();
    if (!isSuperAdmin || uCabang !== "ALL") {
      const targetCab = uCabang === "ALL" ? "PUSAT" : uCabang;
      filteredGroup = filteredGroup.filter(gs => (gs.kantor_cabang || "PUSAT").toUpperCase() === targetCab);
      filteredIndiv = filteredIndiv.filter(is => (is.kantor_cabang || "PUSAT").toUpperCase() === targetCab);
    }

    // Role-based filtering for Field Officer (Petugas Lapangan)
    if (userObj.role === "petugas") {
      filteredGroup = filteredGroup.filter(gs => gs.petugas_id === userObj.id);
      filteredIndiv = filteredIndiv.filter(is => is.petugas_id === userObj.id);
    } else {
      // Simulate Prisma .include({ petugas: { select: { nama_lengkap: true } } })
      filteredGroup = filteredGroup.map(gs => ({
        ...gs,
        petugas: { nama_lengkap: db.users?.find(u => u.id === gs.petugas_id)?.nama || "Admin / Pusat" }
      }));
      filteredIndiv = filteredIndiv.map(is => ({
        ...is,
        petugas: { nama_lengkap: db.users?.find(u => u.id === is.petugas_id)?.nama || "Admin / Pusat" }
      }));
    }

    res.json({
      success: true,
      groupSurveys: filteredGroup,
      individualSurveys: filteredIndiv
    });
  });

  // API: Get Pencairan List with RLS Data Filtering
  app.get("/api/pencairan", checkRole(['petugas', 'spv', 'admin', 'kasir', 'super_admin']), (req, res) => {
    const userObj = getUserFromReq(req);
    const db = readDB();
    if (!db.disbursements) db.disbursements = [];

    let filtered = db.disbursements;

    // Row-level Security / Branch Isolation
    const isSuperAdmin = userObj.role === "super_admin" || userObj.role === "SUPER_ADMIN";
    const uCabang = (userObj.cabang_id || "PUSAT").toUpperCase();
    if (!isSuperAdmin || uCabang !== "ALL") {
      const targetCab = uCabang === "ALL" ? "PUSAT" : uCabang;
      filtered = filtered.filter(d => (d.kantor_cabang || "PUSAT").toUpperCase() === targetCab);
    }

    if (userObj.role === "petugas") {
      filtered = filtered.filter(d => d.petugas_pencairan_id === userObj.id || d.petugas_id === userObj.id);
    } else {
      // Simulate Prisma .include({ petugas: { select: { nama_lengkap: true } } })
      filtered = filtered.map(d => ({
        ...d,
        petugas: { nama_lengkap: db.users?.find(u => u.id === d.petugas_pencairan_id)?.nama || "Admin / Pusat" }
      }));
    }

    res.json({
      success: true,
      data: filtered
    });
  });

  // API Check / Sync activeSchedules for HP petugas
  app.get("/api/sync/pull", (req, res) => {
    const userObj = getUserFromReq(req);
    const db = readDB();
    const officerId = req.query.user_id ? String(req.query.user_id) : userObj.id;

    if (!db.billingSchedules) db.billingSchedules = [];
    if (!db.groups) db.groups = [];
    if (!db.customers) db.customers = [];
    if (!db.regions) db.regions = [];

    // Filter billingSchedules where assigned_user_id matches officerId, or petugas_penagihan_id matches officerId
    const schedules = db.billingSchedules.filter((sched: any) => {
      // Must be assigned to this user
      const isAssigned = sched.assigned_user_id === officerId || sched.petugas_penagihan_id === officerId;
      return isAssigned;
    });

    const populated = schedules.map((sched: any) => {
      const cust = db.customers.find((c: any) => c.id === sched.customer_id);
      const grp = cust ? db.groups.find((g: any) => g.id === cust.group_id) : null;
      const regionObj = grp ? db.regions.find((r: any) => r.id === grp.region_id) : null;
      // Get all members of this group
      const members = grp ? db.customers.filter((c: any) => c.group_id === grp.id) : [];

      return {
        ...sched,
        group: grp ? {
          ...grp,
          region: regionObj || { id: grp.region_id || "R-01", name: "Wilayah " + (grp.region_id || "Umum") },
          members: members
        } : null
      };
    });

    res.json({
      success: true,
      activeSchedules: populated
    });
  });

  // API: Get daily route for mobile sync (GET /api/sync/rute-harian)
  app.get("/api/sync/rute-harian", (req, res) => {
    const userObj = getUserFromReq(req);
    const db = readDB();
    const officerId = req.query.user_id ? String(req.query.user_id) : userObj.id;

    const days = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"];
    const todayIndex = new Date().getDay();
    const hariIni = days[todayIndex];

    if (!db.groups) db.groups = [];

    // Filter groups where assigned petugas matches and day matches
    const ruteHariIni = db.groups
      .filter((g: any) => {
        const isAssigned = g.petugas_assigned_id === officerId || g.assigned_user_id === officerId;
        const isToday = g.hari_penagihan?.toUpperCase() === hariIni;
        return isAssigned && isToday;
      })
      .sort((a: any, b: any) => {
        const urutanA = typeof a.urutan_rute !== "undefined" ? Number(a.urutan_rute) : 0;
        const urutanB = typeof b.urutan_rute !== "undefined" ? Number(b.urutan_rute) : 0;
        return urutanA - urutanB;
      });

    res.json({
      success: true,
      hari: hariIni,
      rute: ruteHariIni
    });
  });

  // GET ALL USERS FOR MANAGEMENT
  app.get("/api/users", checkRole(['super_admin']), (req, res) => {
    const db = readDB();
    if (!db.users) db.users = [];

    // Make sure SUPER_ADMIN is in db
    const hasSuperAdmin = db.users.some((u: any) => u.id === "SUPER_ADMIN" || u.nik === "superadmin");
    if (!hasSuperAdmin) {
      db.users.push({
        id: "SUPER_ADMIN",
        nik: "superadmin",
        nama: "Muhammad Yusuf (Super Admin)",
        role: "super_admin",
        password_hash: hashSHA256("superadmin123"),
        offline_pin_hash: hashSHA256("900900"),
        device_id: null,
        status_aktif: "AKTIF"
      });
      writeDB(db);
    }

    // Set status_aktif and kantor_cabang for users who don't have them
    let mutated = false;
    db.users.forEach((u: any) => {
      if (!u.status_aktif) {
        u.status_aktif = "AKTIF";
        mutated = true;
      }
      if (!u.kantor_cabang) {
        if (u.id === "SUPER_ADMIN" || u.role === "super_admin") {
          u.kantor_cabang = "ALL";
        } else if (u.id === "USR-04" || u.id === "USR-05" || u.id === "USR-06" || u.id === "USR-10" || u.id === "USR-11") {
          u.kantor_cabang = "KC_MATIM";
        } else {
          u.kantor_cabang = "PUSAT";
        }
        u.cabang_id = u.kantor_cabang;
        mutated = true;
      }
    });
    if (mutated) {
      writeDB(db);
    }

    const cabangParam = req.query.cabang as string;
    let filteredUsers = db.users;

    if (cabangParam && cabangParam !== "ALL") {
      filteredUsers = filteredUsers.filter((u: any) => {
        const uCabang = (u.kantor_cabang || "PUSAT").toUpperCase();
        return uCabang === cabangParam.toUpperCase();
      });
    }

    res.json({
      success: true,
      users: filteredUsers
    });
  });

  // POST NEW USER
  app.post("/api/users", checkRole(['super_admin']), (req, res) => {
    const db = readDB();
    if (!db.users) db.users = [];

    const { nama, username, password, role, status_aktif, kantor_cabang } = req.body;
    if (!nama || !username || !role) {
      return res.status(400).json({ error: "Missing required fields (Nama, Username, Role)." });
    }

    // Duplicate check
    const duplicate = db.users.find((u: any) => u.nik.toLowerCase() === username.toLowerCase());
    if (duplicate) {
      return res.status(400).json({ error: "User with this username (NIK) already exists." });
    }

    const newUserId = `USR-${Date.now()}`;
    const creator = getUserFromReq(req);
    const assignedCabang = (kantor_cabang || creator.cabang_id || "PUSAT").toUpperCase();

    const newUser = {
      id: newUserId,
      nik: username,
      nama: nama,
      role: role,
      password_hash: hashSHA256(password || "petugas123"),
      offline_pin_hash: hashSHA256("123456"),
      device_id: null,
      status_aktif: status_aktif || "AKTIF",
      kantor_cabang: assignedCabang === "ALL" ? "PUSAT" : assignedCabang,
      cabang_id: assignedCabang === "ALL" ? "PUSAT" : assignedCabang
    };

    db.users.push(newUser);
    writeDB(db);

    res.json({
      success: true,
      message: "User created successfully.",
      user: newUser
    });
  });

  // PUT EDIT USER ACCORDING TO PROTECTION RULES
  app.put("/api/users/:id", checkRole(['super_admin']), (req, res) => {
    const db = readDB();
    const userId = req.params.id;
    if (!db.users) db.users = [];

    const userIdx = db.users.findIndex((u: any) => u.id === userId);
    if (userIdx === -1) {
      return res.status(404).json({ error: "User not found." });
    }

    const { nama, role, status_aktif, password } = req.body;

    // RULE 4 Protection: Kunci tombol 'Hapus' atau 'Nonaktifkan' khusus untuk akun dengan ID SUPER_ADMIN
    if (userId === "SUPER_ADMIN") {
      if (status_aktif && status_aktif === "NON_AKTIF") {
        return res.status(400).json({ error: "Proteksi Master: Akun SUPER_ADMIN tidak diperkenankan untuk dinonaktifkan." });
      }
    }

    const existingUser = db.users[userIdx];
    if (nama) existingUser.nama = nama;
    // Don't allow changing role of SUPER_ADMIN away from super_admin
    if (role && userId !== "SUPER_ADMIN") {
      existingUser.role = role;
    }
    if (status_aktif) existingUser.status_aktif = status_aktif;
    if (password) {
      existingUser.password_hash = hashSHA256(password);
    }

    writeDB(db);
    res.json({
      success: true,
      message: "User updated successfully.",
      user: existingUser
    });
  });

  // DELETE USER ACCORDING TO PROTECTION RULES
  app.delete("/api/users/:id", checkRole(['super_admin']), (req, res) => {
    const db = readDB();
    const userId = req.params.id;

    if (userId === "SUPER_ADMIN") {
      return res.status(400).json({ error: "Proteksi Master: Akun SUPER_ADMIN bersifat absolut dan tidak dapat dihapus." });
    }

    if (!db.users) db.users = [];
    const initialLen = db.users.length;
    db.users = db.users.filter((u: any) => u.id !== userId);

    if (db.users.length === initialLen) {
      return res.status(404).json({ error: "User not found." });
    }

    writeDB(db);
    res.json({
      success: true,
      message: "User deleted successfully."
    });
  });

  // POST ASSIGN GROUP TASK
  app.post("/api/users/assign-group", (req, res) => {
    const db = readDB();
    const { group_id, assigned_user_id, hari_penagihan, urutan_rute } = req.body;

    if (!group_id || !assigned_user_id || !hari_penagihan) {
      return res.status(400).json({ error: "Missing required fields (group_id, assigned_user_id, hari_penagihan)." });
    }

    if (!db.groups) db.groups = [];
    const grp = db.groups.find((g: any) => g.id === group_id);
    if (!grp) {
      return res.status(404).json({ error: "Group not found." });
    }

    const urutanVal = typeof urutan_rute !== "undefined" ? Number(urutan_rute) : 0;

    // Update group properties
    grp.assigned_user_id = assigned_user_id;
    grp.petugas_assigned_id = assigned_user_id;
    grp.hari_penagihan = hari_penagihan;
    grp.urutan_rute = urutanVal;

    // Update members and billing schedules as well so that query multi-layer pull gets synchronized perfectly
    if (!db.customers) db.customers = [];
    if (!db.billingSchedules) db.billingSchedules = [];

    // Update assigned_user_id and petugas_assigned_id for all customers in this group
    db.customers.forEach((c: any) => {
      if (c.group_id === group_id) {
        c.assigned_user_id = assigned_user_id;
        c.petugas_assigned_id = assigned_user_id;
      }
    });

    // Update related billing schedules with assigned_user_id, petugas_assigned_id, hari_penagihan, and urutan_rute
    const groupCustomerIds = db.customers.filter((c: any) => c.group_id === group_id).map((c: any) => c.id);
    db.billingSchedules.forEach((sched: any) => {
      if (groupCustomerIds.includes(sched.customer_id)) {
        sched.assigned_user_id = assigned_user_id;
        sched.petugas_assigned_id = assigned_user_id;
        sched.petugas_penagihan_id = assigned_user_id;
        sched.hari_penagihan = hari_penagihan;
        sched.urutan_rute = urutanVal;
      }
    });

    writeDB(db);
    res.json({
      success: true,
      message: `Group ${grp.name} successfully assigned to Officer (ID: ${assigned_user_id}) for ${hari_penagihan} (Rute #${urutanVal}). All billing schedules synchronized.`,
      group: grp
    });
  });

  // GET GROUPS/PENAGIHAN FILTERED BY CABANG
  app.get("/api/penagihan", (req, res) => {
    const db = readDB();
    const cabang = req.query.cabang as string;
    let filteredGroups = db.groups || [];
    
    if (cabang && cabang !== "ALL") {
      filteredGroups = filteredGroups.filter((g: any) => {
        const gCabang = (g.kantor_cabang || "PUSAT").toUpperCase();
        return gCabang === cabang.toUpperCase();
      });
    }
    
    res.json({
      success: true,
      groups: filteredGroups
    });
  });

  // POST IMPORT EXCEL ROUTE (POST /api/penagihan/import-excel)
  app.post("/api/penagihan/import-excel", (req, res) => {
    const db = readDB();
    const { rows, assigned_user_id, hari_penagihan, kantor_cabang, region_id } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: "Data baris Excel kosong atau tidak valid." });
    }

    // Find a suitable officer if none provided
    let officerId = assigned_user_id;
    if (!officerId) {
      const defaultOfficer = db.users?.find((u: any) => u.role === "field_officer" || u.role === "petugas");
      officerId = defaultOfficer ? defaultOfficer.id : (db.users?.[0]?.id || "USR-03");
    }

    const userObj = getUserFromReq(req);
    const userCabang = (kantor_cabang || userObj.cabang_id || "PUSAT").toUpperCase();
    const day = (hari_penagihan || "SENIN").toUpperCase();

    // Helper date adder: d + days
    const addDays = (dateStr: string, days: number): string => {
      let d = new Date(dateStr);
      if (isNaN(d.getTime())) {
        // Fallback for DD/MM/YYYY splitting
        const parts = dateStr.split(/[-/]/);
        if (parts.length === 3) {
          const dayVal = parseInt(parts[0], 10);
          const monthVal = parseInt(parts[1], 10) - 1;
          const yearVal = parseInt(parts[2], 10);
          // Handle pivot for two-digit year
          const fullYear = yearVal < 100 ? (yearVal < 50 ? 2000 + yearVal : 1900 + yearVal) : yearVal;
          const altDate = new Date(fullYear, monthVal, dayVal);
          if (!isNaN(altDate.getTime())) {
            d = altDate;
          }
        }
      }
      if (isNaN(d.getTime())) {
        d = new Date();
      }
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };

    const cleanDateStr = (dateStr: string): string => {
      let d = new Date(dateStr);
      if (isNaN(d.getTime())) {
        const parts = dateStr.split(/[-/]/);
        if (parts.length === 3) {
          const dayVal = parseInt(parts[0], 10);
          const monthVal = parseInt(parts[1], 10) - 1;
          const yearVal = parseInt(parts[2], 10);
          const fullYear = yearVal < 100 ? (yearVal < 50 ? 2000 + yearVal : 1900 + yearVal) : yearVal;
          const altDate = new Date(fullYear, monthVal, dayVal);
          if (!isNaN(altDate.getTime())) {
            return altDate.toISOString().slice(0, 10);
          }
        }
        return new Date().toISOString().slice(0, 10);
      }
      return d.toISOString().slice(0, 10);
    };

    // Transform flat array of rows into a grouped structure based on Nama Kelompok (Logika Reduce)
    const groupedData = rows.reduce((acc: any, row: any) => {
      const getVal = (possibleKeys: string[], defaultVal: any = ""): any => {
        for (const k of possibleKeys) {
          if (row[k] !== undefined && row[k] !== null) return row[k];
          // normalized lookups
          const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
          for (const rowKey of Object.keys(row)) {
            const cleanRowKey = rowKey.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (cleanRowKey === cleanK) return row[rowKey];
          }
        }
        return defaultVal;
      };

      const groupName = String(getVal(["Nama Kelompok", "nama_kelompok", "kelompok", "Group Name", "group_name"], "")).trim();
      if (!groupName) return acc;

      const regionName = String(getVal(["Wilayah", "wilayah", "Region", "region", "Area", "area"], "")).trim();

      const rawTanggalCair = String(getVal(["Tanggal Pencairan", "tanggal_pencairan", "cair", "tanggal_cair", "Disbursement Date", "disbursement_date"], "")).trim();
      const tanggalCair = cleanDateStr(rawTanggalCair);

      const name = String(getVal(["Nama Anggota", "nama_anggota", "anggota", "nama", "Member Name", "member_name"], "")).trim();
      const pokok = Number(getVal(["Besar Pinjaman", "besar_pinjaman", "pokok", "plafon", "pinjaman", "Amount", "Loan Amount"], 1000000)) || 1000000;
      const targetAngsuran = Number(getVal(["Target (Angsuran)", "target_angsuran", "target", "angsuran", "Installment", "Target"], 110000)) || 110000;
      const tenor = Number(getVal(["Tenor", "tenor", "jangka_waktu", "Weeks"], 10)) || 10;
      const pokokBunga = Number(getVal(["Pokok+Bunga", "pokok_bunga", "pokokbunga", "pokok + bunga", "Total Amount"], 1100000)) || 1100000;

      // New columns transition keys lookup
      const mingguBerjalan = Number(getVal(["Minggu Berjalan", "minggu_berjalan", "MingguBerjalan", "Current Week", "Week Running", "Installment Paid", "Angsuran Masuk", "minggu_terbayar"], 0)) || 0;

      // Recalculate Sisa Minggu in backend to ensure integrity: Sisa Minggu = Tenor - Minggu Berjalan
      const validatedSisaMinggu = Math.max(0, tenor - mingguBerjalan);

      if (!acc[groupName]) {
        acc[groupName] = {
          nama_kelompok: groupName,
          tanggal_pencairan: tanggalCair,
          region_name: regionName || "Menunggu Pemetaan",
          members: []
        };
      } else if (!acc[groupName].region_name && regionName) {
        acc[groupName].region_name = regionName;
      }

      acc[groupName].members.push({
        name,
        pokok,
        targetAngsuran,
        tenor,
        pokokBunga,
        mingguBerjalan,
        sisaMinggu: validatedSisaMinggu
      });

      return acc;
    }, {});

    const groupKeys = Object.keys(groupedData);
    if (groupKeys.length === 0) {
      return res.status(400).json({ success: false, error: "Tidak ditemukan data kelompok yang valid dari file Excel Anda. Pastikan ada kolom nama_kelompok atau Nama Kelompok." });
    }

    try {
      let groupsCreatedCount = 0;
      let membersCreatedCount = 0;

      if (!db.groups) db.groups = [];
      if (!db.customers) db.customers = [];
      if (!db.loans) db.loans = [];
      if (!db.billingSchedules) db.billingSchedules = [];

      // Loop over groups to register them (equivalent to transaction execution)
      for (const groupName of groupKeys) {
        const gData = groupedData[groupName];

        let resolvedRegionId = "";
        const targetRegionName = gData.region_name || "Menunggu Pemetaan";
        let existingRegion = db.regions?.find((r: any) => r.name.toLowerCase() === targetRegionName.toLowerCase());
        if (!existingRegion) {
          if (!db.regions) db.regions = [];
          const newRegionId = `R-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          existingRegion = {
            id: newRegionId,
            name: targetRegionName
          };
          db.regions.push(existingRegion);
        }
        resolvedRegionId = existingRegion.id;

        const newGroupId = generateDocumentId('KLP', userCabang, db);
        
        const newGroup: Group = {
          id: newGroupId,
          name: gData.nama_kelompok,
          sistem_tanggung_renteng: true,
          is_tanggung_renteng: true,
          survey_status: "LAYAK" as any,
          survey_notes: "Bypassed via Excel Smart grouping import",
          created_at: new Date().toISOString(),
          region_id: resolvedRegionId,
          assigned_user_id: officerId,
          hari_penagihan: day,
          petugas_assigned_id: officerId,
          urutan_rute: 1,
          jam_setoran: "09:00",
          kantor_cabang: userCabang as any
        };
        
        db.groups.push(newGroup);
        groupsCreatedCount++;

        // Insert group members
        gData.members.forEach((m: any, mIdx: number) => {
          const custId = `C2026-X-${Date.now()}-${groupsCreatedCount}-${mIdx}`;
          
          // Automatic status lunas resolution
          let customerStatus = "ACTIVE_LOAN";
          let loanStatus = "ACTIVE_LOAN";
          if (m.sisaMinggu === 0 || m.mingguBerjalan >= m.tenor) {
            customerStatus = "PAID_OFF";
            loanStatus = "PAID_OFF";
          }

          const newCust: Customer = {
            id: custId,
            name: m.name || `Anggota ${mIdx + 1}`,
            nik: `320109${Math.floor(1000000000 + Math.random() * 9000000000)}`,
            alamat: `Kelompok ${gData.nama_kelompok}, Wilayah: ${targetRegionName}`,
            pekerjaan: "Usaha Mandiri Kelompok",
            status: customerStatus as any,
            is_new_member: true,
            group_id: newGroupId,
            assigned_user_id: officerId,
            kantor_cabang: userCabang as any
          };
          db.customers.push(newCust);
          membersCreatedCount++;

          // Cari Tanggal Jatuh Tempo Akhir (Final Due Date)
          // Jika pada saat impor Excel, grup tersebut belum di-assign ke hari tertentu, biarkan nilai Jatuh Temponya null sementara
          let computedTanggalJatuhTempo = null;
          let firstDueDateStr = null;

          if (day !== "BELUM_DIATUR") {
            const dueDates = calculateDueDates(gData.tanggal_pencairan, day, m.sisaMinggu);
            firstDueDateStr = dueDates.firstDueDate;
            computedTanggalJatuhTempo = dueDates.finalDueDate;
          }

          const loanId = generateDocumentId('SPK', userCabang, db);
          const newLoan: Loan = {
            id: loanId,
            customer_id: custId,
            plafon: m.pokok,
            status: loanStatus as any,
            tanggal_cair: gData.tanggal_pencairan,
            petugas_id: officerId,
            created_at: new Date().toISOString(),
            kantor_cabang: userCabang as any,
            installment_paid: m.mingguBerjalan,
            minggu_terbayar: m.mingguBerjalan
          };

          (newLoan as any).tenor = m.tenor;
          (newLoan as any).tanggal_jatuh_tempo = computedTanggalJatuhTempo;
          db.loans.push(newLoan);

          const weeklyPokok = Math.round(m.pokok / m.tenor);
          const weeklyJasa = Math.round((m.pokokBunga - m.pokok) / m.tenor);

          for (let i = 1; i <= m.tenor; i++) {
            let installmentDate = null;
            let statusBill: "UNPAID" | "PAID" = "UNPAID";
            let bPokok = 0;
            let bJasa = 0;

            if (i <= m.mingguBerjalan) {
              statusBill = "PAID";
              bPokok = weeklyPokok;
              bJasa = weeklyJasa;
              
              // Estimate past date
              if (firstDueDateStr) {
                const pastD = new Date(firstDueDateStr);
                pastD.setDate(pastD.getDate() - (m.mingguBerjalan - i + 1) * 7);
                installmentDate = pastD.toISOString().slice(0, 10);
              }
            } else {
              statusBill = "UNPAID";
              bPokok = 0;
              bJasa = 0;
              
              // Future date
              if (firstDueDateStr) {
                const futD = new Date(firstDueDateStr);
                futD.setDate(futD.getDate() + (i - m.mingguBerjalan - 1) * 7);
                installmentDate = futD.toISOString().slice(0, 10);
              }
            }

            const bill: BillingSchedule = {
              id: `BS-${loanId}-${i}`,
              loan_id: loanId,
              customer_id: custId,
              term: i,
              parent_group_id: newGroupId,
              tanggal_jatuh_tempo: installmentDate || "",
              pokok: weeklyPokok,
              jasa: weeklyJasa,
              total_tagihan: m.targetAngsuran || (weeklyPokok + weeklyJasa),
              bayar_pokok: bPokok,
              bayar_jasa: bJasa,
              status: statusBill,
              hari_penagihan: day,
              assigned_user_id: officerId,
              petugas_assigned_id: officerId,
              petugas_penagihan_id: officerId,
              urutan_rute: 1,
              jam_setoran: "09:00",
              is_tanggung_renteng: true
            };
            db.billingSchedules.push(bill);
          }
        });
      }

      writeDB(db);
      return res.json({
        success: true,
        message: `Impor Excel Sukses! Ditambahkan ${groupsCreatedCount} Kelompok dengan total ${membersCreatedCount} Anggota secara otomatis dengan format transisi.`,
        groupsCreated: groupsCreatedCount,
        membersCreated: membersCreatedCount
      });

    } catch (err: any) {
      console.error("Error in transaction simulation:", err);
      return res.status(500).json({ success: false, error: "Gagal menyimpan rute hasil Excel: " + err.message });
    }
  });

  // POST IMPORT EXCEL LEGACY (POST /api/import-legacy)
  app.post("/api/import-legacy", (req, res) => {
    const db = readDB();
    const { rows, assigned_user_id, hari_penagihan, kantor_cabang } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: "Data baris Excel kosong atau tidak valid." });
    }

    // Find a suitable officer if none provided
    let officerId = assigned_user_id;
    if (!officerId) {
      const defaultOfficer = db.users?.find((u: any) => u.role === "field_officer" || u.role === "petugas");
      officerId = defaultOfficer ? defaultOfficer.id : (db.users?.[0]?.id || "USR-03");
    }

    const userObj = getUserFromReq(req);
    const userCabang = (kantor_cabang || userObj.cabang_id || "PUSAT").toUpperCase();
    const day = (hari_penagihan || "SENIN").toUpperCase();

    // Helper to extract values
    const getVal = (row: any, possibleKeys: string[], defaultVal: any = ""): any => {
      for (const k of possibleKeys) {
        if (row[k] !== undefined && row[k] !== null) return row[k];
        const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const rowKey of Object.keys(row)) {
          const cleanRowKey = rowKey.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (cleanRowKey === cleanK) return row[rowKey];
        }
      }
      return defaultVal;
    };

    // Helper to find date for a given term
    const findDateInRow = (row: any, termNum: number): string | null => {
      const possibleKeys = [
        `Mg ${termNum} Date`,
        `Date ${termNum}`,
        `Mg${termNum}_Date`,
        `Date_Mg_${termNum}`,
        `Tgl ${termNum}`,
        `Tanggal ${termNum}`,
        `Mg ${termNum} Tanggal`,
        `Mg${termNum} Date`,
        `Mg${termNum}Date`,
        `Mg${termNum}_date`,
        `date_${termNum}`
      ];
      for (const key of possibleKeys) {
        if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
          return String(row[key]);
        }
      }
      for (const rowKey of Object.keys(row)) {
        const rKeyLower = rowKey.toLowerCase();
        if (rKeyLower.includes(`mg`) && rKeyLower.includes(`${termNum}`) && (rKeyLower.includes(`date`) || rKeyLower.includes(`tgl`) || rKeyLower.includes(`tanggal`))) {
          if (row[rowKey] !== undefined && row[rowKey] !== null && String(row[rowKey]).trim() !== "") {
            return String(row[rowKey]);
          }
        }
      }
      return null;
    };

    // Under-the-hood function for status calculations
    const calculateStatus = (loan: {
      plafon: number;
      tenor: number;
      tanggal_cair: Date | string;
      payments: { nominal_bayar: number; status: string }[];
    }) => {
      const pokok = loan.plafon || 0;
      const bunga = pokok * 0.1;
      const totalPiutang = pokok + bunga;
      const targetAngsuran = totalPiutang / (loan.tenor || 1);

      const actualTotalSetoran = (loan.payments || [])
        .filter(p => p.status === 'SETORAN_APPROVED' || p.status === 'LUNAS_HISTORIS' || p.status === 'LUNAS_TALANGAN')
        .reduce((sum, p) => sum + (p.nominal_bayar || 0), 0);

      const sisaSaldo = Math.max(0, totalPiutang - actualTotalSetoran);

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
        totalPiutang,
        targetAngsuran,
        actualTotalSetoran,
        sisaSaldo,
        expectedWeeks,
        expectedTotalSetoran,
        selisih,
        statusTagihan
      };
    };

    try {
      if (!db.regions) db.regions = [];
      if (!db.groups) db.groups = [];
      if (!db.customers) db.customers = [];
      if (!db.loans) db.loans = [];
      if (!db.billingSchedules) db.billingSchedules = [];
      if (!db.payments) db.payments = [];
      if (!db.billing_logs) db.billing_logs = [];

      let importedGroupsCount = 0;
      let importedMembersCount = 0;

      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = rows[rIdx];

        // Extract variables with multiple lookups
        const nameVal = getVal(row, ["Nama Anggota", "Nama", "nama", "Nama_Anggota", "member", "Nama Pemohon", "nama_pemohon", "Member Name"]);
        if (!nameVal) {
          continue; // skip empty rows
        }

        const cleanNama = String(nameVal).trim();
        const plafon = Number(getVal(row, ["Plafon", "plafon", "Pokok", "pokok", "Principal", "principal", "Besar Pinjaman", "besar_pinjaman", "Loan Amount", "loan_amount", "amount"])) || 2000000;
        const tenor = Number(getVal(row, ["Tenor", "tenor", "Tenor_Mg", "tenor_mg", "Weeks", "weeks", "Tempo", "tempo"])) || 25;
        const kelompokVal = getVal(row, ["Nama Kelompok", "Kelompok", "kelompok", "Group", "group", "Group Name", "group_name"]) || "Default Kelompok Legacy";
        const wilayahVal = getVal(row, ["Nama Wilayah", "Wilayah", "wilayah", "Branch", "branch", "Region", "region", "Area", "area"]) || "Default Wilayah Legacy";

        const cleanKelompok = String(kelompokVal).trim();
        const cleanWilayah = String(wilayahVal).trim();

        const tglCairVal = getVal(row, ["Tanggal Pencairan", "Tanggal_Pencairan", "Tanggal Cair", "tanggal_pencairan", "Tgl Cair", "Disbursement Date", "disbursement_date", "Mulai", "mulai", "tanggal_mulai_siklus", "Tanggal Mulai Siklus"]);
        let tglCair = "2026-01-01";
        if (tglCairVal) {
          try {
            tglCair = parseExcelDate(tglCairVal);
          } catch(e) {
            tglCair = new Date(tglCairVal).toISOString();
            if (isNaN(new Date(tglCair).getTime())) {
              tglCair = "2026-01-01";
            }
          }
        }
        if (tglCair.includes("T")) {
          tglCair = tglCair.split("T")[0];
        }

        // Generate NIK
        let parsedNik = `320109${Math.floor(Date.now() / 1000)}${Math.floor(1000 + Math.random() * 9000)}`;
        const nikVal = getVal(row, ["NIK", "nik"]);
        if (nikVal) {
          try {
            parsedNik = parseNIK(nikVal);
          } catch(e) {}
        }
        while (db.customers.some((c: any) => c.nik === parsedNik)) {
          parsedNik = `320109${Math.floor(Date.now() / 1000)}${Math.floor(1000 + Math.random() * 9000)}`;
        }

        // Upsert Region
        let region = db.regions.find((r: any) => r.name.toLowerCase() === cleanWilayah.toLowerCase());
        if (!region) {
          region = {
            id: `R-LEG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            name: cleanWilayah
          };
          db.regions.push(region);
        }

        // Upsert Group
        let group = db.groups.find((g: any) => g.name.toLowerCase() === cleanKelompok.toLowerCase());
        if (!group) {
          group = {
            id: `G-LEG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            name: cleanKelompok,
            sistem_tanggung_renteng: true,
            is_tanggung_renteng: true,
            survey_status: 'LAYAK',
            survey_notes: "Migrasi Excel Legacy",
            created_at: new Date().toISOString(),
            region_id: region.id,
            cycle_start_date: tglCair,
            assigned_user_id: officerId,
            petugas_assigned_id: officerId,
            hari_penagihan: day as any,
            urutan_rute: 1,
            jam_setoran: "09:00",
            kantor_cabang: userCabang as any
          };
          db.groups.push(group);
          importedGroupsCount++;
        }

        // Setup Customer and Loan
        const customerId = `C2026-LEG-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const newCustomer: Customer = {
          id: customerId,
          name: cleanNama,
          nik: parsedNik,
          alamat: `Kelompok: ${cleanKelompok}, Wilayah: ${cleanWilayah}`,
          pekerjaan: "Usaha Mandiri Onboarding",
          status: 'ACTIVE_LOAN',
          is_new_member: false,
          group_id: group.id,
          assigned_user_id: officerId,
          kantor_cabang: userCabang as any
        };

        const loanId = `L-LEG-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const newLoan: Loan = {
          id: loanId,
          customer_id: customerId,
          plafon: plafon,
          status: 'ACTIVE_LOAN',
          tanggal_cair: tglCair,
          petugas_id: officerId,
          created_at: new Date().toISOString(),
          kantor_cabang: userCabang as any
        };
        (newLoan as any).tenor = tenor;

        const weeklyPokok = Math.round(plafon / tenor);
        const weeklyJasa = Math.round((plafon * 0.1) / tenor); // 10% target

        // Generate Billing Schedules
        const schedulesList: BillingSchedule[] = [];
        for (let i = 1; i <= tenor; i++) {
          const dueDate = new Date(tglCair);
          dueDate.setDate(dueDate.getDate() + (i * 7));

          const bill: BillingSchedule = {
            id: `BS-${loanId}-${i}`,
            loan_id: loanId,
            customer_id: customerId,
            term: i,
            parent_group_id: group.id,
            tanggal_jatuh_tempo: dueDate.toISOString().slice(0, 10),
            pokok: weeklyPokok,
            jasa: weeklyJasa,
            total_tagihan: weeklyPokok + weeklyJasa,
            bayar_pokok: 0,
            bayar_jasa: 0,
            status: 'UNPAID',
            hari_penagihan: day,
            assigned_user_id: officerId,
            petugas_assigned_id: officerId,
            petugas_penagihan_id: officerId,
            urutan_rute: 1,
            jam_setoran: "09:00",
            kantor_cabang: userCabang as any,
            is_tanggung_renteng: true
          };
          schedulesList.push(bill);
        }

        // Loop over Excel row properties starting with "Mg "
        const mgKeys = Object.keys(row).filter(k => /^Mg\s*(\d+)$/i.test(k));
        const rowPayments: { nominal_bayar: number; status: string }[] = [];

        mgKeys.forEach(mgKey => {
          const match = mgKey.match(/^Mg\s*(\d+)$/i);
          const termNum = match ? parseInt(match[1]) : 0;

          if (termNum > 0 && termNum <= tenor) {
            const val = row[mgKey];
            const numericVal = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
            if (val !== undefined && val !== null && val !== "" && !isNaN(numericVal) && numericVal > 0) {
              let payDate = findDateInRow(row, termNum);
              if (!payDate) {
                const defaultDueDate = new Date(tglCair);
                defaultDueDate.setDate(defaultDueDate.getDate() + (termNum * 7));
                payDate = defaultDueDate.toISOString().slice(0, 10);
              } else {
                try {
                  payDate = parseExcelDate(payDate);
                  if (payDate.includes("T")) payDate = payDate.split("T")[0];
                } catch(e) {}
              }

              // Update BillingSchedule properties to Paid
              const bill = schedulesList[termNum - 1];
              if (bill) {
                bill.bayar_pokok = bill.pokok;
                bill.bayar_jasa = bill.jasa;
                bill.status = 'PAID';
              }

              const paymentId = `PAY-LEG-${loanId}-${termNum}`;
              const newPayment: Payment = {
                id: paymentId,
                billing_schedule_id: `BS-${loanId}-${termNum}`,
                customer_id: customerId,
                petugas_id: "Legacy Import",
                nominal_bayar: numericVal,
                tanggal_bayar: payDate,
                status: 'LUNAS_HISTORIS' as any,
                catatan_revisi: null,
                is_offline_logged: false,
                payment_method: 'TUNAI'
              };
              db.payments.push(newPayment);
              db.billing_logs.push(newPayment);

              rowPayments.push({ nominal_bayar: numericVal, status: 'LUNAS_HISTORIS' });
            }
          }
        });

        // Insert schedules
        schedulesList.forEach(s => db.billingSchedules.push(s));

        // Calculate final status
        const calc = calculateStatus({
          plafon,
          tenor,
          tanggal_cair: tglCair,
          payments: rowPayments
        });

        if (calc.sisaSaldo <= 0) {
          newCustomer.status = 'PAID_OFF';
          newLoan.status = 'PAID_OFF';
        }

        // Push new models
        db.customers.push(newCustomer);
        db.loans.push(newLoan);
        importedMembersCount++;

        // Handoff weekly schedule targets to active officer assignments:
        // Set up the current week's active billing schedule target as Target Angsuran + Any Arrears
        const activeTerm = calc.expectedWeeks + 1;
        const activeSched = db.billingSchedules.find(bs => bs.id === `BS-${loanId}-${activeTerm}`);
        if (activeSched) {
          const piutangTakTertagih = calc.statusTagihan === 'PIUTANG TAK TERTAGIH' ? calc.selisih : 0;
          activeSched.status = 'UNPAID';
          activeSched.total_tagihan = calc.targetAngsuran + piutangTakTertagih;
          // proportionally scale pokok/jasa so ledger counts perfectly
          activeSched.pokok = weeklyPokok + (piutangTakTertagih * (weeklyPokok / calc.targetAngsuran));
          activeSched.jasa = weeklyJasa + (piutangTakTertagih * (weeklyJasa / calc.targetAngsuran));
        } else if (calc.sisaSaldo > 0) {
          // If past tenor, update final tenor billing to reflect remaining sisaSaldo
          const finalSched = db.billingSchedules.find(bs => bs.id === `BS-${loanId}-${tenor}`);
          if (finalSched) {
            finalSched.status = 'UNPAID';
            finalSched.total_tagihan = finalSched.total_tagihan + calc.sisaSaldo;
            finalSched.pokok = finalSched.pokok + (calc.sisaSaldo * (weeklyPokok / calc.targetAngsuran));
            finalSched.jasa = finalSched.jasa + (calc.sisaSaldo * (weeklyJasa / calc.targetAngsuran));
          }
        }
      }

      writeDB(db);
      return res.json({
        success: true,
        message: `Impor Legacy Success! Berhasil mengimpor ${importedMembersCount} anggota di bawah ${importedGroupsCount} Kelompok dengan Unpivoting Data Horizontal & Kalkulasi Otomatis Sisa Saldo & Tunggakan. Rute penagihan aktif petugas lapangan otomatis disinkronkan.`,
        state: readDB()
      });
    } catch(err: any) {
      console.error(err);
      return res.status(500).json({ success: false, error: "Gagal memproses data legacy Excel: " + err.message });
    }
  });

  // POST MAP ROUTE (POST /api/penagihan/pemetaan)
  app.post("/api/penagihan/pemetaan", (req, res) => {
    const db = readDB();
    const { 
      mode, // 'otomatis' | 'manual'
      group_id, 
      assigned_user_id, 
      hari_penagihan, 
      urutan_rute,
      jam_setoran,
      is_tanggung_renteng,

      // fields for manual mode
      nama_kelompok,
      region_id,
      new_region_name,
      tanggal_pencairan,
      tanggal_jatuh_tempo,
      pokok_pinjaman,
      pokok_bunga,
      target_angsuran,
      members
    } = req.body;

    const selectedMode = mode || "otomatis";

    if (selectedMode === "manual") {
      // INPUT MANUAL MODE
      if (!nama_kelompok || !assigned_user_id || !hari_penagihan || !tanggal_jatuh_tempo || !members || !Array.isArray(members) || members.length === 0) {
        return res.status(400).json({ error: "Kelompok baru, tanggal jatuh tempo, petugas lapangan, hari penagihan, dan daftar anggota (min 1 orang) wajib diisi." });
      }

      try {
        // --- PRISMA STYLE TRANSACTION SIMULATION ---
        // 1. Buat Region baru (jika wilayah belum ada / dipilih baru)
        let resolvedRegionId = "";
        if (region_id === "create_new") {
          if (!new_region_name) {
            return res.status(400).json({ error: "Nama wilayah baru wajib diisi untuk opsi 'Tambah Wilayah'." });
          }
          if (!db.regions) db.regions = [];
          const existingRegion = db.regions.find((r: any) => r.name.toLowerCase() === new_region_name.trim().toLowerCase());
          if (existingRegion) {
            resolvedRegionId = existingRegion.id;
          } else {
            resolvedRegionId = `R-${Date.now()}-${Math.floor(Math.random() * 100)}`;
            db.regions.push({
              id: resolvedRegionId,
              name: new_region_name.trim()
            });
          }
        } else {
          resolvedRegionId = region_id || "";
        }

        // 2. Buat Group baru (Nama Kelompok, Wilayah, Status TR)
        const userObj = getUserFromReq(req);
        const userCabang = (req.body.kantor_cabang || userObj.cabang_id || "PUSAT").toUpperCase();
        const newGroupId = generateDocumentId('KLP', userCabang, db);
        const resolvedIsTR = typeof is_tanggung_renteng !== "undefined" ? Boolean(is_tanggung_renteng) : true;
        const resolvedUrutan = typeof urutan_rute !== "undefined" ? Number(urutan_rute) : 1;
        const jamSetoranVal = jam_setoran || "09:00";
 
        const newGroup: Group = {
          id: newGroupId,
          name: nama_kelompok,
          sistem_tanggung_renteng: resolvedIsTR,
          is_tanggung_renteng: resolvedIsTR,
          survey_status: "LAYAK" as any,
          survey_notes: "Bypassed via Manual Route Integration",
          created_at: new Date().toISOString(),
          region_id: resolvedRegionId,
          assigned_user_id: assigned_user_id,
          hari_penagihan: hari_penagihan,
          petugas_assigned_id: assigned_user_id,
          urutan_rute: resolvedUrutan,
          jam_setoran: jamSetoranVal,
          kantor_cabang: userCabang as any
        };
 
        if (!db.groups) db.groups = [];
        db.groups.push(newGroup);
 
        // 3. Lakukan iterasi createMany ke tabel customers (menyimpan Nama Pemohon) dan loans (menyimpan Tenor, Pokok, Jatuh Tempo)
        const memberCount = members.length;
        const totalPlafon = Number(pokok_pinjaman) || 0;
        const totalPokokBunga = Number(pokok_bunga) || 0;
 
        const indivPlafon = Math.round(totalPlafon / memberCount);
        const indivPokokBunga = Math.round(totalPokokBunga / memberCount);
 
        if (!db.customers) db.customers = [];
        if (!db.loans) db.loans = [];
        if (!db.billingSchedules) db.billingSchedules = [];
 
        members.forEach((member: any, idx: number) => {
          const custId = `C2026-M-${Date.now()}-${idx}`;
          const newCust: Customer = {
            id: custId,
            name: member.name,
            nik: `320109${Math.floor(1000000000 + Math.random() * 9000000000)}`, // simulated NIK
            alamat: `Kelompok ${nama_kelompok}, Wilayah ID: ${resolvedRegionId}`,
            pekerjaan: "Usaha Mandiri Kelompok",
            status: "ACTIVE_LOAN" as any,
            is_new_member: true,
            group_id: newGroupId,
            assigned_user_id: assigned_user_id,
            kantor_cabang: userCabang as any
          };
          db.customers.push(newCust);

          // Get specific member-level settings, layout fallbacks
          const mPlafon = typeof member.pokok !== 'undefined' ? Number(member.pokok) : indivPlafon;
          const mBunga = typeof member.pokokBunga !== 'undefined' ? Number(member.pokokBunga) : indivPokokBunga;
          const mTenor = typeof member.tenor !== 'undefined' ? Number(member.tenor) : 10;
          const mCairDate = tanggal_pencairan || new Date().toISOString().slice(0, 10);

          // Create Loan with dynamic sequential SPK ID
          const loanId = generateDocumentId('SPK', userCabang, db);
          const newLoan: Loan = {
            id: loanId,
            customer_id: custId,
            plafon: mPlafon,
            status: "ACTIVE_LOAN" as any,
            tanggal_cair: mCairDate,
            petugas_id: assigned_user_id,
            created_at: new Date().toISOString(),
            kantor_cabang: userCabang as any
          };
          // store dynamic attributes on the database state as requested
          (newLoan as any).tenor = mTenor;
          (newLoan as any).tanggal_jatuh_tempo = tanggal_jatuh_tempo;
          db.loans.push(newLoan);

          // 4. Terakhir, buat BillingSchedule untuk mengikat kelompok baru ini ke Petugas, Hari, Jam, dan Urutan Rute
          const weeklyPokok = Math.round(mPlafon / mTenor);
          const weeklyJasa = Math.round((mBunga - mPlafon) / mTenor);

          for (let i = 1; i <= mTenor; i++) {
            const dueDate = new Date(tanggal_jatuh_tempo);
            dueDate.setDate(dueDate.getDate() + (i - 1) * 7);

            const bill: BillingSchedule = {
              id: `BS-${loanId}-${i}`,
              loan_id: loanId,
              customer_id: custId,
              term: i,
              parent_group_id: newGroupId,
              tanggal_jatuh_tempo: dueDate.toISOString().slice(0, 10),
              pokok: weeklyPokok,
              jasa: weeklyJasa,
              total_tagihan: weeklyPokok + weeklyJasa,
              bayar_pokok: 0,
              bayar_jasa: 0,
              status: "UNPAID",
              hari_penagihan: hari_penagihan,
              assigned_user_id: assigned_user_id,
              petugas_assigned_id: assigned_user_id,
              petugas_penagihan_id: assigned_user_id,
              urutan_rute: resolvedUrutan,
              jam_setoran: jamSetoranVal,
              is_tanggung_renteng: resolvedIsTR
            };
            db.billingSchedules.push(bill);
          }
        });

        writeDB(db);
        return res.json({
          success: true,
          message: `Pemetaan Rute Kelompok Baru '${nama_kelompok}' (Mode Manual) berhasil ditambahkan dengan ${memberCount} anggota!`,
          groupId: newGroupId
        });

      } catch (err: any) {
        console.error("Error creating manual mapping:", err);
        return res.status(500).json({ error: "Gagal menyimpan rute manual: " + err.message });
      }

    } else {
      // TARIK DATA SISTEM (OTOMATIS)
      if (!group_id || !assigned_user_id || !hari_penagihan) {
        return res.status(400).json({ error: "Missing required fields (group_id, assigned_user_id, hari_penagihan)." });
      }

      if (!db.groups) db.groups = [];
      const grp = db.groups.find((g: any) => g.id === group_id);
      if (!grp) {
        return res.status(404).json({ error: "Group not found." });
      }

      const urutanVal = typeof urutan_rute !== "undefined" ? Number(urutan_rute) : 0;
      const isTanggungRentengVal = typeof is_tanggung_renteng !== "undefined" ? Boolean(is_tanggung_renteng) : true;
      const jamSetoranVal = jam_setoran || null;

      // Update group properties
      grp.assigned_user_id = assigned_user_id;
      grp.petugas_assigned_id = assigned_user_id;
      grp.hari_penagihan = hari_penagihan;
      grp.urutan_rute = urutanVal;
      grp.jam_setoran = jamSetoranVal;
      grp.is_tanggung_renteng = isTanggungRentengVal;
      grp.sistem_tanggung_renteng = isTanggungRentengVal;

      // Update members and billing schedules as well so that query multi-layer pull gets synchronized perfectly
      if (!db.customers) db.customers = [];
      if (!db.billingSchedules) db.billingSchedules = [];

      // Update assigned_user_id and petugas_assigned_id for all customers in this group
      db.customers.forEach((c: any) => {
        if (c.group_id === group_id) {
          c.assigned_user_id = assigned_user_id;
          c.petugas_assigned_id = assigned_user_id;
          c.jam_setoran = jamSetoranVal;
          c.is_tanggung_renteng = isTanggungRentengVal;
        }
      });

      // Update related billing schedules with assigned_user_id, petugas_assigned_id, hari_penagihan, urutan_rute, jam_setoran, is_tanggung_renteng
      const groupCustomerIds = db.customers.filter((c: any) => c.group_id === group_id).map((c: any) => c.id);
      db.billingSchedules.forEach((sched: any) => {
        if (groupCustomerIds.includes(sched.customer_id) || sched.parent_group_id === group_id) {
          sched.assigned_user_id = assigned_user_id;
          sched.petugas_assigned_id = assigned_user_id;
          sched.petugas_penagihan_id = assigned_user_id;
          sched.hari_penagihan = hari_penagihan;
          sched.urutan_rute = urutanVal;
          sched.jam_setoran = jamSetoranVal;
          sched.is_tanggung_renteng = isTanggungRentengVal;
        }
      });

      writeDB(db);
      res.json({
        success: true,
        message: `Pemetaan Rute Kelompok ${grp.name} berhasil disimpan! Hari ${hari_penagihan}, Urutan #${urutanVal}, Jam Setoran ${jamSetoranVal || '-'}, Tanggung Renteng: ${isTanggungRentengVal ? 'YA' : 'TIDAK'}`,
        group: grp
      });
    }
  });

  // PUT /api/penagihan/pemetaan/:id
  app.put("/api/penagihan/pemetaan/:id", (req, res) => {
    const db = readDB();
    const userObj = getUserFromReq(req);

    // 4. Protection: Only SUPER_ADMIN and ADMIN are allowed
    const isAuthorized = userObj.role === "super_admin" || userObj.role === "admin" || userObj.role === "superadmin";
    if (!isAuthorized) {
      return res.status(403).json({ error: "Akses ditolak: Hanya role SUPER_ADMIN dan ADMIN yang diizinkan untuk mengubah data pemetaan rute." });
    }

    const { id } = req.params; // group_id
    const {
      assigned_user_id,
      hari_penagihan,
      urutan_rute,
      jam_setoran,
      is_tanggung_renteng,
      region_id,
      new_region_name,
      tanggal_pencairan,
      tanggal_jatuh_tempo,
      members
    } = req.body;

    if (!db.groups) db.groups = [];
    const grp = db.groups.find((g: any) => g.id === id);
    if (!grp) {
      return res.status(404).json({ error: "Kelompok tidak ditemukan." });
    }

    const userCabang = (grp.kantor_cabang || userObj.cabang_id || "PUSAT").toUpperCase();
    const resolvedUrutan = typeof urutan_rute !== "undefined" ? Number(urutan_rute) : 1;
    const resolvedIsTR = typeof is_tanggung_renteng !== "undefined" ? Boolean(is_tanggung_renteng) : true;
    const jamSetoranVal = jam_setoran || "09:00";

    // 1. Resolve Region
    let resolvedRegionId = "";
    if (region_id === "create_new") {
      if (!new_region_name) {
        return res.status(400).json({ error: "Nama wilayah baru wajib diisi untuk opsi 'Tambah Wilayah'." });
      }
      if (!db.regions) db.regions = [];
      const existingRegion = db.regions.find((r: any) => r.name.toLowerCase() === new_region_name.trim().toLowerCase());
      if (existingRegion) {
        resolvedRegionId = existingRegion.id;
      } else {
        resolvedRegionId = `R-${Date.now()}-${Math.floor(Math.random() * 107)}`;
        db.regions.push({
          id: resolvedRegionId,
          name: new_region_name.trim()
        });
      }
    } else {
      resolvedRegionId = region_id || grp.region_id || "";
    }

    // Update group properties
    grp.assigned_user_id = assigned_user_id || grp.assigned_user_id;
    grp.petugas_assigned_id = assigned_user_id || grp.petugas_assigned_id;
    grp.hari_penagihan = hari_penagihan || grp.hari_penagihan;
    grp.urutan_rute = resolvedUrutan;
    grp.jam_setoran = jamSetoranVal;
    grp.is_tanggung_renteng = resolvedIsTR;
    grp.sistem_tanggung_renteng = resolvedIsTR;
    if (resolvedRegionId) {
      grp.region_id = resolvedRegionId;
    }

    // 2. Members Management
    if (members && Array.isArray(members)) {
      if (!db.customers) db.customers = [];
      if (!db.loans) db.loans = [];
      if (!db.billingSchedules) db.billingSchedules = [];

      const submittedMemberIds = members.map((m: any) => m.id).filter(Boolean);

      // Determine customers to remove
      const customersToRemove = db.customers.filter((c: any) => c.group_id === id && !submittedMemberIds.includes(c.id));
      const customerIdsToRemove = customersToRemove.map((c: any) => c.id);

      // Remove Customers, Loans, and BillingSchedules
      db.customers = db.customers.filter((c: any) => !customerIdsToRemove.includes(c.id));
      db.loans = db.loans.filter((l: any) => !customerIdsToRemove.includes(l.customer_id));
      db.billingSchedules = db.billingSchedules.filter((bs: any) => !customerIdsToRemove.includes(bs.customer_id));

      // Loop over members to do insert/update (upsert)
      members.forEach((member: any, idx: number) => {
        let custId = member.id;
        const mPlafon = Number(member.pokok) || 1000000;
        const mBunga = Number(member.pokokBunga) || Math.round(mPlafon * 1.10);
        const mTenor = Number(member.tenor) || 10;
        const mCairDate = tanggal_pencairan || new Date().toISOString().slice(0, 10);

        // Extract transition info
        const mMingguBerjalan = Number(member.mingguBerjalan) || 0;
        const mSisaMinggu = Math.max(0, mTenor - mMingguBerjalan);

        // Auto lunas resolution
        let customerStatus = "ACTIVE_LOAN";
        let loanStatus = "ACTIVE_LOAN";
        if (mSisaMinggu === 0 || mMingguBerjalan >= mTenor) {
          customerStatus = "PAID_OFF";
          loanStatus = "PAID_OFF";
        }

        if (!custId) {
          // INSERT
          custId = `C2026-M-${Date.now()}-${idx}-${Math.floor(Math.random() * 100)}`;
          const newCust: Customer = {
            id: custId,
            name: member.name,
            nik: `320109${Math.floor(1000000000 + Math.random() * 9000000000)}`,
            alamat: `Kelompok ${grp.name}, Wilayah ID: ${resolvedRegionId}`,
            pekerjaan: "Usaha Mandiri Kelompok",
            status: customerStatus as any,
            is_new_member: true,
            group_id: id,
            assigned_user_id: assigned_user_id || grp.assigned_user_id,
            kantor_cabang: userCabang as any
          };
          db.customers.push(newCust);
        } else {
          // UPDATE
          const existingCust = db.customers.find((c: any) => c.id === custId);
          if (existingCust) {
            existingCust.name = member.name;
            existingCust.status = customerStatus as any; // update status if lunas
            existingCust.group_id = id;
            existingCust.assigned_user_id = assigned_user_id || grp.assigned_user_id;
          }
        }

        // Cari Tanggal Jatuh Tempo Akhir (Final Due Date)
        let computedTanggalJatuhTempo = null;
        let firstDueDateStr = null;

        const effHariPenagihan = hari_penagihan || grp.hari_penagihan;
        if (effHariPenagihan && effHariPenagihan !== "BELUM_DIATUR") {
          const dueDates = calculateDueDates(mCairDate, effHariPenagihan, mSisaMinggu);
          firstDueDateStr = dueDates.firstDueDate;
          computedTanggalJatuhTempo = dueDates.finalDueDate;
        }

        // Loan operations
        let loan = db.loans.find((l: any) => l.customer_id === custId);
        let loanId = loan?.id;

        if (!loan) {
          loanId = generateDocumentId('SPK', userCabang, db);
          const newLoan: Loan = {
            id: loanId,
            customer_id: custId,
            plafon: mPlafon,
            status: loanStatus as any,
            tanggal_cair: mCairDate,
            petugas_id: assigned_user_id || grp.assigned_user_id,
            created_at: new Date().toISOString(),
            kantor_cabang: userCabang as any,
            installment_paid: mMingguBerjalan,
            minggu_terbayar: mMingguBerjalan
          };
          (newLoan as any).tenor = mTenor;
          (newLoan as any).tanggal_jatuh_tempo = computedTanggalJatuhTempo;
          db.loans.push(newLoan);
        } else {
          loan.plafon = mPlafon;
          loan.status = loanStatus as any; // force update status based on transition paid status
          loan.tanggal_cair = mCairDate;
          loan.petugas_id = assigned_user_id || grp.assigned_user_id;
          (loan as any).tenor = mTenor;
          (loan as any).tanggal_jatuh_tempo = computedTanggalJatuhTempo;
          (loan as any).installment_paid = mMingguBerjalan;
          (loan as any).minggu_terbayar = mMingguBerjalan;
        }

        // Clear and recreate billing schedule for security and data purity
        db.billingSchedules = db.billingSchedules.filter((bs: any) => bs.customer_id !== custId);

        const weeklyPokok = Math.round(mPlafon / mTenor);
        const weeklyJasa = Math.round((mBunga - mPlafon) / mTenor);

        for (let i = 1; i <= mTenor; i++) {
          let installmentDate = null;
          let statusBill: "UNPAID" | "PAID" = "UNPAID";
          let bPokok = 0;
          let bJasa = 0;

          if (i <= mMingguBerjalan) {
            statusBill = "PAID";
            bPokok = weeklyPokok;
            bJasa = weeklyJasa;
            
            // Estimate past date
            if (firstDueDateStr) {
              const pastD = new Date(firstDueDateStr);
              pastD.setDate(pastD.getDate() - (mMingguBerjalan - i + 1) * 7);
              installmentDate = pastD.toISOString().slice(0, 10);
            }
          } else {
            statusBill = "UNPAID";
            bPokok = 0;
            bJasa = 0;
            
            // Future date
            if (firstDueDateStr) {
              const futD = new Date(firstDueDateStr);
              futD.setDate(futD.getDate() + (i - mMingguBerjalan - 1) * 7);
              installmentDate = futD.toISOString().slice(0, 10);
            }
          }

          const bill: BillingSchedule = {
            id: `BS-${loanId}-${i}`,
            loan_id: loanId,
            customer_id: custId,
            term: i,
            parent_group_id: id,
            tanggal_jatuh_tempo: installmentDate || "",
            pokok: weeklyPokok,
            jasa: weeklyJasa,
            total_tagihan: weeklyPokok + weeklyJasa,
            bayar_pokok: bPokok,
            bayar_jasa: bJasa,
            status: statusBill,
            hari_penagihan: effHariPenagihan,
            assigned_user_id: assigned_user_id || grp.assigned_user_id,
            petugas_assigned_id: assigned_user_id || grp.assigned_user_id,
            petugas_penagihan_id: assigned_user_id || grp.assigned_user_id,
            urutan_rute: resolvedUrutan,
            jam_setoran: jamSetoranVal,
            is_tanggung_renteng: resolvedIsTR
          };
          db.billingSchedules.push(bill);
        }
      });
    }

    writeDB(db);
    return res.json({
      success: true,
      message: `Pemetaan Rute Kelompok '${grp.name}' berhasil diperbarui oleh ${userObj.role.toUpperCase()}!`,
      group: grp
    });
  });

  // POST: Cancel/Unassign a Group Assignment (Safe Delete)
  app.post("/api/penagihan/pemetaan/unassign", (req, res) => {
    const db = readDB();
    const { group_id } = req.body;

    if (!group_id) {
      return res.status(400).json({ error: "Missing required parameter group_id" });
    }

    if (!db.groups) db.groups = [];
    const grp = db.groups.find((g: any) => g.id === group_id);
    if (!grp) {
      return res.status(404).json({ error: "Group not found." });
    }

    // Clear assignment values on the Group record
    grp.assigned_user_id = null;
    grp.petugas_assigned_id = null;
    grp.hari_penagihan = null;
    grp.jam_setoran = null;
    grp.urutan_rute = null;

    // Clear assignment values on customers in this group
    if (!db.customers) db.customers = [];
    db.customers.forEach((c: any) => {
      if (c.group_id === group_id) {
        c.assigned_user_id = null;
        c.petugas_assigned_id = null;
      }
    });

    // Clear assignment values on billing schedules
    if (!db.billingSchedules) db.billingSchedules = [];
    const groupCustomerIds = db.customers.filter((c: any) => c.group_id === group_id).map((c: any) => c.id);
    db.billingSchedules.forEach((sched: any) => {
      if (groupCustomerIds.includes(sched.customer_id) || sched.parent_group_id === group_id) {
        sched.assigned_user_id = null;
        sched.petugas_assigned_id = null;
        sched.petugas_penagihan_id = null;
        sched.hari_penagihan = null;
        sched.jam_setoran = null;
        sched.urutan_rute = null;
      }
    });

    writeDB(db);
    res.json({
      success: true,
      message: `Penugasan kelompok '${grp.name}' berhasil dibatalkan. Status kelompok kembali menjadi 'Belum Di-assign'.`
    });
  });

  // GET: Mobile Daily Billing and Routing API
  app.get("/api/mobile/penagihan-harian", (req, res) => {
    const db = readDB();
    const userObj = getUserFromReq(req);
    const loggedInOfficerId = userObj.id;

    // Filter petugas_assigned_id cocok dengan ID petugas login atau parameter
    const petugasId = req.query.petugas_id || loggedInOfficerId;

    // Filter hari_penagihan: Cocok dengan query param `hari` atau default hari ini (Indonesian day name)
    const daysIndo = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"];
    const todayIndo = daysIndo[new Date().getDay()];
    const queryHari = req.query.hari || todayIndo;

    if (!db.groups) db.groups = [];

    // Filter groups assigned to the officer and matching the day
    let filteredGroups = db.groups.filter((g: any) => {
      const assignedId = g.assigned_user_id || g.petugas_assigned_id;
      const matchPetugas = String(assignedId).toLowerCase() === String(petugasId).toLowerCase();
      const matchHari = String(g.hari_penagihan || "").trim().toUpperCase() === String(queryHari).trim().toUpperCase();
      return matchPetugas && matchHari;
    });

    // Populate members and billing info for each group
    const result = filteredGroups.map((g: any) => {
      const groupMembers = (db.customers || []).filter((c: any) => c.group_id === g.id);
      const region = (db.regions || []).find((r: any) => r.id === g.region_id);
      
      // Calculate total scheduled billing for this group
      const memberIds = groupMembers.map((m: any) => m.id);
      const activeBillings = (db.billingSchedules || []).filter((b: any) => 
        memberIds.includes(b.customer_id) && b.status === "UNPAID"
      );
      
      const targetAngsuran = activeBillings.filter((b: any) => b.term === 1 || b.term === (g.current_term || 1)).reduce((sum: number, b: any) => sum + (Number(b.total_tagihan) || 0), 0);
      const totalOutstanding = activeBillings.reduce((sum: number, b: any) => sum + (Number(b.total_tagihan) || 0), 0);

      return {
        id: g.id,
        name: g.name,
        hari_penagihan: g.hari_penagihan,
        urutan_rute: typeof g.urutan_rute !== "undefined" ? Number(g.urutan_rute) : 1,
        jam_setoran: g.jam_setoran || "09:00",
        is_tanggung_renteng: typeof g.is_tanggung_renteng !== "undefined" ? Boolean(g.is_tanggung_renteng) : true,
        region: region ? region.name : "Tanpa Wilayah",
        members: groupMembers.map((m: any) => {
          const loan = (db.loans || []).find((l: any) => l.customer_id === m.id);
          const custBillings = activeBillings.filter((b: any) => b.customer_id === m.id);
          return {
            id: m.id,
            name: m.name,
            nik: m.nik,
            alamat: m.alamat,
            plafon: loan ? loan.plafon : 0,
            tenor: g.tenor || 10,
            remaining_billings: custBillings.length,
            next_due_amount: custBillings[0] ? custBillings[0].total_tagihan : 0
          };
        }),
        metrics: {
          total_members: groupMembers.length,
          target_angsuran_hari_ini: targetAngsuran || (groupMembers.length * 110000),
          total_outstanding_group: totalOutstanding
        }
      };
    });

    // ORDERING: urutkan berdasarkan urutan_rute (asc) lalu jam_setoran (asc)
    result.sort((a, b) => {
      if (a.urutan_rute !== b.urutan_rute) {
        if (a.urutan_rute === null || a.urutan_rute === undefined) return 1;
        if (b.urutan_rute === null || b.urutan_rute === undefined) return -1;
        return a.urutan_rute - b.urutan_rute;
      }
      return String(a.jam_setoran || "").localeCompare(String(b.jam_setoran || ""));
    });

    res.json({
      success: true,
      petugas_id: petugasId,
      hari: queryHari,
      timestamp: new Date().toISOString(),
      count: result.length,
      data: result
    });
  });

  // API: Add Berkas Masuk with GCS multipart uploads
  app.post("/api/berkas-masuk", checkRole(['petugas', 'admin', 'super_admin']), upload.fields([
    { name: 'doc_ktp_pemohon', maxCount: 1 },
    { name: 'doc_ktp_penjamin', maxCount: 1 },
    { name: 'doc_kk', maxCount: 1 }
  ]), async (req: express.Request, res: express.Response) => {
    const db = readDB();
    if (!db.berkasMasuk) db.berkasMasuk = [];
    const userObj = getUserFromReq(req);

    const {
      id_kelompok,
      nama_kelompok,
      wilayah,
      nama_pemohon,
      nik_pemohon,
      tahap_pinjaman,
      pengajuan_pinjaman,
      tenor_mg,
      sisa_piutang,
      no_telepon_pemohon,
      jenis_kelamin_pemohon,
      agama,
      nama_penjamin,
      nik_penjamin,
      jenis_kelamin_penjamin,
      no_telepon_penjamin,
      hubungan,
      status
    } = req.body;

    if (!nama_pemohon || !nik_pemohon || !nama_kelompok) {
      return res.status(400).json({ error: "Nama Pemohon, NIK Pemohon, dan Nama Kelompok wajib diisi." });
    }

    const isNikExists = db.berkasMasuk.some(b => b.nik_pemohon === nik_pemohon);
    if (isNikExists) {
      return res.status(400).json({ error: `NIK Pemohon ${nik_pemohon} sudah memiliki berkas masuk terdaftar.` });
    }

    // Capture existing files URL if passed
    let doc_ktp_pemohon_url = req.body.doc_ktp_pemohon || null;
    let doc_ktp_penjamin_url = req.body.doc_ktp_penjamin || null;
    let doc_kk_url = req.body.doc_kk || null;

    // Build modern Promise-based upload arrays to execute concurrently via Promise.all()
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const uploadPromises: { field: string; promise: Promise<string> }[] = [];

    // TEMPORARY BYPASS: Google Cloud Storage bypassed for testing phase.
    // Set to 'true' or use the environment detection logic below when deploying to production.
    // const canUploadToGCS = process.env.GCS_PROJECT_ID && process.env.GCS_BUCKET_NAME && process.env.GCS_CREDENTIALS;
    const canUploadToGCS = false;

    if (files) {
      if (files.doc_ktp_pemohon && files.doc_ktp_pemohon[0]) {
        const file = files.doc_ktp_pemohon[0];
        if (canUploadToGCS) {
          uploadPromises.push({
            field: 'doc_ktp_pemohon',
            promise: uploadToGCS(file.buffer, `ktp_pemohon_${file.originalname}`)
          });
        } else {
          // Local sandbox fallback: write to local uploads folder
          const uploadsDir = path.join(process.cwd(), "uploads");
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          const fileExt = path.extname(file.originalname) || ".jpg";
          const filename = `ktp_pemohon_fallback_${Date.now()}${fileExt}`;
          fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
          doc_ktp_pemohon_url = `/uploads/${filename}`;
        }
      }

      if (files.doc_ktp_penjamin && files.doc_ktp_penjamin[0]) {
        const file = files.doc_ktp_penjamin[0];
        if (canUploadToGCS) {
          uploadPromises.push({
            field: 'doc_ktp_penjamin',
            promise: uploadToGCS(file.buffer, `ktp_penjamin_${file.originalname}`)
          });
        } else {
          const uploadsDir = path.join(process.cwd(), "uploads");
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          const fileExt = path.extname(file.originalname) || ".jpg";
          const filename = `ktp_penjamin_fallback_${Date.now()}${fileExt}`;
          fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
          doc_ktp_penjamin_url = `/uploads/${filename}`;
        }
      }

      if (files.doc_kk && files.doc_kk[0]) {
        const file = files.doc_kk[0];
        if (canUploadToGCS) {
          uploadPromises.push({
            field: 'doc_kk',
            promise: uploadToGCS(file.buffer, `doc_kk_${file.originalname}`)
          });
        } else {
          const uploadsDir = path.join(process.cwd(), "uploads");
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          const fileExt = path.extname(file.originalname) || ".jpg";
          const filename = `kk_fallback_${Date.now()}${fileExt}`;
          fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
          doc_kk_url = `/uploads/${filename}`;
        }
      }
    }

    try {
      if (uploadPromises.length > 0) {
        // Run Promise.all() parallel operations as strictly requested!
        const publicUrls = await Promise.all(uploadPromises.map(up => up.promise));
        uploadPromises.forEach((up, index) => {
          const url = publicUrls[index];
          if (up.field === 'doc_ktp_pemohon') doc_ktp_pemohon_url = url;
          if (up.field === 'doc_ktp_penjamin') doc_ktp_penjamin_url = url;
          if (up.field === 'doc_kk') doc_kk_url = url;
        });
      }
    } catch (err: any) {
      console.error("GCS Promise.all file upload failing:", err.message);
      return res.status(500).json({ error: "Gagal mengunggah berkas ke Google Cloud Storage: " + err.message });
    }

    const userCabang = (userObj.cabang_id || "PUSAT").toUpperCase();
    const generatedBmId = generateDocumentId('BM', userCabang, db);

    const newBerkas: BerkasMasuk = {
      id: generatedBmId,
      id_kelompok: id_kelompok || `G-MIG-${Date.now()}`,
      nama_kelompok,
      wilayah: wilayah || "Wilayah Pusat",
      nama_pemohon,
      nik_pemohon,
      tahap_pinjaman: Number(tahap_pinjaman) || 1,
      pengajuan_pinjaman: Number(pengajuan_pinjaman) || 0,
      tenor_mg: Number(tenor_mg) || 25,
      sisa_piutang: Number(sisa_piutang) || 0,
      no_telepon_pemohon: no_telepon_pemohon || "",
      jenis_kelamin_pemohon: jenis_kelamin_pemohon || "Perempuan",
      agama: agama || "Islam",
      nama_penjamin: nama_penjamin || "",
      nik_penjamin: nik_penjamin || "",
      jenis_kelamin_penjamin: jenis_kelamin_penjamin || "Laki-laki",
      no_telepon_penjamin: no_telepon_penjamin || "",
      hubungan: hubungan || "Suami",
      doc_ktp_pemohon: doc_ktp_pemohon_url,
      doc_ktp_penjamin: doc_ktp_penjamin_url,
      doc_kk: doc_kk_url,
      status: status || 'PENDING_SPV',
      petugas_id: userObj.id,
      kantor_cabang: (userObj.cabang_id || "PUSAT").toUpperCase() as any,
      created_at: new Date().toISOString(),
      catatan: null
    };

    db.berkasMasuk.push(newBerkas);
    writeDB(db);

    res.json({
      success: true,
      message: canUploadToGCS 
        ? "Berkas masuk berhasil didaftarkan! Semua dokumen asli berhasil diunggah langsung ke Google Cloud Storage."
        : "Berkas masuk didaftarkan (Simulasi lokal sandbox aktif karena kredensial GCS env belum lengkap).",
      data: newBerkas
    });
  });

  // API: Approve Berkas Masuk (State Machine)
  app.post("/api/berkas-masuk/:id/approve", (req, res) => {
    const { id } = req.params;
    const db = readDB();
    if (!db.berkasMasuk) db.berkasMasuk = [];

    const idx = db.berkasMasuk.findIndex(b => b.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Berkas tidak ditemukan." });
    }

    const berkas = db.berkasMasuk[idx];
    if (berkas.status === "PENDING_SPV") {
      // SPV Approval -> PENDING_ADM
      berkas.status = "PENDING_ADM";
      writeDB(db);
      return res.json({
        success: true,
        message: `Berkas ${berkas.nama_pemohon} berhasil disetujui oleh Supervisor. Status dialihkan ke PENDING_ADM.`,
        data: berkas
      });
    } else if (berkas.status === "PENDING_ADM") {
      // Admin Approval -> APPROVED_FOR_SURVEY
      berkas.status = "APPROVED_FOR_SURVEY";

      // JIKA di-approve, sistem secara otomatis membuka akses form 'Survei Kelompok' untuk nasabah ini di aplikasi petugas.
      // We will create the Group if not exist
      let groupObj = db.groups.find(g => g.name.toLowerCase() === berkas.nama_kelompok.toLowerCase());
      if (!groupObj) {
        const newGroupId = `G-BM-${Date.now()}`;
        groupObj = {
          id: newGroupId,
          name: berkas.nama_kelompok,
          sistem_tanggung_renteng: true,
          survey_status: 'NOT_SURVEYED',
          survey_notes: `Kelompok terdaftar secara otomatis dari berkas masuk ${berkas.nama_pemohon}`,
          created_at: new Date().toISOString()
        };
        db.groups.push(groupObj);
      } else {
        // Reset survey status to NOT_SURVEYED to reopen access
        groupObj.survey_status = 'NOT_SURVEYED';
      }

      // Add customer to db.customers
      const newCustId = `C-BM-${Date.now()}`;
      const newCustomer: Customer = {
        id: newCustId,
        name: berkas.nama_pemohon,
        nik: berkas.nik_pemohon,
        alamat: berkas.wilayah || "Domisili Berkas",
        pekerjaan: "Usaha Anggota",
        status: 'APPROVED_FOR_SURVEY',
        is_new_member: berkas.tahap_pinjaman === 1,
        group_id: groupObj.id,
        assigned_user_id: berkas.petugas_id
      };
      db.customers.push(newCustomer);

      writeDB(db);
      return res.json({
        success: true,
        message: `Berkas ${berkas.nama_pemohon} berhasil disetujui final oleh Admin & status dirilis ke APPROVED_FOR_SURVEY! Akses Survei Kelompok dan Individu sekarang resmi terbuka.`,
        data: berkas
      });
    } else {
      return res.status(400).json({ error: `Gagal: Berkas dalam status ${berkas.status} tidak dapat diapprove.` });
    }
  });

  // API: Reject Berkas Masuk (State Machine)
  app.post("/api/berkas-masuk/:id/reject", (req, res) => {
    const { id } = req.params;
    const { catatan } = req.body;

    const db = readDB();
    if (!db.berkasMasuk) db.berkasMasuk = [];

    const idx = db.berkasMasuk.findIndex(b => b.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Berkas tidak ditemukan." });
    }

    const berkas = db.berkasMasuk[idx];
    if (berkas.status !== "PENDING_SPV" && berkas.status !== "PENDING_ADM") {
      return res.status(400).json({ error: "Berkas tidak dapat direject dalam status saat ini." });
    }

    berkas.status = "REJECTED";
    berkas.catatan = catatan || "Ditolak oleh SPV/Admin";

    writeDB(db);
    res.json({
      success: true,
      message: `Berkas ${berkas.nama_pemohon} berhasil ditolak dengan catatan.`,
      data: berkas
    });
  });

  // API: Delete Berkas Masuk
  app.delete("/api/berkas-masuk/:id", (req, res) => {
    const { id } = req.params;
    const db = readDB();
    if (!db.berkasMasuk) db.berkasMasuk = [];

    const idx = db.berkasMasuk.findIndex(b => b.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Berkas tidak ditemukan." });
    }

    const berkas = db.berkasMasuk[idx];
    if (berkas.status !== "DRAFT" && berkas.status !== "REJECTED") {
      return res.status(400).json({ error: "Gagal: Petugas hanya dapat menghapus berkas dengan status DRAFT atau REJECTED." });
    }

    db.berkasMasuk.splice(idx, 1);
    writeDB(db);

    res.json({
      success: true,
      message: "Berkas masuk berhasil dihapus dari sistem."
    });
  });

  // API: Add Manual Raw Customer Entry
  app.post("/api/raw-customers", checkRole(['admin', 'super_admin']), (req, res) => {
    const db = readDB();
    if (!db.rawCustomers) {
      db.rawCustomers = [];
    }

    const userObj = getUserFromReq(req);
    let {
      nama_kelompok,
      tanggal_pencairan,
      tanggal_jatuh_tempo,
      nama_pemohon,
      panggilan,
      tanggal_lahir,
      alamat,
      petani,
      no_hp,
      jumlah_tanggungan,
      nik,
      nama_penjamin,
      pekerjaan_penjamin,
      hubungan,
      no_hp_penjamin,
      tahap,
      pokok_pinjaman,
      tempo_mg,
      target,
      jumlah,
      deposito,
      status,
      kantor_cabang
    } = req.body;

    // Enforce branch if not super_admin
    if (userObj.role !== 'super_admin' && userObj.role !== 'SUPER_ADMIN') {
      kantor_cabang = (userObj.cabang_id || "PUSAT").toUpperCase();
    } else {
      kantor_cabang = (kantor_cabang || "PUSAT").toUpperCase();
    }

    if (!nama_pemohon || !nik || !nama_kelompok) {
      return res.status(400).json({ error: "Nama Pemohon, NIK, dan Nama Kelompok wajib diisi." });
    }

    // Check unique NIK
    const isDup = db.rawCustomers.some(rc => rc.nik === String(nik).trim());
    if (isDup) {
      return res.status(400).json({ error: `NIK '${nik}' sudah terdaftar dalam lemari arsip master.` });
    }

    const newRawCustomer: RawCustomer = {
      id: "RC-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      nama_kelompok: String(nama_kelompok).trim(),
      tanggal_pencairan: tanggal_pencairan ? new Date(tanggal_pencairan).toISOString() : new Date().toISOString(),
      tanggal_jatuh_tempo: tanggal_jatuh_tempo ? new Date(tanggal_jatuh_tempo).toISOString() : new Date().toISOString(),
      nama_pemohon: String(nama_pemohon).trim(),
      panggilan: panggilan ? String(panggilan).trim() : null,
      tanggal_lahir: tanggal_lahir ? new Date(tanggal_lahir).toISOString() : "1980-01-01T00:00:00Z",
      alamat: String(alamat).trim(),
      petani: String(petani).trim() || "Pertanian",
      no_hp: String(no_hp).trim() || "-",
      jumlah_tanggungan: Number(jumlah_tanggungan) || 0,
      nik: String(nik).trim(),
      nama_penjamin: String(nama_penjamin).trim() || "-",
      pekerjaan_penjamin: String(pekerjaan_penjamin).trim() || "-",
      hubungan: String(hubungan).trim() || "-",
      no_hp_penjamin: String(no_hp_penjamin).trim() || "-",
      tahap: Number(tahap) || 1,
      pokok_pinjaman: Number(pokok_pinjaman) || 0,
      tempo_mg: Number(tempo_mg) || 10,
      target: Number(target) || 0,
      jumlah: Number(jumlah) || 0,
      deposito: Number(deposito) || 0,
      status: sanitizeLegacyStatus(status),
      kantor_cabang: kantor_cabang as any
    };

    db.rawCustomers.unshift(newRawCustomer);
    writeDB(db);

    res.json({
      success: true,
      message: "Data arsip baru berhasil disimpan ke database induk.",
      data: newRawCustomer
    });
  });

  // API: Bulk Excel import for Raw Customers
  const importExcelHandler = async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Gagal: File excel wajib diunggah." });
    }

    const userObj = getUserFromReq(req);
    let branchSelected = (req.body.kantor_cabang || "PUSAT").toUpperCase();
    if (userObj.role !== 'super_admin' && userObj.role !== 'SUPER_ADMIN') {
      branchSelected = (userObj.cabang_id || "PUSAT").toUpperCase();
    }

    try {
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json<any>(sheet);

      if (rows.length === 0) {
        return res.status(400).json({ error: "Gagal: File Excel kosong atau tidak memiliki data." });
      }

      const db = readDB();
      if (!db.rawCustomers) {
        db.rawCustomers = [];
      }

      // 1. Data Normalizer Helpers based on design rules
      const normalizeNumber = (val: any): number => {
        if (val === undefined || val === null || String(val).trim() === "") {
          return 0;
        }
        const parsed = Number(val);
        return isNaN(parsed) ? 0 : parsed;
      };

      const parseExcelDate = (val: any): string | null => {
        if (val === undefined || val === null || String(val).trim() === "") {
          return null;
        }
        try {
          if (val instanceof Date) {
            return val.toISOString();
          }
          if (typeof val === 'number') {
            const date = new Date(Date.UTC(1899, 11, 30) + val * 24 * 60 * 60 * 1000);
            return date.toISOString();
          }
          if (typeof val === 'string') {
            const trimmed = val.trim();
            const parsed = Date.parse(trimmed);
            if (!isNaN(parsed)) {
              return new Date(parsed).toISOString();
            }
            // Fallback for DD/MM/YYYY or DD-MM-YYYY format
            const match = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
            if (match) {
              const day = parseInt(match[1], 10);
              const month = parseInt(match[2], 10) - 1; // 0-based
              const year = parseInt(match[3], 10);
              const d = new Date(Date.UTC(year, month, day));
              if (!isNaN(d.getTime())) {
                return d.toISOString();
              }
            }
          }
          return null;
        } catch (e) {
          return null;
        }
      };

      const normalizeNIK = (val: any): string | null => {
        if (val === undefined || val === null || String(val).trim() === "") {
          return null;
        }
        try {
          let str = String(val).trim();
          if (str.includes('e') || str.includes('E') || str.includes('+')) {
            const num = Number(val);
            if (!isNaN(num)) {
              str = num.toFixed(0);
            }
          }
          return str;
        } catch (e) {
          return String(val).trim();
        }
      };

      const mappedArray: RawCustomer[] = [];
      let skippedCount = 0;

      for (const row of rows) {
        const namaPemohonClean = row['NAMA PEMOHON'] ? String(row['NAMA PEMOHON']).trim() : "";
        const namaPenjaminClean = row['NAMA PENJAMIN'] ? String(row['NAMA PENJAMIN']).trim() : "";

        // BARIS HANYA DI-SKIP JIKA BENAR-BENAR KOSONG MELOMPONG
        if (!namaPemohonClean || !namaPenjaminClean) {
          skippedCount++;
          continue;
        }

        const namaKelompok = row['NAMA KELOMPOK'] ? String(row['NAMA KELOMPOK']).trim() : null;
        const tanggalPencairan = parseExcelDate(row['TANGGAL PENCAIRAN']);
        const tanggalJatuhTempo = parseExcelDate(row['TANGGAL JATUH TEMPO']);
        const panggilan = row['PANGGILAN'] ? String(row['PANGGILAN']).trim() : null;
        const tanggalLahir = parseExcelDate(row['TANGGAL LAHIR']);
        const alamat = row['ALAMAT'] ? String(row['ALAMAT']).trim() : null;
        const petani = row['PEKERJAAN'] ? String(row['PEKERJAAN']).trim() : null; // Excel: PEKERJAAN -> DB: petani
        const noHP = row['NO HP'] ? String(row['NO HP']).trim() : null;
        const jumlahTanggungan = row['JUMLAH TANGGUNGAN'] !== undefined ? Number(row['JUMLAH TANGGUNGAN']) : 0;
        const nik = row['NIK'] ? normalizeNIK(row['NIK']) : null;
        const hubungan = row['HUBUNGAN'] ? String(row['HUBUNGAN']).trim() : null;
        const noHPPenjamin = row['NO HP_1'] ? String(row['NO HP_1']).trim() : null;
        const tahap = row['TAHAP'] !== undefined ? Number(row['TAHAP']) : 1;
        const pokokPinjaman = row['POKOK PINJAMAN'] !== undefined ? Number(row['POKOK PINJAMAN']) : 0;
        const tempoMg = row['TEMPO (MG)'] !== undefined ? Number(row['TEMPO (MG)']) : 0;
        const deposito = row['DEPOSITO'] !== undefined ? Number(row['DEPOSITO']) : 0;
        const statusVal = (row['STATUS'] && String(row['STATUS']).toUpperCase().includes('SELESAI')) ? 'SELESAI' : 'AKTIF';

        // Tambahan property penjamin & kalkulasi target/jumlah untuk RawCustomer tipe lengkap
        const pekerjaanPenjamin = row['PEKERJAAN PENJAMIN'] ? String(row['PEKERJAAN PENJAMIN']).trim() : null;
        const jumlah = row['JUMLAH'] !== undefined ? Number(row['JUMLAH']) : (pokokPinjaman * 1.1);
        const target = row['TARGET'] !== undefined ? Number(row['TARGET']) : (tempoMg ? (jumlah / tempoMg) : 0);

        const importedCustomer: RawCustomer = {
          id: "RC-" + Date.now() + "-" + Math.floor(Math.random() * 100000) + "-" + mappedArray.length,
          nama_kelompok: namaKelompok,
          tanggal_pencairan: tanggalPencairan,
          tanggal_jatuh_tempo: tanggalJatuhTempo,
          nama_pemohon: namaPemohonClean,
          panggilan: panggilan,
          tanggal_lahir: tanggalLahir,
          alamat: alamat,
          petani: petani,
          no_hp: noHP,
          jumlah_tanggungan: isNaN(jumlahTanggungan) ? 0 : jumlahTanggungan,
          nik: nik,
          nama_penjamin: namaPenjaminClean,
          pekerjaan_penjamin: pekerjaanPenjamin,
          hubungan: hubungan,
          no_hp_penjamin: noHPPenjamin,
          tahap: isNaN(tahap) ? 1 : tahap,
          pokok_pinjaman: isNaN(pokokPinjaman) ? 0 : pokokPinjaman,
          tempo_mg: isNaN(tempoMg) ? 0 : tempoMg,
          target: isNaN(target) ? 0 : target,
          jumlah: isNaN(jumlah) ? 0 : jumlah,
          deposito: isNaN(deposito) ? 0 : deposito,
          status: sanitizeLegacyStatus(statusVal),
          kantor_cabang: branchSelected as any
        };

        mappedArray.push(importedCustomer);
      }

      // Optimasi Performa - Chunking 1000 baris per eksekusi untuk kestabilan memori
      const CHUNK_SIZE = 1000;
      for (let i = 0; i < mappedArray.length; i += CHUNK_SIZE) {
        const chunk = mappedArray.slice(i, i + CHUNK_SIZE);
        
        // Simulasikan prisma.raw_customers.createMany({ data: chunk, skipDuplicates: true })
        // dengan melakukan concat ke dalam array local memory database:
        db.rawCustomers.push(...chunk);
      }

      writeDB(db);

      res.json({
        success: true,
        message: `Impor Excel Sukses: Berhasil memasukkan ${mappedArray.length} baris data arsip baru (Metode Batch SQL: Chunking ${CHUNK_SIZE} baris). Melewati ${skippedCount} baris kosong karena nama_pemohon tidak valid.`,
        importedCount: mappedArray.length,
        skippedCount: skippedCount
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Kesalahan internal impor Excel: " + err.message });
    }
  };

  app.post("/api/raw-customers/import-excel", checkRole(['admin', 'super_admin']), upload.single("file"), importExcelHandler);
  app.post("/api/raw-customers/import", checkRole(['admin', 'super_admin']), upload.single("file"), importExcelHandler);

  // API Backend Fast-Track Pencairan/Migration (using simulated prisma.$transaction context)
  app.post("/api/raw-customers/:id/cairkan", async (req, res) => {
    const { id } = req.params;
    const { is_new_member } = req.body;

    const db = readDB();
    if (!db.rawCustomers) {
      db.rawCustomers = [];
    }

    const rcIndex = db.rawCustomers.findIndex(rc => rc.id === id);
    if (rcIndex === -1) {
      return res.status(404).json({ error: "Nasabah tidak ditemukan di daftar arsip database awal." });
    }

    const legacyRc = db.rawCustomers[rcIndex];
    if (legacyRc.status !== 'AKTIF') {
      return res.status(400).json({ error: "Gagal: Fast-track pencairan / migrasi hanya diperuntukkan untuk nasabah dengan status AKTIF." });
    }

    try {
      // PRISMA TRANSACTION LOGICAL EMULATION
      // In a real Prisma database:
      // await prisma.$transaction(async (prisma) => {
      //   const customer = await prisma.customer.create({ ... });
      //   const loan = await prisma.loan.create({ ... });
      //   await prisma.billingSchedule.createMany({ ... });
      //   await prisma.rawCustomer.delete({ where: { id: id } });
      // });

      // 1. Insert ke tabel customers
      const cleanName = String(legacyRc.nama_pemohon).trim();
      const cleanNIK = String(legacyRc.nik).trim();
      const cleanAlamat = String(legacyRc.alamat).trim();
      const cleanPekerjaan = String(legacyRc.petani || "Pertanian").trim();

      // Find if customer already exists in operating table
      let targetCustId = `C2026-MIG-${Date.now()}-${Math.floor(Math.random() * 100)}`;
      const existingCustIdx = db.customers.findIndex(c => c.nik === cleanNIK);
      
      let customerRecord;
      if (existingCustIdx !== -1) {
        customerRecord = db.customers[existingCustIdx];
        customerRecord.status = 'ACTIVE_LOAN';
        targetCustId = customerRecord.id;
      } else {
        // Resolve group ID
        let matchedGroupId = null;
        if (legacyRc.nama_kelompok) {
          const normKelompok = legacyRc.nama_kelompok.trim().toLowerCase();
          const grp = db.groups.find(g => g.name.toLowerCase() === normKelompok);
          if (grp) {
            matchedGroupId = grp.id;
          } else {
            // Auto create matching group
            matchedGroupId = `G-MIG-${Date.now()}`;
            db.groups.push({
              id: matchedGroupId,
              name: legacyRc.nama_kelompok.trim(),
              sistem_tanggung_renteng: true,
              survey_status: 'LAYAK',
              survey_notes: `Kelompok migrasi terbuat otomatis dari nasabah ${cleanName}`,
              created_at: new Date().toISOString()
            });
          }
        }

        customerRecord = {
          id: targetCustId,
          name: cleanName,
          nik: cleanNIK,
          alamat: cleanAlamat,
          pekerjaan: cleanPekerjaan,
          status: 'ACTIVE_LOAN' as any,
          is_new_member: is_new_member !== undefined ? !!is_new_member : (legacyRc.tahap === 1),
          group_id: matchedGroupId
        };
        db.customers.push(customerRecord);
      }

      // 2. Insert ke tabel loans
      const loanId = `L-MIG-${Date.now()}-${Math.floor(Math.random() * 100)}`;
      const plafon = Number(legacyRc.pokok_pinjaman) || 5000000;
      const totalBayar = Number(legacyRc.jumlah) || (plafon * 1.1);

      const newLoan: Loan = {
        id: loanId,
        customer_id: targetCustId,
        plafon: plafon,
        status: 'ACTIVE_LOAN',
        tanggal_cair: new Date().toISOString()
      };
      db.loans.push(newLoan);

      // 3. Billing schedules creation (Service Billing Generator)
      const weeks = Number(legacyRc.tempo_mg) || 10;
      const targetWeekly = Number(legacyRc.target) || (totalBayar / weeks);
      const weeklyPokok = plafon / weeks;
      const weeklyJasa = targetWeekly - weeklyPokok;

      for (let i = 1; i <= weeks; i++) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (i * 7));

        const bill: BillingSchedule = {
          id: `BS-${loanId}-${i}`,
          loan_id: loanId,
          customer_id: targetCustId,
          term: i,
          tanggal_jatuh_tempo: dueDate.toISOString(),
          pokok: Number(weeklyPokok.toFixed(2)),
          jasa: Number(weeklyJasa.toFixed(2)),
          total_tagihan: Number(targetWeekly.toFixed(2)),
          bayar_pokok: 0,
          bayar_jasa: 0,
          status: 'UNPAID'
        };
        db.billingSchedules.push(bill);
      }

      // Record deposit
      const deponominal = Number(legacyRc.deposito) || 250000;
      if (deponominal > 0) {
        db.deposits.push({
          id: `DEP-MIG-${Date.now()}`,
          customer_id: targetCustId,
          nominal: deponominal,
          tanggal_mulai: new Date().toISOString(),
          jatuh_tempo: new Date(Date.now() + 180 * 24 * 60 * 60 * 1005).toISOString(),
          status: 'ACTIVE'
        });
      }

      // Trigger accounting journal
      const netReceived = plafon - deponominal;
      const journalLines = [
        { account_code: '1210', debit: plafon, credit: 0 }, // Piutang Pokok
        { account_code: '2110', debit: 0, credit: deponominal }, // Utang Deposito
        { account_code: '1112', debit: 0, credit: netReceived > 0 ? netReceived : 0 } // Kas Bank
      ];
      addJournalEntry(
        db,
        `MIGRATE_ACT_${targetCustId}`,
        `Migrasi Pencairan Langsung Legacy - ${cleanName} (Plafon Rp ${plafon.toLocaleString('id-ID')})`,
        journalLines
      );

      // 4. Hapus (Delete) atau tandai (Flag: Migrated) row tersebut di tabel raw_customers agar tidak terjadi pencairan ganda.
      db.rawCustomers.splice(rcIndex, 1);

      writeDB(db);

      res.json({
        success: true,
        message: `Pencairan Fast-Track untuk nasabah ${cleanName} sukses dilakukan! Data nasabah, loan, dan ${weeks} draf angsuran mingguan terbuat otomatis.`,
        data: {
          customer_id: targetCustId,
          loan_id: loanId,
          weeks_created: weeks
        }
      });
    } catch (e: any) {
      console.error("Fast track error:", e);
      res.status(500).json({ error: "Gagal memproses transaksi fast-track pencairan: " + e.message });
    }
  });

  // API: Reset State
  app.post("/api/reset", (req, res) => {
    const initialState = getInitialState();
    writeDB(initialState);
    res.json({ success: true, message: "Database reset to original seed state successfully.", state: initialState });
  });

  // API Mobile Auth: Login with Device Binding Check
  app.post("/api/auth/login", (req, res) => {
    const { nik, password, deviceId } = req.body;
    if (!nik || !password || !deviceId) {
      return res.status(400).json({ error: "NIK, Password, dan Device ID wajib diisi." });
    }

    const db = readDB();
    if (!db.users) {
      const initial = getInitialState();
      db.users = initial.users;
      writeDB(db);
    }

    const user = db.users.find(u => u.nik === nik);
    if (!user) {
      return res.status(404).json({ error: "User dengan NIK tersebut tidak ditemukan." });
    }

    // Verify password hash
    const reqPwHash = hashSHA256(password);
    if (user.password_hash !== reqPwHash) {
      return res.status(401).json({ error: "Password yang Anda masukkan salah." });
    }

    // Device Binding Check
    if (!user.device_id) {
      user.device_id = deviceId;
      writeDB(db);
    } else if (user.device_id !== deviceId) {
      return res.status(400).json({ error: "Akun ini telah terikat pada perangkat lain" });
    }

    // Generate simulated JWT access token
    const tokenPayload = {
      userId: user.id,
      nik: user.nik,
      role: user.role,
      device_id: user.device_id,
      exp: Date.now() + 24 * 60 * 60 * 1000
    };
    const token = "sim-jwt." + Buffer.from(JSON.stringify(tokenPayload)).toString("base64");

    res.json({
      token,
      user_data: {
        id: user.id,
        nik: user.nik,
        nama: user.nama,
        role: user.role,
        device_id: user.device_id
      },
      pin_hash: user.offline_pin_hash
    });
  });

  // API Mobile Auth Debug: Reset Device Binding
  app.post("/api/auth/reset-binding", (req, res) => {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "User ID diperlukan." });
    }

    const db = readDB();
    const user = db.users?.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: "User tidak ditemukan." });
    }

    user.device_id = null;
    writeDB(db);

    res.json({ success: true, message: "Device binding berhasil dilepas.", state: db });
  });

  // API Tanggung Renteng: Settle joint liability debt
  app.post("/api/tanggung-renteng/settle", settleLiability);
  app.post("/api/tanggung-renteng/withdraw", withdrawLiabilityCash);
  app.post("/api/tanggung-renteng/alihkan-talangan", alihkanTalangan);
  app.get("/api/tanggung-renteng/tr-debts", getTrDebts);
  app.post("/api/tanggung-renteng/bayar-tr-debt", bayarTrDebt);

  // Helper patterns for Onboarding Import Excel/CSV files
  const getVal = (row: any, keys: string[]) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null) return row[k];
    }
    return undefined;
  };

  const parseExcelDate = (val: any): string => {
    if (val instanceof Date) {
      return val.toISOString();
    }
    if (typeof val === 'number') {
      const date = new Date(Date.UTC(1899, 11, 30) + val * 24 * 60 * 60 * 1000);
      return date.toISOString();
    }
    if (typeof val === 'string') {
      const parsed = Date.parse(val);
      if (!isNaN(parsed)) {
        return new Date(parsed).toISOString();
      }
    }
    throw new Error("Format tanggal mulai siklus tidak valid.");
  };

  const parseNIK = (val: any): string => {
    if (val === undefined || val === null) {
      throw new Error("NIK tidak boleh kosong.");
    }
    let str = String(val).trim();
    if (str.includes('e') || str.includes('E') || str.includes('+')) {
      const num = Number(val);
      if (!isNaN(num)) {
        str = num.toFixed(0);
      }
    }
    if (!/^\d+$/.test(str)) {
      throw new Error("NIK harus berupa angka.");
    }
    if (str.length < 10) {
      throw new Error("Digit NIK terlalu pendek.");
    }
    return str;
  };

  const sanitizeLegacyStatus = (statusVal: any): "AKTIF" | "SELESAI" => {
    if (statusVal === undefined || statusVal === null) {
      return "AKTIF";
    }
    const cleanStr = String(statusVal).trim().toUpperCase();
    if (cleanStr === "AKTIF" || cleanStr === "ACTIVE") {
      return "AKTIF";
    }
    if (cleanStr === "SELESAI" || cleanStr === "LUNAS") {
      return "SELESAI";
    }
    return "AKTIF";
  };


  // Onboarding API for Excel/CSV Bulk Import (with ACID Prisma transaction proxy)
  app.post("/api/onboarding/import-excel", upload.single("file"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Gagal: File excel wajib diunggah." });
    }

    try {
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json<any>(sheet);

      if (rows.length === 0) {
        return res.status(400).json({ error: "Gagal: File Excel kosong atau tidak memiliki baris data." });
      }

      const processedNIKs = new Set<string>();

      // Emulated ACID transaction block over memory state file
      const originalState = readDB();
      const clonedState = JSON.parse(JSON.stringify(originalState)) as SystemState;

      const tx = {
        getState: () => clonedState,
        commit: () => {
          writeDB(clonedState);
        }
      };

      try {
        const state = tx.getState();
        const existingCustomers = state.customers || [];

        rows.forEach((row, index) => {
          const rowNum = index + 2; // Row 1 is header
          
          const namaWilayah = getVal(row, ["Nama Wilayah", "Nama_Wilayah", "Wilayah", "wilayah", "Branch", "branch"]);
          const namaKelompok = getVal(row, ["Nama Kelompok", "Nama_Kelompok", "Kelompok", "kelompok", "Group", "group"]);
          const cycleStartDateVal = getVal(row, ["Tanggal Mulai Siklus", "Tanggal_Mulai_Siklus", "cycleStartDate", "Cycle Start Date", "cycle_start_date", "tanggal_mulai_siklus"]);
          const tenorVal = getVal(row, ["Tenor", "tenor"]);
          const namaAnggota = getVal(row, ["Nama Anggota", "Nama_Anggota", "Anggota", "Nama", "nama", "Member", "member"]);
          const nikVal = getVal(row, ["NIK", "nik"]);
          const plafonVal = getVal(row, ["Plafon", "plafon"]);
          const currentWeekVal = getVal(row, ["Minggu Berjalan", "Minggu_Berjalan", "currentWeek", "Current Week", "current_week", "minggu_berjalan"]);

          if (namaWilayah === undefined) throw new Error(`Baris ${rowNum}: Kolom 'Nama Wilayah' tidak ditemukan.`);
          if (namaKelompok === undefined) throw new Error(`Baris ${rowNum}: Kolom 'Nama Kelompok' tidak ditemukan.`);
          if (cycleStartDateVal === undefined) throw new Error(`Baris ${rowNum}: Kolom 'Tanggal Mulai Siklus' tidak ditemukan.`);
          if (tenorVal === undefined) throw new Error(`Baris ${rowNum}: Kolom 'Tenor' tidak ditemukan.`);
          if (namaAnggota === undefined) throw new Error(`Baris ${rowNum}: Kolom 'Nama Anggota' tidak ditemukan.`);
          if (nikVal === undefined) throw new Error(`Baris ${rowNum}: Kolom 'NIK' tidak ditemukan.`);
          if (plafonVal === undefined) throw new Error(`Baris ${rowNum}: Kolom 'Plafon' tidak ditemukan.`);
          if (currentWeekVal === undefined) throw new Error(`Baris ${rowNum}: Kolom 'Minggu Berjalan' tidak ditemukan.`);

          const cleanWilayah = String(namaWilayah).trim();
          const cleanKelompok = String(namaKelompok).trim();
          const cleanAnggota = String(namaAnggota).trim();

          if (!cleanWilayah) throw new Error(`Baris ${rowNum}: Nama Wilayah tidak boleh kosong.`);
          if (!cleanKelompok) throw new Error(`Baris ${rowNum}: Nama Kelompok tidak boleh kosong.`);
          if (!cleanAnggota) throw new Error(`Baris ${rowNum}: Nama Anggota tidak boleh kosong.`);

          let cycleStartDate: string;
          try {
            cycleStartDate = parseExcelDate(cycleStartDateVal);
          } catch (e) {
            throw new Error(`Baris ${rowNum}: Tanggal Mulai Siklus '${cycleStartDateVal}' tidak valid. Gunakan format YYYY-MM-DD.`);
          }

          const tenor = parseInt(tenorVal);
          if (isNaN(tenor) || tenor <= 0) {
            throw new Error(`Baris ${rowNum}: Tenor harus berupa angka positif.`);
          }

          const plafon = Number(plafonVal);
          if (isNaN(plafon) || plafon <= 0) {
            throw new Error(`Baris ${rowNum}: Plafon harus berupa angka positif.`);
          }

          const currentWeek = parseInt(currentWeekVal);
          if (isNaN(currentWeek) || currentWeek < 0) {
            throw new Error(`Baris ${rowNum}: Minggu Berjalan tidak boleh negatif.`);
          }

          let parsedNik: string;
          try {
            parsedNik = parseNIK(nikVal);
          } catch (e: any) {
            throw new Error(`Baris ${rowNum}: ${e.message}`);
          }

          if (processedNIKs.has(parsedNik)) {
            throw new Error(`Baris ${rowNum}: Duplikasi NIK '${parsedNik}' di dalam file Excel.`);
          }
          processedNIKs.add(parsedNik);

          if (existingCustomers.some(c => c.nik === parsedNik)) {
            throw new Error(`Baris ${rowNum}: NIK '${parsedNik}' sudah terdaftar di database sistem.`);
          }

          // Upsert Region
          if (!state.regions) state.regions = [];
          let region = state.regions.find(r => r.name.toLowerCase() === cleanWilayah.toLowerCase());
          if (!region) {
            region = {
              id: `R-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              name: cleanWilayah
            };
            state.regions.push(region);
          }

          // Upsert Kelompok
          if (!state.groups) state.groups = [];
          let group = state.groups.find(g => g.name.toLowerCase() === cleanKelompok.toLowerCase());
          if (!group) {
            group = {
              id: `G-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              name: cleanKelompok,
              sistem_tanggung_renteng: true,
              survey_status: 'LAYAK',
              survey_notes: "Migrasi Legacy Onboarding",
              created_at: new Date().toISOString(),
              region_id: region.id,
              cycle_start_date: cycleStartDate,
              tenor: tenor
            };
            state.groups.push(group);
          }

          // Create Customer
          const customerId = `C-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
          const newCustomer: Customer = {
            id: customerId,
            name: cleanAnggota,
            nik: parsedNik,
            alamat: "Alamat Legacy Migrasi",
            pekerjaan: "Usaha Anggota Legacy",
            status: currentWeek > tenor ? 'PAID_OFF' : 'ACTIVE_LOAN',
            is_new_member: false,
            group_id: group.id
          };
          state.customers.push(newCustomer);

          // Create Loan
          const loanId = `L-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
          const newLoan: Loan = {
            id: loanId,
            customer_id: customerId,
            plafon: plafon,
            status: currentWeek > tenor ? 'PAID_OFF' : 'ACTIVE_LOAN',
            tanggal_cair: cycleStartDate
          };
          state.loans.push(newLoan);

          // Generate schedules & auto lunas
          const weeklyPokok = plafon / tenor;
          const weeklyJasa = plafon * 0.01;

          for (let i = 1; i <= tenor; i++) {
            const dueDate = new Date(cycleStartDate);
            dueDate.setDate(dueDate.getDate() + (i * 7));

            const isPaid = i < currentWeek;

            const bill: BillingSchedule = {
              id: `BS-${loanId}-${i}`,
              loan_id: loanId,
              customer_id: customerId,
              term: i,
              tanggal_jatuh_tempo: dueDate.toISOString(),
              pokok: weeklyPokok,
              jasa: weeklyJasa,
              total_tagihan: weeklyPokok + weeklyJasa,
              bayar_pokok: isPaid ? weeklyPokok : 0,
              bayar_jasa: isPaid ? weeklyJasa : 0,
              status: isPaid ? 'PAID' : 'UNPAID'
            };
            state.billingSchedules.push(bill);

            if (isPaid) {
              const paymentId = `PAY-ONB-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
              const newPayment: Payment = {
                id: paymentId,
                billing_schedule_id: bill.id,
                customer_id: customerId,
                petugas_id: "Legacy Onboarding",
                nominal_bayar: bill.total_tagihan,
                tanggal_bayar: dueDate.toISOString(),
                status: 'SETORAN_APPROVED',
                catatan_revisi: null,
                is_offline_logged: false
              };
              state.payments.push(newPayment);

              addJournalEntry(
                state,
                `ONB_COLLECT_${customerId}_W${i}`,
                `Angsuran Terbayar Onboarding #${i} - ${newCustomer.name}`,
                [
                  { account_code: '1112', debit: bill.total_tagihan, credit: 0 },
                  { account_code: '1210', debit: 0, credit: weeklyPokok },
                  { account_code: '4110', debit: 0, credit: weeklyJasa }
                ]
              );
            }
          }

          // Post Disburse Entry
          addJournalEntry(
            state,
            `ONB_DISBURSE_${customerId}`,
            `Pencairan Saldo Legacy Onboarding - ${newCustomer.name} (Plafon Rp ${plafon.toLocaleString('id-ID')})`,
            [
              { account_code: '1210', debit: plafon, credit: 0 },
              { account_code: '1112', debit: 0, credit: plafon }
            ]
          );
        });

        // If everything succeeded, commit atomic changes
        tx.commit();
      } catch (innerError) {
        throw innerError;
      }

      res.json({
        success: true,
        message: `Onboarding berhasil! ${rows.length} data legacy onboarded successfully ke sistem.`,
        state: readDB()
      });

    } catch (error: any) {
      res.status(400).json({ error: error.message || "Gagal memproses data onboarding." });
    }
  });

  // MENU 1: BERKAS MASUK - Petugas creates manual group & adds members
  app.post("/api/groups", (req, res) => {
    const { name, sistem_tanggung_renteng, member_ids } = req.body;
    if (!name || !member_ids || !Array.isArray(member_ids) || member_ids.length === 0) {
      return res.status(400).json({ error: "Missing group name or members details." });
    }

    const userObj = getUserFromReq(req);
    const targetCabang = (userObj.cabang_id || "PUSAT").toUpperCase();

    const state = readDB();
    const groupId = generateDocumentId('KLP', targetCabang, state);

    const newGroup: Group = {
      id: groupId,
      name,
      sistem_tanggung_renteng: !!sistem_tanggung_renteng,
      survey_status: 'NOT_SURVEYED',
      survey_notes: "",
      created_at: new Date().toISOString(),
      kantor_cabang: targetCabang as any
    };

    state.groups.push(newGroup);

    // Add members from the staging / rest reference
    member_ids.forEach((mId: string) => {
      const idx = state.customers.findIndex(c => c.id === mId);
      if (idx !== -1) {
        state.customers[idx].group_id = groupId;
        // State Machine transition: Petugas Input -> PENDING_SPV
        state.customers[idx].status = "PENDING_SPV";
        state.customers[idx].kantor_cabang = targetCabang as any;
      } else {
        // if not found in current db array, we can copy from raw seed or legacy rawCustomers list
        let seedCust = STAGING_CUSTOMERS.find(c => c.id === mId);
        if (!seedCust && state.rawCustomers) {
          const rc = state.rawCustomers.find(item => item.id === mId);
          if (rc) {
            seedCust = {
              id: rc.id,
              name: rc.nama_pemohon,
              nik: rc.nik,
              alamat: rc.alamat ?? "-",
              pekerjaan: rc.petani || "Pertanian",
              status: "APPROVED_FOR_SURVEY" as any,
              is_new_member: rc.tahap === 1,
              group_id: groupId
            };
          }
        }

        if (seedCust) {
          const freshCust: Customer = {
            ...seedCust,
            group_id: groupId,
            status: "PENDING_SPV",
            kantor_cabang: targetCabang as any
          };
          state.customers.push(freshCust);
        }
      }
    });

    writeDB(state);
    res.json({ success: true, group: newGroup, state });
  });

  // STATE MACHINE TICKET PATH: Web role-change for workflow progression
  // PENDING_SPV -> SPV check -> PENDING_ADM
  // PENDING_ADM -> Admin Verify -> APPROVED_FOR_SURVEY
  app.post("/api/workflow/step", (req, res) => {
    const { customerId, targetStatus } = req.body;
    const state = readDB();
    
    const custIdx = state.customers.findIndex(c => c.id === customerId);
    if (custIdx === -1) {
      return res.status(404).json({ error: "Nasabah tidak ditemukan." });
    }

    const currentStatus = state.customers[custIdx].status;

    // Validate state machine rule
    if (targetStatus === 'PENDING_ADM') {
      if (currentStatus !== 'PENDING_SPV') {
        return res.status(400).json({ error: "Hanya bisa diverifikasi SPV jika berstatus PENDING_SPV." });
      }
      state.customers[custIdx].status = 'PENDING_ADM';
    } else if (targetStatus === 'APPROVED_FOR_SURVEY') {
      if (currentStatus !== 'PENDING_ADM') {
        return res.status(400).json({ error: "Hanya bisa disetujui Admin jika berstatus PENDING_ADM." });
      }
      state.customers[custIdx].status = 'APPROVED_FOR_SURVEY';
    } else {
      return res.status(400).json({ error: "Invalid workflow progression target." });
    }

    writeDB(state);
    res.json({ success: true, customer: state.customers[custIdx], state });
  });

  // MENU 2: SURVEI - Submit Kelompok (Automated Scoring & GCS Fallback)
  app.post("/api/surveys/group", upload.single("foto_kelompok"), async (req: express.Request, res: express.Response) => {
    const userObj = getUserFromReq(req);
    const { 
      group_id, 
      wilayah, 
      tanggal_pertemuan, 
      jumlah_anggota, 
      jumlah_pokok_pinjaman_kelompok,
      notes,
      inisiatif_ketua,
      jarak_domisili,
      kelengkapan_dokumen_dasar,
      ketepatan_waktu,
      pemahaman_tanggung_renteng,
      penentuan_ketua_kelompok,
      pengaruh_ketua,
      saling_kenal_antar_anggota,
      tingkat_kehadiran
    } = req.body;

    if (!group_id) {
      return res.status(400).json({ error: "Missing group ID (id_kelompok)." });
    }

    const state = readDB();
    const grpIdx = state.groups.findIndex(g => g.id === group_id);
    if (grpIdx === -1) {
      return res.status(404).json({ error: "Kelompok tidak ditemukan." });
    }

    // Determine weight scores (BAIK = 3, CUKUP = 2, KURANG = 1)
    const criteriaWeights: Record<string, number> = {
      'BAIK': 3,
      'CUKUP': 2,
      'KURANG': 1
    };

    const pInisiatifKetua = inisiatif_ketua || 'CUKUP';
    const pJarakDomisili = jarak_domisili || 'CUKUP';
    const pKelengkapanDokumenDasar = kelengkapan_dokumen_dasar || 'CUKUP';
    const pKetepatanWaktu = ketepatan_waktu || 'CUKUP';
    const pPemahamanTanggungRenteng = pemahaman_tanggung_renteng || 'CUKUP';
    const pPenentuanKetuaKelompok = penentuan_ketua_kelompok || 'CUKUP';
    const pPengaruhKetua = pengaruh_ketua || 'CUKUP';
    const pSalingKenalAntarAnggota = saling_kenal_antar_anggota || 'CUKUP';
    const pTingkatKehadiran = tingkat_kehadiran || 'CUKUP';

    const calculatedTotalScore = 
      (criteriaWeights[pInisiatifKetua] || 2) +
      (criteriaWeights[pJarakDomisili] || 2) +
      (criteriaWeights[pKelengkapanDokumenDasar] || 2) +
      (criteriaWeights[pKetepatanWaktu] || 2) +
      (criteriaWeights[pPemahamanTanggungRenteng] || 2) +
      (criteriaWeights[pPenentuanKetuaKelompok] || 2) +
      (criteriaWeights[pPengaruhKetua] || 2) +
      (criteriaWeights[pSalingKenalAntarAnggota] || 2) +
      (criteriaWeights[pTingkatKehadiran] || 2);

    const keputusanOtomatis = calculatedTotalScore >= 18 ? 'LAYAK' : 'TIDAK_LAYAK';

    // File Upload handling for foto_kelompok
    let fotoUrl = req.body.foto_kelompok || "";
    const file = req.file;

    if (file) {
      const canUploadToGCS = process.env.GCS_PROJECT_ID && process.env.GCS_BUCKET_NAME && process.env.GCS_CREDENTIALS;
      if (canUploadToGCS) {
        try {
          fotoUrl = await uploadToGCS(file.buffer, `foto_kelompok_${file.originalname}`);
        } catch (storageError: any) {
          console.warn("GCS fail, falling back to local files:", storageError.message);
          const uploadsDir = path.join(process.cwd(), "uploads");
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          const fileExt = path.extname(file.originalname) || ".jpg";
          const filename = `foto_kelompok_err_fallback_${Date.now()}${fileExt}`;
          fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
          fotoUrl = `/uploads/${filename}`;
        }
      } else {
        const uploadsDir = path.join(process.cwd(), "uploads");
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        const fileExt = path.extname(file.originalname) || ".jpg";
        const filename = `foto_kelompok_local_${Date.now()}${fileExt}`;
        fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
        fotoUrl = `/uploads/${filename}`;
      }
    }

    if (!fotoUrl) {
      fotoUrl = "https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?q=80&w=600";
    }

    // Save metrics inside groups status
    state.groups[grpIdx].survey_status = keputusanOtomatis;
    state.groups[grpIdx].survey_notes = notes || `Automated Score: ${calculatedTotalScore}/27 (${keputusanOtomatis})`;

    // Save actual survey session history
    const surveyId = `GS-${Date.now()}`;
    const groupSurveyObj: GroupSurvey = {
      id: surveyId,
      group_id,
      status: keputusanOtomatis,
      notes: notes || `Hasil penilaian otomatis bernilai ${calculatedTotalScore} poin. Pengambil keputusan sistem memilih ${keputusanOtomatis}.`,
      created_at: new Date().toISOString(),

      id_kelompok: group_id,
      nama_kelompok: state.groups[grpIdx].name,
      wilayah: wilayah || "Wilayah Kerja",
      tanggal_pertemuan: tanggal_pertemuan || new Date().toISOString(),
      jumlah_anggota: Number(jumlah_anggota) || 5,
      jumlah_pokok_pinjaman_kelompok: Number(jumlah_pokok_pinjaman_kelompok) || 12500000,
      foto_kelompok: fotoUrl,

      inisiatif_ketua: pInisiatifKetua as any,
      jarak_domisili: pJarakDomisili as any,
      kelengkapan_dokumen_dasar: pKelengkapanDokumenDasar as any,
      ketepatan_waktu: pKetepatanWaktu as any,
      pemahaman_tanggung_renteng: pPemahamanTanggungRenteng as any,
      penentuan_ketua_kelompok: pPenentuanKetuaKelompok as any,
      pengaruh_ketua: pPengaruhKetua as any,
      saling_kenal_antar_anggota: pSalingKenalAntarAnggota as any,
      tingkat_kehadiran: pTingkatKehadiran as any,

      total_skor: calculatedTotalScore,
      keputusan_otomatis: keputusanOtomatis,
      kantor_cabang: (userObj.cabang_id || "PUSAT").toUpperCase() as any
    };

    const newGroupSurveyObj = {
      ...groupSurveyObj,
      petugas_id: userObj.id
    };

    if (!state.groupSurveys) state.groupSurveys = [];
    state.groupSurveys.push(newGroupSurveyObj);

    // Apply outcome to members
    if (keputusanOtomatis === 'LAYAK') {
      const groupMembers = state.customers.filter(c => c.group_id === group_id && c.status === 'APPROVED_FOR_SURVEY');
      groupMembers.forEach(member => {
        const exists = state.individualSurveys.some(s => s.customer_id === member.id);
        if (!exists) {
          state.individualSurveys.push({
            id: `IS-${Date.now()}-${member.id}`,
            customer_id: member.id,
            petugas_id: userObj.id,
            alamat_sesuai: true,
            kondisi_rumah: "Baik",
            pendapatan_bulanan: 3000000,
            status_kelayakan: "LAYAK_CAIR",
            notes: "Draf jaminan otomatis hasil penilaian kelayakan kelompok yang terpilih.",
            created_at: new Date().toISOString()
          });
        }
      });
    } else {
      // TIDAK_LAYAK - GUGURKAN seluruh berkas anggota di kelompok tersebut
      const groupMembers = state.customers.filter(c => c.group_id === group_id);
      groupMembers.forEach(member => {
        member.status = 'TIDAK_LAYAK';
        if (state.berkasMasuk) {
          // Find matching admission berkas using NIK
          const berkas = state.berkasMasuk.find(b => b.nik_pemohon === member.nik);
          if (berkas) {
            berkas.status = "REJECTED";
            berkas.catatan = `DIREJECT OTOMATIS: Hasil survei kelompok adalah TIDAK LAYAK dengan total skor ${calculatedTotalScore}/27. Form individu otomatis terkunci.`;
          }
        }
      });
    }

    writeDB(state);
    res.json({ 
      success: true, 
      keputusan_otomatis: keputusanOtomatis, 
      total_skor: calculatedTotalScore,
      state 
    });
  });

  // MENU 2: SURVEI - Submit Individu dengan GCS, Geotagging, & Automated Decision Engine
  const individualSurveyFieldsUpload = upload.fields([
    { name: 'foto_jaminan', maxCount: 1 },
    { name: 'foto_anggota', maxCount: 1 }
  ]);

  const individualSurveyHandler = async (req: express.Request, res: express.Response) => {
    const userObj = getUserFromReq(req);
    const { 
      customer_id, 
      application_id, 
      pendapatan_usaha, 
      pengeluaran_rumah_tangga, 
      tanggungan_koperasi_lain, 
      nama_koperasi, 
      rekomendasi_petugas, 
      kordinat_lokasi 
    } = req.body;

    const idToFind = customer_id || application_id;
    if (!idToFind) {
      return res.status(400).json({ error: "Missing customer_id or application_id." });
    }

    const state = readDB();
    
    // Find customer by id OR matching customer by NIK if idToFind is BerkasMasuk id
    let customer = state.customers.find(c => c.id === idToFind);
    let berkas = state.berkasMasuk ? state.berkasMasuk.find(b => b.id === idToFind) : null;
    
    if (!customer && berkas) {
      customer = state.customers.find(c => c.nik === berkas.nik_pemohon);
    }
    
    if (!customer) {
      return res.status(404).json({ error: "Nasabah atau berkas masuk tidak ditemukan di sistem." });
    }

    if (!berkas && state.berkasMasuk) {
      berkas = state.berkasMasuk.find(b => b.nik_pemohon === customer.nik) || null;
    }

    if (customer.status !== 'APPROVED_FOR_SURVEY') {
      return res.status(400).json({ error: `Nasabah tidak dalam status APPROVED_FOR_SURVEY. Status terkini: ${customer.status}` });
    }

    // Verify if their group has already been survey-approved as LAYAK
    const groupId = customer.group_id;
    if (groupId) {
      const parentGroup = state.groups.find(g => g.id === groupId);
      if (!parentGroup || parentGroup.survey_status !== 'LAYAK') {
        return res.status(400).json({ error: "Tolong lakukan Survei Kelompok terlebih dahulu dan pastikan statusnya LAYAK sebelum melakukan survei individu." });
      }
    }

    // Calculations
    const pUsaha = Number(pendapatan_usaha) || 0;
    const pPengeluaran = Number(pengeluaran_rumah_tangga) || 0;
    const pTanggungan = Number(tanggungan_koperasi_lain) || 0;
    
    const pendapatanBersih = pUsaha - pPengeluaran - pTanggungan;

    // Plafon and angsuran target
    let angsuranPerMinggu = 0;
    if (berkas) {
      const tenor = Number(berkas.tenor_mg) || 50;
      const plafon = Number(berkas.pengajuan_pinjaman) || 5000000;
      angsuranPerMinggu = (plafon * 1.1) / tenor;
    } else {
      angsuranPerMinggu = (5000000 * 1.1) / 50;
    }

    // Decision engine: Net Earnings must exceed monthly / weekly installment
    const statusApproval = pendapatanBersih > angsuranPerMinggu ? 'LAYAK_CAIR' : 'TIDAK_LAYAK';

    // File handling
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    let urlJaminan = req.body.foto_jaminan || "";
    let urlAnggota = req.body.foto_anggota || "";

    const handleFileUpload = async (file: Express.Multer.File | undefined, defaultPrefix: string) => {
      if (!file) return "";
      const canUploadToGCS = process.env.GCS_PROJECT_ID && process.env.GCS_BUCKET_NAME && process.env.GCS_CREDENTIALS;
      if (canUploadToGCS) {
        try {
          return await uploadToGCS(file.buffer, `${defaultPrefix}_${file.originalname}`);
        } catch (storageError: any) {
          console.warn("GCS fail, falling back to local files:", storageError.message);
        }
      }
      
      const uploadsDir = path.join(process.cwd(), "uploads");
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const fileExt = path.extname(file.originalname) || ".jpg";
      const filename = `${defaultPrefix}_local_${Date.now()}${fileExt}`;
      fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
      return `/uploads/${filename}`;
    };

    if (files?.foto_jaminan?.[0]) {
      urlJaminan = await handleFileUpload(files.foto_jaminan[0], "foto_jaminan");
    }
    if (files?.foto_anggota?.[0]) {
      urlAnggota = await handleFileUpload(files.foto_anggota[0], "foto_anggota");
    }

    if (!urlJaminan) {
      urlJaminan = "https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=600";
    }
    if (!urlAnggota) {
      urlAnggota = "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=600";
    }

    // Save individual survey
    const surveyIdx = state.individualSurveys.findIndex(s => s.customer_id === customer.id);
    const dateObj = new Date();
    const jamString = dateObj.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    
    const newSurvey: IndividualSurvey = {
      id: surveyIdx !== -1 ? state.individualSurveys[surveyIdx].id : `IS-${Date.now()}`,
      customer_id: customer.id,
      petugas_id: userObj.id,
      alamat_sesuai: true,
      kondisi_rumah: "Baik",
      pendapatan_bulanan: pUsaha,
      status_kelayakan: statusApproval,
      notes: rekomendasi_petugas || `Persetujuan Otomatis: ${statusApproval} (Sisa Bersih: Rp ${pendapatanBersih.toLocaleString('id-ID')}, Angsuran: Rp ${angsuranPerMinggu.toLocaleString('id-ID')})`,
      created_at: dateObj.toISOString(),

      application_id: berkas ? berkas.id : undefined,
      tanggal_survei: dateObj.toISOString().split('T')[0],
      jam_survei: jamString,
      pendapatan_usaha: pUsaha,
      pengeluaran_rumah_tangga: pPengeluaran,
      tanggungan_koperasi_lain: pTanggungan,
      nama_koperasi: nama_koperasi || "",
      foto_jaminan: urlJaminan,
      foto_anggota: urlAnggota,
      rekomendasi_petugas: rekomendasi_petugas || "",
      kordinat_lokasi: kordinat_lokasi || "-6.200000, 106.816666",
      status_approval: statusApproval,
      kantor_cabang: (userObj.cabang_id || "PUSAT").toUpperCase() as any
    };

    if (surveyIdx !== -1) {
      state.individualSurveys[surveyIdx] = newSurvey;
    } else {
      state.individualSurveys.push(newSurvey);
    }

    // State machine updates
    if (statusApproval === 'LAYAK_CAIR') {
      customer.status = 'LAYAK_CAIR';
    } else {
      customer.status = 'TIDAK_LAYAK';
      if (berkas) {
        berkas.status = "REJECTED";
        berkas.catatan = `DIREJECT OTOMATIS: Hasil survei individu TIDAK LAYAK. Pendapatan Bersih (Rp ${pendapatanBersih.toLocaleString('id-ID')}) <= Angsuran per minggu (Rp ${angsuranPerMinggu.toLocaleString('id-ID')}).`;
      }
    }

    writeDB(state);
    res.json({ 
      success: true, 
      status_approval: statusApproval, 
      pendapatan_bersih: pendapatanBersih, 
      angsuran_per_minggu: angsuranPerMinggu,
      state 
    });
  };

  app.post("/api/surveys/individual", individualSurveyFieldsUpload, individualSurveyHandler);
  app.post("/api/survei/individu", individualSurveyFieldsUpload, individualSurveyHandler);

  // MENU 3: PENCAIRAN - Khusus SPV dengan tracking tables (deposits, fee_collections)
  const disburseHandler = (req: express.Request, res: express.Response) => {
    const userObj = getUserFromReq(req);
    const { customer_id } = req.body;
    if (!customer_id) {
      return res.status(400).json({ error: "Missing customer ID for disbursement." });
    }

    const state = readDB();
    const custIdx = state.customers.findIndex(c => c.id === customer_id);
    if (custIdx === -1) {
      return res.status(404).json({ error: "Nasabah tidak ditemukan." });
    }

    const customer = state.customers[custIdx];
    if (customer.status !== 'LAYAK_CAIR') {
      return res.status(400).json({ error: "Status nasabah harus LAYAK_CAIR untuk pencairan dana." });
    }

    // Constants for micro financing
    const PLAFON = 5000000; // Rp 5,000,000
    const DEPOSITO = 250000; // Rp 250,000
    const UP = customer.is_new_member ? 100000 : 0; // Rp 100,000 Uang Pangkal for new member
    const ADMIN_FEE = 50000; // Rp 50,000 Administrasi flat
    const NET_RECEIVED = PLAFON - UP - DEPOSITO - ADMIN_FEE;

    // Verify if Bank Kas has enough balance (Rp 75,000,000 initially)
    const bankBalance = getAccountBalance(state, "1112");
    if (bankBalance < NET_RECEIVED) {
      return res.status(400).json({ error: `Kas Bank tidak cukup untuk mencairkan Rp ${NET_RECEIVED.toLocaleString('id-ID')}. Sisa Kas Bank: Rp ${bankBalance.toLocaleString('id-ID')}` });
    }

    // -- DATABASE ACID CONSTRAINTS SIMULATION --
    try {
      const isNew = customer.is_new_member;

      // 1. Change status to ACTIVE_LOAN
      customer.status = 'ACTIVE_LOAN';

      // 2. Record to loans table
      const userCabang = (userObj.cabang_id || "PUSAT").toUpperCase();
      const loanId = generateDocumentId('SPK', userCabang, state);
      const newLoan: Loan = {
        id: loanId,
        customer_id: customer.id,
        plafon: PLAFON,
        status: 'ACTIVE_LOAN',
        tanggal_cair: new Date().toISOString(),
        petugas_id: userObj.id,
        created_at: new Date().toISOString(),
        kantor_cabang: userCabang as any
      };
      state.loans.push(newLoan);

      // 3. Generate 5 micro weekly billing schedules (e.g. 5 weeks)
      // Pokok: 1,000,000, Jasa Interest: 50,000
      const weeks = 5;
      const weeklyPokok = PLAFON / weeks;
      const weeklyJasa = 50000; // 50,000 flat per week (representing micro-fee)
      
      for (let i = 1; i <= weeks; i++) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (i * 7)); // 7, 14, 21 etc. days later

        const bill: BillingSchedule = {
          id: `BS-${loanId}-${i}`,
          loan_id: loanId,
          customer_id: customer.id,
          term: i,
          tanggal_jatuh_tempo: dueDate.toISOString(),
          pokok: weeklyPokok,
          jasa: weeklyJasa,
          total_tagihan: weeklyPokok + weeklyJasa,
          bayar_pokok: 0,
          bayar_jasa: 0,
          status: 'UNPAID',
          kantor_cabang: userCabang as any
        };
        state.billingSchedules.push(bill);
      }

      // Initialize tracking structures if missing
      if (!state.deposits) state.deposits = [];
      if (!state.feeCollections) state.feeCollections = [];

      // Calculate exact end of loan tenor for deposit maturity tracking
      const finalDueDate = new Date();
      finalDueDate.setDate(finalDueDate.getDate() + (weeks * 7));

      // 4. Record deposit with status HOLD and tanggal_jatuh_tempo
      const depositId = `DEP-${Date.now()}`;
      const dep: Deposit = {
        id: depositId,
        customer_id: customer.id,
        loan_id: loanId,
        nominal: DEPOSITO,
        tanggal_mulai: new Date().toISOString(),
        jatuh_tempo: finalDueDate.toISOString(),
        tanggal_potong: new Date().toISOString(),
        tanggal_jatuh_tempo: finalDueDate.toISOString(),
        status: 'HOLD',
        kantor_cabang: userCabang as any
      };
      state.deposits.push(dep);

      // 5. Check New Member: log fee_collections for UANG_PANGKAL
      if (isNew) {
        const upFee: FeeCollection = {
          id: `FC-UP-${Date.now()}`,
          loan_id: loanId,
          customer_id: customer.id,
          jenis_potongan: 'UANG_PANGKAL',
          nominal: UP,
          tanggal_potong: new Date().toISOString(),
          kantor_cabang: userCabang as any
        };
        state.feeCollections.push(upFee);
      }

      // 6. Log fee_collections for ADMINISTRASI
      const admFee: FeeCollection = {
        id: `FC-ADM-${Date.now()}`,
        loan_id: loanId,
        customer_id: customer.id,
        jenis_potongan: 'ADMINISTRASI',
        nominal: ADMIN_FEE,
        tanggal_potong: new Date().toISOString(),
        kantor_cabang: userCabang as any
      };
      state.feeCollections.push(admFee);

      // 7. Update is_new_member flag to false
      customer.is_new_member = false;

      // 8. TRIGGER DOUBLE-ENTRY JOURNAL TRANSACTION
      // (Dr) 1210-Piutang Pokok [Plafon Utuh] (Rp 5,000,000)
      // (Cr) 4120-Pendapatan UP [Nominal UP, jika ada] (Rp 100,000)
      // (Cr) 2110-Utang Deposito [Nominal Deposito] (Rp 250,000)
      // (Cr) 4110-Pendapatan Administrasi [Nominal Administrasi] (Rp 50,000)
      // (Cr) 1112-Kas Bank [Total Terima Bersih]
      const journalLines = [
        { account_code: '1210', debit: PLAFON, credit: 0 }, // Piutang Pokok
        { account_code: '2110', debit: 0, credit: DEPOSITO }, // Utang Deposito
        { account_code: '4110', debit: 0, credit: ADMIN_FEE }, // Pendapatan Adm
        { account_code: '1112', debit: 0, credit: NET_RECEIVED } // Kas Bank
      ];

      if (UP > 0) {
        journalLines.push({ account_code: '4120', debit: 0, credit: UP }); // Pendapatan UP
      }

      addJournalEntry(
        state, 
        `DISBURSE_${customer.id}`, 
        `Pencairan Pembiayaan Mikro ${customer.name} (Plafon Rp ${PLAFON.toLocaleString('id-ID')})`, 
        journalLines
      );

      writeDB(state);
      res.json({ 
        success: true, 
        message: `Dana Rp ${NET_RECEIVED.toLocaleString('id-ID')} berhasil dicairkan ke kas bank nasabah ${customer.name}! (Potongan Deposito Rp ${DEPOSITO.toLocaleString('id-ID')} status HOLD & Administrasi Rp ${ADMIN_FEE.toLocaleString('id-ID')})`,
        state 
      });

    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message || "Gagal memproses transaksi keuangan pencairan." });
    }
  };

  const collectiveDisburseHandler = (req: express.Request, res: express.Response) => {
    const userObj = getUserFromReq(req);
    const { 
      id_kelompok,
      nama_kelompok,
      petugas_pencairan_id,
      petugas_penagihan_id,
      hari_penagihan,
      jumlah_anggota_cair,
      total_pencairan_kotor,
      potongan_sisa_piutang,
      potongan_up,
      potongan_deposito,
      potongan_administrasi,
      total_uang_dikembalikan_ke_kantor,
      total_uang_kembali_ke_kantor,
      foto_selfie_pencairan,
      status_verifikasi,
      cancelled_customer_ids,
      valid_customer_ids,
      status_sosialisasi
    } = req.body;

    if (!id_kelompok || !valid_customer_ids || !Array.isArray(valid_customer_ids) || valid_customer_ids.length === 0) {
      return res.status(400).json({ error: "Data kelompok atau daftar nasabah valid tidak lengkap untuk pencairan kolektif." });
    }

    const state = readDB();

    try {
      const PLAFON = 5000000; // Rp 5,000,000
      const DEPOSITO = 250000; // Rp 250,000
      const ADMIN_FEE = 50000; // Rp 50,000 Administrasi flat

      const disburseDate = new Date();
      const disburseDateStr = disburseDate.toISOString();

      const resolvedValidCustomers: any[] = [];
      const resolvedCancelledCustomers: any[] = [];

      const petugasPencairan = state.users.find(u => u.id === petugas_pencairan_id);
      const petugasPenagihan = state.users.find(u => u.id === petugas_penagihan_id);

      // Process each valid customer
      for (const custId of valid_customer_ids) {
        const custIdx = state.customers.findIndex(c => c.id === custId);
        if (custIdx === -1) continue;

        const customer = state.customers[custIdx];
        resolvedValidCustomers.push(customer);

        const isNew = customer.is_new_member;
        const UP = isNew ? 100000 : 0;

        // A. Set status to ACTIVE_LOAN
        customer.status = 'ACTIVE_LOAN';

        // B. Record to loans table
        const userCabang = (userObj.cabang_id || "PUSAT").toUpperCase();
        const loanId = generateDocumentId('SPK', userCabang, state);
        const newLoan: Loan = {
          id: loanId,
          customer_id: customer.id,
          plafon: PLAFON,
          status: 'ACTIVE_LOAN',
          tanggal_cair: disburseDateStr,
          kantor_cabang: userCabang as any
        };
        state.loans.push(newLoan);

        // C. Generate 5 micro weekly billing schedules (e.g. 5 weeks)
        const weeks = 5;
        const weeklyPokok = PLAFON / weeks;
        const weeklyJasa = 50000; // 50,000 flat per week (representing micro-fee)

        for (let i = 1; i <= weeks; i++) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + (i * 7)); // 7, 14, 21 etc. days later

          const bill: BillingSchedule = {
            id: `BS-${loanId}-${i}`,
            loan_id: loanId,
            customer_id: customer.id,
            term: i,
            tanggal_jatuh_tempo: dueDate.toISOString(),
            pokok: weeklyPokok,
            jasa: weeklyJasa,
            total_tagihan: weeklyPokok + weeklyJasa,
            bayar_pokok: 0,
            bayar_jasa: 0,
            status: 'UNPAID',
            hari_penagihan: hari_penagihan,
            petugas_penagihan_id: petugas_penagihan_id,
            petugas_penagihan_name: petugasPenagihan ? petugasPenagihan.nama : "Petugas Penagihan",
            kantor_cabang: userCabang as any
          };
          state.billingSchedules.push(bill);
        }

        // Initialize tracking collections if missing
        if (!state.deposits) state.deposits = [];
        if (!state.feeCollections) state.feeCollections = [];

        // D. Record deposit with status HOLD and tanggal_jatuh_tempo
        const finalDueDate = new Date();
        finalDueDate.setDate(finalDueDate.getDate() + (weeks * 7));
        const depositId = `DEP-${Date.now()}-${custId}`;
        const dep: Deposit = {
          id: depositId,
          customer_id: customer.id,
          loan_id: loanId,
          nominal: DEPOSITO,
          tanggal_mulai: disburseDateStr,
          jatuh_tempo: finalDueDate.toISOString(),
          tanggal_potong: disburseDateStr,
          tanggal_jatuh_tempo: finalDueDate.toISOString(),
          status: 'HOLD',
          kantor_cabang: userCabang as any
        };
        state.deposits.push(dep);

        // E. Record UP Fee if isNew
        if (isNew) {
          const upFee: FeeCollection = {
            id: `FC-UP-${Date.now()}-${custId}`,
            loan_id: loanId,
            customer_id: customer.id,
            jenis_potongan: 'UANG_PANGKAL',
            nominal: UP,
            tanggal_potong: disburseDateStr,
            kantor_cabang: userCabang as any
          };
          state.feeCollections.push(upFee);
        }

        // F. Record Admin Fee
        const admFee: FeeCollection = {
          id: `FC-ADM-${Date.now()}-${custId}`,
          loan_id: loanId,
          customer_id: customer.id,
          jenis_potongan: 'ADMINISTRASI',
          nominal: ADMIN_FEE,
          tanggal_potong: disburseDateStr,
          kantor_cabang: userCabang as any
        };
        state.feeCollections.push(admFee);

        // G. Update is_new_member flag
        customer.is_new_member = false;
      }

      // 2. Process cancelled customers
      if (cancelled_customer_ids && Array.isArray(cancelled_customer_ids)) {
        for (const custId of cancelled_customer_ids) {
          const custIdx = state.customers.findIndex(c => c.id === custId);
          if (custIdx !== -1) {
            state.customers[custIdx].status = 'TIDAK_LAYAK';
            resolvedCancelledCustomers.push(state.customers[custIdx]);
          }
        }
      }

      // 3. Save collective disbursement transaction record inside the database state
      const disbursementId = `DISB-${Date.now()}`;
      const finalTotalKembali = Number(total_uang_kembali_ke_kantor !== undefined ? total_uang_kembali_ke_kantor : total_uang_dikembalikan_ke_kantor);
      const newDisbursement: Disbursement = {
        id: disbursementId,
        id_kelompok,
        nama_kelompok,
        petugas_pencairan_id,
        petugas_penagihan_id,
        hari_penagihan,
        jumlah_anggota_cair: Number(jumlah_anggota_cair),
        total_pencairan_kotor: Number(total_pencairan_kotor),
        potongan_sisa_piutang: Number(potongan_sisa_piutang),
        potongan_up: Number(potongan_up),
        potongan_deposito: Number(potongan_deposito),
        potongan_administrasi: Number(potongan_administrasi),
        total_uang_dikembalikan_ke_kantor: finalTotalKembali,
        total_uang_kembali_ke_kantor: finalTotalKembali,
        foto_selfie_pencairan: foto_selfie_pencairan || '',
        status_sosialisasi: status_sosialisasi === undefined ? true : !!status_sosialisasi,
        status_verifikasi: status_verifikasi || 'SESUAI',
        petugas_id: userObj.id,
        created_at: new Date().toISOString()
      };
      if (!state.disbursements) state.disbursements = [];
      state.disbursements.push(newDisbursement);

      // 4. TRIGGER SAK DOUBLE-ENTRY JOURNAL TRANSACTION (COA) CONSOL
      const totalKotor = Number(total_pencairan_kotor);
      const totalPotongan = Number(total_uang_dikembalikan_ke_kantor);
      const netTransferred = totalKotor - totalPotongan;

      const journalLines = [
        { account_code: '1210', debit: totalKotor, credit: 0 }, // Piutang Pokok
        { account_code: '2110', debit: 0, credit: Number(potongan_deposito) }, // Utang Deposito
        { account_code: '4110', debit: 0, credit: Number(potongan_administrasi) }, // Pendapatan Adm
        { account_code: '1112', debit: 0, credit: netTransferred } // Kas Bank (Net)
      ];

      if (Number(potongan_up) > 0) {
        journalLines.push({ account_code: '4120', debit: 0, credit: Number(potongan_up) }); // Pendapatan UP
      }

      if (Number(potongan_sisa_piutang) > 0) {
        journalLines.push({ account_code: '1210', debit: 0, credit: Number(potongan_sisa_piutang) }); // Reduksi piutang lama
      }

      addJournalEntry(
        state, 
        `DISB_COLL_${id_kelompok}`, 
        `Pencairan Kolektif Kelompok ${nama_kelompok} (${jumlah_anggota_cair} Anggota Cair, Petugas Pencairan: ${petugasPencairan?.nama}, Petugas Penagihan: ${petugasPenagihan?.nama})`, 
        journalLines
      );

      // 5. BULK UPDATE ON BILLING SCHEDULES
      state.billingSchedules.forEach(schedule => {
        const isGroupCust = valid_customer_ids.includes(schedule.customer_id);
        if (isGroupCust) {
          schedule.hari_penagihan = hari_penagihan;
          schedule.petugas_penagihan_id = petugas_penagihan_id;
          schedule.petugas_penagihan_name = petugasPenagihan ? petugasPenagihan.nama : "Petugas Penagihan";
        }
      });

      writeDB(state);

      res.json({
        success: true,
        message: `Pencairan Kolektif Kelompok '${nama_kelompok}' sukses diproses! ${jumlah_anggota_cair} anggota aktif dicairkan, ${resolvedCancelledCustomers.length} anggota dibatalkan. Jadwal billing dan rute penagihan hari ${hari_penagihan} otomatis dialokasikan ke Petugas Penagihan: ${petugasPenagihan ? petugasPenagihan.nama : 'Unknown'}.`,
        state
      });

    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message || "Gagal memproses pencairan kolektif." });
    }
  };

  app.post("/api/loans/disburse", checkRole(['admin', 'spv', 'super_admin']), disburseHandler);
  app.post("/api/pencairan/eksekusi", checkRole(['admin', 'spv', 'super_admin']), disburseHandler);
  app.post("/api/loans/collective-disburse", checkRole(['admin', 'spv', 'super_admin']), collectiveDisburseHandler);

  // API: Get PDF SPK & Kuitansi for a customer/disbursement
  app.get("/api/pencairan/:id/cetak-spk", checkRole(['admin', 'spv', 'kasir', 'super_admin']), async (req, res) => {
    try {
      const state = readDB();
      const id = req.params.id;

      let targetCustomers: Customer[] = [];
      let groupName = "Kelompok Simpan Pinjam";
      let groupId = "";
      let disbursementDate = new Date();
      let petugasPencairanNama = "Staff Administrasi";
      let petugasPenagihanNama = "Petugas Penagihan";
      let hariPenagihan = "Senin";
      let disbursementRecord: Disbursement | undefined;

      // 1. Check if :id is a customer ID
      const customer = state.customers.find(c => c.id === id);
      if (customer) {
        targetCustomers = [customer];
        if (customer.group_id) {
          const grp = state.groups.find(g => g.id === customer.group_id);
          if (grp) {
            groupName = grp.name;
            groupId = grp.id;
          }
          disbursementRecord = state.disbursements?.find(d => d.id_kelompok === customer.group_id);
        }
      } else {
        // 2. Check if :id is a disbursement ID
        const disb = state.disbursements?.find(d => d.id === id);
        if (disb) {
          disbursementRecord = disb;
          groupName = disb.nama_kelompok;
          groupId = disb.id_kelompok;
          hariPenagihan = disb.hari_penagihan;
          
          const qCustId = req.query.customerId as string;
          if (qCustId) {
            const sc = state.customers.find(c => c.id === qCustId);
            if (sc) {
              targetCustomers = [sc];
            }
          } else {
            targetCustomers = state.customers.filter(c => c.group_id === disb.id_kelompok && (c.status === 'ACTIVE_LOAN' || c.status === 'PAID_OFF'));
            if (targetCustomers.length === 0) {
              // fallback to all members in that group to ensure we don't return empty pages
              targetCustomers = state.customers.filter(c => c.group_id === disb.id_kelompok);
            }
          }
        } else {
          // 3. Check if :id is a group ID
          const grp = state.groups.find(g => g.id === id);
          if (grp) {
            groupName = grp.name;
            groupId = grp.id;
            disbursementRecord = state.disbursements?.find(d => d.id_kelompok === grp.id);
            const qCustId = req.query.customerId as string;
            if (qCustId) {
              const sc = state.customers.find(c => c.id === qCustId);
              if (sc) {
                targetCustomers = [sc];
              }
            } else {
              targetCustomers = state.customers.filter(c => c.group_id === grp.id && (c.status === 'ACTIVE_LOAN' || c.status === 'PAID_OFF'));
              if (targetCustomers.length === 0) {
                targetCustomers = state.customers.filter(c => c.group_id === grp.id);
              }
            }
          }
        }
      }

      if (targetCustomers.length === 0) {
        return res.status(404).send("Data nasabah atau kelompok tidak ditemukan untuk bukti pencairan.");
      }

      const pages: any[] = [];

      for (let idx = 0; idx < targetCustomers.length; idx++) {
        const cust = targetCustomers[idx];
        const berkas = state.berkasMasuk?.find(b => b.nik_pemohon === cust.nik);
        const namaPenjamin = berkas?.nama_penjamin || "Penjamin Kelompok";
        const sisaPiutang = berkas ? Number(berkas.sisa_piutang) : 0;

        const loan = state.loans?.find(l => l.customer_id === cust.id);
        const loanId = loan?.id || `L-TEMP-${cust.id}`;
        const dates = loan?.tanggal_cair ? new Date(loan.tanggal_cair) : disbursementDate;
        const formattedDate = dates.toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

        const hasUP = state.feeCollections?.some(fc => fc.customer_id === cust.id && fc.jenis_potongan === "UANG_PANGKAL") || cust.is_new_member;
        const upFeeAmount = hasUP ? 100000 : 0;
        const depositoAmount = 250000;
        const adminAmount = 50000;
        const totalPotongan = upFeeAmount + depositoAmount + adminAmount + sisaPiutang;
        const netAmount = 5000000 - totalPotongan;

        const matchingBills = state.billingSchedules?.filter(bs => bs.loan_id === loanId) || [];
        const tenorWeeks = matchingBills.length || 50;
        const weeklyPokok = (5000000 / tenorWeeks);
        const weeklyJasa = matchingBills.length > 0 ? matchingBills[0].jasa : 50000;
        const weeklyTotal = weeklyPokok + weeklyJasa;

        if (disbursementRecord) {
          const petugasPencairan = state.users?.find(u => u.id === disbursementRecord.petugas_pencairan_id);
          if (petugasPencairan) petugasPencairanNama = petugasPencairan.nama;
          
          const petugasPenagihan = state.users?.find(u => u.id === disbursementRecord.petugas_penagihan_id);
          if (petugasPenagihan) petugasPenagihanNama = petugasPenagihan.nama;
          hariPenagihan = disbursementRecord.hari_penagihan;
        }

        pages.push(
          {
            columns: [
              { text: 'PT SEKAWAN SEJAHTERA BERSAMA', style: 'header', alignment: 'left', width: '65%' },
              { text: `NO SPK: ${loanId}`, style: 'sectionHeader', alignment: 'right', width: '35%', bold: true, fontSize: 10 }
            ]
          },
          { text: 'Kantor Cabang Kabupaten Manggarai, Nusa Tenggara Timur', style: 'subheader', alignment: 'left' },
          { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1.5, color: '#000000' }] },
          { text: '\n' },
          
          { text: 'SURAT PERJANJIAN KREDIT & TANDA TERIMA DANA (KUITANSI)', style: 'docTitle', alignment: 'center' },
          { text: `Nomor SPK: ${loanId} | ID Nasabah: ${cust.id}`, style: 'docSub', alignment: 'center' },
          { text: '\n' },
          
          { text: 'BAGIAN I: IDENTITAS PENERIMA MANFAAT', style: 'sectionHeader' },
          {
            table: {
              widths: [130, '*', 130, '*'],
              body: [
                [{ text: 'Hari / Tanggal Cair', bold: true }, ': ' + formattedDate, { text: 'Nama Pemohon', bold: true }, ': ' + cust.name],
                [{ text: 'NIK Pemohon', bold: true }, ': ' + cust.nik, { text: 'Pekerjaan', bold: true }, ': ' + cust.pekerjaan],
                [{ text: 'Nama Penjamin', bold: true }, ': ' + namaPenjamin, { text: 'Nama Kelompok SAK', bold: true }, ': ' + groupName]
              ]
            },
            layout: 'noBorders',
            margin: [0, 0, 0, 10]
          },
          
          { text: 'BAGIAN II: RINCIAN NOMINAL & POTONGAN KEUANGAN KANTOR', style: 'sectionHeader' },
          {
            table: {
              headerRows: 1,
              widths: ['*', 110, 110, 120],
              body: [
                [
                  { text: 'Uraian Komponen Finansial SAK', bold: true, fillColor: '#f1f5f9' },
                  { text: 'Debet (Plafon)', bold: true, alignment: 'right', fillColor: '#f1f5f9' },
                  { text: 'Kredit (Potongan)', bold: true, alignment: 'right', fillColor: '#f1f5f9' },
                  { text: 'Keterangan Buku Kas', bold: true, fillColor: '#f1f5f9' }
                ],
                [
                  'Plafon Pembiayaan Pinjaman',
                  { text: 'Rp ' + Number(5000000).toLocaleString('id-ID'), alignment: 'right' },
                  '-',
                  'Suku Bunga flat 0%'
                ],
                [
                  'Potongan Uang Pangkal (UP) Baru',
                  '-',
                  { text: '- Rp ' + Number(upFeeAmount).toLocaleString('id-ID'), alignment: 'right', color: '#b91c1c' },
                  upFeeAmount > 0 ? 'Wajib Anggota Baru' : 'Anggota Lama'
                ],
                [
                  'Potongan Deposito Wajib SAK',
                  '-',
                  { text: '- Rp ' + Number(depositoAmount).toLocaleString('id-ID'), alignment: 'right', color: '#b91c1c' },
                  'Simpanan Ditahan'
                ],
                [
                  'Biaya Administrasi Flat Kantor',
                  '-',
                  { text: '- Rp ' + Number(adminAmount).toLocaleString('id-ID'), alignment: 'right', color: '#b91c1c' },
                  'Administrasi flat SAK'
                ],
                [
                  'Pemotongan Tunggakan Sisa Piutang',
                  '-',
                  { text: '- Rp ' + Number(sisaPiutang).toLocaleString('id-ID'), alignment: 'right', color: '#b91c1c' },
                  sisaPiutang > 0 ? 'Pelunasan Kredit Lama' : 'Sisa Piutang Nihil'
                ],
                [
                  { text: 'TOTAL DITERIMA BERSIH (NET)', bold: true, fillColor: '#ecfdf5' },
                  { text: 'Rp ' + Number(netAmount).toLocaleString('id-ID'), bold: true, alignment: 'right', fillColor: '#ecfdf5', color: '#047857' },
                  { text: 'Rp ' + Number(totalPotongan).toLocaleString('id-ID'), bold: true, alignment: 'right', fillColor: '#ecfdf5', color: '#b91c1c' },
                  { text: 'SERAH TERIMA TUNAI', bold: true, fillColor: '#ecfdf5', color: '#047857' }
                ]
              ]
            },
            margin: [0, 0, 0, 10]
          },
          
          {
            table: {
              widths: ['*'],
              body: [
                [{
                  text: `Rencana Pemulihan Mingguan SAK: Tenor ${tenorWeeks} Minggu, Angsuran Pokok Rp ${weeklyPokok.toLocaleString('id-ID')}/Minggu + Jasa Rp ${weeklyJasa.toLocaleString('id-ID')}/Minggu | Total Angsuran Mingguan: Rp ${weeklyTotal.toLocaleString('id-ID')}/Minggu (Rute Penagihan Hari ${hariPenagihan})`,
                  bold: true,
                  color: '#1e3a8a',
                  fontSize: 9
                }]
              ]
            },
            layout: {
              fillColor: () => '#eff6ff',
              hLineWidth: () => 1,
              vLineWidth: () => 1,
              hLineColor: () => '#bfdbfe',
              vLineColor: () => '#bfdbfe'
            },
            margin: [0, 0, 0, 10]
          },

          { text: 'BAGIAN III: KETENTUAN TANGGUNG RENTENG KELOMPOK SAK', style: 'sectionHeader' },
          {
            text: 'Dengan menandatangani Surat Perjanjian Kredit (SPK) ini, Pemohon dan Anggota Kelompok sepakat secara bulat untuk tunduk pada Peraturan Tanggung Renteng Kelompok. Jika salah satu pihak berhalangan atau lalai menyelesaikan pembayaran iuran angsuran mingguan tepat waktu, maka tanggung jawab pembayaran tersebut mutlak dialihkan dan diselesaikan bersama-sama secara kolektif oleh seluruh anggota kelompok yang aktif pada hari pertemuan yang telah disepakati.',
            style: 'clauseBody',
            margin: [0, 0, 0, 15]
          },
          
          {
            columns: [
              {
                width: '*',
                text: 'Pihak I / Pemohon\n\n\n\n\n_________________________\nNama: ' + cust.name,
                alignment: 'center',
                style: 'signature'
              },
              {
                width: '*',
                text: 'Pihak II / Penjamin\n\n\n\n\n_________________________\nNama: ' + namaPenjamin,
                alignment: 'center',
                style: 'signature'
              }
            ],
            margin: [0, 0, 0, 10]
          },
          {
            columns: [
              {
                width: '*',
                text: 'Petugas Lapangan (Pencair)\n\n\n\n\n_________________________\nNama: ' + petugasPencairanNama,
                alignment: 'center',
                style: 'signature'
              },
              {
                width: '*',
                text: 'Mengetahui,\nAdm / Pimpinan Cabang\n\n\n\n_________________________\nPT Sekawan Sejahtera Bersama',
                alignment: 'center',
                style: 'signature'
              }
            ]
          }
        );

        if (idx < targetCustomers.length - 1) {
          pages[pages.length - 1].pageBreak = 'after';
        }
      }

      // Flat definition structure matching robot parameters
      const docDefinition = {
        content: pages,
        styles: {
          header: { fontSize: 13, bold: true, color: '#1e293b' },
          subheader: { fontSize: 8, italic: true, color: '#64748b' },
          docTitle: { fontSize: 11, bold: true, color: '#0f172a' },
          docSub: { fontSize: 8, font: 'Courier', color: '#64748b' },
          sectionHeader: { fontSize: 9, bold: true, color: '#1e293b', marginBottom: 4 },
          clauseBody: { fontSize: 8, leading: 1.2, color: '#334155', alignment: 'justify' },
          signature: { fontSize: 8, color: '#334155' }
        },
        defaultStyle: {
          fontSize: 9
        }
      };

      const fonts = {
        Roboto: {
          normal: 'node_modules/pdfmake/fonts/Roboto/Roboto-Regular.ttf',
          bold: 'node_modules/pdfmake/fonts/Roboto/Roboto-Medium.ttf',
          italic: 'node_modules/pdfmake/fonts/Roboto/Roboto-Italic.ttf',
          bolditalic: 'node_modules/pdfmake/fonts/Roboto/Roboto-MediumItalic.ttf'
        }
      };

      const printer = new (PdfPrinter as any)(fonts);
      const doc = printer.createPdfKitDocument(docDefinition);
      
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {
        const result = Buffer.concat(chunks);
        const firstCust = targetCustomers[0];
        const firstLoan = state.loans?.find(l => l.customer_id === firstCust?.id);
        const firstLoanId = firstLoan?.id || `SPK-TEMP-${firstCust?.id || 'Nasabah'}`;
        const cleanGroupName = groupName.replace(/[^a-zA-Z0-9]/g, "_");
        const pdfFilename = `${firstLoanId}_Kelompok_${cleanGroupName}.pdf`;
        
        res.setHeader("Content-Disposition", `attachment; filename="${pdfFilename}"`);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Length", result.length);
        res.send(result);
      });
      doc.on('error', (err) => {
        console.error("PDF generation stream error:", err);
        res.status(500).json({ error: "Gagal me-render format PDF." });
      });
      doc.end();

    } catch (err: any) {
      console.error("PDF generation err:", err);
      res.status(500).json({ error: err.message || "Gagal membuat dokumen SPK PDF." });
    }
  });

  app.post("/api/pencairan/upload-selfie", upload.single("foto_selfie_pencairan"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "File foto selfie tidak terkirim." });
    }
    try {
      const file = req.file;
      const timestamp = Date.now();
      const filename = `selfie_${timestamp}_${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
      let uploadUrl = "";
      if (process.env.GCS_BUCKET_NAME) {
        try {
          uploadUrl = await uploadToGCS(file.buffer, filename);
        } catch (gcsErr: any) {
          console.warn("GCS Upload failed, falling back to local files:", gcsErr.message);
          const uploadsDir = path.join(process.cwd(), "uploads");
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
          uploadUrl = `/uploads/${filename}`;
        }
      } else {
        const uploadsDir = path.join(process.cwd(), "uploads");
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
        uploadUrl = `/uploads/${filename}`;
      }
      res.json({ success: true, url: uploadUrl });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Gagal mengunggah foto selfie pencairan." });
    }
  });

  // MODUL PENAGIHAN: Submit Collections in bulk/group (simulating SQLite offline sync)
  app.post("/api/payments/collect", (req, res) => {
    const { collections, group_id, is_offline } = req.body;
    // collections is an array of records: { billing_schedule_id: string, customer_id: string, nominal_bayar: number, is_menunggak?: boolean, is_lari?: boolean, payment_method?: 'TUNAI' | 'TRANSFER' }
    if (!collections || !Array.isArray(collections) || collections.length === 0) {
      return res.status(400).json({ error: "Missing collection details." });
    }

    const state = readDB();

    try {
      const results: Payment[] = [];

      // Iterate through payments collected by Petugas
      collections.forEach((col: any) => {
        const schedIdx = state.billingSchedules.findIndex(s => s.id === col.billing_schedule_id);
        if (schedIdx === -1) {
          throw new Error(`Jadwal tagihan ${col.billing_schedule_id} tidak ditemukan.`);
        }

        const sched = state.billingSchedules[schedIdx];
        const payVal = Number(col.nominal_bayar) || 0;
        const current_method = col.payment_method || 'TUNAI';

        // 1. Case Melarikan Diri/Anggota Lari
        if (col.is_lari) {
          // Set customer status to MACET_KABUR
          const custIdx = state.customers.findIndex(c => c.id === col.customer_id);
          if (custIdx !== -1) {
            state.customers[custIdx].status = 'MACET_KABUR';
            (state.customers[custIdx] as any).is_lari = true;
          }

          // Set loan status of customer to MACET_KABUR
          const loanIdx = state.loans.findIndex(l => l.customer_id === col.customer_id && l.status === 'ACTIVE_LOAN');
          if (loanIdx !== -1) {
            state.loans[loanIdx].status = 'MACET_KABUR';
          }

          // Force sched status & insert a log record with 0 amount
          sched.status = 'UNPAID';
          
          const paymentId = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const newPayment: Payment = {
            id: paymentId,
            billing_schedule_id: sched.id,
            customer_id: col.customer_id,
            petugas_id: "Petugas Lapangan 1",
            nominal_bayar: 0,
            tanggal_bayar: new Date().toISOString(),
            status: 'PENDING_SETORAN',
            catatan_revisi: "ANGGOTA MELARIKAN DIRI/KABUR - Luring Flagged",
            is_offline_logged: !!is_offline,
            payment_method: 'TUNAI',
            is_lari: true
          };
          state.payments.push(newPayment);
          results.push(newPayment);

          // Add a red alert notification of runaway in state or similar log
          if (!(state as any).alerts) {
            (state as any).alerts = [];
          }
          (state as any).alerts.push({
            id: `ALERT-${Date.now()}`,
            message: `⚠️ WARNING: Nasabah ${col.customer_name || 'Nasabah'} melarikan diri (Kredit Macet) pada rute kelompok ${group_id || 'Kelompok'}!`,
            date: new Date().toISOString()
          });

          return; // skip further billing schedule edits for this item
        }

        // 2. Case Absent / Menunggak
        if (col.is_menunggak || payVal === 0) {
          sched.status = 'MENUNGGAK';

          const paymentId = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const newPayment: Payment = {
            id: paymentId,
            billing_schedule_id: sched.id,
            customer_id: col.customer_id,
            petugas_id: "Petugas Lapangan 1",
            nominal_bayar: 0,
            tanggal_bayar: new Date().toISOString(),
            status: 'PENDING_SETORAN',
            catatan_revisi: "ABSEN / MENUNGGAK (Setoran Rp 0)",
            is_offline_logged: !!is_offline,
            payment_method: current_method,
            is_menunggak: true
          };
          state.payments.push(newPayment);
          results.push(newPayment);
          return; // skip journal entry since cash collected is 0
        }

        // 3. Normal collection booking
        const paymentId = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const newPayment: Payment = {
          id: paymentId,
          billing_schedule_id: sched.id,
          customer_id: col.customer_id,
          petugas_id: "Petugas Lapangan 1",
          nominal_bayar: payVal,
          tanggal_bayar: new Date().toISOString(),
          status: 'PENDING_SETORAN',
          catatan_revisi: null,
          is_offline_logged: !!is_offline,
          payment_method: current_method,
          is_menunggak: false,
          is_lari: false
        };

        state.payments.push(newPayment);
        results.push(newPayment);

        // Calculate distribution
        const interestOwed = sched.jasa - sched.bayar_jasa;
        const interestPaid = Math.min(payVal, interestOwed);
        
        const principalOwed = sched.pokok - sched.bayar_pokok;
        const principalPaid = Math.min(payVal - interestPaid, principalOwed);

        sched.bayar_jasa += interestPaid;
        sched.bayar_pokok += principalPaid;

        const totalPaidSoFar = sched.bayar_pokok + sched.bayar_jasa;
        if (totalPaidSoFar >= sched.total_tagihan) {
          sched.status = 'PAID';
        } else if (totalPaidSoFar > 0) {
          sched.status = 'PARTIAL';
        }

        // DOUBLE-ENTRY JOURNAL ENTRY
        // Debit: Kas di Tangan Petugas (1111)
        // Credit: Piutang Pokok (1210) & Pendapatan Jasa (4110)
        const lines = [
          { account_code: '1111', debit: payVal, credit: 0 },
        ];

        if (principalPaid > 0) {
          lines.push({ account_code: '1210', debit: 0, credit: principalPaid });
        }
        if (interestPaid > 0) {
          lines.push({ account_code: '4110', debit: 0, credit: interestPaid });
        }

        const totalCredited = principalPaid + interestPaid;
        const remainder = payVal - totalCredited;
        if (remainder > 0) {
          lines.push({ account_code: '1210', debit: 0, credit: remainder });
          sched.bayar_pokok += remainder;
        }

        addJournalEntry(
          state, 
          `COLLECT_${sched.customer_id}_TERM${sched.term}`, 
          `Penerimaan Angsuran Lapangan #${sched.term} - ${col.customer_name || 'Nasabah'} [Metode: ${current_method}]`, 
          lines
        );

        // Check if underpaid and system_tanggung_renteng is FALSE: transfer deficiency to overdue account
        const deficiency = sched.total_tagihan - (sched.bayar_pokok + sched.bayar_jasa);
        if (deficiency > 0 && group_id) {
          const groupObj = state.groups.find(g => g.id === group_id);
          if (groupObj && !groupObj.sistem_tanggung_renteng) {
            const remainingPokokToShift = sched.pokok - sched.bayar_pokok;
            if (remainingPokokToShift > 0 && sched.status !== 'UNPAID') {
              addJournalEntry(
                state,
                `OVERDUE_SHIFT_${col.customer_id}`,
                `Pencatatan Piutang Tunggakan Pribadi (Non-Tanggung-Renteng) ${col.customer_name}`,
                [
                  { account_code: '1220', debit: remainingPokokToShift, credit: 0 },
                  { account_code: '1210', debit: 0, credit: remainingPokokToShift }
                ]
              );
            }
          }
        }
      });

      // Check if all billing schedules of active loans are fully paid, shift loan to PAID_OFF
      state.loans.forEach(lnk => {
        const relatedScheds = state.billingSchedules.filter(s => s.loan_id === lnk.id);
        const allPaid = relatedScheds.every(s => s.status === 'PAID');
        if (allPaid && relatedScheds.length > 0 && lnk.status === 'ACTIVE_LOAN') {
          lnk.status = 'PAID_OFF';
          // Also set customer status to PAID_OFF
          const cIdx = state.customers.findIndex(c => c.id === lnk.customer_id);
          if (cIdx !== -1) {
            state.customers[cIdx].status = 'PAID_OFF';
          }
        }
      });

      writeDB(state);
      res.json({ success: true, message: "Penerimaan Tagihan berhasil dibukukan sementara (Tunggu Setoran Kasir).", payments: results, state });

    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message || "Gagal memproses penagihan." });
    }
  });

  // MODUL SETORAN HARIAN KASIR: Approve or Reject Setoran
  app.post("/api/cashier/verify", (req, res) => {
    const { payment_ids, action, memo } = req.body; // action: 'APPROVE' or 'REJECT'
    if (!payment_ids || !Array.isArray(payment_ids) || payment_ids.length === 0 || !action) {
      return res.status(400).json({ error: "Missing required cashier action data." });
    }

    const state = readDB();

    try {
      const activePayments = state.payments.filter(p => payment_ids.includes(p.id));

      if (activePayments.length === 0) {
        return res.status(404).json({ error: "No matching pending setoran payments found." });
      }

      if (action === 'APPROVE') {
        const totalCash = activePayments.reduce((sum, p) => sum + p.nominal_bayar, 0);
        
        const totalTunai = activePayments
          .filter(p => !p.payment_method || p.payment_method === 'TUNAI')
          .reduce((sum, p) => sum + p.nominal_bayar, 0);

        const totalTransfer = activePayments
          .filter(p => p.payment_method === 'TRANSFER')
          .reduce((sum, p) => sum + p.nominal_bayar, 0);

        // Update payment status
        activePayments.forEach(p => {
          p.status = 'SETORAN_APPROVED';
        });

        // Trigger Accounting
        // Skenario: Uang TUNAI dideposit ke Kas Kecil (1110), Uang TRANSFER masuk Kas Bank (1112)
        // Keduanya dikreditkan dari Kas di Tangan Petugas (1111)
        const accountingLines: any[] = [];
        if (totalTunai > 0) {
          accountingLines.push({ account_code: '1110', debit: totalTunai, credit: 0 }); // Kas Kecil (Dr)
          accountingLines.push({ account_code: '1111', debit: 0, credit: totalTunai }); // Kas di Tangan Petugas (Cr)
        }
        if (totalTransfer > 0) {
          accountingLines.push({ account_code: '1112', debit: totalTransfer, credit: 0 }); // Kas Bank (Dr)
          accountingLines.push({ account_code: '1111', debit: 0, credit: totalTransfer }); // Kas di Tangan Petugas (Cr)
        }

        if (accountingLines.length > 0) {
          addJournalEntry(
            state,
            `KASIR_SETORAN_${Date.now()}`,
            `Penyetoran Kas Harian Petugas Lapangan. Tunai: Rp ${totalTunai.toLocaleString('id-ID')}, Transfer: Rp ${totalTransfer.toLocaleString('id-ID')}`,
            accountingLines
          );
        }

        writeDB(state);
        res.json({ 
          success: true, 
          message: `Berhasil memverifikasi setoran kasir sebesar Rp ${totalCash.toLocaleString('id-ID')} (Tunai: Rp ${totalTunai.toLocaleString('id-ID')} ke Kas Kecil, Transfer: Rp ${totalTransfer.toLocaleString('id-ID')} ke Kas Bank)!`, 
          state 
        });

      } else if (action === 'REJECT') {
        // Status becomes REVISION_REQUIRED. Funds remain in 'Kas di Tangan Petugas'
        activePayments.forEach(p => {
          p.status = 'REVISION_REQUIRED';
          p.catatan_revisi = memo || "Perbedaan kas fisik dengan sistem";
        });

        writeDB(state);
        res.json({ success: true, message: "Setoran lapangan ditolak untuk direvisi Petugas.", state });
      } else {
        res.status(400).json({ error: "Invalid cashier action selection." });
      }

    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message || "Gagal memproses setoran kasir." });
    }
  });

  // MODUL SETORAN HARIAN KASIR: Update/Revise individual payment amount
  app.post("/api/cashier/update-payment", (req, res) => {
    const { payment_id, nominal_bayar, payment_method } = req.body;
    if (!payment_id || nominal_bayar === undefined) {
      return res.status(400).json({ error: "Missing required payment update data." });
    }

    const state = readDB();
    try {
      const payment = state.payments.find(p => p.id === payment_id);
      if (!payment) {
        return res.status(404).json({ error: "Data pembayaran tidak ditemukan." });
      }

      const oldAmount = payment.nominal_bayar;
      payment.nominal_bayar = Number(nominal_bayar);
      if (payment_method) {
        payment.payment_method = payment_method;
      }

      writeDB(state);
      res.json({
        success: true,
        message: `Berhasil mengoreksi nominal setoran untuk anggota dari Rp ${oldAmount.toLocaleString('id-ID')} menjadi Rp ${payment.nominal_bayar.toLocaleString('id-ID')}`,
        state
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message || "Gagal mengupdate nominal setoran." });
    }
  });

  // REKAPAN ANGSURAN HARIAN ENDPOINTS (Double Approval Verification)
  app.get("/api/rekapan/data", (req, res) => {
    try {
      const state = readDB();
      if (!state.approvedGroupIds) {
        state.approvedGroupIds = [];
      }

      const payments = state.payments || [];
      const customers = state.customers || [];
      const groups = state.groups || [];
      const users = state.users || [];

      // Map group catalog
      const groupMap = new Map(groups.map(g => [g.id, g.name]));
      // Map customer to group_id & name
      const customerMap = new Map(customers.map(c => [c.id, { name: c.name, groupId: c.group_id }]));
      // Map user/petugas name
      const userMap = new Map(users.map(u => [u.id, u.nama]));

      // Group active payments by petugas_id first
      const petugasGroups: { [petugasId: string]: { [groupId: string]: any[] } } = {};
      
      payments.forEach(p => {
        if (p.status !== 'PENDING_SETORAN' && p.status !== 'SETORAN_APPROVED') return;
        
        const petugasId = p.petugas_id || 'UNKNOWN';
        const custInfo = customerMap.get(p.customer_id);
        const groupId = custInfo ? custInfo.groupId : 'UNKNOWN';
        
        if (!petugasGroups[petugasId]) {
          petugasGroups[petugasId] = {};
        }
        if (!petugasGroups[petugasId][groupId]) {
          petugasGroups[petugasId][groupId] = [];
        }
        petugasGroups[petugasId][groupId].push(p);
      });

      const listPetugas: any[] = [];
      let totalSetoranTerverifikasi = 0;
      let totalSetoranPending = 0;

      Object.entries(petugasGroups).forEach(([petugasId, groupPayments]) => {
        const petugasNama = userMap.get(petugasId) || petugasId;
        const groupList: any[] = [];
        let allApproved = true;
        let anyPending = false;
        let totalPetugasUang = 0;
        let petugasHasPendingPayments = false;

        Object.entries(groupPayments).forEach(([groupId, payList]) => {
          const groupName = groupMap.get(groupId) || `Kelompok ${groupId}`;
          const totalUang = payList.reduce((sum, p) => sum + p.nominal_bayar, 0);
          totalPetugasUang += totalUang;

          const isGroupApproved = state.approvedGroupIds.includes(groupId);
          const hasPending = payList.some(p => p.status === 'PENDING_SETORAN');
          if (hasPending) {
            petugasHasPendingPayments = true;
          }

          // Accumulate general metrics based on the group approved state
          payList.forEach(p => {
            if (p.status === 'PENDING_SETORAN') {
              if (isGroupApproved) {
                totalSetoranTerverifikasi += p.nominal_bayar;
              } else {
                totalSetoranPending += p.nominal_bayar;
              }
            }
          });

          if (!isGroupApproved && hasPending) {
            allApproved = false;
          }
          if (hasPending) {
            anyPending = true;
          }

          groupList.push({
            groupId,
            groupName,
            totalUang,
            isApproved: isGroupApproved,
            status: isGroupApproved ? 'APPROVED' : 'PENDING_KASIR',
            paymentCount: payList.length,
            pendingCount: payList.filter(p => p.status === 'PENDING_SETORAN').length
          });
        });

        const isLocked = !anyPending && groupList.length > 0;

        listPetugas.push({
          petugasId,
          petugasNama,
          groups: groupList,
          totalUang: totalPetugasUang,
          isReadyToAcc: allApproved && anyPending && groupList.length > 0 && petugasHasPendingPayments,
          isLocked
        });
      });

      res.json({
        success: true,
        metrics: {
          totalSetoranTerverifikasi,
          totalSetoranPending,
          totalSetoranKas: totalSetoranTerverifikasi + totalSetoranPending
        },
        data: listPetugas
      });

    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message || "Gagal mengambil data rekapan harian." });
    }
  });

  app.post("/api/rekapan/approve-group", (req, res) => {
    try {
      const { groupId } = req.body;
      if (!groupId) {
        return res.status(400).json({ error: "Missing groupId parameter." });
      }

      const state = readDB();
      if (!state.approvedGroupIds) {
        state.approvedGroupIds = [];
      }

      if (!state.approvedGroupIds.includes(groupId)) {
        state.approvedGroupIds.push(groupId);
      }

      writeDB(state);
      res.json({ success: true, message: `Kelompok ${groupId} berhasil di-approve.` });
    } catch (err: any) {
      res.status(550).json({ error: err.message || "Gagal meng-approve kelompok." });
    }
  });

  app.post("/api/rekapan/unapprove-group", (req, res) => {
    try {
      const { groupId } = req.body;
      if (!groupId) {
        return res.status(400).json({ error: "Missing groupId parameter." });
      }

      const state = readDB();
      if (!state.approvedGroupIds) {
        state.approvedGroupIds = [];
      }

      state.approvedGroupIds = state.approvedGroupIds.filter((id: string) => id !== groupId);

      writeDB(state);
      res.json({ success: true, message: `Batal approve kelompok ${groupId}.` });
    } catch (err: any) {
      res.status(550).json({ error: err.message || "Gagal membatalkan approve kelompok." });
    }
  });

  app.post("/api/rekapan/acc-rekapan", (req, res) => {
    try {
      const { petugasId } = req.body;
      if (!petugasId) {
        return res.status(400).json({ error: "Missing petugasId parameter." });
      }

      const state = readDB();
      if (!state.approvedGroupIds) {
        state.approvedGroupIds = [];
      }

      const payments = state.payments || [];
      const customers = state.customers || [];
      const customerMap = new Map(customers.map(c => [c.id, c.group_id]));

      // Select all PENDING_SETORAN payments under this petugas
      const activePayments = payments.filter(p => p.petugas_id === petugasId && p.status === 'PENDING_SETORAN');

      if (activePayments.length === 0) {
        return res.status(400).json({ error: "Tidak ada setoran penagihan aktif (PENDING) untuk petugas ini." });
      }

      // Verify all these payments belong to groups that are approved
      const missingApprovals: string[] = [];
      activePayments.forEach(p => {
        const groupId = customerMap.get(p.customer_id) || 'UNKNOWN';
        if (!state.approvedGroupIds.includes(groupId)) {
          if (!missingApprovals.includes(groupId)) {
            missingApprovals.push(groupId);
          }
        }
      });

      if (missingApprovals.length > 0) {
        return res.status(400).json({ 
          error: `Gagal ACC Rekapan. Kelompok berikut belum disetujui kasir: ${missingApprovals.join(", ")}` 
        });
      }

      // Execute approval transition
      const totalCash = activePayments.reduce((sum, p) => sum + p.nominal_bayar, 0);
      const totalTunai = activePayments
        .filter(p => !p.payment_method || p.payment_method === 'TUNAI')
        .reduce((sum, p) => sum + p.nominal_bayar, 0);
      const totalTransfer = activePayments
        .filter(p => p.payment_method === 'TRANSFER')
        .reduce((sum, p) => sum + p.nominal_bayar, 0);

      activePayments.forEach(p => {
        p.status = 'SETORAN_APPROVED';
      });

      // Clear the approved group flags of those groups since they are now locked
      const affectedGroupIds = new Set<string>();
      activePayments.forEach(p => {
        const gId = customerMap.get(p.customer_id);
        if (gId) affectedGroupIds.add(gId);
      });

      state.approvedGroupIds = state.approvedGroupIds.filter((id: string) => !affectedGroupIds.has(id));

      // Trigger accounting double-entry ledger bookkeeping
      const accountingLines: any[] = [];
      if (totalTunai > 0) {
        accountingLines.push({ account_code: '1110', debit: totalTunai, credit: 0 }); // Kas Kecil (Dr)
        accountingLines.push({ account_code: '1111', debit: 0, credit: totalTunai }); // Kas di Tangan Petugas (Cr)
      }
      if (totalTransfer > 0) {
        accountingLines.push({ account_code: '1112', debit: totalTransfer, credit: 0 }); // Kas Bank (Dr)
        accountingLines.push({ account_code: '1111', debit: 0, credit: totalTransfer }); // Kas di Tangan Petugas (Cr)
      }

      if (accountingLines.length > 0) {
        addJournalEntry(
          state,
          `KASIR_ACC_REKAPAN_${Date.now()}`,
          `ACC Rekapan Penagihan Harian Petugas Lapangan (ID: ${petugasId}). Total Penyetoran: Rp ${totalCash.toLocaleString('id-ID')} (Tunai: Rp ${totalTunai.toLocaleString('id-ID')}, Transfer: Rp ${totalTransfer.toLocaleString('id-ID')})`,
          accountingLines
        );
      }

      writeDB(state);
      res.json({ 
        success: true, 
        message: `Berhasil mengunci rekapan harian petugas & membukukan kas masuk sebesar Rp ${totalCash.toLocaleString('id-ID')}!` 
      });

    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message || "Gagal memproses ACC Rekapan Penagihan." });
    }
  });

  // 1. OPEX MANUAL EXPENSES
  app.get("/api/operasional/opex", (req, res) => {
    try {
      const state = readDB();
      res.json({ success: true, count: (state.opexExpenses || []).length, data: state.opexExpenses || [] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/operasional/opex", (req, res) => {
    try {
      const { category, amount, description, date, paying_account } = req.body;
      if (!category || !amount || !description) {
        return res.status(400).json({ success: false, error: "Missing required fields (category, amount, description)." });
      }

      const state = readDB();
      if (!state.opexExpenses) state.opexExpenses = [];

      const expenseId = `EXP-${Date.now()}-${Math.floor(Math.random()*1000)}`;
      const newExpense: OpexExpense = {
        id: expenseId,
        category,
        amount: Number(amount),
        description,
        date: date || new Date().toISOString(),
        petugas_id: "KASIR"
      };

      state.opexExpenses.push(newExpense);

      // Bookkeeping
      const catCodeMap: { [key: string]: string } = {
        'Bensin': '5100',
        'Gaji': '5110',
        'ATK': '5120',
        'Listrik': '5130',
        'Lainnya': '5140'
      };
      const expenseCode = catCodeMap[category] || '5140';
      const creditCashCode = paying_account === 'Kas Bank' ? '1112' : '1110';

      const lines = [
        { account_code: expenseCode, debit: Number(amount), credit: 0 },
        { account_code: creditCashCode, debit: 0, credit: Number(amount) }
      ];

      addJournalEntry(state, expenseId, `OPEX: Pengeluaran biaya ${category} - ${description}`, lines);

      writeDB(state);
      res.json({ success: true, data: newExpense, message: `Beban ${category} sebesar Rp ${Number(amount).toLocaleString('id-ID')} berhasil dicatatkan.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. RETRIEVE ALL DYNAMIC OPERATIONAL MEMOS
  app.get("/api/operasional/reports-summary", (req, res) => {
    try {
      const state = readDB();
      const payments = state.payments || [];
      const disbursements = state.disbursements || [];
      const opexExpenses = state.opexExpenses || [];

      // Receipes - Setoran Tagihan
      const approvedPayments = payments.filter(p => p.status === 'SETORAN_APPROVED');
      const totalSetoranTagihan = approvedPayments.reduce((sum, p) => sum + p.nominal_bayar, 0);

      // Receipes - Setoran Dana Awal (Potongan UP, pot deposit, pot adm, pot sisa piutang)
      let totalUp = 0;
      let totalDeposit = 0;
      let totalAdm = 0;
      let totalDeductedInstallments = 0;

      disbursements.forEach(d => {
        totalUp += Number(d.potongan_up) || 0;
        totalDeposit += Number(d.potongan_deposito) || 0;
        totalAdm += Number(d.potongan_administrasi) || 0;
        totalDeductedInstallments += Number(d.potongan_sisa_piutang) || 0;
      });

      const totalDanaAwal = totalUp + totalDeposit + totalAdm + totalDeductedInstallments;

      // Disbursements (Pencairan)
      const totalPencairanKotor = disbursements.reduce((sum, d) => sum + (Number(d.total_pencairan_kotor) || 0), 0);
      const totalPencairanBersih = disbursements.reduce((sum, d) => sum + ((Number(d.total_pencairan_kotor) || 0) - (Number(d.total_uang_dikembalikan_ke_kantor) || 0)), 0);

      // OPEX Expenses
      const opexCategorySums: { [key: string]: number } = { Bensin: 0, Gaji: 0, ATK: 0, Listrik: 0, Lainnya: 0 };
      opexExpenses.forEach(e => {
        if (opexCategorySums[e.category] !== undefined) {
          opexCategorySums[e.category] += e.amount;
        } else {
          opexCategorySums['Lainnya'] += e.amount;
        }
      });
      const totalManualOpex = opexExpenses.reduce((sum, e) => sum + e.amount, 0);

      // NPL (Non-Performing Loan) calculation
      const schedules = state.billingSchedules || [];
      const unpaidSchedules = schedules.filter(s => s.status !== 'PAID');
      const outstandingPortfolio = unpaidSchedules.reduce((sum, s) => sum + Math.max(0, s.total_tagihan - (s.bayar_pokok + s.bayar_jasa)), 0) || 45000000;

      // Bad Debt sum
      const overdueSchedules = schedules.filter(s => s.status === 'OVERDUE' || s.status === 'MENUNGGAK');
      const badDebtSchedules = overdueSchedules.reduce((sum, s) => sum + Math.max(0, s.total_tagihan - (s.bayar_pokok + s.bayar_jasa)), 0);

      const loansHistory = state.loans || [];
      const macetLoansSum = loansHistory.filter(l => l.status === 'MACET_KABUR').reduce((sum, l) => sum + l.plafon, 0);

      // Fetch '1230' Account Balance (Manual marks)
      let markedBadDebtSum = 0;
      const jlLines = state.journalEntryLines || [];
      jlLines.forEach(l => {
        if (l.account_code === '1230') {
          markedBadDebtSum += l.debit - l.credit;
        }
      });
      
      const totalBadDebt = badDebtSchedules + macetLoansSum + Math.max(0, markedBadDebtSum);
      const nplRatio = outstandingPortfolio > 0 ? (totalBadDebt / (outstandingPortfolio + totalBadDebt)) * 105 : 2.5;

      // NPL Weekly historical curves
      const nplTrend = [
        { label: "Mg 1", ratio: 1.2 },
        { label: "Mg 2", ratio: 1.4 },
        { label: "Mg 3", ratio: 1.1 },
        { label: "Mg 4", ratio: 1.5 },
        { label: "Mg 5", ratio: 1.8 },
        { label: "Mg 6", ratio: Math.min(18.5, Math.round(Math.max(1.5, nplRatio) * 10) / 10) }
      ];

      res.json({
        success: true,
        penerimaan: {
          totalSetoranTagihan,
          totalDanaAwal,
          receiptDetails: {
            setoranTagihan: approvedPayments.map(p => ({
              id: p.id,
              customer_id: p.customer_id,
              amount: p.nominal_bayar,
              date: p.tanggal_bayar,
              method: p.payment_method || 'TUNAI'
            })),
            setoranDanaAwal: {
              raw_disbursements_count: disbursements.length,
              potongan_up: totalUp,
              potongan_deposito: totalDeposit,
              potongan_administrasi: totalAdm,
              potongan_sisa_piutang: totalDeductedInstallments
            }
          }
        },
        pengeluaran: {
          totalOPEX: totalManualOpex,
          totalPencairanKotor,
          totalPencairanBersih,
          opexSummaryByCategory: opexCategorySums,
          opexExpenses
        },
        npl: {
          outstandingPortfolio,
          totalBadDebt,
          ratio: Math.min(18.5, Math.round(Math.max(1.5, nplRatio) * 100) / 100),
          trend: nplTrend
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. BANK RECONCILIATION
  app.get("/api/operasional/reconciliation", (req, res) => {
    try {
      const state = readDB();
      const journalEntryLines = state.journalEntryLines || [];
      const journalEntries = state.journalEntries || [];

      // Seed mock bank statement mutation on first run so they have something neat to view!
      if (!state.bankMutations || state.bankMutations.length === 0) {
        state.bankMutations = [
          {
            id: "MOCK-MUT-101",
            date: "2026-06-02",
            description: "TRANSFER DR BANK MANDIRI - SETORAN BUDGETING",
            amount: 75000000,
            type: "CR",
            status: "MATCHED",
            matched_with: "JE-SEED-01"
          },
          {
            id: "MOCK-MUT-102",
            date: "2026-06-03",
            description: "BIAYA OPERASIONAL BENSIN",
            amount: 150000,
            type: "DR",
            status: "UNMATCHED"
          },
          {
            id: "MOCK-MUT-103",
            date: "2026-06-04",
            description: "PENYETORAN BUNGA KOPERASI",
            amount: 1200000,
            type: "CR",
            status: "UNMATCHED"
          }
        ];
        writeDB(state);
      }

      // Extract internal bank ledger logs (Account 1112 Kas Bank)
      const internalBankEntries = journalEntryLines
        .filter(line => line && line.account_code === '1112')
        .map(line => {
          const entry = journalEntries.find(e => e && e.id === line.entry_id);
          return {
            id: line.id,
            entry_id: line.entry_id,
            reference: entry?.reference || '',
            description: entry?.description || '',
            date: entry?.date || '',
            debit: line.debit,
            credit: line.credit,
            amount: line.debit > 0 ? line.debit : -line.credit
          };
        });

      res.json({
        success: true,
        bankMutations: state.bankMutations || [],
        internalBankEntries
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/operasional/reconciliation/import", (req, res) => {
    try {
      const { mutations } = req.body;
      if (!mutations || !Array.isArray(mutations)) {
        return res.status(400).json({ success: false, error: "Missing array mutations parameter." });
      }

      const state = readDB();
      if (!state.bankMutations) state.bankMutations = [];

      mutations.forEach((m: any) => {
        state.bankMutations!.push({
          id: m.id || `MUT-${Date.now()}-${Math.floor(Math.random()*1000)}`,
          date: m.date || new Date().toISOString().split('T')[0],
          description: m.description || 'Imported Mutation Statement',
          amount: Number(m.amount) || 0,
          type: m.type || 'CR',
          status: 'UNMATCHED'
        });
      });

      writeDB(state);
      res.json({ success: true, message: `Berhasil mengimpor ${mutations.length} catatan mutasi bank korporat.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/operasional/reconciliation/match", (req, res) => {
    try {
      const { mutationId, matchedWithId } = req.body;
      if (!mutationId) {
        return res.status(400).json({ success: false, error: "Missing mutationId parameter." });
      }

      const state = readDB();
      const mutList = state.bankMutations || [];
      const mut = mutList.find(m => m.id === mutationId);
      if (!mut) {
        return res.status(404).json({ success: false, error: "Mutasi bank tidak ditemukan." });
      }

      mut.status = 'MATCHED';
      mut.matched_with = matchedWithId || 'JOURNAL_LINE';

      writeDB(state);
      res.json({ success: true, message: `Mutasi bank berhasil dicocokkan & direkonsiliasi.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. FIXED ASSETS (Straight Line Depreciation Method)
  app.get("/api/accounting/fixed-assets", (req, res) => {
    try {
      const state = readDB();
      res.json({ success: true, data: state.fixedAssets || [] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/accounting/fixed-assets", (req, res) => {
    try {
      const { name, acquisition_cost, salvage_value, useful_life, purchase_date } = req.body;
      if (!name || !acquisition_cost || !useful_life) {
        return res.status(400).json({ success: false, error: "Missing required properties (name, acquisition_cost, useful_life)." });
      }

      const state = readDB();
      if (!state.fixedAssets) state.fixedAssets = [];

      const assetId = `AST-${Date.now()}-${Math.floor(Math.random()*1000)}`;
      const cost = Number(acquisition_cost);
      const salvage = Number(salvage_value) || 0;
      const life = Number(useful_life);
      const monthlyDepr = Math.round((cost - salvage) / life);

      const newAsset: FixedAsset = {
        id: assetId,
        name,
        acquisition_cost: cost,
        salvage_value: salvage,
        useful_life: life,
        purchase_date: purchase_date || new Date().toISOString().split('T')[0],
        monthly_depreciation: monthlyDepr,
        accumulated_depreciation: 0,
        current_value: cost,
        status: 'ACTIVE'
      };

      state.fixedAssets.push(newAsset);

      // Bookkeeping for asset acquisition
      // Debit: 1310 Aset Tetap, Credit: 1112 Kas Bank (purchased via Bank)
      const lines = [
        { account_code: '1310', debit: cost, credit: 0 },
        { account_code: '1112', debit: 0, credit: cost }
      ];

      addJournalEntry(state, assetId, `ASET_BARU: Perolehan aset tetap ${name}`, lines);

      writeDB(state);
      res.json({ success: true, data: newAsset, message: `Aset Tetap ${name} berhasil didaftarkan & dibukukan.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/accounting/fixed-assets/depreciate-all", (req, res) => {
    try {
      const state = readDB();
      const assets = state.fixedAssets || [];
      const activeAssets = assets.filter(a => a.status === 'ACTIVE' && a.current_value > a.salvage_value);

      if (activeAssets.length === 0) {
        return res.status(400).json({ success: false, error: "Tidak ada aset tetap aktif yang membutuhkan depresiasi." });
      }

      let totalDeprThisMonth = 0;
      const descList: string[] = [];

      activeAssets.forEach(a => {
        const remainingToDepreciate = a.current_value - a.salvage_value;
        const deprAmount = Math.min(a.monthly_depreciation, remainingToDepreciate);
        if (deprAmount > 0) {
          a.accumulated_depreciation += deprAmount;
          a.current_value = a.acquisition_cost - a.accumulated_depreciation;
          a.last_depreservation_date = new Date().toISOString();
          totalDeprThisMonth += deprAmount;
          descList.push(`${a.name} (Rp ${deprAmount.toLocaleString('id-ID')})`);
        }
      });

      if (totalDeprThisMonth > 0) {
        // Bookkeeping
        // Debit: 5200 Beban Penyusutan Aset Tetap, Credit: 1311 Akumulasi Penyusutan Aset Tetap
        const lines = [
          { account_code: '5200', debit: totalDeprThisMonth, credit: 0 },
          { account_code: '1311', debit: 0, credit: totalDeprThisMonth }
        ];

        addJournalEntry(state, `DEPR-${Date.now()}`, `DEPRESIASI BULANAN: Penyusutan nilai asset garis lurus bulanan: ${descList.join(", ")}`, lines);
      }

      writeDB(state);
      res.json({ success: true, count: activeAssets.length, totalDeprAmount: totalDeprThisMonth, message: `Otomatisasi penyusutan berhasil dieksekusi. Total biaya penyusutan bulan ini Rp ${totalDeprThisMonth.toLocaleString('id-ID')} diposting ke Buku Besar.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. LIABILITIES & CAPITAL MODAL
  app.get("/api/accounting/liabilities-capital", (req, res) => {
    try {
      const state = readDB();
      res.json({ success: true, data: state.liabilitiesCapitalLogs || [] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/accounting/liabilities-capital", (req, res) => {
    try {
      const { type, amount, source, description, date } = req.body;
      if (!type || !amount || !source || !description) {
        return res.status(400).json({ success: false, error: "Missing required properties (type, amount, source, description)." });
      }

      const state = readDB();
      if (!state.liabilitiesCapitalLogs) state.liabilitiesCapitalLogs = [];

      const logId = `LCL-${Date.now()}-${Math.floor(Math.random()*1000)}`;
      const valAmount = Number(amount);
      const newLog: LiabilitiesCapitalLog = {
        id: logId,
        type,
        amount: valAmount,
        source,
        description,
        date: date || new Date().toISOString()
      };

      state.liabilitiesCapitalLogs.push(newLog);

      // Bookkeeping
      // Debit: 1112 Kas di Bank
      // Credit: 2120 Utang Pihak Ketiga (if UTANG) or 3100 Modal Disetor (if MODAL)
      const credCode = type === 'UTANG' ? '2120' : '3100';
      const lines = [
        { account_code: '1112', debit: valAmount, credit: 0 },
        { account_code: credCode, debit: 0, credit: valAmount }
      ];

      addJournalEntry(state, logId, `${type}: Pencatatan kontribusi ${type} dari ${source} - ${description}`, lines);

      writeDB(state);
      res.json({ success: true, data: newLog, message: `Berhasil mencatatkan aliran dana masuk ${type} sebesar Rp ${valAmount.toLocaleString('id-ID')}` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. PIUTANG TAK TERTAGIH (Write off bad loans manually)
  app.post("/api/accounting/mark-bad-debt", (req, res) => {
    try {
      const { customerId, amount, description } = req.body;
      if (!customerId || !amount) {
        return res.status(400).json({ success: false, error: "Missing required fields (customerId, amount)." });
      }

      const state = readDB();
      // Optional: locate loan & update status
      const loan = state.loans?.find(l => l.customer_id === customerId);
      if (loan) {
        loan.status = 'MACET_KABUR';
      }
      const customer = state.customers?.find(c => c.id === customerId);
      if (customer) {
        customer.is_lari = true;
      }

      // Log Double Entry
      // Debit: 1230 Piutang Tak Tertagih
      // Credit: 1210 Piutang Pokok
      const lines = [
        { account_code: '1230', debit: Number(amount), credit: 0 },
        { account_code: '1210', debit: 0, credit: Number(amount) }
      ];

      const refId = `BAD-${Date.now()}`;
      addJournalEntry(state, refId, `BAD_DEBT_WRITEOFF: Pengalihan pinjaman gagal bayar nasabah ${customer?.name || customerId} - ${description || 'Macet/Kabur'}`, lines);

      writeDB(state);
      res.json({ success: true, message: `Berhasil mengalihkan piutang lancar nasabah ke Piutang Tak Tertagih sebesar Rp ${Number(amount).toLocaleString('id-ID')}.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST MANUAL JOURNAL ENTRY WITH DOUBLE-ENTRY BALANCE VALIDATION
  app.post("/api/accounting/manual-entry", (req, res) => {
    try {
      const state = readDB();
      const { reference, description, lines } = req.body;

      if (!reference || !reference.trim()) {
        return res.status(400).json({ success: false, error: "Nomor Referensi jurnal manual wajib diisi." });
      }
      if (!description || !description.trim()) {
        return res.status(400).json({ success: false, error: "Memo/Deskripsi deskriptif jurnal manual wajib diisi." });
      }
      if (!lines || !Array.isArray(lines) || lines.length < 2) {
        return res.status(400).json({ success: false, error: "Jurnal manual minimal terdiri dari 2 entri baris (Double-Entry SAK Koperasiseimbang)." });
      }

      // Format & validation
      for (const line of lines) {
        if (!line.account_code) {
          return res.status(400).json({ success: false, error: "Setiap baris alokasi akun wajib memiliki Account Code SAK." });
        }
        const coaExists = STANDARD_COA.some(c => c.code === line.account_code);
        if (!coaExists) {
          return res.status(400).json({ success: false, error: `Account Code ${line.account_code} tidak ditemukan di Standar COA.` });
        }
        line.debit = Number(line.debit) || 0;
        line.credit = Number(line.credit) || 0;
        if (line.debit < 0 || line.credit < 0) {
          return res.status(400).json({ success: false, error: "Nilai Debit dan Kredit alokasi tidak boleh negatif." });
        }
        if (line.debit === 0 && line.credit === 0) {
          return res.status(400).json({ success: false, error: "Debit dan Kredit tidak boleh bersamaan nol dalam satu baris." });
        }
      }

      const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
      const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);

      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return res.status(400).json({ 
          success: false, 
          error: `Pencatatan gagal! Saldo tidak seimbang. Total Debit (Rp ${totalDebit.toLocaleString('id-ID')}) harus sama dengan Total Kredit (Rp ${totalCredit.toLocaleString('id-ID')}). Selisih: Rp ${Math.abs(totalDebit - totalCredit).toLocaleString('id-ID')}` 
        });
      }

      addJournalEntry(state, reference.trim(), description.trim(), lines);
      writeDB(state);

      res.json({ success: true, message: `Berhasil memposting Jurnal Manual ${reference} senilai Rp ${totalDebit.toLocaleString('id-ID')} ke dalam Buku Besar Koperasi SAK.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // MODUL LAPORAN AKUNTANSI (Date Range filters SAK)
  app.get("/api/accounting/reports", (req, res) => {
    try {
      const state = readDB();
      const { startDate, endDate } = req.query;

      const journalEntryLines = state.journalEntryLines || [];
      const journalEntries = state.journalEntries || [];

      let filteredLines = journalEntryLines;

      // Filter by date if specified
      if (startDate || endDate) {
        const sDate = startDate ? new Date(startDate as string) : new Date(0);
        const eDate = endDate ? new Date(endDate as string) : new Date();

        filteredLines = journalEntryLines.filter(line => {
          if (!line) return false;
          const entry = journalEntries.find(e => e && e.id === line.entry_id);
          if (!entry || !entry.date) return false;
          const entryDate = new Date(entry.date);
          return entryDate >= sDate && entryDate <= eDate;
        });
      }

      // A. NERACA SALDO (Trial Balance) -- Aggregation of Dr/Cr
      const trialBalance = STANDARD_COA.map(account => {
        let debitSum = 0;
        let creditSum = 0;

        filteredLines.forEach(line => {
          if (line && line.account_code === account.code) {
            debitSum += Number(line.debit) || 0;
            creditSum += Number(line.credit) || 0;
          }
        });

        // Calculate final balance based on normal balance
        let currentBalance = 0;
        if (account.normal_balance === 'DR') {
          currentBalance = debitSum - creditSum;
        } else {
          currentBalance = creditSum - debitSum;
        }

        return {
          code: account.code,
          name: account.name,
          type: account.type,
          normal_balance: account.normal_balance,
          debitTotal: debitSum,
          creditTotal: creditSum,
          endingBalance: currentBalance
        };
      });

      const totalDebits = trialBalance.reduce((sum, item) => sum + item.debitTotal, 0);
      const totalCredits = trialBalance.reduce((sum, item) => sum + item.creditTotal, 0);

      // B. LAPORAN LABA/RUGI (Income Statement) -- Revenue minus Expenses
      // Accounts: 4110 (Pendapatan Jasa), 4120 (Pendapatan UP)
      const revenueLines = trialBalance.filter(item => item && item.type === 'PENDAPATAN');
      const totalRevenue = revenueLines.reduce((sum, item) => sum + item.endingBalance, 0);
      const opexLines = trialBalance.filter(item => item && item.type === 'BEBAN');
      const totalExpense = opexLines.reduce((sum, item) => sum + item.endingBalance, 0);
      const netProfit = totalRevenue - totalExpense;

      // C. LAPORAN ARUS KAS (Cash Flow Statement)
      // Direct Cash Movements (Accounts: 1110 Kas Kecil, 1111 Kas Petugas, 1112 Kas Bank)
      const cashAccounts = ['1110', '1111', '1112'];
      const cashFlowDetails: any[] = [];
      let cashInflow = 0;
      let cashOutflow = 0;

      // Grouping by journal entries to find cash receipts vs disbursements
      journalEntries.forEach(entry => {
        if (!entry) return;
        const entryLines = journalEntryLines.filter(l => l && l.entry_id === entry.id);
        
        let cashInEntry = 0;
        let cashOutEntry = 0;

        entryLines.forEach(line => {
          if (line && cashAccounts.includes(line.account_code)) {
            cashInEntry += Number(line.debit) || 0;
            cashOutEntry += Number(line.credit) || 0;
          }
        });

        if (cashInEntry > 0 || cashOutEntry > 0) {
          cashInflow += cashInEntry;
          cashOutflow += cashOutEntry;
          cashFlowDetails.push({
            date: entry.date,
            reference: entry.reference,
            description: entry.description,
            inflow: cashInEntry,
            outflow: cashOutEntry,
            net: cashInEntry - cashOutEntry
          });
        }
      });

      // D. LAPORAN PERUBAHAN MODAL (Changes in Equity)
      // Modal Awal (3100) + Laba Bersih (3300/netProfit) - Prive = Modal Akhir
      const initialCapital = trialBalance.find(item => item && item.code === '3100')?.endingBalance || 0;
      const endingCapital = initialCapital + netProfit; // Prive = 0

      res.json({
        trialBalance: {
          accounts: trialBalance,
          totalDebits,
          totalCredits,
          isBalanced: Math.abs(totalDebits - totalCredits) < 0.05
        },
        incomeStatement: {
          revenues: revenueLines,
          totalRevenue,
          expenses: opexLines,
          totalExpense,
          netProfit
        },
        cashFlow: {
          activities: cashFlowDetails,
          totalInflow: cashInflow,
          totalOutflow: cashOutflow,
          netCashFlow: cashInflow - cashOutflow
        },
        capitalStatement: {
          initialCapital,
          netProfit,
          prive: 0,
          endingCapital
        }
      });
    } catch (err: any) {
      console.error("Gagal mengambil laporan akuntansi server-side error:", err);
      res.status(500).json({ error: "Gagal mengambil laporan akuntansi: " + (err.message || "Unknown error") });
    }
  });

  // Serve static UI assets
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[ERP-Backend] Server running securely on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Critical server starting failure", err);
});
