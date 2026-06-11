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

  // Modals state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showSupportHelp, setShowSupportHelp] = useState(false);

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
    <div className="min-h-screen bg-[#0070BA] flex items-center justify-center p-4 select-none relative font-sans" id="sekawan_karyawan_login_container">
      
      {/* Main Container styled exactly as requested: max width 500px, 60px border radius, min-height 90vh */}
      <main className="w-full max-w-[500px] bg-white relative overflow-hidden flex flex-col p-6 md:p-8 pt-5 shadow-2xl justify-between min-h-[90vh]" style={{ borderRadius: '60px' }}>
        
        {/* BEGIN: StatusBar */}
        <div className="flex justify-between items-center w-full mb-8 text-sm font-semibold text-slate-700" data-purpose="ios-status-bar">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold tracking-tight">10.44</span>
            <svg className="w-4 h-4 text-slate-700" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"></path>
            </svg>
            <svg className="w-4 h-4 text-slate-700" fill="currentColor" viewBox="0 0 20 20">
              <path d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.266 0 .52.105.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z"></path>
            </svg>
          </div>
          <div className="flex items-center gap-3">
            <button 
              type="button" 
              onClick={() => setShowSupportHelp(true)}
              className="text-[#0070BA] hover:scale-105 active:scale-95 transition-transform"
              title="Hubungi Bantuan Support"
            >
              <svg className="w-5 h-5 text-blue-500 hover:text-blue-600 cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
              </svg>
            </button>
            <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
            </svg>
          </div>
        </div>
        {/* END: StatusBar */}

        {viewMode === 'login' ? (
          /* =======================================
             VIEW: LOGIN SCREEN
             ======================================= */
          <div className="flex-1 flex flex-col justify-between" id="login_screen_scroller">
            
            <div className="space-y-6">
              
              {/* BEGIN: BrandLogoSection */}
              <div className="flex flex-col items-center mb-6" data-purpose="brand-section">
                {/* Brand Logo integrated precisely */}
                <img 
                  alt="Sekawan Logo" 
                  className="w-24 h-auto mb-2 object-contain mx-auto" 
                  referrerPolicy="no-referrer"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDjQ9IjpnOZzG-LUeELWL220CbxD74LpvMlmEoXPZ6ExX73N7G_55Uxd1jWSKLGybJHpPnPAltIitP_DGcl7rT2YnMrwMYrdL0rcVjgas4HWFhjp3aw5IMwLy_RnSYqXKl-sISRDNau93-A6hgVWqPoKIZvNwvpdQMWcTFboqIACOUAnKAR5p71VbO_LIbL1rf0IpRAfs2Tnwf2qXJdMIPqKcllCLPYkuYVh-_jLSXPD6A9IpPnYtQfsIUuvqMNSB5cVZL4InYqQujY"
                />
                <h1 className="text-4xl font-extrabold tracking-tight text-[#0070BA] flex items-end justify-center mb-1">
                  SSJB
                </h1>
                
                {/* Karyawan Badge */}
                <div className="mt-2 bg-[#8CC63F] text-white px-8 py-2 rounded-full font-bold text-xs tracking-wider uppercase inline-block text-center shadow-xs">
                  KITA SEKAWAN
                </div>
              </div>
              {/* END: BrandLogoSection */}

              {/* Login Error Alert */}
              {loginError && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-xl flex items-start gap-2 text-xs font-semibold animate-fadeIn" id="login_error_box">
                  <AlertCircle size={15} className="shrink-0 text-red-500 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}

              {/* BEGIN: LoginForm */}
              <form onSubmit={handleLoginSubmit} className="space-y-6 w-full mb-6" data-purpose="login-form">
                {/* Username Input with clean border-bottom-2 style */}
                <div className="relative w-full">
                  <input 
                    type="text" 
                    id="username" 
                    required
                    placeholder="Username / No.HP / NIK / Email" 
                    value={nik}
                    onChange={(e) => setNik(e.target.value)}
                    className="w-full bg-transparent border-0 border-b-2 border-slate-200 text-gray-850 placeholder:text-gray-400 py-3 text-base outline-none focus:outline-none focus:ring-0 focus:border-[#0070BA] transition-colors rounded-none px-0"
                  />
                </div>

                {/* Password Input with eye toggler and border-bottom-2 style */}
                <div className="relative w-full">
                  <input 
                    type={showPassword ? 'text' : 'password'}
                    id="password" 
                    required
                    placeholder="Password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent border-0 border-b-2 border-slate-200 text-gray-850 placeholder:text-gray-400 py-3 text-base pr-10 outline-none focus:outline-none focus:ring-0 focus:border-[#0070BA] transition-colors rounded-none px-0"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 p-1 hover:text-slate-600 transition"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                        <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                      </svg>
                    )}
                  </button>
                </div>

                {/* Submit button MASUK */}
                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-[#0066A2] hover:bg-blue-800 disabled:bg-blue-300 text-white font-bold py-4 rounded-xl text-lg transition shadow-sm cursor-pointer flex items-center justify-center min-h-[56px]"
                >
                  {loading ? (
                    <span className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    "MASUK"
                  )}
                </button>
              </form>
              {/* END: LoginForm */}

              {/* BEGIN: HelperLinks */}
              <div className="text-center space-y-3 mb-6 w-full" data-purpose="auth-links">
                <p className="text-gray-500 font-medium text-sm">
                  Pengguna baru ? Silakan{" "}
                  <button 
                    type="button" 
                    onClick={() => {
                      setViewMode('register');
                      setRegError(null);
                    }}
                    className="text-[#8CC63F] font-bold hover:underline cursor-pointer bg-transparent border-none p-0 inline-block focus:outline-none"
                  >
                    Register
                  </button>
                </p>
                <button 
                  type="button" 
                  onClick={() => setShowForgotPassword(true)}
                  className="block text-[#8CC63F] font-bold text-base hover:underline mx-auto cursor-pointer bg-transparent border-none p-0 focus:outline-none"
                >
                  Lupa Password
                </button>
              </div>
              {/* END: HelperLinks */}

            </div>

            {/* BEGIN: DemoAccountsSection */}
            <div className="mt-4 border-t border-slate-100 pt-5 w-full" data-purpose="demo-accounts-section">
              <div className="flex items-center justify-center gap-2 mb-3">
                <span className="text-[11px] font-bold text-gray-400 tracking-widest uppercase flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                    <path clipRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0l-1.12 4.63h-4.63c-1.56 0-2.2 2.02-.93 2.98l3.75 2.73-1.43 4.41c-.49 1.51 1.25 2.76 2.5 1.83L10 17l3.35 2.5c1.25.93 2.99-.32 2.5-1.83l-1.43-4.41 3.75-2.73c1.27-.96.63-2.98-.93-2.98h-4.63l-1.12-4.63z" fillRule="evenodd"></path>
                  </svg>
                  Quick Demo Accounts (Uji Coba)
                </span>
              </div>

              {/* Scrollable container exactly as requested */}
              <div className="max-h-[170px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {demoAccounts.map((acc, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleDemoSelect(acc)}
                    className="w-full border border-gray-100 rounded-2xl p-3 flex justify-between items-center bg-slate-50/50 hover:bg-slate-100/80 transition-colors text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-100"
                  >
                    <div className="min-w-0 pr-2">
                      <h4 className="font-bold text-xs text-gray-800 truncate">{acc.name}</h4>
                      <p className="text-[10px] text-gray-500 mt-0.5 truncate">{acc.desc}</p>
                    </div>
                    <span className="text-[9px] font-bold border border-blue-200 text-blue-600 px-2 py-0.5 rounded bg-white shrink-0 ml-2 font-mono uppercase tracking-wide">
                      {acc.role}
                    </span>
                  </button>
                ))}
              </div>

              <div className="text-center mt-3">
                <p className="text-[11px] text-gray-400 font-medium">Versi 1.2.6</p>
              </div>
            </div>
            {/* END: DemoAccountsSection */}

          </div>
        ) : (
          /* =======================================
             VIEW: REGISTRATION FORM SCREEN
             ======================================= */
          <div className="flex-1 flex flex-col justify-between" id="register_screen_scroller">
            
            <div className="space-y-4">
              
              {/* Return to Login button */}
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => setViewMode('login')}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <ChevronLeft size={14} />
                  <span>Kembali Masuk</span>
                </button>
              </div>

              {/* Title Section */}
              <div>
                <h3 className="text-xl font-bold tracking-tight text-[#0070BA] font-display uppercase leading-tight">
                  Registrasi Karyawan
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Daftarkan ID, NIK, dan Email Anda untuk otorisasi sistem.
                </p>
              </div>

              {/* Error Alert Registrasi */}
              {regError && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl flex items-start gap-2 text-xs font-semibold animate-fadeIn" id="reg_error_box">
                  <AlertCircle size={15} className="shrink-0 text-red-500 mt-0.5" />
                  <span>{regError}</span>
                </div>
              )}

              {/* Main Registration Form - styled with custom inputs */}
              <form onSubmit={handleRegisterSubmit} className="space-y-3.5 text-xs" id="employee_registration_form">
                
                {/* Employee ID */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider block">
                    ID Karyawan / Employee ID
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: EMP-0012, EMP-2401"
                    value={regEmpId}
                    onChange={(e) => setRegEmpId(e.target.value)}
                    className="w-full bg-transparent border-0 border-b-2 border-slate-200 text-slate-800 placeholder:text-slate-400 py-1.5 text-sm outline-none focus:outline-none focus:ring-0 focus:border-[#0070BA] transition-colors rounded-none px-0"
                  />
                </div>

                {/* Complete Name */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider block">
                    Nama Karyawan Lengkap
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Masukkan nama sesuai KTP..."
                    value={regNama}
                    onChange={(e) => setRegNama(e.target.value)}
                    className="w-full bg-transparent border-0 border-b-2 border-slate-200 text-slate-800 placeholder:text-slate-400 py-1.5 text-sm outline-none focus:outline-none focus:ring-0 focus:border-[#0070BA] transition-colors rounded-none px-0"
                  />
                </div>

                {/* Identity / NIK */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider block">
                    Identitas NIK Karyawan / No.HP
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Masukkan NIK 16 digit atau nomor HP..."
                    value={regNik}
                    onChange={(e) => setRegNik(e.target.value)}
                    className="w-full bg-transparent border-0 border-b-2 border-slate-200 text-slate-800 placeholder:text-slate-400 py-1.5 text-sm outline-none focus:outline-none focus:ring-0 focus:border-[#0070BA] transition-colors rounded-none px-0"
                  />
                </div>

                {/* Email address */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider block">
                    Email Registrasi Karyawan
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="Contoh: nama@gmail.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full bg-transparent border-0 border-b-2 border-slate-200 text-slate-800 placeholder:text-slate-400 py-1.5 text-sm outline-none focus:outline-none focus:ring-0 focus:border-[#0070BA] transition-colors rounded-none px-0"
                  />
                </div>

                {/* Position / Role selection */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Jabatan Kerja / Hak Akses
                  </label>
                  <select
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value as any)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 bg-slate-50 focus:outline-none focus:border-[#0070BA] focus:ring-1 focus:ring-blue-100 text-xs font-semibold"
                  >
                    <option value="petugas">Petugas Lapangan (Collection/Survey)</option>
                    <option value="spv">Supervisor KC (Verifikasi/Audit)</option>
                    <option value="kasir">Kasir Cabang (Teller/Tutup Buku)</option>
                    <option value="admin">Administrator SOP (Final Approval / GL)</option>
                    <option value="super_admin">Super Admin / TI Operational</option>
                  </select>
                </div>

                {/* Access passcode */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider block">
                    Sandi Akses Portal
                  </label>
                  <div className="relative border-b-2 border-slate-200 flex items-center">
                    <input
                      type={regShowPassword ? 'text' : 'password'}
                      required
                      placeholder="Buat sandi akses..."
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="w-full bg-transparent border-0 text-slate-800 placeholder:text-slate-400 py-1.5 text-sm outline-none focus:outline-none focus:ring-0 focus:border-transparent rounded-none px-0"
                    />
                    <button
                      type="button"
                      onClick={() => setRegShowPassword(!regShowPassword)}
                      className="text-slate-400 hover:text-slate-600 transition p-1"
                    >
                      {regShowPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={regLoading}
                  className="w-full h-12 bg-[#8CC63F] hover:bg-[#7bc02e] text-white font-bold text-center flex items-center justify-center font-sans uppercase text-sm rounded-xl tracking-wider cursor-pointer shadow transition-all duration-150 mt-4"
                  id="reg_submit_btn"
                >
                  {regLoading ? (
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    "DAFTAR AKUN BARU"
                  )}
                </button>
              </form>

            </div>

            <div className="text-[10px] text-slate-400 text-center mt-5">
              Pendaftaran karyawan diverifikasi otomatis di server utama PT Sekawan Sejahtera Bersama.
            </div>

          </div>
        )}

      </main>

      {/* Lupa Password Modal Overlay */}
      {showForgotPassword && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn" id="forgot_password_modal">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-slate-800 space-y-4 shadow-2xl border border-slate-150">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-lime-100 text-[#8CC63F] rounded-full flex items-center justify-center mx-auto">
                <Shield size={24} />
              </div>
              <h4 className="font-sans font-bold text-lg text-slate-950 tracking-tight">
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
              <p className="font-bold text-[#0070BA] break-all select-all">
                ptsekawansejahterabersama@gmail.com
              </p>
              <p className="text-slate-500 leading-normal text-[11px] pt-1">
                Silakan ajukan permintaan reset data PIN / password dengan menyertakan melampirkan **Nomor Registrasi ID Karyawan** beserta **NIK asli** Anda.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowForgotPassword(false)}
              className="w-full py-3 bg-[#0066A2] hover:bg-blue-800 text-white font-bold rounded-xl text-xs uppercase cursor-pointer tracking-wider transition"
            >
              Saya Mengerti (Tutup)
            </button>
          </div>
        </div>
      )}

      {/* Corporate Help Modal Overlay (Replacement for window.alert) */}
      {showSupportHelp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn" id="corporate_support_modal">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-slate-800 space-y-4 shadow-2xl border border-slate-150">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-blue-50 text-[#0070BA] rounded-full flex items-center justify-center mx-auto">
                <HelpCircle size={24} />
              </div>
              <h4 className="font-sans font-bold text-lg text-slate-950 tracking-tight">
                Layanan Bantuan Support
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Kantor Pusat PT Sekawan Sejahtera Bersama siap membimbing kebutuhan teknis operasional Anda.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl text-xs space-y-3 text-slate-705">
              <div>
                <p className="font-bold text-[10px] text-slate-400 uppercase tracking-wider font-mono">🏢 HUBUNGTI TI KORDINASI:</p>
                <p className="font-bold text-[#0070BA] text-sm mt-0.5 select-all">ptsekawansejahterabersama@gmail.com</p>
              </div>
              <div>
                <p className="font-bold text-[10px] text-slate-400 uppercase tracking-wider font-mono">🕒 JAM LAYANAN OPERASIONAL:</p>
                <p className="font-medium text-slate-600 mt-0.5">Senin - Jumat | 08:00 - 17:00 WIB</p>
              </div>
              <p className="text-slate-450 border-t border-slate-200 pt-2 text-[10.5px]">
                Hubungi administrator masing-masing cabang untuk audit akun, penugasan wilayah penagihan laparangan, atau kendala verifikasi login.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowSupportHelp(false)}
              className="w-full py-3 bg-[#0066A2] hover:bg-blue-800 text-white font-bold rounded-xl text-xs uppercase cursor-pointer tracking-wider transition"
            >
              Tutup Info
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
