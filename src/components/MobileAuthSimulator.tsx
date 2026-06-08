import React, { useState, useEffect } from 'react';
import { 
  Smartphone, Lock, Unlock, ShieldCheck, Wifi, WifiOff, Database, Key, 
  RefreshCw, UserCheck, CheckCircle2, Circle, RotateCcw, UploadCloud, 
  AlertTriangle, Trash2, ShieldAlert, Cpu, Check, HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, SystemState, BillingSchedule } from '../types';

// Client-side local SHA256 helper so mobile can hash the PIN locally without backend roundtrips!
// This demonstrates the true offline-first cryptographic design.
async function clientSHA256(text: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface MobileAuthSimulatorProps {
  onRefreshParent: () => void;
  systemState: SystemState | null;
}

export default function MobileAuthSimulator({ onRefreshParent, systemState }: MobileAuthSimulatorProps) {
  // Mobile Network simulation
  const [isPhoneOffline, setIsPhoneOffline] = useState<boolean>(false);
  
  // Simulated hardware UUID from Expo-Device
  const [phoneDeviceId, setPhoneDeviceId] = useState<string>("DEV-UUID-88981");

  // Simulated Expo SecureStore Storage State
  const [secureStore, setSecureStore] = useState<{
    accessToken: string | null;
    userProfile: { id: string; nik: string; nama: string; role: string; device_id: string | null } | null;
    offlinePinHash: string | null;
  }>({
    accessToken: null,
    userProfile: null,
    offlinePinHash: null
  });

  // Authentication State Machine:
  // STATE 1: 'unauthenticated' - Must log in online (NIK and Password)
  // STATE 2: 'locked' - Daily PIN Unlock (offline PIN matching offlinePinHash)
  // STATE 3: 'authenticated' - Access to collector main dashboard
  const [authStage, setAuthStage] = useState<'unauthenticated' | 'locked' | 'authenticated'>('unauthenticated');

  // Login inputs (State 1)
  const [nikInput, setNikInput] = useState<string>("123456"); // Pre-populated with seeder USR-01
  const [passwordInput, setPasswordInput] = useState<string>("petugas123");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);

  // PIN inputs (State 2)
  const [pinDots, setPinDots] = useState<string>("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [shakeTrigger, setShakeTrigger] = useState<number>(0);

  // Simulated backend DB tracking for rendering alongside SecureStore
  const [backendUsers, setBackendUsers] = useState<User[]>([]);
  const [backendLoading, setBackendLoading] = useState<boolean>(false);

  // Active User session values once logged in
  const [activeSessionUser, setActiveSessionUser] = useState<any>(null);

  // Sensitive action simulated queue
  const [simulatedPayments, setSimulatedPayments] = useState<any[]>([
    { id: "PAY-OFF-101", customerName: "Siti Aminah", amount: 155000, term: 1, status: "UNPAID" },
    { id: "PAY-OFF-102", customerName: "Suryani Kulsum", amount: 140000, term: 1, status: "UNPAID" },
    { id: "PAY-OFF-103", customerName: "Rukmini Rahayu", amount: 200000, term: 2, status: "UNPAID" }
  ]);
  const [offlineSyncRequired, setOfflineSyncRequired] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Modal Hook Simulation State for usePinVerification()
  const [pinVerificationModal, setPinVerificationModal] = useState<{
    isOpen: boolean;
    onSuccess: () => void;
    actionLabel: string;
    enteredPin: string;
    errorMessage: string | null;
    shake: number;
  }>({
    isOpen: false,
    onSuccess: () => {},
    actionLabel: "",
    enteredPin: "",
    errorMessage: null,
    shake: 0
  });

  // Fetch backend users for reference from /api/state
  const fetchBackendUsers = async () => {
    setBackendLoading(true);
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = await res.json();
        if (data.state && data.state.users) {
          setBackendUsers(data.state.users);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBackendLoading(false);
    }
  };

  useEffect(() => {
    fetchBackendUsers();
  }, [systemState]);

  // Load physical phone parameters from local simulation state on mount
  useEffect(() => {
    const savedStore = localStorage.getItem('simdev_secure_store');
    const savedStage = localStorage.getItem('simdev_auth_stage');
    const savedDeviceId = localStorage.getItem('simdev_device_id');
    const savedOffline = localStorage.getItem('simdev_is_offline');
    
    if (savedDeviceId) {
      setPhoneDeviceId(savedDeviceId);
    }
    if (savedOffline === 'true') {
      setIsPhoneOffline(true);
    }
    if (savedStore) {
      try {
        const parsed = JSON.parse(savedStore);
        setSecureStore(parsed);
        if (parsed.accessToken && parsed.userProfile) {
          setActiveSessionUser(parsed.userProfile);
          // If already has profile and token, start locked or authenticated
          if (savedStage) {
            setAuthStage(savedStage as any);
          } else {
            setAuthStage('locked');
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Save secure store states helper
  const savePhoneStates = (store: typeof secureStore, stage: typeof authStage) => {
    localStorage.setItem('simdev_secure_store', JSON.stringify(store));
    localStorage.setItem('simdev_auth_stage', stage);
    localStorage.setItem('simdev_device_id', phoneDeviceId);
    localStorage.setItem('simdev_is_offline', isPhoneOffline ? 'true' : 'false');
  };

  // Simulate hardware restart
  const handleHardwareRestart = () => {
    setPinDots("");
    setPinError(null);
    setLoginError(null);
    // If we have credentials, hardware power-down boots directly into State 2: Locked screen (Offline PIN Validation)
    if (secureStore.accessToken && secureStore.userProfile) {
      setAuthStage('locked');
      localStorage.setItem('simdev_auth_stage', 'locked');
    } else {
      setAuthStage('unauthenticated');
      localStorage.setItem('simdev_auth_stage', 'unauthenticated');
    }
  };

  // Hard factory reset of mobile phone
  const handleFactoryResetMobile = () => {
    const freshStore = { accessToken: null, userProfile: null, offlinePinHash: null };
    setSecureStore(freshStore);
    setAuthStage('unauthenticated');
    setPinDots("");
    setPinError(null);
    setLoginError(null);
    localStorage.removeItem('simdev_secure_store');
    localStorage.setItem('simdev_auth_stage', 'unauthenticated');
    setSimulatedPayments([
      { id: "PAY-OFF-101", customerName: "Siti Aminah", amount: 155000, term: 1, status: "UNPAID" },
      { id: "PAY-OFF-102", customerName: "Suryani Kulsum", amount: 140000, term: 1, status: "UNPAID" },
      { id: "PAY-OFF-103", customerName: "Rukmini Rahayu", amount: 200000, term: 2, status: "UNPAID" }
    ]);
    setOfflineSyncRequired(false);
  };

  // Generate a random physical device UUID
  const handleGenerateNewDeviceId = () => {
    const newUUID = "XPO-UUID-" + Math.floor(100000 + Math.random() * 900000);
    setPhoneDeviceId(newUUID);
    localStorage.setItem('simdev_device_id', newUUID);
    setLoginError(null);
  };

  // Trigger server-side device binding release
  const handleReleaseServerDeviceBinding = async (userId: string) => {
    try {
      const res = await fetch('/api/auth/reset-binding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (res.ok) {
        await fetchBackendUsers();
        onRefreshParent();
      } else {
        alert(data.error || "Gagal melepas device binding");
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  // STATE 1: Login Handler (Online required)
  const handleOnlineLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    // Mandate validation: Must be online
    if (isPhoneOffline) {
      setLoginError("Petugas WAJIB ONLINE untuk melakukan verifikasi credentials awal dan pendaftaran ID perangkat (Device Binding).");
      return;
    }

    if (!nikInput || !passwordInput) {
      setLoginError("NIK dan Password wajib diisi.");
      return;
    }

    setLoginLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nik: nikInput,
          password: passwordInput,
          deviceId: phoneDeviceId
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Gagal login.");
        return;
      }

      // Successful first login: Store encrypted parameters in Expo Secure Store representation
      const updatedStore = {
        accessToken: data.token,
        userProfile: data.user_data,
        offlinePinHash: data.pin_hash
      };

      setSecureStore(updatedStore);
      setActiveSessionUser(data.user_data);
      // Immediately transition to Authenticated since we are online initially, or transition to State 2 (Locked)
      setAuthStage('authenticated');
      savePhoneStates(updatedStore, 'authenticated');
      
      await fetchBackendUsers();
      onRefreshParent();
    } catch (e: any) {
      setLoginError("Network connection error: " + e.message);
    } finally {
      setLoginLoading(false);
    }
  };

  // STATE 2: Custom numpad PIN unlock handle (Offline-compatible!)
  const handleNumpadPress = async (digit: string) => {
    setPinError(null);
    if (pinDots.length >= 6) return;

    const updated = pinDots + digit;
    setPinDots(updated);

    // If reached 6 digits, immediately verify
    if (updated.length === 6) {
      // Hashing PIN locally via clientSHA256 (matches offlinePinHash!)
      const generatedLocalHash = await clientSHA256(updated);
      
      if (secureStore.offlinePinHash === generatedLocalHash) {
        // Success: Transition to Authenticated state! Works offline!
        setAuthStage('authenticated');
        savePhoneStates(secureStore, 'authenticated');
        setPinDots("");
      } else {
        // Fail: trigger shake animation & flash error
        setPinError("PIN Salah! Akses ditolak.");
        setShakeTrigger(prev => prev + 1);
        setTimeout(() => {
          setPinDots("");
        }, 800);
      }
    }
  };

  const handleNumpadClear = () => {
    setPinDots("");
    setPinError(null);
  };

  const handleNumpadBackspace = () => {
    if (pinDots.length > 0) {
      setPinDots(pinDots.slice(0, -1));
    }
  };

  // Logout / Lock application manual
  const handleLockMobileManual = () => {
    setAuthStage('locked');
    savePhoneStates(secureStore, 'locked');
  };

  // Simulated Hook: usePinVerification()
  // Activates overlay modal requesting the officer's 6-digit PIN to authorize actions.
  const triggerPinVerification = (actionLabel: string, onSuccess: () => void) => {
    setPinVerificationModal({
      isOpen: true,
      onSuccess,
      actionLabel,
      enteredPin: "",
      errorMessage: null,
      shake: 0
    });
  };

  const handleModalNumpadPress = async (digit: string) => {
    if (pinVerificationModal.enteredPin.length >= 6) return;
    const updated = pinVerificationModal.enteredPin + digit;
    setPinVerificationModal(prev => ({ ...prev, enteredPin: updated, errorMessage: null }));

    if (updated.length === 6) {
      const generatedLocalHash = await clientSHA256(updated);
      if (secureStore.offlinePinHash === generatedLocalHash) {
        // Permitted! Dismiss modal and trigger code block callback
        const savedCallback = pinVerificationModal.onSuccess;
        setPinVerificationModal({
          isOpen: false,
          onSuccess: () => {},
          actionLabel: "",
          enteredPin: "",
          errorMessage: null,
          shake: 0
        });
        savedCallback();
      } else {
        setPinVerificationModal(prev => ({
          ...prev,
          errorMessage: "PIN Verifikasi Salah! Aksi sensitif ditolak.",
          shake: prev.shake + 1
        }));
        setTimeout(() => {
          setPinVerificationModal(prev => ({ ...prev, enteredPin: "" }));
        }, 800);
      }
    }
  };

  // SUBMIT PAYMENT ACTION 1: 'Gagal Tagih' (Requires PIN verification!)
  const handlePaymentCollected = (schedId: string, markOfflineStatus: 'GAGAL_TAGIH' | 'BAYAR') => {
    // Wrap sensitive action in usePinVerification() trigger
    const actionDesc = markOfflineStatus === 'GAGAL_TAGIH' 
      ? `Konfirmasi Lapangan GAGAL TAGIH` 
      : `Submit Pembayaran Rp ${markOfflineStatus === 'BAYAR' ? '150.000' : ''}`;

    triggerPinVerification(actionDesc, () => {
      // onSuccess Callback block:
      setSimulatedPayments(prev => prev.map(p => {
        if (p.id === schedId) {
          return { ...p, status: markOfflineStatus };
        }
        return p;
      }));
      setOfflineSyncRequired(true);
      setSyncMessage(`Berhasil mencatatkan status pembayaran ke local database mobile.`);
      setTimeout(() => setSyncMessage(null), 4000);
    });
  };

  // SYNC ACTION 2: 'Sync Push' (Requires PIN verification & Online connection!)
  const handleSyncPushToServer = () => {
    if (isPhoneOffline) {
      alert("Gagal Sinkronisasi: Anda sedang offline harian. Koneksi internet wajib aktif untuk Sinkronisasi!");
      return;
    }

    triggerPinVerification("Sinkronisasi Berkas & Penagihan Lapangan Ke Server", () => {
      // onSuccess callback block:
      // In a real app this pushes payment logs to Express /api/payments
      setSimulatedPayments(prev => prev.map(p => {
        if (p.status === 'GAGAL_TAGIH' || p.status === 'BAYAR') {
          return { ...p, status: 'SYNCED_OK' };
        }
        return p;
      }));
      setOfflineSyncRequired(false);
      setSyncMessage("DATA BERHASIL DISINKRONISASI KE SERVER! Jurnal transaksi double-entry otomatis dibentuk di pusat.");
      setTimeout(() => setSyncMessage(null), 5000);
      onRefreshParent();
    });
  };

  return (
    <div className="space-y-6" id="auth_simulator_workspace">
      {/* Banner introduction with beautiful typography */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-display tracking-tight flex items-center gap-2">
            <ShieldCheck className="text-emerald-400" size={24} />
            Simulator Otentikasi & Pengaman Offline-First
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
            Menyimulasikan arsitektur keamanan ketat mobile penagihan lapangan memakai 
            <span className="text-emerald-400 font-semibold font-mono"> expo-secure-store</span>, 
            <span className="text-emerald-400 font-semibold font-mono"> DB Device-Binding (SIM-PRISMA)</span>, dan logic 
            <span className="text-emerald-400 font-semibold font-mono"> usePinVerification() </span> 
            untuk mengunci aksi-aksi kritis secara aman terdesentralisasi.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleHardwareRestart}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition"
            title="Simulasikan matikan paksa / restart HP"
          >
            <RotateCcw size={14} />
            Reboot Phone
          </button>
          <button
            onClick={handleFactoryResetMobile}
            className="px-3 py-1.5 bg-rose-950 hover:bg-rose-900 text-rose-200 rounded text-xs font-semibold flex items-center gap-1.5 border border-rose-900 transition"
            title="Hapus memori lokal HP untuk pengetesan awal"
          >
            <Trash2 size={14} />
            Wipe Expo Store
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: The Interactive iPhone Simulated Device Frame (Lg: 5/12 cols) */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="text-center mb-2">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold">SMARTPHONE SIMULATOR</span>
          </div>

          {/* Physical Phone Frame Container */}
          <div className="relative w-80 h-[640px] bg-slate-950 rounded-[48px] border-[10px] border-slate-900 shadow-2xl overflow-hidden ring-[1px] ring-slate-800 flex flex-col">
            
            {/* Speaker & Sensor Notch Bezel */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7 bg-slate-900 rounded-b-2xl z-30 flex items-center justify-center">
              <div className="w-12 h-1 bg-slate-950 rounded-full mb-1" />
              <div className="absolute right-4 w-2 h-2 bg-slate-950 rounded-full" />
            </div>

            {/* Smart Phone Operating Status Bar */}
            <div className="bg-slate-950 text-slate-300 text-[11px] font-mono px-6 pt-7 pb-1 flex justify-between items-center select-none z-20 shrink-0">
              <span className="font-semibold">08:41 UTC</span>
              <div className="flex items-center gap-1.5">
                {/* Connection Widget */}
                {isPhoneOffline ? (
                  <span className="text-amber-500 font-bold flex items-center gap-0.5">
                    <WifiOff size={11} />
                    <span className="text-[9px]">OFFLINE</span>
                  </span>
                ) : (
                  <span className="text-emerald-500 font-bold flex items-center gap-0.5">
                    <Wifi size={11} />
                    <span className="text-[9px]">LTE</span>
                  </span>
                )}
                {/* Simulated battery level */}
                <div className="w-5 h-2.5 bg-slate-800 rounded-sm border border-slate-700 p-0.5 flex">
                  <div className="h-full w-4/5 bg-emerald-500 rounded-2xs" />
                </div>
              </div>
            </div>

            {/* Inner Interactive Mobile View Screen */}
            <div className="grow bg-slate-900 text-white flex flex-col p-4 relative overflow-hidden">
              
              {/* STATE 1 VIEW: Unauthenticated Form (Online Required) */}
              {authStage === 'unauthenticated' && (
                <div className="grow flex flex-col py-3 px-1 animate-fadeIn">
                  <div className="text-center mt-6 mb-4">
                    <div className="mx-auto w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-full flex items-center justify-center border border-indigo-500/20 mb-2">
                      <Lock size={20} className="animate-pulse" />
                    </div>
                    <h3 className="font-bold text-base font-display">Aplikasi Lapangan</h3>
                    <p className="text-[10px] text-slate-400 tracking-wide">STATE 1: Login Awal (Petugas Baru / Online)</p>
                  </div>

                  <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 text-xs mb-4">
                    <div className="flex items-center gap-1.5 text-amber-400 font-semibold mb-1">
                      <AlertTriangle size={13} />
                      Aturan Device Binding:
                    </div>
                    <p className="text-[10px] text-slate-350 leading-relaxed">
                      Sistem akan merekam UUID HP ini saat pertama kali login. Untuk menguji error binding, 
                      klik "Ganti Device ID" pada menu kontrol dan gunakan NIK yang sama.
                    </p>
                  </div>

                  {loginError && (
                    <div className="p-2.5 bg-rose-950/80 border border-rose-800 text-rose-200 text-[11px] rounded mb-3 leading-relaxed">
                      {loginError}
                    </div>
                  )}

                  <form onSubmit={handleOnlineLogin} className="space-y-3.5 grow flex flex-col">
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">NIK Petugas</label>
                      <input 
                        type="text" 
                        value={nikInput}
                        onChange={(e) => setNikInput(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white uppercase focus:outline-none focus:border-indigo-500" 
                        placeholder="Masukkan NIK Anda"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Password</label>
                      <input 
                        type="password" 
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                        placeholder="••••••••" 
                      />
                    </div>

                    <div className="pt-2 text-center text-[10px] text-slate-400 font-mono">
                      Device ID: {phoneDeviceId}
                    </div>

                    <div className="mt-auto pt-4">
                      <button 
                        type="submit"
                        disabled={loginLoading}
                        className="w-full bg-indigo-650 hover:bg-indigo-600 disabled:bg-slate-800 text-white py-2 rounded text-xs font-bold transition flex items-center justify-center gap-1 shadow-md"
                      >
                        {loginLoading ? (
                          <>
                            <RefreshCw className="animate-spin" size={13} />
                            Menghubungkan Server...
                          </>
                        ) : (
                          <>
                            <ShieldCheck size={14} />
                            LOGIN ONLINE (BIND DEVICE)
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* STATE 2 VIEW: Locked State (PIN daily unlock - supports Offline!) */}
              {authStage === 'locked' && (
                <div className="grow flex flex-col justify-between py-2 px-1 animate-fadeIn">
                  <div className="text-center mt-6">
                    <div className="mx-auto w-12 h-12 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center border border-amber-500/20 mb-2">
                      <Key size={20} />
                    </div>
                    <h3 className="font-bold text-base font-display">Aplikasi Terkunci</h3>
                    <p className="text-[10px] text-slate-400 tracking-wide uppercase font-mono">
                      STATE 2: Unlock Harian (Offline / Online OK)
                    </p>
                    <div className="text-slate-300 text-xs font-semibold mt-1">
                      {secureStore.userProfile?.nama || "Petugas Lapangan"}
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">NIK: {secureStore.userProfile?.nik}</p>
                  </div>

                  {/* 6 Dots PIN Indicators */}
                  <div className="my-3 text-center">
                    <motion.div 
                      key={shakeTrigger}
                      animate={shakeTrigger ? { x: [-10, 10, -10, 10, 0] } : {}}
                      transition={{ duration: 0.4 }}
                      className="flex justify-center items-center gap-3"
                    >
                      {[0, 1, 2, 3, 4, 5].map((idx) => (
                        <div 
                          key={idx}
                          className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                            idx < pinDots.length 
                              ? 'bg-amber-400 border-amber-400 scale-110 shadow-glow' 
                              : 'bg-transparent border-slate-700'
                          }`}
                        />
                      ))}
                    </motion.div>
                    
                    {pinError ? (
                      <p className="text-rose-455 text-[11px] mt-3 font-semibold">{pinError}</p>
                    ) : (
                      <p className="text-slate-400 text-[10px] mt-3">Silakan masukkan 6 Digit PIN anda</p>
                    )}
                  </div>

                  {/* Custom NumPad Mobile UI UI Grid (Request constraints met!) */}
                  <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-900 mb-2" id="phone_numpad">
                    <div className="grid grid-cols-3 gap-2">
                      {/* Numbers 1-9 */}
                      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => handleNumpadPress(num)}
                          className="py-2 bg-slate-900 rounded-lg text-sm font-bold text-slate-200 hover:bg-slate-800 active:bg-amber-500 active:text-slate-950 transition-all font-mono"
                        >
                          {num}
                        </button>
                      ))}
                      {/* Clear Button */}
                      <button 
                        type="button"
                        onClick={handleNumpadClear}
                        className="py-2 bg-slate-900 rounded-lg text-xs font-bold text-slate-400 hover:bg-slate-800 transition font-mono"
                      >
                        CLR
                      </button>
                      {/* Zero */}
                      <button 
                        type="button"
                        onClick={() => handleNumpadPress("0")}
                        className="py-2 bg-slate-900 rounded-lg text-sm font-bold text-slate-200 hover:bg-slate-800 active:bg-amber-500 active:text-slate-950 transition font-mono"
                      >
                        0
                      </button>
                      {/* Backspace */}
                      <button 
                        type="button"
                        onClick={handleNumpadBackspace}
                        className="py-2 bg-slate-900 rounded-lg text-xs font-bold text-slate-400 hover:bg-slate-800 transition font-mono"
                      >
                        DEL
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STATE 3 VIEW: Authenticated Main Menu (Field billing operations) */}
              {authStage === 'authenticated' && (
                <div className="grow flex flex-col justify-between py-1 px-1 animate-fadeIn overflow-auto text-slate-100">
                  
                  {/* Dashboard Header within phone */}
                  <div>
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-2 shrink-0">
                      <div>
                        <div className="text-[9px] font-mono uppercase text-slate-450 tracking-wider">Collector Mobile</div>
                        <div className="font-bold text-xs text-emerald-400">{secureStore.userProfile?.nama?.split(' ')[0]}</div>
                      </div>
                      <button
                        type="button"
                        onClick={handleLockMobileManual}
                        className="bg-slate-800 hover:bg-slate-750 text-slate-305 text-[9px] font-bold px-2 py-1 rounded flex items-center gap-1 transition"
                      >
                        <Lock size={10} />
                        Kunci HP
                      </button>
                    </div>

                    {/* Offline-first indicators inside mobile */}
                    <div className="p-2 bg-slate-950/80 rounded border border-slate-850 text-[10px] mb-3 leading-relaxed">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-slate-400">Status Mobile App:</span>
                        <span className={`px-1 rounded-sm text-[9px] font-bold uppercase ${
                          isPhoneOffline ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                        }`}>
                          {isPhoneOffline ? 'OFFLINE WORKING' : 'CONNECTED'}
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-400">
                        {isPhoneOffline 
                          ? "Mampu menyimpan penagihan lokal tanpa internet. PIN verifikasi wajib saat Gagal Tagih." 
                          : "Koneksi online aktif. Tekan Sinkronisasikan setelah penagihan lapangan."}
                      </p>
                    </div>

                    {/* Simulated queue warning banner */}
                    {syncMessage && (
                      <div className="p-2 bg-indigo-950/80 border border-indigo-800 text-[10px] text-indigo-200 rounded mb-3 animate-fadeIn">
                        {syncMessage}
                      </div>
                    )}

                    {/* Field Tasks List of Simulated Schedules */}
                    <div className="space-y-2">
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wide flex justify-between">
                        <span>Penagihan Mingguan Hari Ini</span>
                        <span>{simulatedPayments.length} Nasabah</span>
                      </div>
                      
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                        {simulatedPayments.map((item) => (
                          <div 
                            key={item.id} 
                            className="bg-slate-950/60 p-2 rounded border border-slate-850 flex flex-col gap-1.5"
                          >
                            <div className="flex justify-between items-start text-[10px]">
                              <div>
                                <span className="font-bold text-slate-205">{item.customerName}</span>
                                <span className="text-[9px] text-slate-400 block">Unit Term: {item.term} • Rp {item.amount.toLocaleString('id-ID')}</span>
                              </div>
                              
                              {/* Display Badge of current simulated result status */}
                              <div>
                                {item.status === 'UNPAID' && (
                                  <span className="bg-slate-900 border border-slate-800 text-slate-400 px-1 py-0.5 rounded text-[8px] font-bold">Unpaid</span>
                                )}
                                {item.status === 'BAYAR' && (
                                  <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-1 py-0.5 rounded text-[8px] font-bold">TERBAYAR</span>
                                )}
                                {item.status === 'GAGAL_TAGIH' && (
                                  <span className="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-1 py-0.5 rounded text-[8px] font-bold">GAGAL TAGIH</span>
                                )}
                                {item.status === 'SYNCED_OK' && (
                                  <span className="bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 px-1 py-0.5 rounded text-[8px] font-bold flex items-center gap-0.5">
                                    <CheckCircle2 size={7} />
                                    SYNC BACKEND
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Action Buttons with constraints for PIN trigger */}
                            {item.status === 'UNPAID' && (
                              <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => handlePaymentCollected(item.id, 'BAYAR')}
                                  className="py-1 px-2 bg-slate-900 hover:bg-emerald-950 hover:text-emerald-400 text-slate-400 rounded text-[9px] font-bold border border-slate-800 hover:border-emerald-550/40 text-center transition"
                                >
                                  Terima Bayar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePaymentCollected(item.id, 'GAGAL_TAGIH')}
                                  className="py-1 px-2 bg-slate-900 hover:bg-rose-950 hover:text-rose-400 text-slate-400 rounded text-[9px] font-bold border border-slate-800 hover:border-rose-550/40 text-center transition"
                                >
                                  Gagal Tagih (Kritis)
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>

                  {/* Push sync button footer for server submission */}
                  <div className="pt-2 mt-auto border-t border-slate-850 shrink-0">
                    <button
                      type="button"
                      onClick={handleSyncPushToServer}
                      disabled={!offlineSyncRequired}
                      className={`w-full py-2 rounded text-xs font-bold transition flex items-center justify-center gap-1.5 shadow ${
                        offlineSyncRequired 
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-955 cursor-pointer font-bold' 
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-850'
                      }`}
                    >
                      <UploadCloud size={13} />
                      SYNC PUSH KE SERVER (Verifikasi PIN)
                    </button>
                    {offlineSyncRequired && (
                      <p className="text-[8px] text-amber-400 text-center mt-1 font-semibold animate-pulse">
                        * Ada perubahan lokal yang belum disinkronkan ke server pusat.
                      </p>
                    )}
                  </div>

                </div>
              )}

              {/* FLOATING ACTION VERIFICATION PIN PIN MODAL FOR SENSITIVE ACTIONS */}
              {/* Menyimulasikan helper hook usePinVerification() */}
              <AnimatePresence>
                {pinVerificationModal.isOpen && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-slate-950/95 z-40 p-4 flex flex-col justify-between"
                  >
                    <div className="text-center mt-6">
                      <div className="mx-auto w-10 h-10 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center border border-rose-500/25 mb-2">
                        <ShieldAlert size={18} className="animate-pulse" />
                      </div>
                      <h4 className="font-bold text-xs text-rose-400 tracking-wider uppercase font-mono">
                        VERIFIKASI AKSI KRUSIAL
                      </h4>
                      <p className="text-[11px] text-white font-medium mt-1 uppercase leading-snug">
                        {pinVerificationModal.actionLabel}
                      </p>
                      <p className="text-[9px] text-slate-455 mt-1 leading-relaxed">
                        Aksi ini memerlukan konfirmasi PIN 6 digit demi keamanan kepatuhan offline-first.
                      </p>
                    </div>

                    {/* PIN dots display */}
                    <div className="my-1 text-center">
                      <motion.div 
                        key={pinVerificationModal.shake}
                        animate={pinVerificationModal.shake ? { x: [-8, 8, -8, 8, 0] } : {}}
                        transition={{ duration: 0.4 }}
                        className="flex justify-center items-center gap-2 mb-2"
                      >
                        {[0, 1, 2, 3, 4, 5].map((idx) => (
                          <div 
                            key={idx}
                            className={`w-3 h-3 rounded-full border-2 transition-all ${
                              idx < pinVerificationModal.enteredPin.length 
                                ? 'bg-rose-400 border-rose-400 scale-110 shadow-glow' 
                                : 'bg-transparent border-slate-700'
                            }`}
                          />
                        ))}
                      </motion.div>
                      {pinVerificationModal.errorMessage && (
                        <p className="text-rose-400 text-[10px] font-semibold">{pinVerificationModal.errorMessage}</p>
                      )}
                    </div>

                    {/* Custom NumPad for verification */}
                    <div className="bg-slate-900 border border-slate-850 p-2.5 rounded-xl">
                      <div className="grid grid-cols-3 gap-1.5">
                        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => handleModalNumpadPress(num)}
                            className="py-1.5 bg-slate-955 rounded text-xs font-bold text-slate-200 hover:bg-slate-800 transition font-mono"
                          >
                            {num}
                          </button>
                        ))}
                        <button 
                          type="button"
                          onClick={() => setPinVerificationModal(prev => ({ ...prev, enteredPin: "", errorMessage: null }))}
                          className="py-1.5 bg-slate-955 rounded text-[10px] text-slate-400 font-mono"
                        >
                          BATAL
                        </button>
                        <button 
                          type="button"
                          onClick={() => handleModalNumpadPress("0")}
                          className="py-1.5 bg-slate-955 rounded text-xs font-bold text-slate-200 font-mono"
                        >
                          0
                        </button>
                        <button 
                          type="button"
                          onClick={() => setPinVerificationModal({ isOpen: false, onSuccess: () => {}, actionLabel: "", enteredPin: "", errorMessage: null, shake: 0 })}
                          className="py-1.5 bg-rose-950/40 hover:bg-rose-900 rounded text-[9px] text-rose-300 font-semibold"
                        >
                          CANCEL
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: The Explanations & Inspection Panel (Lg: 7/12 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Hardware Sim control panel */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200" id="sim_hardware_controls">
            <h3 className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wider mb-3 flex items-center gap-2">
              <Cpu className="text-indigo-500" size={16} />
              HARDWARE SIMULATION CONTROLS
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Konfigurasi parameter fisik smartphone penagih lapangan untuk memicu skenario koneksi offline 
              ataupun pembatasan pendaftaran kunci ID perangkat secara real-time.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Connection configuration */}
              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-slate-700">Phone Network Status:</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    isPhoneOffline ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                  }`}>
                    {isPhoneOffline ? 'OFFLINE' : 'ONLINE'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPhoneOffline(!isPhoneOffline)}
                  className={`w-full py-1.5 px-3 rounded text-xs font-bold transition flex items-center justify-center gap-1 ${
                    isPhoneOffline 
                      ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800' 
                      : 'bg-amber-100 hover:bg-amber-200 text-amber-800'
                  }`}
                >
                  {isPhoneOffline ? <Wifi size={14} /> : <WifiOff size={14} />}
                  {isPhoneOffline ? 'Set Phone to Connected (ONLINE)' : 'Cut Connection (OFFLINE)'}
                </button>
                <span className="text-[9px] text-slate-450 block mt-1.5 leading-relaxed">
                  * Login awal (STATE 1) mewajibkan online. Jika offline, backend tidak dihubungi.
                  Unlock PIN (STATE 2) dapat diproses offline penuh menggunakan cryptographic storage lokal.
                </span>
              </div>

              {/* Device ID Spoofer */}
              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-slate-700">Mobile Device ID (UUID):</span>
                  <span className="font-mono text-[11px] bg-slate-900 text-emerald-400 px-2 py-0.5 rounded">
                    {phoneDeviceId}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateNewDeviceId}
                  className="w-full py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-xs font-bold transition flex items-center justify-center gap-1"
                >
                  <Smartphone size={14} />
                  Spoof / Ganti Device ID HP
                </button>
                <span className="text-[9px] text-slate-455 block mt-1.5 leading-relaxed">
                  * Mensimulasikan petugas mengunduh aplikasi di handphone fisik baru yang berbeda. 
                  Gunakan ini untuk mencoba login dengan NIK 123456 demi memicu validasi Device Binding Lock!
                </span>
              </div>
            </div>
          </div>

          {/* SecureStore view representation */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
            <h3 className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Key className="text-amber-500" size={16} />
              EXPO SIMULATED SECURE STORE INSPECTOR
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Melihat penyimpanan lokal terenkripsi di internal hardware smartphone (expo-secure-store). 
              PIN asli tidak pernah disimpan melainkan yang disimpan hanyalah standard base64 accessToken 
              dan SHA256 hashed offline PIN.
            </p>

            <div className="bg-slate-950 rounded-lg p-3 text-xs font-mono text-slate-300 space-y-2 border border-slate-900 overflow-x-auto">
              <div>
                <span className="text-amber-400 font-bold">SecureStore.getItemAsync('accessToken'):</span>
                <span className="text-emerald-400 text-[11px] break-all block pl-4 mt-0.5 whitespace-pre-wrap">
                  {secureStore.accessToken ? `"${secureStore.accessToken}"` : "null (Belum login/Unauthenticated)"}
                </span>
              </div>
              <div>
                <span className="text-amber-400 font-bold">SecureStore.getItemAsync('userProfile'):</span>
                <span className="text-blue-300 text-[11px] break-all block pl-4 mt-0.5">
                  {secureStore.userProfile ? JSON.stringify(secureStore.userProfile, null, 2) : "null"}
                </span>
              </div>
              <div>
                <span className="text-amber-400 font-bold">SecureStore.getItemAsync('offlinePinHash'):</span>
                <span className="text-purple-300 text-[11px] block pl-4 mt-0.5">
                  {secureStore.offlinePinHash ? `"${secureStore.offlinePinHash}"` : "null (PIN tersimpan luar biasa aman)"}
                </span>
                {secureStore.offlinePinHash && (
                  <span className="text-[9px] text-slate-400 bg-slate-900 px-1 py-0.5 rounded border border-slate-800 ml-4 mt-1 inline-block">
                    * Verifikasi PIN dilakukan secara offline seutuhnya dengan mencocokkan SHA-256 lokal dari input numpad.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Simulated Prisma User database table */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center gap-2">
                  <Database className="text-blue-500" size={16} />
                  PRISMA USER TABLE (BACKEND SIMULATION STATE)
                </h3>
                <p className="text-xs text-slate-500">
                  Merepresentasikan data tabel User terkueri real-time dari database pusat di server cloud Express + Prisma.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchBackendUsers}
                className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-xs font-bold transition flex items-center gap-1 self-start md:self-center"
              >
                <RefreshCw size={11} className={backendLoading ? "animate-spin" : ""} />
                Fetch DB
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-205 text-slate-600 font-mono uppercase text-[9px] font-bold">
                    <th className="py-2 px-3">Petugas (NIK)</th>
                    <th className="py-2 px-3">Role</th>
                    <th className="py-2 px-3">Device ID Terikat (device_id)</th>
                    <th className="py-2 px-3 text-right">Aksi DB Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {backendUsers.map((usr) => (
                    <tr key={usr.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3">
                        <div className="font-bold text-slate-800 text-[11px]">{usr.nama}</div>
                        <div className="text-[10px] text-slate-500">NIK: {usr.nik}</div>
                        <div className="text-[9px] text-slate-400 mt-0.5 truncate max-w-[170px]" title="Password hash SHA255">PW Hash: {usr.password_hash.slice(0, 15)}...</div>
                      </td>
                      <td className="py-2 px-3">
                        <span className="px-1.5 py-0.5 bg-slate-900 text-white rounded text-[9px] uppercase font-bold">
                          {usr.role}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        {usr.device_id ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-emerald-600 font-bold text-[10px] bg-emerald-50 px-1.5 py-0.5 border border-emerald-100 rounded inline-block self-start">
                              {usr.device_id}
                            </span>
                            <span className="text-[8px] text-slate-400 font-sans leading-tight">
                              🔒 Terikat ke HP ini. Hanya HP ini yang boleh login.
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">
                            [BELUM TERIKAT]
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {usr.device_id ? (
                          <button
                            type="button"
                            onClick={() => handleReleaseServerDeviceBinding(usr.id)}
                            className="bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 px-2 py-1 rounded text-[10px] font-bold transition flex items-center gap-0.5 ml-auto"
                            title="Konfirmasi lepas binding untuk ganti HP"
                          >
                            <Trash2 size={11} />
                            Reset Limit
                          </button>
                        ) : (
                          <span className="text-slate-400 text-[10px] font-sans italic">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {backendUsers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-400 font-sans">
                        Gagal mengueri database pusat, silakan klik tombol Reset data atau Fetch DB.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-3.5 bg-indigo-50 border border-indigo-100 rounded-lg text-xs leading-relaxed text-indigo-900">
              <span className="font-bold flex items-center gap-1 mb-1">
                <HelpCircle size={14} className="text-indigo-600 shrink-0" />
                Cara Menguji Alur Skenario Anda:
              </span>
              <ul className="list-decimal list-inside space-y-1 pl-1 text-[11.5px]">
                <li>
                  Gunakan NIK <strong className="font-bold">123456</strong> dan password <strong className="font-bold">petugas123</strong> dengan device HP saat ini. Login berhasil, menyimpan data terenkripsi di SecureStore, dan mengikat Device ID ini pada database pusat.
                </li>
                <li>
                  Ubah stat koneksi ke <strong className="font-bold">OFFLINE</strong>, klik "Kunci HP". Masukkan 6-digit PIN <strong className="font-bold">123456</strong> pada numpad, HP terbuka secara offline penuh!
                </li>
                <li>
                  Klik "Spoof / Ganti Device ID HP" di atas untuk mensimulasikan petugas menggunakan HP baru, lalu coba login online dengan NIK <strong className="font-bold">123456</strong>. Login akan <strong className="font-bold text-rose-700">ditolak</strong> karena terikat pada smartphone lama!
                </li>
                <li>
                  Klik <strong className="font-bold">Reset Limit</strong> pada tabel database untuk membebaskan akun tersebut dan mengikat ke HP baru Anda secara dinamis.
                </li>
              </ul>
            </div>
            
          </div>

        </div>

      </div>
    </div>
  );
}
