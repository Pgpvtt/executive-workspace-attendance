import React, { useState } from 'react';
import { Building2, User, Mail, Lock, Badge, ArrowRight, AlertCircle, Loader2, CheckCircle2, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { dataService } from '../services/dataService';
import type { Company } from '../types';

interface SignupProps {
  onSignupComplete: (company: Company) => void;
  onBackToLogin: () => void;
}

export default function Signup({ onSignupComplete, onBackToLogin }: SignupProps) {
  const [companyName, setCompanyName] = useState('');
  const [adminName,   setAdminName]   = useState('');
  const [email,       setEmail]       = useState('');
  const [employeeId,  setEmployeeId]  = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [error,       setError]       = useState<string | null>(null);
  const [isLoading,   setIsLoading]   = useState(false);
  const [done,        setDone]        = useState<Company | null>(null);
  const [copied,      setCopied]      = useState(false);

  const clearError = () => setError(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !adminName.trim() || !email.trim() || !employeeId.trim() || !password) {
      setError('All fields are required.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const signupPromise = dataService.signUpNewCompany({
        companyName: companyName.trim(),
        adminName:   adminName.trim(),
        email:       email.trim(),
        password,
        employeeId:  employeeId.trim(),
      });

      // Global safety net — if the entire flow takes > 15s, stop and show error
      const company = await Promise.race([
        signupPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Signup timed out after 15s. Check your internet connection and try again.')), 15000)
        ),
      ]);

      setDone(company);
    } catch (err) {
      console.error('Signup error:', err);
      setError(err instanceof Error ? err.message : 'Sign-up failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const copySlug = () => {
    if (!done) return;
    navigator.clipboard.writeText(done.slug).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-5%] left-[-5%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-[1000px] grid grid-cols-1 lg:grid-cols-2 bg-white rounded-3xl shadow-2xl overflow-hidden border border-outline-variant/10"
      >
        {/* Left: Branding */}
        <div className="hidden lg:flex flex-col justify-between p-16 bg-surface-container-low border-r border-outline-variant/10">
          <div>
            <div className="flex items-center gap-3 mb-12">
              <div className="w-10 h-10 bg-primary flex items-center justify-center rounded-xl shadow-lg shadow-primary/20">
                <Building2 className="text-white" size={24} />
              </div>
              <span className="text-xl font-black tracking-tight text-primary">Executive Workspace</span>
            </div>
            <h1 className="text-5xl font-black tracking-tight text-on-surface mb-6 leading-tight">
              Set up your <br /> company in <span className="text-primary">minutes.</span>
            </h1>
            <p className="text-on-surface-variant text-lg leading-relaxed max-w-md">
              Create your company account, add employees, and start tracking attendance — all from one place.
            </p>
          </div>
          <div className="space-y-4">
            {['GPS-verified store visit tracking', 'Fraud detection & alerts', 'Real-time team dashboard'].map(f => (
              <div key={f} className="flex items-center gap-3">
                <CheckCircle2 size={18} className="text-primary shrink-0" />
                <span className="text-sm font-medium text-on-surface-variant">{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Form or Success */}
        <div className="flex flex-col justify-center p-8 md:p-16 bg-white overflow-y-auto">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-8 h-8 bg-primary flex items-center justify-center rounded-lg">
              <Building2 className="text-white" size={20} />
            </div>
            <span className="text-lg font-black tracking-tight text-primary">Executive Workspace</span>
          </div>

          <AnimatePresence mode="wait">
            {done ? (
              /* ── Success State ── */
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
              >
                <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-2">
                  <CheckCircle2 size={32} className="text-green-500" />
                </div>
                <div>
                  <h2 className="text-3xl font-black text-on-surface mb-2 tracking-tight">You're all set!</h2>
                  <p className="text-on-surface-variant font-medium">
                    <span className="font-black text-on-surface">{done.name}</span> is live. Share your company code with employees so they can log in.
                  </p>
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">Company Code</p>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-2xl font-black text-on-surface tracking-wider">{done.slug}</span>
                    <button
                      onClick={copySlug}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-outline-variant/20 rounded-xl text-[10px] font-black uppercase tracking-widest text-on-surface hover:bg-surface-container-low transition-colors"
                    >
                      {copied ? <><Check size={14} className="text-green-500" /> Copied</> : <><Copy size={14} /> Copy</>}
                    </button>
                  </div>
                  <p className="text-[10px] text-on-surface-variant font-medium mt-3">
                    Employees enter this code + their Employee ID to log in.
                  </p>
                </div>

                <button
                  onClick={() => onSignupComplete(done)}
                  className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-xl shadow-primary/20 hover:bg-primary-dim active:scale-[0.98] transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-sm"
                >
                  <span>Go to Dashboard</span>
                  <ArrowRight size={18} />
                </button>
              </motion.div>
            ) : (
              /* ── Sign-up Form ── */
              <motion.div key="form" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                <div className="mb-8">
                  <h2 className="text-3xl font-black text-on-surface mb-2 tracking-tight">Create Account</h2>
                  <p className="text-on-surface-variant font-medium">One account for your entire company.</p>
                </div>

                <form className="space-y-5" onSubmit={handleSubmit}>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-3 bg-error/10 border border-error/20 text-error rounded-2xl px-4 py-3"
                    >
                      <AlertCircle size={18} className="shrink-0" />
                      <p className="text-sm font-semibold">{error}</p>
                    </motion.div>
                  )}

                  {/* Company Name */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Company Name</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Building2 className="text-outline-variant group-focus-within:text-primary transition-colors" size={18} />
                      </div>
                      <input
                        type="text"
                        value={companyName}
                        onChange={e => { setCompanyName(e.target.value); clearError(); }}
                        disabled={isLoading}
                        className="w-full pl-11 pr-4 py-4 bg-surface-container-low border-none rounded-2xl text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-primary/20 outline-none font-medium disabled:opacity-60"
                        placeholder="Acme Corp"
                      />
                    </div>
                  </div>

                  {/* Admin Name */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Your Name</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <User className="text-outline-variant group-focus-within:text-primary transition-colors" size={18} />
                      </div>
                      <input
                        type="text"
                        value={adminName}
                        onChange={e => { setAdminName(e.target.value); clearError(); }}
                        disabled={isLoading}
                        className="w-full pl-11 pr-4 py-4 bg-surface-container-low border-none rounded-2xl text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-primary/20 outline-none font-medium disabled:opacity-60"
                        placeholder="Jane Smith"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Admin Email</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Mail className="text-outline-variant group-focus-within:text-primary transition-colors" size={18} />
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={e => { setEmail(e.target.value); clearError(); }}
                        disabled={isLoading}
                        className="w-full pl-11 pr-4 py-4 bg-surface-container-low border-none rounded-2xl text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-primary/20 outline-none font-medium disabled:opacity-60"
                        placeholder="jane@acmecorp.com"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  {/* Employee ID */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Employee ID (your login ID)</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Badge className="text-outline-variant group-focus-within:text-primary transition-colors" size={18} />
                      </div>
                      <input
                        type="text"
                        value={employeeId}
                        onChange={e => { setEmployeeId(e.target.value); clearError(); }}
                        disabled={isLoading}
                        className="w-full pl-11 pr-4 py-4 bg-surface-container-low border-none rounded-2xl text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-primary/20 outline-none font-medium disabled:opacity-60"
                        placeholder="e.g. admin01"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Password</label>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Lock className="text-outline-variant group-focus-within:text-primary transition-colors" size={18} />
                        </div>
                        <input
                          type="password"
                          value={password}
                          onChange={e => { setPassword(e.target.value); clearError(); }}
                          disabled={isLoading}
                          className="w-full pl-11 pr-4 py-4 bg-surface-container-low border-none rounded-2xl text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-primary/20 outline-none font-medium disabled:opacity-60"
                          placeholder="••••••••"
                          autoComplete="new-password"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Confirm</label>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Lock className="text-outline-variant group-focus-within:text-primary transition-colors" size={18} />
                        </div>
                        <input
                          type="password"
                          value={confirm}
                          onChange={e => { setConfirm(e.target.value); clearError(); }}
                          disabled={isLoading}
                          className="w-full pl-11 pr-4 py-4 bg-surface-container-low border-none rounded-2xl text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-primary/20 outline-none font-medium disabled:opacity-60"
                          placeholder="••••••••"
                          autoComplete="new-password"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-xl shadow-primary/20 hover:bg-primary-dim active:scale-[0.98] transition-all mt-2 flex items-center justify-center gap-2 uppercase tracking-widest text-sm disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isLoading
                      ? <><Loader2 size={18} className="animate-spin" /><span>Creating Account…</span></>
                      : <><span>Create Company</span><ArrowRight size={18} /></>
                    }
                  </button>
                </form>

                <p className="mt-8 text-center text-sm text-on-surface-variant">
                  Already have an account?{' '}
                  <button
                    onClick={onBackToLogin}
                    className="font-black text-primary hover:underline"
                  >
                    Sign In
                  </button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
