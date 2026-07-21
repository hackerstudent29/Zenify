"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { useGoogleLogin } from '@react-oauth/google';
import { Eye, EyeOff, Check, X, Loader2 } from "lucide-react";
import { ZenifyLogo } from "@/components/shared/ZenifyLogo";
import { motion, AnimatePresence } from "framer-motion";
import { ReactiveAudioBackground } from "@/components/player/ReactiveAudioBackground";

export default function AuthPage() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    if (mode === 'signup') {
      setActiveTab('signup');
    } else {
      setActiveTab('login');
    }
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetStep, setResetStep] = useState<'request' | 'verify'>('request');
  const [otp, setOtp] = useState("");
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleGoogleLogin = useGoogleLogin({
    flow: 'auth-code',
    onSuccess: async (codeResponse) => {
      try {
        setIsLoading(true);
        const res = await api.post('auth/google', { code: codeResponse.code });
        login(res.data.user, res.data.accessToken);
        showToast("Signed in successfully with Google", "success");
        router.push('/');
      } catch (err: any) {
        const msg = err.response?.data?.message || err.message || "Google login failed";
        console.error("Google login error:", msg);
        setError(msg);
        showToast(msg, "error");
      } finally {
        setIsLoading(false);
      }
    },
    onError: () => {
      const msg = "Google login was cancelled or failed";
      setError(msg);
      showToast(msg, "error");
    },
  });

  const handleForgotPasswordRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await api.post("auth/request-otp", { email });
      setResetStep('verify');
      showToast("Reset code sent to your email", "success");
    } catch (err: any) {
      showToast(err.response?.data?.message || "Failed to send reset code", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await api.post("auth/reset-password", { email, otp, password });
      setShowForgotPassword(false);
      setResetStep('request');
      setOtp("");
      setPassword("");
      showToast("Password reset successfully. Please log in.", "success");
    } catch (err: any) {
      showToast(err.response?.data?.message || "Reset failed", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const res = await api.post("auth/verify-email", { email, otp });
      login(res.data.user, res.data.accessToken);
      showToast("Email verified! Welcome to Zenify", "success");
      router.push("/");
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || "Verification failed";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    try {
      if (activeTab === 'login') {
        const res = await api.post("auth/login", { email: trimmedEmail, password: trimmedPassword });
        login(res.data.user, res.data.accessToken);
        showToast("Welcome back to Zenify", "success");
        router.push("/");
      } else {
        const res = await api.post("auth/register", { email: trimmedEmail, password: trimmedPassword, name: name.trim() });
        if (res.data.requiresVerification) {
          setIsVerifyingEmail(true);
          setOtp("");
          showToast("Verification code sent to your email", "success");
        } else {
          login(res.data.user, res.data.accessToken);
          showToast("Account created successfully", "success");
          router.push("/");
        }
      }
    } catch (err: any) {
      console.error("Login/Register catch error:", err);
      const backendMsg = err.response?.data?.message || err.response?.data?.error;
      let msg = backendMsg || (activeTab === 'login' ? 'Invalid email or password' : 'Registration failed');

      if (msg.toLowerCase().includes('not verified')) {
        setIsVerifyingEmail(true);
        setOtp('');
        showToast('Please verify your email to continue', 'success');
        return;
      }

      if (msg.toLowerCase().includes('invalid email or password')) {
        msg = 'Incorrect email or password. Use "Forgot?" to reset it.';
      } else if (msg.toLowerCase().includes('network error') || !err.response) {
        msg = 'Connection failed. Please check your internet.';
      }

      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = "w-full rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-md px-4 py-3 text-[13px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/50 transition-all shadow-inner";

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black p-4 select-none">
      {/* Dark Ambient Glassmorphic Background */}
      <ReactiveAudioBackground variant="fullview" speedMultiplier={0.3} />
      
      {/* Dark Frosted Glass Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[40px] pointer-events-none z-0" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[380px] px-6 py-8 rounded-2xl text-center"
      >
        {/* Zenify Logo */}
        <div className="flex justify-center mb-6">
          <ZenifyLogo size={48} />
        </div>

        {/* Header Text */}
        <div className="mb-8 space-y-1 text-center">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {showForgotPassword 
              ? "Reset password" 
              : (activeTab === 'login' ? "Welcome back" : "Create account")}
          </h1>
          <p className="text-[13px] font-medium text-zinc-400">
            {showForgotPassword
              ? "Enter your email to receive a reset code"
              : (activeTab === 'login' ? "Sign in to continue listening" : "Start your music journey today")}
          </p>
        </div>

        {/* Forms */}
        <AnimatePresence mode="wait">
          {isVerifyingEmail ? (
            <motion.form
              key="verify-form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              onSubmit={handleVerifyEmail}
              className="space-y-4 text-left"
            >
              <div className="space-y-3">
                <div className="text-center space-y-1">
                  <h3 className="text-base font-bold text-white">Verify Email</h3>
                  <p className="text-[12px] text-zinc-400">Enter code sent to <span className="text-rose-400 font-medium">{email}</span></p>
                </div>
                <div className="space-y-1 pt-1">
                  <label className="text-[12px] font-semibold text-zinc-300">Security Code</label>
                  <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)}
                    placeholder="000000" maxLength={6} required
                    className={`${inputClass} text-center tracking-[0.5em] font-mono text-xl py-3 h-12 bg-black/50 border-white/20 font-bold placeholder:text-xl placeholder:font-medium placeholder:text-zinc-500`} />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-[12px] font-medium">
                  <X size={14} /> {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 text-[13px] font-bold text-rose-500 border border-white/10 transition-all disabled:opacity-50 mt-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Complete registration"}
              </button>
              <button type="button" onClick={() => { setIsVerifyingEmail(false); setError(""); }}
                className="w-full text-[12px] text-zinc-400 hover:text-white transition-colors py-1 text-center font-medium">
                ← Back
              </button>
            </motion.form>
          ) : showForgotPassword ? (
            <motion.form
              key="forgot-form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              onSubmit={resetStep === 'request' ? handleForgotPasswordRequest : handleResetPassword}
              className="space-y-4 text-left"
            >
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[12px] font-semibold text-zinc-300">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com" required disabled={resetStep === 'verify'}
                    className={inputClass} />
                </div>
                {resetStep === 'verify' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[12px] font-semibold text-zinc-300">Code</label>
                      <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)}
                        placeholder="000000" maxLength={6} required
                        className={`${inputClass} text-center tracking-[0.4em] font-mono`} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[12px] font-semibold text-zinc-300">New Password</label>
                      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••" required className={inputClass} />
                    </div>
                  </>
                )}
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 text-[13px] font-bold text-rose-500 border border-white/10 transition-all disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (resetStep === 'request' ? "Send Code" : "Update Password")}
              </button>
              <button type="button" onClick={() => {
                setShowForgotPassword(false);
                setResetStep('request');
                setPassword("");
                setOtp("");
                setError("");
              }}
                className="w-full text-[12px] text-zinc-400 hover:text-white transition-colors py-1 text-center font-medium">
                ← Back to sign in
              </button>
            </motion.form>
          ) : (
            <motion.form
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleSubmit}
              className="space-y-4 text-left"
            >
              <div className="space-y-3.5">
                {activeTab === 'signup' && (
                  <div className="space-y-1">
                    <label className="text-[12px] font-semibold text-zinc-300">Name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                      placeholder="Your name" className={inputClass} />
                  </div>
                )}
                
                <div className="space-y-1">
                  <label className="text-[12px] font-semibold text-zinc-300">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com" required className={inputClass} />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[12px] font-semibold text-zinc-300">Password</label>
                    {activeTab === 'login' && (
                      <button type="button" onClick={() => {
                        setShowForgotPassword(true);
                        setPassword("");
                        setOtp("");
                        setError("");
                        setResetStep('request');
                      }}
                        className="text-[12px] font-semibold text-rose-500 hover:text-rose-400 transition-colors">
                        Forgot?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} value={password}
                      onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                      required className={`${inputClass} pr-10`} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {activeTab === 'signup' && (
                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input type="checkbox" required className="h-3.5 w-3.5 rounded border-white/20 bg-black/40 text-rose-500 focus:ring-rose-500" />
                    <span className="text-[11px] text-zinc-400 font-medium">I agree to the Terms & Privacy Policy</span>
                  </label>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-[12px] font-medium">
                  <X size={14} /> {error}
                </div>
              )}

              <div className="pt-2 space-y-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center py-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-[13px] font-bold text-rose-500 border border-white/10 shadow-lg transition-all disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (activeTab === 'login' ? "Sign In" : "Create Account")}
                </button>

                <div className="relative flex items-center justify-center my-2">
                  <div className="w-full border-t border-white/10" />
                  <span className="absolute bg-[#181518] px-2 text-[10px] text-zinc-500 font-bold tracking-widest uppercase">OR</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleGoogleLogin()}
                  className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-4 py-3 text-[13px] font-semibold text-white transition-all"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Google
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Toggle Mode Link */}
        {!showForgotPassword && !isVerifyingEmail && (
          <div className="mt-8 text-center">
            <p className="text-[13px] text-zinc-400 font-medium">
              {activeTab === 'login' ? "Don't have an account? " : "Already have an account? "}
              <button
                type="button"
                onClick={() => {
                  setActiveTab(activeTab === 'login' ? 'signup' : 'login');
                  setError("");
                }}
                className="font-bold text-rose-500 hover:text-rose-400 transition-colors underline-offset-4 hover:underline"
              >
                {activeTab === 'login' ? "Sign up now" : "Sign in now"}
              </button>
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-[11px] text-zinc-600 font-medium">© 2026 Zenify</p>
        </div>
      </motion.div>

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-2xl border backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-[100] transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 ${toast.type === 'error'
          ? 'bg-red-500/20 border-red-500/30 text-red-300'
          : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
        }`}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          <span className="text-[13px] font-semibold tracking-tight">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
