"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { useGoogleLogin } from '@react-oauth/google';
import { Eye, EyeOff, Music, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AuthPage() {
    const router = useRouter();
    const { setAuth, isAuthenticated } = useAuthStore();

    useEffect(() => {
        const checkSession = async () => {
            try {
                const res = await api.post('/auth/refresh');
                if (res.data.user) {
                    setAuth(res.data.user, res.data.accessToken);
                    setTimeout(() => router.replace('/'), 100);
                }
            } catch (e) {
                // Session truly invalid, stay on login
            }
        };

        if (isAuthenticated) {
            setTimeout(() => router.replace('/'), 100);
        } else {
            checkSession();
        }
    }, [isAuthenticated, router, setAuth]);
    const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState(""); // For signup maybe later
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);
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
                const res = await api.post('/auth/google', { code: codeResponse.code });
                setAuth(res.data.user, res.data.accessToken);
                showToast("Signed in successfully with Google", "success");
                setTimeout(() => router.push('/'), 500);
            } catch (err) {
                console.error(err);
                setError("Google login failed");
                showToast("Google login failed", "error");
            } finally {
                setIsLoading(false);
            }
        },
        onError: () => {
            setError("Google login failed");
            showToast("Google login failed", "error");
        },
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            if (activeTab === 'login') {
                const res = await api.post("/auth/login", { email, password });
                setAuth(res.data.user, res.data.accessToken);
                showToast("Welcome back to Zenify", "success");
                setTimeout(() => router.push("/"), 500);
            } else {
                const res = await api.post("/auth/register", { email, password });
                setAuth(res.data.user, res.data.accessToken);
                showToast("Account created successfully", "success");
                setTimeout(() => router.push("/"), 500);
            }
        } catch (err: any) {
            const msg = err.response?.data?.message || (activeTab === 'login' ? "Invalid credentials" : "Registration failed");
            setError(msg);
            showToast(msg, "error");
        } finally {
            setIsLoading(false);
        }
    };

    // Custom CSS Variables for the component based on Zenify theme
    const theme = {
        bg: '#0E0E10',
        surface: '#141416',
        surface2: '#1A1A1E',
        border: 'rgba(255,255,255,0.06)',
        borderHover: 'rgba(255,255,255,0.1)',
        text: '#F2F2F5',
        muted: '#8E8E9A',
        accent: '#8B5CF6',
        accentDim: 'rgba(139, 92, 246, 0.12)',
    };

    return (
        <div className="flex min-h-screen w-full font-sans text-[var(--foreground)] bg-[var(--background)] overflow-hidden">
            {/* LEFT PANEL - Hidden on mobile */}
            <div className="hidden lg:flex w-1/2 flex-col justify-between p-14 border-r border-[var(--border)] relative overflow-hidden bg-[var(--background)]">
                {/* Background Deco */}
                <div className="absolute inset-0 z-0 opacity-40 pointer-events-none" style={{
                    backgroundImage: `radial-gradient(circle at 10% 20%, ${theme.accentDim} 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(255,255,255,0.03) 0%, transparent 40%)`
                }} />

                {/* Grid Pattern */}
                <div className="absolute inset-0 z-0 opacity-[0.1]" style={{
                    backgroundImage: `linear-gradient(${theme.border} 1px, transparent 1px), linear-gradient(90deg, ${theme.border} 1px, transparent 1px)`,
                    backgroundSize: '48px 48px',
                    maskImage: 'radial-gradient(ellipse at 60% 40%, black 10%, transparent 70%)'
                }} />

                {/* Header */}
                <div className="relative z-10 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                    <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
                    <span className="font-bold tracking-tight text-xl">Zenify</span>
                </div>

                {/* Hero Content */}
                <div className="relative z-10 space-y-6 max-w-lg mb-20 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
                    <h1 className="text-5xl font-light leading-tight tracking-tight">
                        Music for<br />
                        <strong className="font-semibold text-[var(--accent)]">everyone.</strong>
                    </h1>
                    <p className="text-[var(--muted)] text-base leading-relaxed max-w-xs opacity-80">
                        Zero distraction, pure immersion. Listen to your favorite tracks anytime, anywhere.
                    </p>
                </div>

                {/* Mockup / Visual Element */}
                <div className="relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-7 max-w-[300px] shadow-2xl shadow-black/60">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="w-9 h-9 rounded-xl bg-[var(--accent-dim)] border border-[var(--accent)]/20 flex items-center justify-center">
                                <Music className="w-4 h-4 text-[var(--accent)]" />
                            </div>
                            <div className="flex-1 space-y-2">
                                <div className="h-1.5 bg-[var(--surface-hover)] rounded-full w-3/4" />
                                <div className="h-1.5 bg-[var(--surface-hover)] rounded-full w-1/2" />
                            </div>
                            <div className="px-2.5 py-1 rounded-full bg-[var(--accent-dim)] border border-[var(--accent)]/20 text-[9px] text-[var(--accent)] font-bold tracking-widest flex items-center gap-1.5">
                                <div className="w-1 h-1 rounded-full bg-[var(--accent)]" />
                                HIFI
                            </div>
                        </div>
                        {/* Waveform shim */}
                        <div className="h-10 bg-[var(--surface-hover)] rounded-xl relative overflow-hidden flex items-center justify-center gap-1.5 px-3">
                            {[...Array(14)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    className="w-1 bg-[var(--accent)]/30 rounded-full"
                                    animate={{ height: [8, 20, 8] }}
                                    transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" }}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                <div className="relative z-10 text-[10px] text-[var(--muted-dark)] font-bold uppercase tracking-widest animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500">
                    © 2024 Zenify
                </div>
            </div>

            {/* RIGHT PANEL - Unified Auth Form */}
            <div className="flex-1 flex items-center justify-center p-6 bg-[var(--background)]">
                <div className="w-full max-w-[400px]">

                    {/* Unified Toggle Tabs - Flatter design */}
                    <div className="flex bg-surface p-1 rounded-xl mb-10 w-full animate-in fade-in slide-in-from-bottom-4 duration-500 shadow-inner">
                        <button
                            onClick={() => setActiveTab('login')}
                            className={`flex-1 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all duration-300 cursor-pointer ${activeTab === 'login' ? 'bg-surface-hover text-foreground shadow-xl scale-[0.98]' : 'text-muted hover:text-foreground'}`}
                        >
                            Log in
                        </button>
                        <button
                            onClick={() => setActiveTab('signup')}
                            className={`flex-1 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all duration-300 cursor-pointer ${activeTab === 'signup' ? 'bg-surface-hover text-foreground shadow-xl scale-[0.98]' : 'text-muted hover:text-foreground'}`}
                        >
                            Sign up
                        </button>
                    </div>

                    <AnimatePresence mode="wait">
                        <motion.form
                            key={activeTab}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            onSubmit={handleSubmit}
                            className="space-y-6"
                        >
                            <div className="space-y-5">
                                {activeTab === 'signup' && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted-dark)] ml-1">Full Name</label>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="John Doe"
                                            className="w-full bg-surface-hover/40 rounded-xl px-5 py-4 text-sm text-foreground placeholder:text-muted-dark focus:outline-none focus:bg-surface-hover/80 transition-all shadow-sm"
                                        />
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted-dark)] ml-1">Email Address</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="email@example.com"
                                        required
                                        className="w-full bg-surface-hover/40 rounded-xl px-5 py-4 text-sm text-foreground placeholder:text-muted-dark focus:outline-none focus:bg-surface-hover/80 transition-all shadow-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted-dark)]">Password</label>
                                        {activeTab === 'login' && (
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] hover:text-[var(--accent)]/80 cursor-pointer transition-colors">Forgot?</span>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            required
                                            className="w-full bg-surface-hover/40 rounded-xl px-5 py-4 text-sm text-foreground placeholder:text-muted-dark focus:outline-none focus:bg-surface-hover/80 transition-all shadow-sm pr-12"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
                                        >
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>

                                {activeTab === 'signup' && (
                                    <div className="flex items-start gap-3 mt-3">
                                        <input type="checkbox" className="mt-1 appearance-none w-4 h-4 rounded-md bg-surface-hover/60 checked:bg-accent transition-all cursor-pointer relative after:content-[''] after:hidden checked:after:block after:absolute after:left-[5px] after:top-[1px] after:w-1.5 after:h-2.5 after:border-white after:border-r-2 after:border-b-2 after:rotate-45" required />
                                        <p className="text-[10px] text-[var(--muted)] leading-relaxed uppercase tracking-wider font-medium">
                                            I agree to the <span className="text-[var(--accent)] cursor-pointer hover:underline">Terms</span> and Privacy Policy.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-[var(--accent)] text-white font-bold py-4 rounded-xl text-xs uppercase tracking-[0.2em] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-70 disabled:pointer-events-none shadow-2xl shadow-[var(--accent)]/20 cursor-pointer mt-2"
                            >
                                {isLoading ? "Loading..." : (activeTab === 'login' ? "Sign In" : "Sign Up")}
                            </button>

                            <div className="relative flex items-center gap-4 py-4">
                                <div className="h-px bg-[var(--border)] flex-1" />
                                <span className="text-[10px] text-[var(--muted-dark)] font-bold uppercase tracking-[0.3em]">OR</span>
                                <div className="h-px bg-[var(--border)] flex-1" />
                            </div>

                            <button
                                type="button"
                                onClick={() => handleGoogleLogin()}
                                className="w-full flex items-center justify-center gap-3 bg-surface hover:bg-surface-hover text-foreground font-bold py-4 rounded-xl text-xs uppercase tracking-[0.15em] transition-all cursor-pointer shadow-lg"
                            >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="11" fill="white" />
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                                Continue with Google
                            </button>
                        </motion.form>
                    </AnimatePresence>
                </div>
            </div>

            {/* Toast Notification */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={`fixed bottom-8 right-8 flex items-center gap-3 px-5 py-3.5 rounded-2xl border shadow-2xl z-50 text-xs font-bold uppercase tracking-wider ${toast.type === 'error' ? 'bg-[var(--surface)] border-[#D06A6A]/30 text-[#D06A6A]' : 'bg-[var(--surface)] border-[var(--accent)]/30 text-[var(--accent)]'}`}
                    >
                        {toast.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                        {toast.msg}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
