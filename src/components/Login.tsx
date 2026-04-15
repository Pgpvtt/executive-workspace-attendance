import React, { useState } from 'react';
import { Building2, Lock, Badge, ArrowRight, AlertCircle, Loader2, Hash, Mail, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LoginProps {
  onLogin: (id: string, pass: string, companySlug: string) => Promise<string | null>;
  onSignup: () => void;
  onResendConfirmation: (email: string) => Promise<string | null>;
}

export default function Login({ onLogin, onSignup, onResendConfirmation }: LoginProps) {
  const [companySlug, setCompanySlug] = useState('');
  const [id,          setId]          = useState('');
  const [pass,        setPass]        = useState('');
  const [error,       setError]       = useState<string | null>(null);
  const [isLoading,   setIsLoading]   = useState(false);

  // Email-confirmation flow
  const [confirmEmail,    setConfirmEmail]    = useState<string | null>(null);
  const [resendLoading,   setResendLoading]   = useState(false);
  const [resendSuccess,   setResendSuccess]   = useState(false);
  const [resendError,     setResendError]     = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !pass.trim()) {
      setError('Please enter your Employee ID and password.');
      return;
    }
    setError(null);
    setConfirmEmail(null);
    setResendSuccess(false);
    setIsLoading(true);
    try {
      const err = await onLogin(id.trim(), pass, companySlug.trim());
      if (err) {
        if (err.startsWith('EMAIL_NOT_CONFIRMED:')) {
          setConfirmEmail(err.replace('EMAIL_NOT_CONFIRMED:', ''));
          setError('Your email address has not been confirmed. Check your inbox or resend the link below.');
        } else {
          setError(err);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!confirmEmail) return;
    setResendLoading(true);
    setResendError(null);
    setResendSuccess(false);
    const err = await onResendConfirmation(confirmEmail);
    setResendLoading(false);
    if (err) {
      setResendError(err);
    } else {
      setResendSuccess(true);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-primary/5 blur-[120px]"></div>
        <div className="absolute bottom-[-5%] left-[-5%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px]"></div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-[1000px] grid grid-cols-1 lg:grid-cols-2 bg-white rounded-3xl shadow-2xl overflow-hidden border border-outline-variant/10"
      >
        {/* Left Side: Branding */}
        <div className="hidden lg:flex flex-col justify-between p-16 bg-surface-container-low border-r border-outline-variant/10">
          <div>
            <div className="flex items-center gap-3 mb-12">
              <div className="w-10 h-10 bg-primary flex items-center justify-center rounded-xl shadow-lg shadow-primary/20">
                <Building2 className="text-white" size={24} />
              </div>
              <span className="text-xl font-black tracking-tight text-primary">Executive Workspace</span>
            </div>
            <h1 className="text-5xl font-black tracking-tight text-on-surface mb-6 leading-tight">
              Manage your time <br /> with <span className="text-primary">precision.</span>
            </h1>
            <p className="text-on-surface-variant text-lg leading-relaxed max-w-md">
              Access the central hub for team attendance, directory management, and office policy compliance.
            </p>
          </div>

          <div className="space-y-6">
            <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl shadow-sm max-w-sm border border-white">
              <p className="text-xs font-black text-primary mb-2 flex items-center gap-2 uppercase tracking-widest">
                Pro-tip
              </p>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                Use your Employee ID (e.g. #9942) or email address provided by Human Resources during onboarding.
              </p>
            </div>
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="flex flex-col justify-center p-8 md:p-16 lg:p-20 bg-white">
          <div className="lg:hidden flex items-center gap-3 mb-12">
            <div className="w-8 h-8 bg-primary flex items-center justify-center rounded-lg">
              <Building2 className="text-white" size={20} />
            </div>
            <span className="text-lg font-black tracking-tight text-primary">Executive Workspace</span>
          </div>

          <div className="mb-10">
            <h2 className="text-3xl font-black text-on-surface mb-2 tracking-tight">Sign In</h2>
            <p className="text-on-surface-variant font-medium">Enter your credentials to access your dashboard.</p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Error Banner */}
            <AnimatePresence>
              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex flex-col gap-3 bg-error/10 border border-error/20 text-error rounded-2xl px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <AlertCircle size={18} className="shrink-0" />
                    <p className="text-sm font-semibold">{error}</p>
                  </div>

                  {/* Resend confirmation section */}
                  {confirmEmail && (
                    <div className="border-t border-error/20 pt-3 mt-1">
                      {resendSuccess ? (
                        <div className="flex items-center gap-2 text-sm font-semibold text-green-600">
                          <CheckCircle2 size={16} />
                          Confirmation email sent to {confirmEmail}
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-error/80 mb-2">
                            Sending to: <span className="font-black">{confirmEmail}</span>
                          </p>
                          {resendError && (
                            <p className="text-xs text-error mb-2 font-semibold">{resendError}</p>
                          )}
                          <button
                            type="button"
                            onClick={handleResend}
                            disabled={resendLoading}
                            className="flex items-center gap-2 text-xs font-black uppercase tracking-widest bg-error text-white px-4 py-2 rounded-xl hover:bg-error/90 transition-colors disabled:opacity-60"
                          >
                            {resendLoading
                              ? <><Loader2 size={14} className="animate-spin" /> Sending…</>
                              : <><Mail size={14} /> Resend Confirmation Email</>
                            }
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Company Code */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">
                Company Code <span className="normal-case font-medium">(optional for email login)</span>
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Hash className="text-outline-variant group-focus-within:text-primary transition-colors" size={18} />
                </div>
                <input
                  type="text"
                  value={companySlug}
                  onChange={e => { setCompanySlug(e.target.value); setError(null); setConfirmEmail(null); }}
                  disabled={isLoading}
                  className="w-full pl-11 pr-4 py-4 bg-surface-container-low border-none rounded-2xl text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-primary/20 transition-all outline-none font-medium disabled:opacity-60"
                  placeholder="e.g. acmecorp-x7k2"
                  autoComplete="organization"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">
                Employee ID or Email
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Badge className="text-outline-variant group-focus-within:text-primary transition-colors" size={18} />
                </div>
                <input
                  type="text"
                  value={id}
                  onChange={(e) => { setId(e.target.value); setError(null); setConfirmEmail(null); }}
                  disabled={isLoading}
                  className="w-full pl-11 pr-4 py-4 bg-surface-container-low border-none rounded-2xl text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-primary/20 transition-all outline-none font-medium disabled:opacity-60"
                  placeholder="e.g. admin or admin@office.com"
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">
                Password
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="text-outline-variant group-focus-within:text-primary transition-colors" size={18} />
                </div>
                <input
                  type="password"
                  value={pass}
                  onChange={(e) => { setPass(e.target.value); setError(null); setConfirmEmail(null); }}
                  disabled={isLoading}
                  className="w-full pl-11 pr-4 py-4 bg-surface-container-low border-none rounded-2xl text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-primary/20 transition-all outline-none font-medium disabled:opacity-60"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-xl shadow-primary/20 hover:bg-primary-dim active:scale-[0.98] transition-all duration-200 mt-4 flex items-center justify-center gap-2 uppercase tracking-widest text-sm disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-on-surface-variant">
            New company?{' '}
            <button
              type="button"
              onClick={onSignup}
              className="font-black text-primary hover:underline"
            >
              Create an account
            </button>
          </p>

          <footer className="mt-8 pt-6 border-t border-outline-variant/10">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                © {new Date().getFullYear()} Executive Workspace
              </p>
              <div className="flex items-center gap-6">
                <button className="text-[10px] font-black text-on-surface-variant hover:text-primary transition-colors uppercase tracking-widest">Privacy</button>
                <button className="text-[10px] font-black text-on-surface-variant hover:text-primary transition-colors uppercase tracking-widest">Support</button>
              </div>
            </div>
          </footer>
        </div>
      </motion.div>
    </div>
  );
}
