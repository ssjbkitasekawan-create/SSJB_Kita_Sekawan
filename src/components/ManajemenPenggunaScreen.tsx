import React, { useState, useEffect } from 'react';
import { 
  User, 
  Group, 
  SystemState 
} from '../types';
import { 
  UserCheck, 
  Plus, 
  Edit2, 
  Trash2, 
  Lock, 
  Calendar, 
  Users, 
  MapPin, 
  Check, 
  X, 
  RefreshCcw, 
  AlertCircle,
  Shield,
  Clock
} from 'lucide-react';

interface ManajemenPenggunaScreenProps {
  systemState: SystemState | null;
  onRefreshParent: () => void;
  triggerSuccess: (msg: string) => void;
  triggerError: (msg: string) => void;
  activeRole: string;
  activeBranch?: 'ALL' | 'PUSAT' | 'KC_MATIM';
  setActiveBranch?: (branch: 'ALL' | 'PUSAT' | 'KC_MATIM') => void;
}

export default function ManajemenPenggunaScreen({
  systemState,
  onRefreshParent,
  triggerSuccess,
  triggerError,
  activeRole,
  activeBranch = 'ALL',
  setActiveBranch
}: ManajemenPenggunaScreenProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [activeTab, setActiveTab] = useState<'profil_pengguna' | 'matriks_kerja'>('profil_pengguna');

  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    if (activeRole !== 'super_admin') {
      return activeBranch === 'KC_MATIM' ? 'KC_MATIM' : 'PUSAT';
    }
    return activeBranch || 'ALL';
  });

  // Sync state if activeRole changes or inactive branch lock
  useEffect(() => {
    if (activeRole !== 'super_admin') {
      const lockedVal = activeBranch === 'KC_MATIM' ? 'KC_MATIM' : 'PUSAT';
      setSelectedBranch(lockedVal);
    } else if (activeBranch) {
      setSelectedBranch(activeBranch);
    }
  }, [activeRole, activeBranch]);

  // Handle local branch change
  const handleBranchChange = (newVal: string) => {
    setSelectedBranch(newVal);
    if (setActiveBranch && (newVal === 'ALL' || newVal === 'PUSAT' || newVal === 'KC_MATIM')) {
      setActiveBranch(newVal as any);
    }
  };

  // Form New User State
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [formNama, setFormNama] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formRole, setFormRole] = useState<'petugas' | 'spv' | 'admin' | 'kasir' | 'super_admin'>('petugas');
  const [formStatus, setFormStatus] = useState<'AKTIF' | 'NON_AKTIF'>('AKTIF');
  const [formPassword, setFormPassword] = useState('');
  const [formCabang, setFormCabang] = useState<'PUSAT' | 'KC_MATIM'>('PUSAT');

  // Editing User State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Assignment Modal/Form State
  const [selectedPetugasId, setSelectedPetugasId] = useState<string>('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<'SENIN' | 'SELASA' | 'RABU' | 'KAMIS' | 'JUMAT' | 'SABTU'>('SENIN');
  const [submittingAssignment, setSubmittingAssignment] = useState(false);

  // Fetch users list dynamically with branch parameter
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const token = localStorage.getItem('erp_token') || 'sim-jwt.eyJ1c2VySWQiOiJTVVBFUl9BRE1JTiIsInJvbGUiOiJzdXBlcl9hZG1pbiJ9';
      const res = await fetch(`/api/users?cabang=${selectedBranch}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
      } else {
        triggerError(data.error || 'Gagal memuat daftar pengguna.');
      }
    } catch (e) {
      console.error(e);
      triggerError('Koneksi terputus. Gagal mengambil daftar pengguna.');
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [selectedBranch]);

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNama || !formUsername) {
      triggerError('Harap lengkapi field Nama dan Username.');
      return;
    }

    try {
      const token = localStorage.getItem('erp_token') || 'sim-jwt.eyJ1c2VySWQiOiJTVVBFUl9BRE1JTiIsInJvbGUiOiJzdXBlcl9hZG1pbiJ9';
      // If super admin creating, use formCabang selection, otherwise use active/locked branch
      const userCabang = activeRole === 'super_admin' ? formCabang : selectedBranch;

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          nama: formNama,
          username: formUsername,
          password: formPassword || 'petugas123',
          role: formRole,
          status_aktif: formStatus,
          kantor_cabang: userCabang === 'ALL' ? 'PUSAT' : userCabang
        })
      });

      const data = await res.json();
      if (data.success) {
        triggerSuccess(`Akun ${formNama} berhasil didaftarkan!`);
        setIsAddingUser(false);
        setFormNama('');
        setFormUsername('');
        setFormPassword('');
        setFormRole('petugas');
        setFormStatus('AKTIF');
        fetchUsers();
        onRefreshParent();
      } else {
        triggerError(data.error || 'Gagal mendaftarkan user baru.');
      }
    } catch (e) {
      triggerError('Kesalahan jaringan saat mendaftarkan user.');
    }
  };

  const handleUpdateUserStatus = async (userId: string, newStatus: 'AKTIF' | 'NON_AKTIF') => {
    if (userId === "SUPER_ADMIN" && newStatus === 'NON_AKTIF') {
      triggerError('Proteksi Master: Akun SUPER_ADMIN tidak diperkenankan untuk dinonaktifkan.');
      return;
    }

    try {
      const token = localStorage.getItem('erp_token') || 'sim-jwt.eyJ1c2VySWQiOiJTVVBFUl9BRE1JTiIsInJvbGUiOiJzdXBlcl9hZG1pbiJ9';
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          status_aktif: newStatus
        })
      });

      const data = await res.json();
      if (data.success) {
        triggerSuccess(`Status user berhasil diperbarui menjadi ${newStatus}`);
        fetchUsers();
        onRefreshParent();
      } else {
        triggerError(data.error || 'Gagal memperbarui status user.');
      }
    } catch (e) {
      triggerError('Gagal melakukan update status user.');
    }
  };

  const handleDeleteUser = async (userId: string, userNama: string) => {
    if (userId === "SUPER_ADMIN") {
      triggerError('Proteksi Master: Akun SUPER_ADMIN bersifat absolut dan tidak dapat dihapus.');
      return;
    }

    if (!window.confirm(`Apakah Anda yakin ingin menghapus user "${userNama}" secara permanen? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }

    try {
      const token = localStorage.getItem('erp_token') || 'sim-jwt.eyJ1c2VySWQiOiJTVVBFUl9BRE1JTiIsInJvbGUiOiJzdXBlcl9hZG1pbiJ9';
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (data.success) {
        triggerSuccess(`User ${userNama} berhasil dihapus dari sistem.`);
        fetchUsers();
        onRefreshParent();
      } else {
        triggerError(data.error || 'Gagal menghapus user.');
      }
    } catch (e) {
      triggerError('Kesalahan koneksi saat menghapus user.');
    }
  };

  const handleSaveAssignmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId || !selectedPetugasId || !selectedDay) {
      triggerError('Harap pilih Petugas, Kelompok, dan Hari Kerja.');
      return;
    }

    setSubmittingAssignment(true);
    try {
      const token = localStorage.getItem('erp_token') || 'sim-jwt.eyJ1c2VySWQiOiJTVVBFUl9BRE1JTiIsInJvbGUiOiJzdXBlcl9hZG1pbiJ9';
      const res = await fetch('/api/users/assign-group', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          group_id: selectedGroupId,
          assigned_user_id: selectedPetugasId,
          hari_penagihan: selectedDay
        })
      });

      const data = await res.json();
      if (data.success) {
        triggerSuccess(`Penugasan berhasil disimpan! Kelompok kini dialokasikan ke Petugas pada hari ${selectedDay}.`);
        setSelectedGroupId('');
        onRefreshParent();
      } else {
        triggerError(data.error || 'Gagal menyimpan penugasan kelompok harian.');
      }
    } catch (e) {
      triggerError('Kesalahan koneksi saat menyimpan penugasan harian.');
    } finally {
      setSubmittingAssignment(false);
    }
  };

  // Get field officers (petugas)
  const officersList = users.filter(u => u.role === 'petugas');
  const allGroups = systemState?.groups || [];

  // Group harian mapping
  const daysOfWeek = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'] as const;

  return (
    <div className="space-y-6 animate-fade-in" id="manajemen_pengguna_screen">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-purple-800 to-indigo-800 text-white rounded-xl p-6 shadow-md relative overflow-hidden">
        <div className="absolute right-4 bottom-4 opacity-10">
          <UserCheck size={180} />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 bg-purple-500 text-[10px] uppercase font-mono font-bold rounded-full border border-purple-400">
              Control Panel (Super Admin)
            </span>
          </div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-2">
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2 font-display">
              <UserCheck size={26} />
              MANAJEMEN PENGGUNA & MATRIX HAK AKSES
            </h2>
            
            {/* Branch Switcher Dropdown */}
            <div className="flex items-center gap-1.5 bg-purple-950/40 border border-purple-400/30 px-3 py-1.5 rounded-xl w-fit" id="branch_switcher_wrapper_local_users">
              <span className="text-xs font-bold text-white flex items-center gap-1">
                📍 Lokasi Kerja:
              </span>
              {activeRole === 'super_admin' ? (
                <select
                  value={selectedBranch}
                  onChange={(e) => handleBranchChange(e.target.value)}
                  className="text-xs font-bold bg-white text-slate-800 border border-purple-600 rounded px-2.5 py-1 focus:outline-none cursor-pointer"
                  id="branch_select_local_users"
                >
                  <option value="ALL">🏢 Semua Cabang</option>
                  <option value="PUSAT">🏢 Pusat</option>
                  <option value="KC_MATIM">📍 KC Manggarai Timur</option>
                </select>
              ) : (
                <span className="text-xs font-bold text-white bg-purple-950/60 px-2.5 py-1 rounded border border-purple-800/50 font-mono">
                  {selectedBranch === 'KC_MATIM' ? '📍 KC Manggarai Timur' : '🏢 Pusat'}
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-purple-100 max-w-2xl mt-2 animate-fade-in">
            Sistem pengawasan otorisasi hak akses petugas di lapangan. Mengubah pola pembagian statis wilayah menjadi 
            <strong> Penugasan Kelompok Harian (Senin - Sabtu)</strong> untuk mendukung penanganan fleksibel serta 
            skala penugasan dinamis.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-xl p-1 shadow-sm gap-1">
        <button
          onClick={() => setActiveTab('profil_pengguna')}
          className={`flex-1 py-3 text-xs font-bold rounded-lg transition flex items-center justify-center gap-2 ${
            activeTab === 'profil_pengguna'
              ? 'bg-purple-900 text-white shadow'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Users size={15} />
          PROFILE & MASTER USER
        </button>
        <button
          onClick={() => setActiveTab('matriks_kerja')}
          className={`flex-1 py-3 text-xs font-bold rounded-lg transition flex items-center justify-center gap-2 ${
            activeTab === 'matriks_kerja'
              ? 'bg-purple-900 text-white shadow'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Calendar size={15} />
          MATRIKS KERJA PETUGAS (SENIN - SABTU)
        </button>
      </div>

      {/* TAB CONTENT 1: USER PROFILE MANAGEMENT */}
      {activeTab === 'profil_pengguna' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6" id="panel_user_profile">
          
          {/* Add / Edit Form panel */}
          <div className="xl:col-span-1 bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Shield size={16} className="text-purple-700" />
                Daftar Akun Baru
              </h3>
              <button 
                onClick={fetchUsers} 
                className="text-slate-500 hover:text-slate-850 p-1 rounded hover:bg-slate-100 transition"
                title="Refresh Daftar User"
              >
                <RefreshCcw size={14} className={loadingUsers ? "animate-spin" : ""} />
              </button>
            </div>

            <form onSubmit={handleAddUserSubmit} className="space-y-4" id="form_add_user">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Nama Lengkap Petugas</label>
                <input 
                  type="text" 
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-purple-500 bg-slate-50"
                  placeholder="Contoh: Heri Darmawan"
                  value={formNama}
                  onChange={e => setFormNama(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Username / NIK Login</label>
                <input 
                  type="text" 
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-purple-500 bg-slate-50"
                  placeholder="Contoh: petugas12"
                  value={formUsername}
                  onChange={e => setFormUsername(e.target.value)}
                  required
                />
                <span className="text-[10px] text-slate-450 mt-1 block">Username ini digunakan untuk login di Mobile maupun Web.</span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Password Akses</label>
                <input 
                  type="password" 
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-purple-500 bg-slate-50"
                  placeholder="Kosongkan untuk default: petugas123"
                  value={formPassword}
                  onChange={e => setFormPassword(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Hak Akses Role</label>
                  <select
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-purple-500 bg-slate-50"
                    value={formRole}
                    onChange={e => setFormRole(e.target.value as any)}
                  >
                    <option value="petugas">Petugas Lapangan</option>
                    <option value="spv">Supervisor (SPV)</option>
                    <option value="kasir">Kasir</option>
                    <option value="admin">Administrator</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Cabang Kerja</label>
                  <select
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-purple-500 bg-slate-50"
                    value={formCabang}
                    onChange={e => setFormCabang(e.target.value as any)}
                  >
                    <option value="PUSAT">Pusat</option>
                    <option value="KC_MATIM">KC Manggarai Timur</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Status Aktif</label>
                  <select
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-purple-500 bg-slate-50"
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value as any)}
                  >
                    <option value="AKTIF">AKTIF</option>
                    <option value="NON_AKTIF">NON-AKTIF</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                id="btn_submit_add_user"
                className="w-full py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 border border-purple-655"
              >
                <Plus size={14} />
                DAFTARKAN PENGGUNA BARU
              </button>
            </form>

            <div className="bg-purple-50 border border-purple-150 p-3 rounded-lg text-[10.5px] text-purple-900 leading-relaxed">
              <span className="font-bold flex items-center gap-1 mb-1">
                <AlertCircle size={12} className="text-purple-700 shrink-0" />
                Catatan Keamanan Super
              </span>
              User baru yang didaftarkan langsung terstruktur kedalam master database. Petugas lapangan tidak perlu dikaitkan secara statis ke wilayah tertentu karena penentuan wilayah dilakukan secara harian berbasis kelompok kerja.
            </div>
          </div>

          {/* Users Table list */}
          <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Daftar Akun Pengguna</h3>
                <p className="text-[10px] text-slate-500">Total terdaftar: {users.length} akun dalam sistem ERP</p>
              </div>
              <span className="px-2 py-0.5 bg-slate-200 text-[9px] font-mono font-bold rounded text-slate-700 uppercase">
                RBAC ATURAN SUPER
              </span>
            </div>

            {loadingUsers ? (
              <div className="p-10 text-center text-slate-500 text-xs">
                <RefreshCcw className="animate-spin inline mr-2 text-purple-700" size={16} />
                Memuat basis data pengguna...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11.5px] text-left">
                  <thead className="bg-slate-100 text-slate-600 uppercase text-[9px] font-mono border-b border-slate-200">
                    <tr>
                      <th className="p-3">Nama Pengguna</th>
                      <th className="p-3">NIK / Username</th>
                      <th className="p-3">Role Otorisasi</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Tindakan Keamanan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map(u => {
                      const isSuperUser = u.id === 'SUPER_ADMIN';
                      return (
                        <tr key={u.id} className="hover:bg-slate-50 transition">
                          <td className="p-3 font-semibold text-slate-800">
                            <div className="flex items-center gap-2">
                              {isSuperUser ? <Lock size={12} className="text-purple-600 inline shrink-0" /> : null}
                              <span>{u.nama}</span>
                            </div>
                            {selectedBranch === 'ALL' && (
                              <div className="mt-1">
                                {(!u.kantor_cabang || u.kantor_cabang.toUpperCase() === 'PUSAT' || u.kantor_cabang.toUpperCase() === 'ALL') ? (
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 border border-blue-200 rounded text-[9px] font-bold uppercase inline-block">
                                    [Pusat]
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[9px] font-bold uppercase inline-block font-mono">
                                    [KC MATIM]
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-3 font-mono text-slate-500">{u.nik}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              u.role === 'super_admin' ? 'bg-purple-100 text-purple-800' :
                              u.role === 'admin' ? 'bg-blue-105 text-blue-800' :
                              u.role === 'spv' ? 'bg-emerald-100 text-emerald-800' :
                              u.role === 'kasir' ? 'bg-teal-100 text-teal-800' :
                              'bg-amber-100 text-amber-805'
                            }`}>
                              {u.role.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleUpdateUserStatus(u.id, u.status_aktif === 'NON_AKTIF' ? 'AKTIF' : 'NON_AKTIF')}
                              disabled={isSuperUser}
                              className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold border transition ${
                                isSuperUser ? 'bg-purple-50 text-purple-700 border-purple-200 cursor-not-allowed' :
                                u.status_aktif === 'AKTIF' || !u.status_aktif
                                  ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'
                              }`}
                            >
                              {u.status_aktif === 'NON_AKTIF' ? 'NON-AKTIF' : 'AKTIF'}
                            </button>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isSuperUser ? (
                                <span className="text-[10px] text-purple-700 font-mono font-bold flex items-center gap-1 bg-purple-50 px-2 py-0.5 rounded border border-purple-150">
                                  <Lock size={10} />
                                  LOCKED MASTER
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleDeleteUser(u.id, u.nama)}
                                  className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-100 transition"
                                  title="Hapus Pengguna"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: WORKING KALENDER / MATRIX (Senin - Sabtu for 11 officers) */}
      {activeTab === 'matriks_kerja' && (
        <div className="space-y-6" id="panel_matriks_kerja">
          
          {/* Assignment Quick tool form */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-3">
              <Calendar size={16} className="text-purple-700" />
              Alokasikan Penugasan Kelompok Harian
            </h3>
            <form onSubmit={handleSaveAssignmentSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end" id="form_assign_group_day">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Pilih Petugas (11 Petugas)</label>
                <select
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-slate-50 focus:outline-purple-500"
                  value={selectedPetugasId}
                  onChange={e => setSelectedPetugasId(e.target.value)}
                  required
                >
                  <option value="">-- Pilih Petugas Lapangan --</option>
                  {officersList.map(o => (
                    <option key={o.id} value={o.id}>{o.nama} ({o.nik})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Kelompok Kerja</label>
                <select
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-slate-50 focus:outline-purple-500"
                  value={selectedGroupId}
                  onChange={e => setSelectedGroupId(e.target.value)}
                  required
                >
                  <option value="">-- Pilih Kelompok --</option>
                  {allGroups.map(g => {
                    const linkedUser = users.find(u => u.id === g.assigned_user_id);
                    return (
                      <option key={g.id} value={g.id}>
                        {g.name} (Tanggung Renteng: {g.sistem_tanggung_renteng ? 'Ya' : 'Tidak'}) {g.hari_penagihan ? `[${g.hari_penagihan} - ${linkedUser?.nama || 'Tanpa Petugas'}]` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Hari Kerja Penagihan</label>
                <select
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-slate-50 focus:outline-purple-500"
                  value={selectedDay}
                  onChange={e => setSelectedDay(e.target.value as any)}
                  required
                >
                  {daysOfWeek.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={submittingAssignment}
                id="btn_submit_assign_group"
                className="w-full py-2.5 bg-purple-700 hover:bg-purple-800 disabled:bg-purple-400 text-white font-bold rounded-lg text-xs transition flex items-center justify-center gap-1.5 shadow-sm border border-purple-600"
              >
                {submittingAssignment ? (
                  <>
                    <RefreshCcw size={13} className="animate-spin" />
                    Menyinkronkan...
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    SIMPAN & OUT PRE-SYNC
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Matrix Grid Visualization */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden" id="matrix_visualization_card">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                  <Clock size={15} className="text-purple-700" />
                  Kalender Matriks Kerja Penugasan
                </h3>
                <p className="text-[10px] text-slate-500">Mengevaluasi densitas beban penugasan 11 Petugas Lapangan (Senin sampai Sabtu)</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-purple-100 border border-purple-300 rounded inline-block"></span>
                <span className="text-[10px] font-semibold text-slate-600">Terjadwal Kerja harian</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-600 uppercase text-[9.5px] font-mono border-b border-slate-200">
                  <tr>
                    <th className="p-3 border-r border-slate-200 bg-slate-150 font-bold text-slate-800 w-44 shrink-0">Petugas Lapangan</th>
                    {daysOfWeek.map(d => (
                      <th key={d} className="p-3 text-center border-r border-slate-200 font-bold min-w-32">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {officersList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-slate-400 text-xs">
                        Belum ada petugas lapangan terdaftar. Gunakan Tab "Profile & Master User" untuk membuat akun baru.
                      </td>
                    </tr>
                  ) : (
                    officersList.map(officer => {
                      return (
                        <tr key={officer.id} className="hover:bg-slate-50 transition">
                          {/* Officer Info Cell */}
                          <td className="p-3 font-semibold text-slate-800 border-r border-slate-200 bg-slate-50">
                            <div className="leading-tight">{officer.nama}</div>
                            <div className="text-[9.5px] text-slate-450 font-mono mt-0.5">{officer.nik}</div>
                          </td>

                          {/* Day Columns */}
                          {daysOfWeek.map(day => {
                            // Find groups assigned to this officer on this day
                            const assignedGroups = allGroups.filter(
                              g => g.assigned_user_id === officer.id && g.hari_penagihan === day
                            );

                            const hasTask = assignedGroups.length > 0;

                            return (
                              <td 
                                key={day} 
                                className={`p-2.5 border-r border-slate-200 transition text-center ${
                                  hasTask ? 'bg-purple-50/70' : ''
                                }`}
                              >
                                {hasTask ? (
                                  <div className="space-y-1.5">
                                    {assignedGroups.map(gk => (
                                      <div 
                                        key={gk.id} 
                                        className="p-1.5 bg-white border border-purple-300 rounded text-[10px] text-purple-900 font-medium text-left shadow-xs flex flex-col"
                                      >
                                        <span className="font-bold flex items-center gap-1">
                                          <Users size={10} className="text-purple-700" />
                                          {gk.name}
                                        </span>
                                        <span className="text-[9px] text-slate-500 font-mono mt-0.5">
                                          ID: {gk.id}
                                        </span>
                                        <span className="text-[9px] text-emerald-700 font-semibold mt-0.5">
                                          Renteng: {gk.sistem_tanggung_renteng ? 'Ya' : 'Tidak'}
                                        </span>
                                      </div>
                                    ))}
                                    <div className="text-[9px] font-bold text-purple-700 font-mono">
                                      {assignedGroups.length} Kelompok Kerja
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 font-mono text-[10px] italic">OFF / Kosong</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Matrix summary */}
            <div className="p-4 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center text-[10.5px] text-slate-500">
              <span>* Data matriks tersinkronisasi langsung secara real-time ke aplikasi smartphone masing-masing petugas.</span>
              <span className="font-mono font-bold text-slate-700">6 Hari Kerja (SENIN s/d SABTU)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
