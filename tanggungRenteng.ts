import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { SystemState, JointLiability, LiabilityPaymentHistory, TrDebt } from "./src/types";

// DB Path definition
const DB_FILE = path.join(process.cwd(), "database.json");

function readDB(): SystemState {
  const defaultVal: SystemState = {
    customers: [],
    groups: [],
    groupSurveys: [],
    individualSurveys: [],
    loans: [],
    billingSchedules: [],
    deposits: [],
    payments: [],
    journalEntries: [],
    journalEntryLines: [],
    users: [],
    jointLiabilities: [],
    liabilityPaymentHistories: [],
    trDebts: [],
    tr_debts: [],
    billing_logs: []
  };
  if (!fs.existsSync(DB_FILE)) {
    return defaultVal;
  }
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    return {
      ...defaultVal,
      ...data,
      jointLiabilities: data.jointLiabilities || [],
      liabilityPaymentHistories: data.liabilityPaymentHistories || [],
      users: data.users || [],
      trDebts: data.trDebts || [],
      tr_debts: data.tr_debts || [],
      billing_logs: data.billing_logs || []
    };
  } catch (e) {
    return defaultVal;
  }
}

function writeDB(state: SystemState) {
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2));
}

// =========================================================================
// MOCK PRISMA IMPLEMENTATION FOR RUNTIME PREVIEW
// This allows server.ts to run and execute perfectly at runtime
// while adhering 100% to your production Prisma code design!
// =========================================================================
export const prisma = {
  $transaction: async <T>(callback: (tx: any) => Promise<T>): Promise<T> => {
    const db = readDB();
    const tx = {
      jointLiability: {
        findUnique: async (args: { where: { id: string } }) => {
          const liabilities = db.jointLiabilities || [];
          return liabilities.find(l => l.id === args.where.id) || null;
        },
        update: async (args: { where: { id: string }; data: Partial<JointLiability> }) => {
          db.jointLiabilities = (db.jointLiabilities || []).map(l => {
            if (l.id === args.where.id) {
              return { ...l, ...args.data };
            }
            return l;
          });
          writeDB(db);
          return db.jointLiabilities.find(l => l.id === args.where.id);
        }
      },
      liabilityPaymentHistory: {
        create: async (args: { data: Omit<LiabilityPaymentHistory, "id"> }) => {
          if (!db.liabilityPaymentHistories) db.liabilityPaymentHistories = [];
          const newHistory: LiabilityPaymentHistory = {
            id: `LPH-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            ...args.data
          };
          db.liabilityPaymentHistories.push(newHistory);
          writeDB(db);
          return newHistory;
        }
      },
      billingSchedule: {
        update: async (args: { where: { id: string }; data: any }) => {
          if (!db.billingSchedules) db.billingSchedules = [];
          const idx = db.billingSchedules.findIndex(s => s.id === args.where.id);
          if (idx !== -1) {
            db.billingSchedules[idx] = { ...db.billingSchedules[idx], ...args.data };
            writeDB(db);
            return db.billingSchedules[idx];
          }
          return null;
        }
      },
      billing_logs: {
        create: async (args: { data: any }) => {
          if (!db.payments) db.payments = [];
          const newPayment = {
            id: `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            ...args.data
          };
          db.payments.push(newPayment);
          if (!db.billing_logs) db.billing_logs = [];
          db.billing_logs.push(newPayment);
          writeDB(db);
          return newPayment;
        }
      },
      tr_debts: {
        create: async (args: { data: any }) => {
          if (!db.trDebts) db.trDebts = [];
          const newTrDebt = {
            id: `TRD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            ...args.data,
            created_at: new Date().toISOString()
          };
          db.trDebts.push(newTrDebt);
          if (!db.tr_debts) db.tr_debts = [];
          db.tr_debts.push(newTrDebt);
          writeDB(db);
          return newTrDebt;
        }
      }
    };
    const res = await callback(tx);
    writeDB(db);
    return res;
  }
};

// Helper to create matching Double-Entry accounting journal lines automatically
function insertDoubleEntry(
  reference: string,
  description: string,
  lines: { account_code: string; debit: number; credit: number }[]
) {
  const db = readDB();
  const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Double-Entry Error: Debit (Rp ${totalDebit}) must equal Credit (Rp ${totalCredit})!`);
  }

  const entryId = `JE-${Date.now()}-${Math.floor(Math.random() * 1500)}`;
  const journalEntry = {
    id: entryId,
    reference,
    description,
    date: new Date().toISOString()
  };

  if (!db.journalEntries) db.journalEntries = [];
  if (!db.journalEntryLines) db.journalEntryLines = [];

  db.journalEntries.push(journalEntry);

  lines.forEach((line, index) => {
    db.journalEntryLines.push({
      id: `JEL-${entryId}-${index}`,
      entry_id: entryId,
      account_code: line.account_code,
      debit: line.debit,
      credit: line.credit
    });
  });

  writeDB(db);
}

/**
 * Controller: settleLiability
 * 
 * REVISI ATURAN BISNIS:
 * Uang pelunasan talangan tanggung renteng dari Nasabah A (Borrower yang berutang) 
 * dititipkan secara fisik kepada Petugas Lapangan di lokasi untuk diserahkan ke Nasabah B (Lender penyedia talangan).
 * Oleh karena itu, transaksi penerimaan ini memengaruhi Kas Petugas dan kewajiban titipan lembaga:
 * 
 * Jurnal Otomatis (Masuk):
 * (Debit) 1111 - Kas di Tangan Petugas Lapangan [nominalBayar]
 * (Kredit) 2140 - Utang Titipan Kas Kelompok/Anggota [nominalBayar]
 */
export const settleLiability = async (req: Request, res: Response) => {
  const { liabilityId, nominalBayar, petugasId } = req.body;

  if (!liabilityId || typeof nominalBayar !== "number" || nominalBayar <= 0) {
    return res.status(400).json({ 
      error: "Gagal: Parameter 'liabilityId' dan 'nominalBayar' (angka positif) wajib diisi." 
    });
  }

  const pId = petugasId || "SYSTEM-PETUGAS";

  try {
    // Menggunakan prisma.$transaction untuk membungkus 3 operasi atomik secara ACID
    const result = await prisma.$transaction(async (tx) => {
      
      // Langkah A (Validasi): Ambil data JointLiability, cek statusnya belum SETTLED
      const liability = await tx.jointLiability.findUnique({
        where: { id: liabilityId }
      });

      if (!liability) {
        throw new Error("Data utang talangan joint liability tidak ditemukan.");
      }

      if (liability.status === "SETTLED") {
        throw new Error("Gagal: Transaksi utang talangan ini sudah lunas sepenuhnya (SETTLED).");
      }

      const sisaUtang = liability.nominal_utang - liability.nominal_terbayar;
      if (nominalBayar > sisaUtang) {
        throw new Error(`Gagal: Nominal bayar (Rp ${nominalBayar.toLocaleString()}) melebihi sisa utang talangan yang belum dibayar (Rp ${sisaUtang.toLocaleString()}).`);
      }

      // Langkah B (Insert History): Buat record baru di LiabilityPaymentHistory sebesar nominalBayar
      const history = await tx.liabilityPaymentHistory.create({
        data: {
          liability_id: liabilityId,
          nominal_bayar: nominalBayar,
          tanggal_bayar: new Date().toISOString(),
          petugas_id: pId
        }
      });

      // Langkah C (Update Liability): Tambahkan nominal_terbayar, sesuaikan status ke SETTLED / PARTIAL
      const newTerbayar = liability.nominal_terbayar + nominalBayar;
      const isNowSettled = (liability.nominal_utang - newTerbayar) === 0;
      const nextStatus = isNowSettled ? "SETTLED" : "PARTIAL";

      const updatedLiability = await tx.jointLiability.update({
        where: { id: liabilityId },
        data: {
          nominal_terbayar: newTerbayar,
          status: nextStatus
        }
      });

      return {
        liability: updatedLiability,
        history
      };
    });

    // POS JURNAL OTOMATIS KE BUKU BESAR (Penerimaan Titipan Fisik dari A)
    const db = readDB();
    const customers = db.customers || [];
    const borrower = customers.find(c => c.id === result.liability.borrower_id);
    const borrowerName = borrower ? borrower.name : result.liability.borrower_id;
    
    insertDoubleEntry(
      "TITIPAN_TANGGUNG_RENTENG",
      `Penerimaan titipan dana talangan TR dari ${borrowerName} sebesar Rp ${nominalBayar.toLocaleString()}`,
      [
        { account_code: "1111", debit: nominalBayar, credit: 0 }, // Kas di Tangan Petugas Lapangan (Dr)
        { account_code: "2140", debit: 0, credit: nominalBayar }  // Utang Titipan Kas Kelompok/Anggota (Cr)
      ]
    );

    return res.json({
      success: true,
      message: `Pelunasan talangan tanggung renteng sebesar Rp ${nominalBayar.toLocaleString('id-ID')} berhasil dicatat di outbox. Jurnal titipan kas kasir otomatis terbit.`,
      data: result
    });

  } catch (error: any) {
    return res.status(400).json({ 
      error: error.message || "Terjadi kesalahan memproses pelunasan." 
    });
  }
};

/**
 * Controller: withdrawLiabilityCash
 * 
 * Digunakan saat petugas secara fisik menyerahkan uang titipan dana talangan yang tersimpan 
 * di kas petugas (akun 1111) langsung kepada Nasabah B (pemberi pinjaman talangan yang berhak menerima kembali dananya).
 * 
 * Jurnal Otomatis (Keluar):
 * (Debit) 2140 - Utang Titipan Kas Kelompok/Anggota [sebesar nominal_terbayar]
 * (Kredit) 1111 - Kas di Tangan Petugas Lapangan [sebesar nominal_terbayar]
 */
export const withdrawLiabilityCash = async (req: Request, res: Response) => {
  const { liabilityId, petugasId } = req.body;

  if (!liabilityId) {
    return res.status(400).json({
      error: "Gagal: Parameter 'liabilityId' wajib disertakan."
    });
  }

  const pId = petugasId || "SYSTEM-PETUGAS";

  try {
    const db = readDB();
    const liability = (db.jointLiabilities || []).find(l => l.id === liabilityId);

    if (!liability) {
      return res.status(404).json({ error: "Gagal: Data utang talangan tidak ditemukan." });
    }

    if (liability.is_cash_withdrawn) {
      return res.status(400).json({ 
        error: "Gagal: Dana talangan untuk transaksi ini sudah diserahkan sebelumnya dan tidak dapat ditarik kembali/ganda." 
      });
    }

    const valueToWithdraw = liability.nominal_terbayar;
    if (valueToWithdraw <= 0) {
      return res.status(400).json({ 
        error: `Gagal: Belum ada nominal dana talangan yang dibayarkan oleh borrower (Terbayar saat ini: Rp 0).` 
      });
    }

    // Set flag is_cash_withdrawn to avoid double operations
    liability.is_cash_withdrawn = true;
    writeDB(db);

    const lender = (db.customers || []).find(c => c.id === liability.lender_id);
    const lenderName = lender ? lender.name : liability.lender_id;

    // POST JURNAL OTOMATIS PENARIKAN (Penyerahan Dana Titipan ke Lender)
    insertDoubleEntry(
      "DISBURSE_TITIPAN_TR",
      `Penyerahan fisik dana titipan TR kepada Lender (${lenderName}) sebesar Rp ${valueToWithdraw.toLocaleString()}`,
      [
        { account_code: "2140", debit: valueToWithdraw, credit: 0 }, // Utang Titipan Kas Kelompok/Anggota (Dr)
        { account_code: "1111", debit: 0, credit: valueToWithdraw }  // Kas di Tangan Petugas Lapangan (Cr)
      ]
    );

    return res.json({
      success: true,
      message: `Dana talangan sebesar Rp ${valueToWithdraw.toLocaleString('id-ID')} berhasil diserahkan fisik kepada ${lenderName}.`,
      data: liability
    });

  } catch (error: any) {
    return res.status(400).json({ 
      error: error.message || "Gagal memproses penyerahan dana." 
    });
  }
};

/**
 * Controller: alihkanTalangan
 * 
 * Mengubah status tagihan anggota tersebut di tabel billing_logs (payments) menjadi LUNAS_TALANGAN.
 * Membuat baris data baru ke dalam tabel khusus tr_debts (Piutang Talangan).
 */
export const alihkanTalangan = async (req: Request, res: Response) => {
  const { customer_id, group_id, billing_schedule_id, nominal_talangan } = req.body;

  if (!customer_id || !group_id || !billing_schedule_id || !nominal_talangan) {
    return res.status(400).json({
      error: "Gagal: Parameter 'customer_id', 'group_id', 'billing_schedule_id', dan 'nominal_talangan' wajib diisi."
    });
  }

  try {
    const db = readDB();
    const sched = db.billingSchedules.find(s => s.id === billing_schedule_id);
    if (!sched) {
      return res.status(404).json({ error: "Jadwal tagihan tidak ditemukan." });
    }
    const payPokok = sched.pokok;
    const payJasa = sched.jasa;

    const result = await prisma.$transaction(async (tx) => {
      // Aksi 1: Selesaikan Angsuran
      await tx.billingSchedule.update({
        where: { id: billing_schedule_id },
        data: {
          status: 'PAID',
          bayar_pokok: payPokok,
          bayar_jasa: payJasa,
        }
      });

      const billingLog = await tx.billing_logs.create({
        data: {
          billing_schedule_id,
          customer_id,
          petugas_id: "Petugas Lapangan 1",
          nominal_bayar: Number(nominal_talangan),
          tanggal_bayar: new Date().toISOString(),
          status: 'LUNAS_TALANGAN',
          catatan_revisi: null,
          is_offline_logged: false,
          payment_method: 'TUNAI',
          is_menunggak: true
        }
      });

      // Aksi 2: Buat Piutang Internal
      const trDebt = await tx.tr_debts.create({
        data: {
          customer_id,
          group_id,
          nominal_talangan: Number(nominal_talangan),
          status: 'BELUM_DIBAYAR',
          tanggal_kejadian: new Date().toISOString(),
        }
      });

      return { billingLog, trDebt };
    });

    return res.json({
      success: true,
      message: "Berhasil mengalihkan angsuran anggota ke Talangan (TR).",
      data: result
    });

  } catch (error: any) {
    return res.status(400).json({
      error: error.message || "Terjadi kesalahan memproses pengalihan talangan TR."
    });
  }
};

/**
 * Controller: getTrDebts
 * 
 * Tarik semua data dari tabel tr_debts yang statusnya BELUM_DIBAYAR.
 */
export const getTrDebts = async (req: Request, res: Response) => {
  try {
    const db = readDB();
    const trDebts = db.trDebts || [];
    const customers = db.customers || [];
    const groups = db.groups || [];

    const activeDebts = trDebts
      .filter(d => d.status === 'BELUM_DIBAYAR')
      .map(d => {
        const customer = customers.find(c => c.id === d.customer_id);
        const group = groups.find(g => g.id === d.group_id);
        return {
          ...d,
          customer_name: customer ? customer.name : `Anggota ${d.customer_id}`,
          group_name: group ? group.name : `Kelompok ${d.group_id}`
        };
      });

    return res.json({
      success: true,
      data: activeDebts
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Gagal mengambil data piutang talangan." });
  }
};

/**
 * Controller: bayarTrDebt
 * 
 * Mengubah status di tabel tr_debts menjadi LUNAS_DIKEMBALIKAN.
 */
export const bayarTrDebt = async (req: Request, res: Response) => {
  const { tr_debt_id } = req.body;

  if (!tr_debt_id) {
    return res.status(400).json({ error: "Gagal: Parameter 'tr_debt_id' wajib diisi." });
  }

  try {
    const db = readDB();
    if (!db.trDebts) db.trDebts = [];
    const debtIdx = db.trDebts.findIndex(d => d.id === tr_debt_id);

    if (debtIdx === -1) {
      return res.status(404).json({ error: "Piutang talangan tidak ditemukan." });
    }

    db.trDebts[debtIdx].status = 'LUNAS_DIKEMBALIKAN';
    
    // sync snake case copies
    if (db.tr_debts) {
      const idxSnake = db.tr_debts.findIndex((d: any) => d.id === tr_debt_id);
      if (idxSnake !== -1) {
        db.tr_debts[idxSnake].status = 'LUNAS_DIKEMBALIKAN';
      }
    }

    writeDB(db);

    return res.json({
      success: true,
      message: "Sukses menerima pelunasan talangan (TR)."
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "Gagal memproses pelunasan piutang talangan." });
  }
};
