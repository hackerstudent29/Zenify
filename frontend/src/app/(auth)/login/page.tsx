"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import api from "@/lib/api";
import { useGoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { Eye, EyeOff, Check, X, Loader2, AlertCircle } from "lucide-react";
import { ZenifyLogo } from "@/components/shared/ZenifyLogo";
import { LiquidBackground } from "@/components/shared/LiquidBackground";
import { SEO } from "@/components/shared/SEO";
import { cn } from "@/lib/utils";

function AuthPageContent() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuthStore();
  const showLoginSplash = useUIStore(s => s.showLoginSplash);
  const setShowLoginSplash = useUIStore(s => s.setShowLoginSplash);

  useEffect(() => {
    if (isAuthenticated && !showLoginSplash) {
      router.replace('/');
    }
  }, [isAuthenticated, showLoginSplash, router]);

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
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
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

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    if (error) setError("");
  };

  const handleGoogleLogin = useGoogleLogin({
    flow: 'auth-code',
    onSuccess: async (codeResponse) => {
      try {
        setIsGoogleLoading(true);
        setError("");
        setFieldErrors({});
        const res = await api.post('auth/google', { code: codeResponse.code });
        login(res.data.user, res.data.accessToken);
        if (res.data.isNewUser) {
          try {
            localStorage.removeItem(`zenify_tour_completed_${res.data.user.id}`);
            localStorage.removeItem("zenify_tour_completed");
            sessionStorage.setItem("zenify_force_tour", "true");
          } catch (e) {}
        }
        showToast("Signed in successfully with Google", "success");
        sessionStorage.setItem("zenify_just_arrived", "true");
        setShowLoginSplash(true);
        router.prefetch('/');
        router.replace('/');
      } catch (err: any) {
        const msg = err.response?.data?.message || err.message || "Google login failed";
        console.error("Google login error:", msg);
        setError(msg);
        showToast(msg, "error");
      } finally {
        setIsGoogleLoading(false);
      }
    },
    onError: (err) => {
      const msg = "Google login was cancelled or failed";
      setError(msg);
      showToast(msg, "error");
      setIsGoogleLoading(false);
    },
  });

  const handleForgotPasswordRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFieldErrors({ email: "Please enter a valid email address" });
      setError("Please provide a valid email");
      return;
    }
    setFieldErrors({});
    setIsLoading(true);
    try {
      await api.post("auth/request-otp", { email: email.trim() });
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
    setError("");
    const errors: { [key: string]: string } = {};
    if (!otp.trim() || otp.trim().length !== 6) {
      errors.otp = "Enter 6-digit code";
    }
    if (!password || password.length < 6) {
      errors.password = "Password must be at least 6 characters";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Please check the required fields");
      return;
    }
    setFieldErrors({});
    setIsLoading(true);
    try {
      await api.post("auth/reset-password", { email: email.trim(), otp: otp.trim(), password });
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
    if (!otp.trim() || otp.trim().length !== 6) {
      setFieldErrors({ otp: "Enter 6-digit verification code" });
      setError("Please enter the 6-digit code");
      return;
    }
    setFieldErrors({});
    setIsLoading(true);
    try {
      const res = await api.post("auth/verify-email", { email: email.trim(), otp: otp.trim() });
      login(res.data.user, res.data.accessToken);
      showToast("Email verified! Welcome to Zenify", "success");
      setShowLoginSplash(true);
      router.prefetch('/');
      router.replace('/');
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
    const errors: { [key: string]: string } = {};

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (activeTab === 'signup') {
      if (!name.trim()) {
        errors.name = "Please enter your name";
      }
      if (!trimmedEmail) {
        errors.email = "Please enter your email";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        errors.email = "Please enter a valid email address";
      }
      if (!trimmedPassword) {
        errors.password = "Please enter a password";
      } else if (trimmedPassword.length < 6) {
        errors.password = "Password must be at least 6 characters";
      }
      if (!agreedToTerms) {
        errors.terms = "Please accept the Terms & Privacy Policy";
      }
    } else {
      if (!trimmedEmail) {
        errors.email = "Please enter your email";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        errors.email = "Please enter a valid email address";
      }
      if (!trimmedPassword) {
        errors.password = "Please enter your password";
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Please complete all required fields correctly");
      return;
    }

    setFieldErrors({});
    setIsLoading(true);

    try {
      if (activeTab === 'login') {
        const res = await api.post("auth/login", { email: trimmedEmail, password: trimmedPassword });
        login(res.data.user, res.data.accessToken);
        showToast("Welcome back to Zenify", "success");
        sessionStorage.setItem("zenify_just_arrived", "true");
        setShowLoginSplash(true);
        router.prefetch('/');
        router.replace('/');
      } else {
        const res = await api.post("auth/register", { email: trimmedEmail, password: trimmedPassword, name: name.trim() });
        if (res.data.requiresVerification) {
          setIsVerifyingEmail(true);
          setOtp("");
          showToast("Verification code sent to your email", "success");
        } else {
          login(res.data.user, res.data.accessToken);
          showToast("Account created successfully", "success");
          sessionStorage.setItem("zenify_just_arrived", "true");
          setShowLoginSplash(true);
          router.prefetch('/');
          router.replace('/');
        }
      }
    } catch (err: any) {
      console.error("Login/Register catch error:", err);
      const backendMsg = err.response?.data?.message || err.response?.data?.error;
      let msg = backendMsg;

      if (!msg) {
        if (err.message === 'Network Error' || !err.response) {
          msg = 'Unable to connect to Zenify servers. Please check your internet connection.';
        } else {
          msg = activeTab === 'login' ? 'Invalid email or password' : 'Registration failed';
        }
      }

      if (msg.toLowerCase().includes('not verified')) {
        setIsVerifyingEmail(true);
        setOtp('');
        showToast('Please verify your email to continue', 'success');
        return;
      }

      if (msg.toLowerCase().includes('invalid email or password')) {
        msg = 'Incorrect email or password. Use "Forgot?" to reset it.';
      }

      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const getInputClass = (hasError?: boolean) => cn(
    "w-full h-11 min-h-[44px] rounded-xl border bg-black/60 backdrop-blur-xl px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-400 focus:outline-none transition-all shadow-inner font-medium",
    hasError 
      ? "border-brand/70 ring-1 ring-brand/40 focus:border-brand focus:ring-brand" 
      : "border-white/20 focus:border-brand focus:ring-1 focus:ring-brand/50"
  );

  if (showLoginSplash) {
    return <div className="fixed inset-0 bg-black z-0 pointer-events-none" />;
  }

  return (
    <main role="main" className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black">
      <SEO title="Log In – Zenify" noindex={true} path="/login" />
      <LiquidBackground coverUrl="/logo.png" speedMultiplier={1.8} />
      <div className="relative z-10 w-full max-w-[360px] px-5">

        {/* Animated Logo + Header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="relative flex items-center justify-center mb-4">
            <div className="absolute inset-0 bg-brand/25 blur-2xl rounded-full scale-125 pointer-events-none" />
            <ZenifyLogo size={60} animated={true} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mb-1.5 drop-shadow-md">
            {showForgotPassword ? "Reset Password" : (activeTab === 'login' ? "Welcome back" : "Create account")}
          </h1>
          <p className="text-[13px] font-medium text-zinc-300">
            {showForgotPassword
              ? "Enter your details to regain access"
              : (activeTab === 'login' ? "Sign in to continue listening" : "Start your music journey")}
          </p>
        </div>

        <div className="space-y-5">
          {isVerifyingEmail ? (
            <form onSubmit={handleVerifyEmail} noValidate className="space-y-3.5 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="space-y-4">
                <div className="text-center space-y-1.5">
                  <h3 className="text-lg font-bold text-white">Verify account</h3>
                  <p className="text-[12px] text-zinc-300 font-medium">Enter the 6-digit code sent to <br /><span className="text-brand font-bold">{email}</span></p>
                </div>
                <div className="space-y-1.5 pt-2">
                  <label className="text-[12px] font-semibold text-zinc-200">Security Code</label>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => {
                      setOtp(e.target.value);
                      clearFieldError('otp');
                    }}
                    placeholder="000000"
                    maxLength={6}
                    className={cn(
                      getInputClass(!!fieldErrors.otp),
                      "text-center tracking-[0.5em] font-mono text-2xl py-4 h-14 bg-black/60 font-bold placeholder:text-2xl placeholder:font-medium placeholder:text-zinc-500"
                    )}
                  />
                  {fieldErrors.otp && (
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-300 mt-1 bg-brand/10 border border-brand/30 px-2.5 py-1 rounded-lg w-fit shadow-[0_0_12px_rgba(225,29,72,0.15)] animate-in fade-in duration-200">
                      <AlertCircle className="w-3 h-3 text-brand shrink-0" />
                      <span>{fieldErrors.otp}</span>
                    </div>
                  )}
                </div>
              </div>
              
              {error && (
                <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-brand/10 border border-brand/40 text-rose-200 text-[12px] font-medium shadow-[0_4px_20px_rgba(225,29,72,0.15)] backdrop-blur-md mt-2 animate-in fade-in duration-300">
                  <AlertCircle className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 min-h-[44px] flex items-center justify-center rounded-xl bg-zinc-900 hover:bg-zinc-800 text-[13px] font-bold text-white shadow-lg border border-white/10 hover:border-brand/40 transition-all active:scale-95 disabled:opacity-50 mt-4 cursor-pointer"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-brand" /> : "Complete registration"}
              </button>
              <button
                type="button"
                onClick={() => { setIsVerifyingEmail(false); setError(""); setFieldErrors({}); }}
                className="w-full text-[12px] text-zinc-300 hover:text-white transition-colors py-2 font-semibold cursor-pointer"
              >
                ← Change email or password
              </button>
            </form>
          ) : showForgotPassword ? (
            <form onSubmit={resetStep === 'request' ? handleForgotPasswordRequest : handleResetPassword} noValidate className="space-y-3.5">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-zinc-200">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      clearFieldError('email');
                    }}
                    placeholder="you@example.com"
                    disabled={resetStep === 'verify'}
                    className={cn(getInputClass(!!fieldErrors.email), "disabled:opacity-40")}
                  />
                  {fieldErrors.email && (
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-300 mt-1 bg-brand/10 border border-brand/30 px-2.5 py-1 rounded-lg w-fit shadow-[0_0_12px_rgba(225,29,72,0.15)] animate-in fade-in duration-200">
                      <AlertCircle className="w-3 h-3 text-brand shrink-0" />
                      <span>{fieldErrors.email}</span>
                    </div>
                  )}
                </div>

                {resetStep === 'verify' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-semibold text-zinc-200">Code</label>
                      <input
                        type="text"
                        value={otp}
                        onChange={(e) => {
                          setOtp(e.target.value);
                          clearFieldError('otp');
                        }}
                        placeholder="000000"
                        maxLength={6}
                        className={cn(getInputClass(!!fieldErrors.otp), "text-center tracking-[0.4em] font-mono")}
                      />
                      {fieldErrors.otp && (
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-300 mt-1 bg-brand/10 border border-brand/30 px-2.5 py-1 rounded-lg w-fit shadow-[0_0_12px_rgba(225,29,72,0.15)] animate-in fade-in duration-200">
                          <AlertCircle className="w-3 h-3 text-brand shrink-0" />
                          <span>{fieldErrors.otp}</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-semibold text-zinc-200">New Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          clearFieldError('password');
                        }}
                        placeholder="••••••••"
                        className={getInputClass(!!fieldErrors.password)}
                      />
                      {fieldErrors.password && (
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-300 mt-1 bg-brand/10 border border-brand/30 px-2.5 py-1 rounded-lg w-fit shadow-[0_0_12px_rgba(225,29,72,0.15)] animate-in fade-in duration-200">
                          <AlertCircle className="w-3 h-3 text-brand shrink-0" />
                          <span>{fieldErrors.password}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-brand/10 border border-brand/40 text-rose-200 text-[12px] font-medium shadow-[0_4px_20px_rgba(225,29,72,0.15)] backdrop-blur-md animate-in fade-in duration-300">
                  <AlertCircle className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 min-h-[44px] flex items-center justify-center rounded-xl bg-zinc-900 hover:bg-zinc-800 text-[13px] font-bold text-white shadow-lg border border-white/10 hover:border-brand/40 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-brand" /> : (resetStep === 'request' ? "Send Code" : "Update Password")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForgotPassword(false);
                  setResetStep('request');
                  setPassword("");
                  setOtp("");
                  setError("");
                  setFieldErrors({});
                }}
                className="w-full text-[12px] text-zinc-300 hover:text-white transition-colors py-1 font-semibold cursor-pointer"
              >
                ← Back to sign in
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
              <div className="space-y-3">
                {activeTab === 'signup' && (
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-semibold text-zinc-200">Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        clearFieldError('name');
                      }}
                      placeholder="Your name"
                      className={getInputClass(!!fieldErrors.name)}
                    />
                    {fieldErrors.name && (
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-300 mt-1 bg-brand/10 border border-brand/30 px-2.5 py-1 rounded-lg w-fit shadow-[0_0_12px_rgba(225,29,72,0.15)] animate-in fade-in duration-200">
                        <AlertCircle className="w-3 h-3 text-brand shrink-0" />
                        <span>{fieldErrors.name}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-zinc-200">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      clearFieldError('email');
                    }}
                    placeholder="you@example.com"
                    className={getInputClass(!!fieldErrors.email)}
                  />
                  {fieldErrors.email && (
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-300 mt-1 bg-brand/10 border border-brand/30 px-2.5 py-1 rounded-lg w-fit shadow-[0_0_12px_rgba(225,29,72,0.15)] animate-in fade-in duration-200">
                      <AlertCircle className="w-3 h-3 text-brand shrink-0" />
                      <span>{fieldErrors.email}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[12px] font-semibold text-zinc-200">Password</label>
                    {activeTab === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowForgotPassword(true);
                          setPassword("");
                          setOtp("");
                          setError("");
                          setFieldErrors({});
                          setResetStep('request');
                        }}
                        className="text-[12px] font-bold text-brand hover:underline transition-all cursor-pointer"
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearFieldError('password');
                      }}
                      placeholder="••••••••"
                      className={cn(getInputClass(!!fieldErrors.password), "pr-10")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 min-w-[40px] min-h-[40px] flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-300 mt-1 bg-brand/10 border border-brand/30 px-2.5 py-1 rounded-lg w-fit shadow-[0_0_12px_rgba(225,29,72,0.15)] animate-in fade-in duration-200">
                      <AlertCircle className="w-3 h-3 text-brand shrink-0" />
                      <span>{fieldErrors.password}</span>
                    </div>
                  )}
                </div>

                {activeTab === 'signup' && (
                  <div className="pt-1 space-y-1">
                    <label className="flex items-center gap-2.5 cursor-pointer group select-none">
                      <div className="relative flex items-center justify-center shrink-0">
                        <input
                          type="checkbox"
                          checked={agreedToTerms}
                          onChange={(e) => {
                            setAgreedToTerms(e.target.checked);
                            clearFieldError('terms');
                          }}
                          className="sr-only peer"
                        />
                        <div
                          className={cn(
                            "w-4 h-4 rounded-md border flex items-center justify-center transition-all duration-200",
                            agreedToTerms
                              ? "bg-brand border-brand text-white shadow-[0_0_12px_rgba(225,29,72,0.65)]"
                              : "border-white/30 bg-black/60 group-hover:border-white/50"
                          )}
                        >
                          <Check
                            className={cn(
                              "w-3 h-3 text-white transition-transform duration-200",
                              agreedToTerms ? "scale-100 opacity-100" : "scale-0 opacity-0"
                            )}
                            strokeWidth={3}
                          />
                        </div>
                      </div>
                      <span className="text-[12px] text-zinc-300 font-medium leading-tight">
                        I agree to the{" "}
                        <a
                          href="/terms"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand hover:underline font-semibold"
                        >
                          Terms
                        </a>{" "}
                        &amp;{" "}
                        <a
                          href="/privacy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand hover:underline font-semibold"
                        >
                          Privacy Policy
                        </a>
                      </span>
                    </label>
                    {fieldErrors.terms && (
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-300 mt-1 bg-brand/10 border border-brand/30 px-2.5 py-1 rounded-lg w-fit shadow-[0_0_12px_rgba(225,29,72,0.15)] animate-in fade-in duration-200">
                        <AlertCircle className="w-3 h-3 text-brand shrink-0" />
                        <span>{fieldErrors.terms}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-brand/10 border border-brand/40 text-rose-200 text-[12px] font-medium shadow-[0_4px_20px_rgba(225,29,72,0.15)] backdrop-blur-md animate-in fade-in duration-300">
                  <AlertCircle className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              <div className="pt-1.5 space-y-3.5">
                {/* Form Submit Button - NEVER shows loader when isGoogleLoading */}
                <button
                  type="submit"
                  disabled={isLoading || isGoogleLoading}
                  className="w-full h-11 min-h-[44px] flex items-center justify-center rounded-xl bg-zinc-900 hover:bg-zinc-800 text-[13px] font-bold text-white shadow-lg border border-white/10 hover:border-brand/40 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-brand" />
                  ) : (
                    activeTab === 'login' ? "Sign In" : "Create Account"
                  )}
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-white/15" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-black/80 backdrop-blur-md px-3 py-0.5 text-[11px] text-zinc-300 font-bold uppercase tracking-wider rounded-full border border-white/10">or</span>
                  </div>
                </div>

                {/* Google Button - Shows Loader specifically on this button */}
                <button
                  type="button"
                  onClick={() => !isGoogleLoading && !isLoading && handleGoogleLogin()}
                  disabled={isGoogleLoading || isLoading}
                  className="w-full h-11 flex items-center justify-center gap-2.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 px-4 text-[13px] font-semibold text-white shadow-md backdrop-blur-md transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                >
                  {isGoogleLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-brand" />
                      <span className="text-zinc-200">Connecting to Google...</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                      <span>Google</span>
                    </>
                  )}
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
                type="button"
                onClick={() => {
                  setActiveTab(activeTab === 'login' ? 'signup' : 'login');
                  setError("");
                  setFieldErrors({});
                }}
                className="ml-1.5 font-bold text-brand hover:underline transition-all cursor-pointer"
              >
                {activeTab === 'login' ? "Sign up now" : "Sign in"}
              </button>
            </p>
          )}
          <p className="text-[11px] text-zinc-400 font-medium tracking-wider">© 2026 Zenify</p>
        </div>
      </div>

      {/* Brand Styled Toast Notification */}
      {toast && (
        <div className={cn(
          "fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-2xl border backdrop-blur-2xl z-[100] transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 shadow-2xl",
          toast.type === 'error'
            ? "bg-zinc-950/95 border-brand/50 text-rose-200 shadow-[0_0_30px_rgba(225,29,72,0.3)]"
            : "bg-zinc-950/95 border-emerald-500/40 text-emerald-300 shadow-[0_0_30px_rgba(16,185,129,0.2)]"
        )}>
          {toast.type === 'success' ? (
            <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <Check className="w-3.5 h-3.5" />
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full bg-brand/20 flex items-center justify-center text-brand shrink-0">
              <AlertCircle className="w-3.5 h-3.5" />
            </div>
          )}
          <span className="text-[13px] font-semibold tracking-tight">{toast.msg}</span>
        </div>
      )}
    </main>
  );
}

export default function AuthPage() {
  return (
    <GoogleOAuthProvider clientId="362498893988-fnrqfrbcb6nbs2j2gvnev10qabc4c2en.apps.googleusercontent.com">
      <AuthPageContent />
    </GoogleOAuthProvider>
  );
}
