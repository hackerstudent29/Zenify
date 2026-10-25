"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import api from "@/lib/api";
import { useGoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { motion, AnimatePresence, MotionConfig, type Transition } from "framer-motion";
import { Eye, EyeOff, Check, Loader2, AlertCircle, Mail, Lock, User, KeyRound, ChevronLeft, ShieldCheck } from "lucide-react";
import { ZenifyLogo } from "@/components/shared/ZenifyLogo";
import { DynamicBackground } from "@/components/shared/DynamicBackground";
import { SEO } from "@/components/shared/SEO";
import { cn } from "@/lib/utils";

/* ---------- Apple-style design tokens & spring physics ---------- */
const SPRING: Transition = { type: "spring", stiffness: 380, damping: 30, mass: 0.8 };
const SOFT_SPRING: Transition = { type: "spring", stiffness: 260, damping: 26, mass: 0.9 };
const SF_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Inter, system-ui, sans-serif';

const viewVariants = {
  initial: { opacity: 0, x: 28, scale: 0.98, filter: "blur(6px)" },
  animate: { opacity: 1, x: 0, scale: 1, filter: "blur(0px)", transition: SOFT_SPRING },
  exit: { opacity: 0, x: -28, scale: 0.98, filter: "blur(6px)", transition: { duration: 0.16 } },
};

/* ---------- Small presentational helpers (look only) ---------- */
function FieldError({ message }: { message?: string }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          key={message}
          initial={{ opacity: 0, height: 0, y: -4 }}
          animate={{ opacity: 1, height: "auto", y: 0 }}
          exit={{ opacity: 0, height: 0 }}
          transition={SPRING}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-1.5 pt-1.5 text-[11.5px] font-medium text-rose-300">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span>{message}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          key="banner"
          initial={{ opacity: 0, height: 0, scale: 0.96 }}
          animate={{ opacity: 1, height: "auto", scale: 1 }}
          exit={{ opacity: 0, height: 0, scale: 0.96 }}
          transition={SPRING}
          className="overflow-hidden"
        >
          <div className="flex items-start gap-2.5 rounded-xl border border-brand/40 bg-brand/10 px-3 py-2 text-[12px] font-medium text-rose-200 backdrop-blur-md">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span className="leading-snug">{message}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-[12px] font-semibold text-zinc-200">{children}</label>;
}

function PrimaryButton({
  children,
  disabled,
  loading,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <motion.button
      type="submit"
      disabled={disabled}
      whileHover={{ scale: disabled ? 1 : 1.015 }}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      transition={SPRING}
      className="flex h-10 w-full cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-zinc-900 text-[13px] font-bold text-white shadow-lg transition-colors hover:border-brand/40 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : children}
    </motion.button>
  );
}

function TextLinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      transition={SPRING}
      className="flex w-full cursor-pointer items-center justify-center gap-1 py-2 text-[12.5px] font-medium text-white/60 transition-colors hover:text-white"
    >
      {children}
    </motion.button>
  );
}

function AuthPageContent() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuthStore();
  const showLoginSplash = useUIStore((s) => s.showLoginSplash);
  const setShowLoginSplash = useUIStore((s) => s.setShowLoginSplash);

  useEffect(() => {
    if (isAuthenticated && !showLoginSplash) {
      router.replace("/");
    }
  }, [isAuthenticated, showLoginSplash, router]);

  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    if (mode === "signup") {
      setActiveTab("signup");
    } else {
      setActiveTab("login");
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
  const [resetStep, setResetStep] = useState<"request" | "verify">("request");
  const [otp, setOtp] = useState("");
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    if (error) setError("");
  };

  const handleGoogleLogin = useGoogleLogin({
    flow: "auth-code",
    onSuccess: async (codeResponse) => {
      try {
        setIsGoogleLoading(true);
        setError("");
        setFieldErrors({});
        const res = await api.post("auth/google", { code: codeResponse.code });
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
        router.prefetch("/");
        router.replace("/");
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
      setResetStep("verify");
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
      setResetStep("request");
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
      router.prefetch("/");
      router.replace("/");
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

    if (activeTab === "signup") {
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
      if (activeTab === "login") {
        const res = await api.post("auth/login", { email: trimmedEmail, password: trimmedPassword });
        login(res.data.user, res.data.accessToken);
        showToast("Welcome back to Zenify", "success");
        sessionStorage.setItem("zenify_just_arrived", "true");
        setShowLoginSplash(true);
        router.prefetch("/");
        router.replace("/");
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
          router.prefetch("/");
          router.replace("/");
        }
      }
    } catch (err: any) {
      console.error("Login/Register catch error:", err);
      const backendMsg = err.response?.data?.message || err.response?.data?.error;
      let msg = backendMsg;

      if (!msg) {
        if (err.message === "Network Error" || !err.response) {
          msg = "Unable to connect to Zenify servers. Please check your internet connection.";
        } else {
          msg = activeTab === "login" ? "Invalid email or password" : "Registration failed";
        }
      }

      if (msg.toLowerCase().includes("not verified")) {
        setIsVerifyingEmail(true);
        setOtp("");
        showToast("Please verify your email to continue", "success");
        return;
      }

      if (msg.toLowerCase().includes("invalid email or password")) {
        msg = 'Incorrect email or password. Use "Forgot?" to reset it.';
      }

      setError(msg);
      showToast(msg, "error");
    } finally {
      setIsLoading(false);
    }
  };

  /* ---------- Apple-style input ---------- */
  const getInputClass = (hasError?: boolean) =>
    cn(
      "h-10 w-full rounded-xl border bg-black/50 pl-9 pr-4 text-[13px] font-medium text-white backdrop-blur-xl outline-none transition-all placeholder:text-zinc-400",
      hasError
        ? "border-brand/70 ring-1 ring-brand/40 focus:border-brand focus:ring-brand"
        : "border-white/20 focus:border-brand focus:ring-1 focus:ring-brand/50"
    );

  const InputIcon = ({ icon: Icon }: { icon: React.ElementType }) => (
    <Icon className="pointer-events-none absolute left-3 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-zinc-400" />
  );

  const switchTab = (tab: "login" | "signup") => {
    setActiveTab(tab);
    setError("");
    setFieldErrors({});
  };

  if (showLoginSplash) {
    return <div className="fixed inset-0 bg-black z-0 pointer-events-none" />;
  }

  const viewKey = isVerifyingEmail ? "verify" : showForgotPassword ? `forgot-${resetStep}` : `main`;
  const title = showForgotPassword ? "Reset Password" : activeTab === "login" ? "Welcome back" : "Create account";
  const subtitle = showForgotPassword
    ? "Enter your details to regain access"
    : activeTab === "login"
    ? "Sign in to continue listening"
    : "Start your music journey";

  return (
    <MotionConfig reducedMotion="user">
      <main
        role="main"
        style={{ fontFamily: SF_FONT }}
        className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black antialiased"
      >
        <SEO title="Log In – Zenify" noindex={true} path="/login" />
        <DynamicBackground surface="other" coverUrl="/logo.png" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/60" />

        {/* macOS window */}
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 24, mass: 1 }}
          className="relative z-10 w-full max-w-[340px] px-5"
        >
          <motion.div
            layout
            transition={SOFT_SPRING}
            className=""
          >
            <div>
              {/* Header */}
              <div className="mb-3.5 flex flex-col items-center text-center">
                <div className="mb-2.5 flex items-center justify-center">
                  <ZenifyLogo size={44} animated={false} />
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={title}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                  >
                    <h1 className="text-[20px] font-bold leading-tight tracking-[-0.02em] text-white">{title}</h1>
                    <p className="mt-0.5 text-[12.5px] text-zinc-300">{subtitle}</p>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Segmented control (macOS style) */}
              <AnimatePresence initial={false}>
                {!showForgotPassword && !isVerifyingEmail && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={SPRING}
                    className="overflow-hidden"
                  >
                    <div className="relative mb-3.5 flex rounded-[10px] bg-white/[0.08] p-[3px]" role="tablist">
                      {(["login", "signup"] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          role="tab"
                          aria-selected={activeTab === tab}
                          onClick={() => switchTab(tab)}
                          className={cn(
                            "relative z-10 h-7 flex-1 cursor-pointer rounded-[8px] text-[12.5px] font-semibold transition-colors duration-200",
                            activeTab === tab ? "text-white" : "text-white/55 hover:text-white/80"
                          )}
                        >
                          {activeTab === tab && (
                            <motion.span
                              layoutId="segment-pill"
                              transition={{ type: "spring", stiffness: 500, damping: 36 }}
                              className="absolute inset-0 -z-10 rounded-[8px] bg-white/[0.18] shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_0.5px_0_rgba(255,255,255,0.25)]"
                            />
                          )}
                          {tab === "login" ? "Sign In" : "Sign Up"}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Views */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={viewKey} variants={viewVariants} initial="initial" animate="animate" exit="exit">
                  {isVerifyingEmail ? (
                    <form onSubmit={handleVerifyEmail} noValidate className="space-y-3">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fa243c]/15 ring-1 ring-[#fa243c]/30">
                          <ShieldCheck className="h-5 w-5 text-brand" />
                        </div>
                        <h3 className="text-[16px] font-semibold text-white">Verify account</h3>
                        <p className="text-[12.5px] leading-relaxed text-white/55">
                          Enter the 6-digit code sent to <br />
                          <span className="font-semibold text-white">{email}</span>
                        </p>
                      </div>
                      <div>
                        <Label>Security Code</Label>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          value={otp}
                          onChange={(e) => {
                            setOtp(e.target.value);
                            clearFieldError("otp");
                          }}
                          placeholder="000000"
                          maxLength={6}
                          className={cn(
                            getInputClass(!!fieldErrors.otp),
                            "h-14 pl-4 text-center font-mono text-[24px] font-semibold tracking-[0.5em] placeholder:text-[24px] placeholder:font-medium placeholder:text-white/25"
                          )}
                        />
                        <FieldError message={fieldErrors.otp} />
                      </div>
                      <ErrorBanner message={error} />
                      <PrimaryButton disabled={isLoading} loading={isLoading}>
                        Complete registration
                      </PrimaryButton>
                      <TextLinkButton
                        onClick={() => {
                          setIsVerifyingEmail(false);
                          setError("");
                          setFieldErrors({});
                        }}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" /> Change email or password
                      </TextLinkButton>
                    </form>
                  ) : showForgotPassword ? (
                    <form
                      onSubmit={resetStep === "request" ? handleForgotPasswordRequest : handleResetPassword}
                      noValidate
                      className="space-y-3"
                    >
                      <div className="space-y-2.5">
                        <div>
                          <Label>Email</Label>
                          <div className="relative">
                            <InputIcon icon={Mail} />
                            <input
                              type="email"
                              value={email}
                              onChange={(e) => {
                                setEmail(e.target.value);
                                clearFieldError("email");
                              }}
                              placeholder="you@example.com"
                              disabled={resetStep === "verify"}
                              className={cn(getInputClass(!!fieldErrors.email), "disabled:opacity-40")}
                            />
                          </div>
                          <FieldError message={fieldErrors.email} />
                        </div>

                        <AnimatePresence initial={false}>
                          {resetStep === "verify" && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={SPRING}
                              className="space-y-2.5"
                            >
                              <div>
                                <Label>Code</Label>
                                <div className="relative">
                                  <InputIcon icon={KeyRound} />
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={otp}
                                    onChange={(e) => {
                                      setOtp(e.target.value);
                                      clearFieldError("otp");
                                    }}
                                    placeholder="000000"
                                    maxLength={6}
                                    className={cn(getInputClass(!!fieldErrors.otp), "text-center font-mono tracking-[0.4em]")}
                                  />
                                </div>
                                <FieldError message={fieldErrors.otp} />
                              </div>
                              <div>
                                <Label>New Password</Label>
                                <div className="relative">
                                  <InputIcon icon={Lock} />
                                  <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => {
                                      setPassword(e.target.value);
                                      clearFieldError("password");
                                    }}
                                    placeholder="••••••••"
                                    className={getInputClass(!!fieldErrors.password)}
                                  />
                                </div>
                                <FieldError message={fieldErrors.password} />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <ErrorBanner message={error} />
                      <PrimaryButton disabled={isLoading} loading={isLoading}>
                        {resetStep === "request" ? "Send Code" : "Update Password"}
                      </PrimaryButton>
                      <TextLinkButton
                        onClick={() => {
                          setShowForgotPassword(false);
                          setResetStep("request");
                          setPassword("");
                          setOtp("");
                          setError("");
                          setFieldErrors({});
                        }}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" /> Back to sign in
                      </TextLinkButton>
                    </form>
                  ) : (
                    <form onSubmit={handleSubmit} noValidate className="space-y-3">
                      <div className="space-y-2.5">
                        <AnimatePresence initial={false}>
                          {activeTab === "signup" && (
                            <motion.div
                              key="name"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={SPRING}
                              className="overflow-hidden"
                            >
                              <Label>Name</Label>
                              <div className="relative">
                                <InputIcon icon={User} />
                                <input
                                  type="text"
                                  value={name}
                                  onChange={(e) => {
                                    setName(e.target.value);
                                    clearFieldError("name");
                                  }}
                                  placeholder="Your name"
                                  className={getInputClass(!!fieldErrors.name)}
                                />
                              </div>
                              <FieldError message={fieldErrors.name} />
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div>
                          <Label>Email</Label>
                          <div className="relative">
                            <InputIcon icon={Mail} />
                            <input
                              type="email"
                              value={email}
                              onChange={(e) => {
                                setEmail(e.target.value);
                                clearFieldError("email");
                              }}
                              placeholder="you@example.com"
                              className={getInputClass(!!fieldErrors.email)}
                            />
                          </div>
                          <FieldError message={fieldErrors.email} />
                        </div>

                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <label className="text-[12px] font-semibold text-zinc-200">Password</label>
                            {activeTab === "login" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setShowForgotPassword(true);
                                  setPassword("");
                                  setOtp("");
                                  setError("");
                                  setFieldErrors({});
                                  setResetStep("request");
                                }}
                                className="cursor-pointer text-[12px] font-semibold text-brand transition-opacity hover:opacity-70"
                              >
                                Forgot?
                              </button>
                            )}
                          </div>
                          <div className="relative">
                            <InputIcon icon={Lock} />
                            <input
                              type={showPassword ? "text" : "password"}
                              value={password}
                              onChange={(e) => {
                                setPassword(e.target.value);
                                clearFieldError("password");
                              }}
                              placeholder="••••••••"
                              className={cn(getInputClass(!!fieldErrors.password), "pr-11")}
                            />
                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.85 }}
                              transition={SPRING}
                              onClick={() => setShowPassword(!showPassword)}
                              aria-label={showPassword ? "Hide password" : "Show password"}
                              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-white/45 transition-colors hover:text-white"
                            >
                              <AnimatePresence mode="wait" initial={false}>
                                <motion.span
                                  key={showPassword ? "off" : "on"}
                                  initial={{ opacity: 0, scale: 0.6, rotate: -30 }}
                                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                                  exit={{ opacity: 0, scale: 0.6, rotate: 30 }}
                                  transition={{ duration: 0.12 }}
                                >
                                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </motion.span>
                              </AnimatePresence>
                            </motion.button>
                          </div>
                          <FieldError message={fieldErrors.password} />
                        </div>

                        <AnimatePresence initial={false}>
                          {activeTab === "signup" && (
                            <motion.div
                              key="terms"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={SPRING}
                              className="overflow-hidden"
                            >
                              <label className="group flex cursor-pointer select-none items-center gap-2.5">
                                <div className="relative flex shrink-0 items-center justify-center">
                                  <input
                                    type="checkbox"
                                    checked={agreedToTerms}
                                    onChange={(e) => {
                                      setAgreedToTerms(e.target.checked);
                                      clearFieldError("terms");
                                    }}
                                    className="peer sr-only"
                                  />
                                  <motion.div
                                    animate={{ scale: agreedToTerms ? [1, 1.18, 1] : 1 }}
                                    transition={{ type: "spring", stiffness: 500, damping: 18 }}
                                    className={cn(
                                      "flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-[#fa243c]/60",
                                      agreedToTerms
                                        ? "border-[#fa243c] bg-[#fa243c]"
                                        : "border-white/30 bg-white/[0.06] group-hover:border-white/50"
                                    )}
                                  >
                                    <motion.span
                                      initial={false}
                                      animate={{ scale: agreedToTerms ? 1 : 0, opacity: agreedToTerms ? 1 : 0 }}
                                      transition={{ type: "spring", stiffness: 600, damping: 22 }}
                                    >
                                      <Check className="h-3 w-3 text-white" strokeWidth={3.5} />
                                    </motion.span>
                                  </motion.div>
                                </div>
                                <span className="text-[12.5px] leading-tight text-white/60">
                                  I agree to the{" "}
                                  <a
                                    href="/terms"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-semibold text-brand hover:underline"
                                  >
                                    Terms
                                  </a>{" "}
                                  &amp;{" "}
                                  <a
                                    href="/privacy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-semibold text-brand hover:underline"
                                  >
                                    Privacy Policy
                                  </a>
                                </span>
                              </label>
                              <FieldError message={fieldErrors.terms} />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <ErrorBanner message={error} />

                      <div className="space-y-2.5 pt-0.5">
                        <PrimaryButton disabled={isLoading || isGoogleLoading} loading={isLoading}>
                          {activeTab === "login" ? "Sign In" : "Create Account"}
                        </PrimaryButton>

                        <div className="flex items-center gap-3">
                          <span className="h-px flex-1 bg-white/12" />
                          <span className="text-[11.5px] font-medium text-white/40">or</span>
                          <span className="h-px flex-1 bg-white/12" />
                        </div>

                        <motion.button
                          type="button"
                          onClick={() => !isGoogleLoading && !isLoading && handleGoogleLogin()}
                          disabled={isGoogleLoading || isLoading}
                          whileHover={{ scale: 1.015 }}
                          whileTap={{ scale: 0.97 }}
                          transition={SPRING}
                          className="flex h-10 w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-white/20 bg-white/10 px-4 text-[13px] font-semibold text-white shadow-md backdrop-blur-md transition-colors hover:bg-white/15 disabled:opacity-60"
                        >
                          {isGoogleLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin text-brand" />
                              <span className="text-zinc-200">Connecting to Google…</span>
                            </>
                          ) : (
                            <>
                              <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                              </svg>
                              <span>Continue with Google</span>
                            </>
                          )}
                        </motion.button>
                      </div>
                    </form>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Footer */}
              <div className="mt-4 space-y-1 text-center">
                {!showForgotPassword && !isVerifyingEmail && (
                  <p className="text-[12.5px] text-zinc-300">
                    {activeTab === "login" ? "Don't have an account?" : "Already have an account?"}
                    <button
                      type="button"
                      onClick={() => switchTab(activeTab === "login" ? "signup" : "login")}
                      className="ml-1.5 cursor-pointer font-semibold text-brand transition-opacity hover:opacity-70"
                    >
                      {activeTab === "login" ? "Sign up now" : "Sign in"}
                    </button>
                  </p>
                )}
                <p className="text-[11px] text-zinc-400">© 2026 Zenify</p>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* macOS-style notification banner */}
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.msg}
              initial={{ opacity: 0, y: -40, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 420, damping: 28 }}
              className="fixed left-1/2 top-5 z-[100] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-[16px] bg-[#2c2c2e]/80 py-2.5 pl-3 pr-5 shadow-[0_16px_48px_rgba(0,0,0,0.5),0_0_0_0.5px_rgba(255,255,255,0.18)] backdrop-blur-2xl backdrop-saturate-[1.8]"
              role="status"
            >
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                  toast.type === "success" ? "bg-[#30d158]" : "bg-[#fa243c]"
                )}
              >
                {toast.type === "success" ? (
                  <Check className="h-4 w-4 text-white" strokeWidth={3} />
                ) : (
                  <AlertCircle className="h-4 w-4 text-white" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold leading-none text-white/45">Zenify</p>
                <p className="mt-1 text-[13px] font-medium leading-tight text-white">{toast.msg}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </MotionConfig>
  );
}

export default function AuthPage() {
  return (
    <GoogleOAuthProvider clientId="362498893988-fnrqfrbcb6nbs2j2gvnev10qabc4c2en.apps.googleusercontent.com">
      <AuthPageContent />
    </GoogleOAuthProvider>
  );
}