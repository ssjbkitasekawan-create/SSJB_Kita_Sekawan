import React, { useState } from 'react';
import { 
  Eye, 
  EyeOff, 
  ChevronLeft, 
  Wifi, 
  Signal, 
  Battery, 
  CheckCircle, 
  AlertCircle,
  HelpCircle,
  User,
  KeyRound,
  Mail,
  Shield,
  Briefcase
} from 'lucide-react';

interface WebLoginScreenProps {
  onLoginSuccess: (user: any, token: string) => void;
  triggerSuccess: (msg: string) => void;
  triggerError: (msg: string) => void;
}

export default function WebLoginScreen({
  onLoginSuccess,
  triggerSuccess,
  triggerError
}: WebLoginScreenProps) {
  // Navigation states: 'login' | 'register'
  const [viewMode, setViewMode] = useState<'login' | 'register'>('login');

  // Login variables
  const [nik, setNik] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Registration variables
  const [regEmpId, setRegEmpId] = useState('');
  const [regNama, setRegNama] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regNik, setRegNik] = useState('');
  const [regRole, setRegRole] = useState<'petugas' | 'spv' | 'admin' | 'kasir' | 'super_admin'>('petugas');
  const [regPassword, setRegPassword] = useState('');
  const [regShowPassword, setRegShowPassword] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // Lupa Password Modal state
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Quick Account selector for testing
  const demoAccounts = [
    { name: 'Sekawan Owner (Full Access)', role: 'super_admin', nik: 'ptsekawansejahterabersama@gmail.com', pass: 'sekawan123', desc: 'Main Authority Super Administrator' },
    { name: 'Siti Rahma (Administrator)', role: 'admin', nik: 'admin123', pass: 'admin123', desc: 'Approval Akhir & Pembukuan Kas' },
    { name: 'Siti Aminah (Supervisor)', role: 'spv', nik: 'spv123', pass: 'spv123', desc: 'Verifikasi Berkas & Pencairan' },
    { name: 'Cathy Amelia (Kasir Kantor)', role: 'kasir', nik: 'kasir123', pass: 'kasir123', desc: 'Rekap Setoran Kasir' },
    { name: 'Rudi Hermawan (Petugas Lapangan)', role: 'petugas', nik: 'petugas03', pass: 'sekawan123', desc: 'Input Form Survei & Lapangan' },
  ];

  const handleDemoSelect = (acc: typeof demoAccounts[0]) => {
    setNik(acc.nik);
    setPassword(acc.pass);
    setLoginError(null);
    triggerSuccess(`Form diisi otomatis: ${acc.name}`);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nik.trim() || !password.trim()) {
      setLoginError('Mohon isi Username / No.HP / NIK / Email dan Password.');
      return;
    }

    setLoading(true);
    setLoginError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nik: nik.trim(),
          password: password.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Autentikasi gagal. Silakan periksa kembali kredensial Anda.');
      }

      triggerSuccess(`Selamat datang, ${data.user_data.nama}!`);
      onLoginSuccess(data.user_data, data.token);

    } catch (err: any) {
      console.error('Login error:', err);
      setLoginError(err.message || 'Koneksi ke server gagal.');
      triggerError(err.message || 'Gagal login.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);

    if (!regEmpId.trim() || !regNama.trim() || !regEmail.trim() || !regNik.trim() || !regPassword.trim()) {
      setRegError('Mohon lengkapi semua kolom pendaftaran karyawan.');
      return;
    }

    // Basic email validation
    if (!regEmail.includes('@') || !regEmail.includes('.')) {
      setRegError('Format email registrasi tidak valid.');
      return;
    }

    setRegLoading(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nama: regNama.trim(),
          email: regEmail.trim().toLowerCase(),
          nik: regNik.trim(),
          employee_id: regEmpId.trim().toUpperCase(),
          role: regRole,
          password: regPassword.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Pendaftaran gagal.');
      }

      triggerSuccess('Akun karyawan Sekawan berhasil diregistrasi!');
      
      // Auto-populate and clean up
      setNik(regEmail.trim().toLowerCase());
      setPassword(regPassword.trim());
      setViewMode('login');
      
      // Clear forms
      setRegEmpId('');
      setRegNama('');
      setRegEmail('');
      setRegNik('');
      setRegPassword('');

    } catch (err: any) {
      console.error('Registration error:', err);
      setRegError(err.message || 'Komunikasi database error.');
      triggerError(err.message || 'Registrasi Gagal.');
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 select-none relative font-sans" id="sekawan_karyawan_login_container">
      {/* Wave Decorative Header behind Mockup */}
      <div className="absolute top-0 inset-x-0 h-44 bg-[#0A6EBD] rounded-b-[40px] pointer-events-none shadow-md z-0 flex items-center justify-center">
        <span className="font-mono text-[10px] text-white/50 tracking-widest font-black uppercase">
          SEKAWAN SEJAHTERA BERSAMA • MAIN SERVER: ptsekawansejahterabersama@gmail.com
        </span>
      </div>

      {/* Main Mockup Phone Frame */}
      <div className="w-full max-w-[430px] bg-white border border-slate-200 rounded-[48px] overflow-hidden shadow-2xl flex flex-col relative z-10 min-h-[780px]" id="phone_mockup_body">
        
        {/* Smartphone Simulated Top Status Bar */}
        <div className="bg-white px-8 pt-3 pb-2 flex items-center justify-between text-slate-800 text-xs font-semibold select-none border-b border-slate-50 shrink-0" id="simulated_status_bar">
          <div className="flex items-center gap-1.5" id="sim_status_left">
            <span className="font-mono tracking-tight text-xs text-slate-900">10.44</span>
            <Signal size={12} className="text-slate-800" />
            <Wifi size={12} className="text-slate-800" />
          </div>
          {/* Support Helpline Hotline */}
          <div className="flex items-center gap-2" id="sim_status_right">
            <button 
              type="button"
              onClick={() => {
                alert(`Layanan Bantuan Kantor Pusat PT Sekawan Sejahtera Bersama:\nEmail: ptsekawansejahterabersama@gmail.com\nHubungi administrator Anda untuk bantuan fisik.`);
              }}
              className="text-[#0A6EBD] hover:scale-110 active:scale-95 transition-transform p-1 rounded-full hover:bg-slate-50 cursor-pointer"
              title="Customer Services Support"
            >
              <HelpCircle size={18} />
            </button>
            <Battery size={14} className="text-slate-800" />
          </div>
        </div>

        {/* Dynamic Navigation Content Area */}
        {viewMode === 'login' ? (
          /* =======================================
             VIEW: LOGIN SCREEN (Mockup PNM)
             ======================================= */
          <div className="flex-1 flex flex-col justify-between px-8 py-10" id="mockup_login_wrapper">
            
            <div className="space-y-10">
              
              {/* BRAND REBRANDED LOGO (Stylized as Requested to Rebrand PNM -> Sekawan Karyawan) */}
              <div className="flex flex-col items-center text-center py-6" id="brand_logo_area">
                <div className="flex items-baseline" id="brand_main_text">
                  <span className="text-[44px] tracking-tight font-sans font-black text-[#015FA9] uppercase">
                    SEKAWAN
                  </span>
                  <span className="text-[44px] tracking-tight font-sans font-black text-[#85C33E] relative -left-0.5">
                    <span className="text-[#85C33E]">.</span>
                  </span>
                </div>
                
                {/* Green badge under the text */}
                <div className="mt-1 px-8 py-1.5 bg-[#82C341] rounded-full text-white font-sans text-sm font-black tracking-wider uppercase shadow-sm">
                  Karyawan
                </div>
              </div>

              {/* Error banner */}
              {loginError && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-2xl flex items-start gap-2 text-xs font-semibold animate-fade-in" id="login_error_box">
                  <AlertCircle size={15} className="shrink-0 text-red-500 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}

              {/* Login line form fields */}
              <form onSubmit={handleLoginSubmit} className="space-y-8 font-sans" id="login_form_fields">
                
                {/* NIK / Username Line Input */}
                <div className="relative border-b border-slate-300 pb-1.5 flex flex-col" id="pair_nik_input">
                  <input
                    type="text"
                    required
                    placeholder="Username / No.HP / NIK / Email"
                    value={nik}
                    onChange={(e) => setNik(e.target.value)}
                    className="w-full text-slate-800 placeholder:text-slate-400 font-medium text-base bg-transparent border-0 outline-none focus:ring-0 p-1 transition-all"
                  />
                </div>

                {/* Password Line Input */}
                <div className="relative border-b border-slate-300 pb-1.5 flex items-center justify-between" id="pair_password_input">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full text-slate-800 placeholder:text-slate-400 font-medium text-base bg-transparent border-0 outline-none focus:ring-0 p-1"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-slate-400 hover:text-slate-600 transition p-1"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Submit button ("MASUK") */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 bg-[#0966B0] hover:bg-[#07538c] active:scale-[0.98] disabled:bg-[#4d97cb] text-white font-bold text-center flex items-center justify-center font-sans tracking-wide uppercase text-[15px] rounded-lg cursor-pointer transition shadow shadow-blue-200"
                  id="pnm_style_masuk_btn"
                >
                  {loading ? (
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    "MASUK"
                  )}
                </button>
              </form>

              {/* Bottom links */}
              <div className="flex flex-col items-center gap-3 text-sm font-medium" id="login_footer_links">
                <p className="text-slate-500 font-medium">
                  Pengguna baru ? Silakan{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('register');
                      setRegError(null);
                    }}
                    className="text-[#84C23E] hover:underline font-bold bg-transparent border-none p-0 cursor-pointer"
                  >
                    Register
                  </button>
                </p>

                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-[#84C23E] hover:underline font-bold bg-transparent border-none p-0 cursor-pointer"
                >
                  Lupa Password
                </button>
              </div>

            </div>

            {/* Quick Demo Switcher Container inside Mockup */}
            <div className="border-t border-slate-100 pt-5 mt-auto space-y-2 shrink-0">
              <span className="text-[10px] font-mono tracking-widest text-slate-400 font-black uppercase flex items-center gap-1 justify-center">
                🛠️ Quick Demo Accounts (Uji Coba)
              </span>
              <div className="max-h-[140px] overflow-y-auto space-y-1.5 scrollbar-thin pr-1">
                {demoAccounts.map((acc, aIdx) => (
                  <button
                    key={aIdx}
                    type="button"
                    onClick={() => handleDemoSelect(acc)}
                    className="w-full text-left p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200/60 rounded-xl text-slate-700 transition flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex flex-col text-[10px] truncate max-w-[220px]">
                      <span className="font-bold text-slate-900 leading-tight">{acc.name}</span>
                      <span className="text-[9px] text-slate-400 capitalize truncate mt-0.5">{acc.desc}</span>
                    </div>
                    <span className="text-[8.5px] px-1.5 py-0.5 bg-blue-550 border border-blue-400 text-slate-600 rounded uppercase font-mono font-bold shrink-0">
                      {acc.role}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Version control */}
            <div className="text-center pt-3 text-slate-400 text-[11px] font-semibold shrink-0" id="login_version_footer">
              Versi 1.2.6
            </div>

          </div>
        ) : (
          /* =======================================
             VIEW: REGISTRATION FORM SCREEN
             ======================================= */
          <div className="flex-1 flex flex-col justify-between px-8 py-6 overflow-y-auto" id="mockup_register_wrapper">
            
            <div className="space-y-5">
              
              {/* Back to Login header */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('login')}
                  className="p-1 px-2.5 bg-slate-100/80 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                >
                  <ChevronLeft size={14} />
                  <span>Kembali Masuk</span>
                </button>
              </div>

              {/* Title Header */}
              <div>
                <h3 className="text-xl font-bold tracking-tight text-[#0A6EBD] font-display uppercase leading-tight">
                  Registrasi Karyawan
                </h3>
                <p className="text-xs text-slate-450 mt-1">
                  Daftarkan nomor induk, email, dan jabatan baru Anda untuk akses portal.
                </p>
              </div>

              {/* Error registrations alert */}
              {regError && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl flex items-start gap-2 text-xs font-semibold animate-fade-in" id="reg_error_box">
                  <AlertCircle size={15} className="shrink-0 text-red-500 mt-0.5" />
                  <span>{regError}</span>
                </div>
              )}

              {/* Actual form inputs */}
              <form onSubmit={handleRegisterSubmit} className="space-y-4 text-xs" id="employee_registration_form">
                
                {/* 1. Employee ID / ID Karyawan */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                    ID Karyawan / Employee ID
                  </label>
                  <div className="relative border-b border-slate-300 pb-1.5 flex items-center">
                    <input
                      type="text"
                      required
                      placeholder="Contoh: EMP-0012, EMP-2401"
                      value={regEmpId}
                      onChange={(e) => setRegEmpId(e.target.value)}
                      className="w-full text-slate-800 placeholder:text-slate-400 font-medium text-sm bg-transparent border-0 outline-none focus:ring-0 p-1"
                    />
                  </div>
                </div>

                {/* 2. Employee Fully registered Name */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                    Nama Karyawan Lengkap
                  </label>
                  <div className="relative border-b border-slate-300 pb-1.5 flex items-center">
                    <input
                      type="text"
                      required
                      placeholder="Masukkan nama asli sesuai KTP..."
                      value={regNama}
                      onChange={(e) => setRegNama(e.target.value)}
                      className="w-full text-slate-800 placeholder:text-slate-400 font-medium text-sm bg-transparent border-0 outline-none focus:ring-0 p-1"
                    />
                  </div>
                </div>

                {/* 3. Identity / Identitas / NIK */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                    Identitas NIK Karyawan / No.HP
                  </label>
                  <div className="relative border-b border-slate-300 pb-1.5 flex items-center">
                    <input
                      type="text"
                      required
                      placeholder="Masukkan NIK 16 digit atau nomor HP..."
                      value={regNik}
                      onChange={(e) => setRegNik(e.target.value)}
                      className="w-full text-slate-800 placeholder:text-slate-400 font-medium text-sm bg-transparent border-0 outline-none focus:ring-0 p-1"
                    />
                  </div>
                </div>

                {/* 4. Corporate/Registered Email */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                    Email Registrasi Karyawan
                  </label>
                  <div className="relative border-b border-slate-300 pb-1.5 flex items-center">
                    <input
                      type="email"
                      required
                      placeholder="Contoh: nama@gmail.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="w-full text-slate-800 placeholder:text-slate-400 font-medium text-sm bg-transparent border-0 outline-none focus:ring-0 p-1"
                    />
                  </div>
                </div>

                {/* 5. Position / Jabatan (Role selection) */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                    Jabatan Kerja / Hak Akses
                  </label>
                  <select
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value as any)}
                    className="w-full p-2 border border-slate-300 rounded-lg text-slate-800 bg-slate-50 focus:outline-[#0A6EBD] text-xs font-semibold"
                  >
                    <option value="petugas">Petugas Lapangan (Collection/Survey)</option>
                    <option value="spv">Supervisor KC (Verifikasi/Audit)</option>
                    <option value="kasir">Kasir Cabang (Teller/Tutup Buku)</option>
                    <option value="admin">Administrator SOP (Final Approval / GL)</option>
                    <option value="super_admin">Super Admin / TI Operational</option>
                  </select>
                </div>

                {/* 6. Password Access code */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                    Sandi Akses Portal
                  </label>
                  <div className="relative border-b border-slate-300 pb-1.5 flex items-center justify-between">
                    <input
                      type={regShowPassword ? 'text' : 'password'}
                      required
                      placeholder="Buat sandi yang aman..."
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="w-full text-slate-800 placeholder:text-slate-400 font-semibold text-sm bg-transparent border-0 outline-none focus:ring-0 p-1"
                    />
                    <button
                      type="button"
                      onClick={() => setRegShowPassword(!regShowPassword)}
                      className="text-slate-400 hover:text-slate-600 transition p-1"
                    >
                      {regShowPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Submit Registrasi */}
                <button
                  type="submit"
                  disabled={regLoading}
                  className="w-full h-11 bg-[#82C341] hover:bg-[#72b033] active:scale-[0.98] disabled:bg-[#bccca5] text-white font-bold text-center flex items-center justify-center font-sans uppercase text-[12px] rounded-lg tracking-wider cursor-pointer shadow transition mt-2"
                  id="reg_submit_btn"
                >
                  {regLoading ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    "DAFTAR AKUN BARU"
                  )}
                </button>
              </form>

            </div>

            {/* Terms policy info footer inside register page */}
            <div className="text-[10px] text-slate-400 text-center mt-4">
              Pendaftaran karyawan diverifikasi otomatis di server utama PT Sekawan Sejahtera Bersama.
            </div>

          </div>
        )}

      </div>

      {/* Lupa Password Modal Overlay */}
      {showForgotPassword && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="forgot_password_modal">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-slate-800 space-y-4 shadow-2xl border border-slate-100">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-lime-100 text-[#82C341] rounded-full flex items-center justify-center mx-auto">
                <Shield size={24} />
              </div>
              <h4 className="font-sans font-bold text-lg text-slate-900 tracking-tight">
                Lupa Password?
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Sistem database dilindungi oleh enkripsi Secure-Hashing dari server master PT Sekawan Sejahtera Bersama.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-150 rounded-2xl text-xs space-y-2 text-slate-700">
              <p className="font-medium text-[11px] text-slate-400 uppercase tracking-widest font-mono">
                📞 MASTER ADMINISTRATOR SERVER:
              </p>
              <p className="font-bold text-[#0A6EBD] break-all selection:bg-blue-100">
                ptsekawansejahterabersama@gmail.com
              </p>
              <p className="text-slate-500 leading-normal text-[11px] pt-1">
                Silakan ajukan permintaan reset data pin / password dengan menyertakan melampirkan **Nomor Registrasi ID Karyawan** beserta **NIK asli** Anda.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowForgotPassword(false)}
              className="w-full py-2.5 bg-[#0966B0] hover:bg-[#07538c] text-white font-bold rounded-xl text-xs uppercase cursor-pointer tracking-wider transition"
            >
              Saya Mengerti (Tutup)
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
