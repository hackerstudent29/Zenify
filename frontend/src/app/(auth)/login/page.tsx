"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { useGoogleLogin } from '@react-oauth/google';
import { Eye, EyeOff, Check, X, Loader2 } from "lucide-react";
import { ZenifyLogo } from "@/components/shared/ZenifyLogo";
import { LiquidBackground } from "@/components/shared/LiquidBackground";

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
 onError: (err) => {
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
 // Use the exact message from the backend — the interceptor no longer swallows it
 const backendMsg = err.response?.data?.message || err.response?.data?.error;
 let msg = backendMsg || (activeTab === 'login' ? 'Invalid email or password' : 'Registration failed');

 // Handle unverified user: show the OTP verification screen
 if (msg.toLowerCase().includes('not verified')) {
 setIsVerifyingEmail(true);
 setOtp('');
 showToast('Please verify your email to continue', 'success');
 return;
 }

 // Friendlier copy for common cases
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

  const inputClass = "w-full rounded-xl border border-white/20 bg-black/60 backdrop-blur-xl px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-400 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/50 transition-all shadow-inner font-medium";

  return (
  <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black">
  <LiquidBackground coverUrl="/logo.png" />
  <div className="relative z-10 w-full max-w-[350px] px-5">

  {/* Logo + Header */}
  <div className="flex flex-col items-center mb-6 text-center">
  <div className="flex items-center gap-2.5 mb-4">
  <ZenifyLogo size={52} />
  </div>
  <h1 className="text-2xl font-bold tracking-tight text-white mb-1.5 drop-shadow-md">
  {showForgotPassword ? "Reset Password" : (activeTab === 'login' ? "Welcome back" : "Create account")}
  </h1>
  <p className="text-[13px] font-medium text-zinc-200">
  {showForgotPassword
  ? "Enter your details to regain access"
  : (activeTab === 'login' ? "Sign in to continue listening" : "Start your music journey")}
  </p>
  </div>

  <div className="space-y-5">
  {isVerifyingEmail ? (
  <form onSubmit={handleVerifyEmail} className="space-y-3.5 animate-in fade-in slide-in-from-right-4 duration-500">
  <div className="space-y-4">
  <div className="text-center space-y-1.5">
  <h3 className="text-lg font-bold text-white">Verify account</h3>
  <p className="text-[12px] text-zinc-200 font-medium">Enter the 6-digit code sent to <br /><span className="text-rose-400 font-bold">{email}</span></p>
  </div>
  <div className="space-y-1.5 pt-2">
  <label className="text-[12px] font-semibold text-zinc-200">Security Code</label>
  <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)}
  placeholder="000000" maxLength={6} required
  className={`${inputClass} text-center tracking-[0.5em] font-mono text-2xl py-4 h-14 bg-black/60 border-white/20 font-bold placeholder:text-2xl placeholder:font-medium placeholder:text-zinc-500`} />
  </div>
  </div>
  
  {error && (
  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-[12px] font-medium mt-2 animate-in fade-in duration-300">
  <X size={14} /> {error}
  </div>
  )}

  <button type="submit" disabled={isLoading}
  className="w-full h-11 flex items-center justify-center rounded-xl bg-gradient-to-r from-rose-600 to-pink-500 hover:from-rose-500 hover:to-pink-400 text-[13px] font-bold text-white shadow-[0_0_24px_rgba(244,63,94,0.5)] border border-white/20 transition-all disabled:opacity-50 mt-4">
  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Complete registration"}
  </button>
  <button type="button" onClick={() => { setIsVerifyingEmail(false); setError(""); }}
  className="w-full text-[12px] text-zinc-300 hover:text-white transition-colors py-2 font-semibold">
  ← Change email or password
  </button>
  </form>
  ) : showForgotPassword ? (
  <form onSubmit={resetStep === 'request' ? handleForgotPasswordRequest : handleResetPassword} className="space-y-3.5">
  <div className="space-y-3">
  <div className="space-y-1.5">
  <label className="text-[12px] font-semibold text-zinc-200">Email</label>
  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
  placeholder="you@example.com" required disabled={resetStep === 'verify'}
  className={`${inputClass} disabled:opacity-40`} />
  </div>
  {resetStep === 'verify' && (
  <>
  <div className="space-y-1.5">
  <label className="text-[12px] font-semibold text-zinc-200">Code</label>
  <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)}
  placeholder="000000" maxLength={6} required
  className={`${inputClass} text-center tracking-[0.4em] font-mono`} />
  </div>
  <div className="space-y-1.5">
  <label className="text-[12px] font-semibold text-zinc-200">New Password</label>
  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
  placeholder="••••••••" required className={inputClass} />
  </div>
  </>
  )}
  </div>
  <button type="submit" disabled={isLoading}
  className="w-full flex items-center justify-center rounded-xl bg-gradient-to-r from-rose-600 to-pink-500 hover:from-rose-500 hover:to-pink-400 py-2.5 text-[13px] font-bold text-white shadow-[0_0_24px_rgba(244,63,94,0.5)] border border-white/20 transition-all disabled:opacity-50">
  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (resetStep === 'request' ? "Send Code" : "Update Password")}
  </button>
  <button type="button" onClick={() => {
  setShowForgotPassword(false);
  setResetStep('request');
  setPassword("");
  setOtp("");
  setError("");
  }}
  className="w-full text-[12px] text-zinc-300 hover:text-white transition-colors py-1 font-semibold">
  ← Back to sign in
  </button>
  </form>
  ) : (
  <form onSubmit={handleSubmit} className="space-y-3.5">
  <div className="space-y-3">
  {activeTab === 'signup' && (
  <div className="space-y-1.5">
  <label className="text-[12px] font-semibold text-zinc-200">Name</label>
  <input type="text" value={name} onChange={(e) => setName(e.target.value)}
  placeholder="Your name" className={inputClass} />
  </div>
  )}
  <div className="space-y-1.5">
  <label className="text-[12px] font-semibold text-zinc-200">Email</label>
  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
  placeholder="you@example.com" required className={inputClass} />
  </div>
  <div className="space-y-1.5">
  <div className="flex justify-between items-center">
  <label className="text-[12px] font-semibold text-zinc-200">Password</label>
  {activeTab === 'login' && (
  <button type="button" onClick={() => {
  setShowForgotPassword(true);
  setPassword("");
  setOtp("");
  setError("");
  setResetStep('request');
  }}
  className="text-[12px] font-bold text-rose-400 hover:text-rose-300 transition-colors">
  Forgot?
  </button>
  )}
  </div>
  <div className="relative">
  <input type={showPassword ? "text" : "password"} value={password}
  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
  required className={`${inputClass} pr-10`} />
  <button type="button" onClick={() => setShowPassword(!showPassword)}
  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors">
  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
  </button>
  </div>
  </div>
  {activeTab === 'signup' && (
  <label className="flex items-center gap-2 cursor-pointer pt-0.5">
  <input type="checkbox" required className="h-3.5 w-3.5 rounded border-white/20 bg-black/40 text-rose-500 focus:ring-rose-500" />
  <span className="text-[11px] text-zinc-300 font-medium">I agree to the Terms & Privacy Policy</span>
  </label>
  )}
  </div>

  {error && (
  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-[12px] font-medium">
  <X size={14} /> {error}
  </div>
  )}

  <div className="pt-1.5 space-y-3.5">
  <button type="submit" disabled={isLoading}
  className="w-full flex items-center justify-center rounded-xl bg-gradient-to-r from-rose-600 via-rose-500 to-pink-500 hover:from-rose-500 hover:to-pink-400 py-2.5 text-[13px] font-bold text-white shadow-[0_0_24px_rgba(244,63,94,0.5)] border border-white/20 transition-all disabled:opacity-50">
  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (activeTab === 'login' ? "Sign In" : "Create Account")}
  </button>

  <div className="relative">
  <div className="absolute inset-0 flex items-center">
  <span className="w-full border-t border-white/15" />
  </div>
  <div className="relative flex justify-center">
  <span className="bg-black/80 backdrop-blur-md px-3 py-0.5 text-[11px] text-zinc-300 font-bold uppercase tracking-wider rounded-full border border-white/10">or</span>
  </div>
  </div>

  <button type="button" onClick={() => handleGoogleLogin()}
  className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 px-4 py-2.5 text-[13px] font-semibold text-white shadow-md backdrop-blur-md transition-all">
  <svg className="h-4 w-4" viewBox="0 0 24 24">
  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
  Google
  </button>
  </div>
  </form>
  )}
  </div>

  {/* Footer */}
  <div className="mt-7 text-center space-y-3.5">
  {!showForgotPassword && !isVerifyingEmail && (
  <p className="text-[13px] text-zinc-300 font-medium">
  {activeTab === 'login' ? "Don't have an account?" : "Already have an account?"}
  <button
  onClick={() => setActiveTab(activeTab === 'login' ? 'signup' : 'login')}
  className="ml-1.5 font-bold text-rose-400 hover:text-rose-300 transition-colors underline-offset-4 hover:underline"
  >
  {activeTab === 'login' ? "Sign up now" : "Sign in"}
  </button>
  </p>
  )}
  <p className="text-[11px] text-zinc-400 font-medium tracking-wider">© 2026 Zenify</p>
  </div>
  </div>

 {/* Toast Notification */}
 {toast && (
 <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-2xl border backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-[100] transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 ${toast.type === 'error'
 ? 'bg-red-500/10 border-red-500/20 text-red-400'
 : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
 }`}>
 {toast.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
 <span className="text-[13px] font-semibold tracking-tight">{toast.msg}</span>
 </div>
 )}
 </div>
 );
}
