/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Smartphone, BookOpen, ShieldCheck, DollarSign, RefreshCw } from 'lucide-react';

interface RoleSelectorProps {
  currentRole: 'Petugas' | 'SPV' | 'Admin' | 'Kasir';
  onRoleChange: (role: 'Petugas' | 'SPV' | 'Admin' | 'Kasir') => void;
  onResetDatabase: () => void;
  isResetting: boolean;
}

export default function RoleSelector({ 
  currentRole, 
  onRoleChange, 
  onResetDatabase,
  isResetting 
}: RoleSelectorProps) {
  const roles = [
    {
      id: 'Petugas' as const,
      title: 'Petugas Lapangan',
      device: 'Mobile App Emulasi (Offline-First)',
      color: 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100',
      activeColor: 'bg-emerald-600 text-white border-emerald-600',
      icon: Smartphone,
      permissions: ['Input Berkas Masuk', 'Survei Kelompok & Individu', 'Penagihan Lapangan (Offline SIM)']
    },
    {
      id: 'SPV' as const,
      title: 'Supervisor (SPV)',
      device: 'Dashboard Web',
      color: 'bg-indigo-50 border-indigo-200 text-indigo-800 hover:bg-indigo-100',
      activeColor: 'bg-indigo-600 text-white border-indigo-600',
      icon: ShieldCheck,
      permissions: ['Verifikasi Berkas Masuk (SPV Cek)', 'Otoritas Tunggal Pencairan Dana']
    },
    {
      id: 'Admin' as const,
      title: 'Administrator',
      device: 'Dashboard Web',
      color: 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100',
      activeColor: 'bg-amber-600 text-white border-amber-600',
      icon: BookOpen,
      permissions: ['Verifikasi Akhir Berkas (Adm)', 'Audit Laporan Akuntansi Laba/Rugi SAK']
    },
    {
      id: 'Kasir' as const,
      title: 'Kasir Utama',
      device: 'Dashboard Web',
      color: 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100',
      activeColor: 'bg-rose-600 text-white border-rose-600',
      icon: DollarSign,
      permissions: ['Verifikasi Setoran Harian Petugas', 'Approve Terima Kas / Tolak & Minta Revisi']
    }
  ];

  return (
    <div id="role-selector-container" className="bg-white border border-slate-150 rounded-2xl p-6 shadow-sm mb-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-950">
            Sandbox Simulasi Peran Mikro (RBAC & SAK)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Ganti peran interaktif di bawah ini untuk melihat batasan menu, state machine, dan aliran posting akuntansi secara langsung.
          </p>
        </div>
        <button
          id="btn-reset-db"
          onClick={onResetDatabase}
          disabled={isResetting}
          className="flex items-center gap-2 px-4 py-2 text-xs font-medium font-sans bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950 disabled:bg-slate-300 rounded-lg transition-colors cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isResetting ? 'animate-spin' : ''}`} />
          {isResetting ? 'Merestart...' : 'Reset State Database'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {roles.map((role) => {
          const Icon = role.icon;
          const isActive = currentRole === role.id;
          return (
            <button
              id={`role-btn-${role.id}`}
              key={role.id}
              onClick={() => onRoleChange(role.id)}
              className={`flex flex-col text-left p-4 rounded-xl border transition-all cursor-pointer ${
                isActive 
                  ? `${role.activeColor} shadow-md scale-[1.02]` 
                  : `${role.color} border-slate-200`
              }`}
            >
              <div className="flex justify-between items-start w-full">
                <span className={`p-2 rounded-lg ${isActive ? 'bg-white/20' : 'bg-white shadow-xs'}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-full ${
                  isActive ? 'bg-white/30 text-white' : 'bg-slate-200/60 text-slate-600'
                }`}>
                  {role.device}
                </span>
              </div>
              <h3 className="font-display font-semibold mt-3 text-sm">{role.title}</h3>
              <div className="mt-3 flex-1">
                <p className={`text-[11px] font-sans font-medium uppercase tracking-wider mb-1 ${
                  isActive ? 'text-white/80' : 'text-slate-500'
                }`}>
                  Menu Akses &amp; Otoritas:
                </p>
                <ul className="space-y-1">
                  {role.permissions.map((p, i) => (
                    <li key={i} className={`text-[11px] list-disc list-inside ${isActive ? 'text-white/90' : 'text-slate-600'}`}>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
