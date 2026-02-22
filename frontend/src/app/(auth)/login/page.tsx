"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { useGoogleLogin } from '@react-oauth/google';
import { Eye, EyeOff, Music, Check, X, ArrowRight, Sparkles } from "lucide-react";

export default function AuthPage() {
    const router = useRouter();
    const { login, isAuthenticated } = useAuthStore();

    useEffect(() => {
        const checkSession = async () => {
            try {
                const res = await api.post('/auth/refresh');
                if (res.data.user) {
                    login(res.data.user, res.data.accessToken);
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
    }, [isAuthenticated, router, login]);

    const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [resetStep, setResetStep] = useState<'request' | 'verify'>('request');
    const [otp, setOtp] = useState("");
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
                login(res.data.user, res.data.accessToken);
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

    const handleForgotPasswordRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await api.post("/auth/request-otp", { email });
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
            await api.post("/auth/reset-password", { email, otp, password });
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            if (activeTab === 'login') {
                const res = await api.post("/auth/login", { email, password });
                login(res.data.user, res.data.accessToken);
                showToast("Welcome back to Zenify", "success");
                setTimeout(() => window.location.href = "/", 300);
            } else {
                const res = await api.post("/auth/register", { email, password });
                login(res.data.user, res.data.accessToken);
                showToast("Account created successfully", "success");
                setTimeout(() => window.location.href = "/", 300);
            }
        } catch (err: any) {
            const msg = err.response?.data?.message || (activeTab === 'login' ? "Invalid credentials" : "Registration failed");
            setError(msg);
            showToast(msg, "error");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-[#09090B] font-sans selection:bg-[#A855F7] selection:text-white">
            <div className="w-full max-w-[360px] px-6">

                {/* Header Section */}
                <div className="flex flex-col items-center mb-8 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white mb-4 shadow-sm">
                        <Music className="text-black h-5 w-5" />
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight text-white mb-1.5">
                        {showForgotPassword ? "Reset Password" : (activeTab === 'login' ? "Welcome back" : "Create account")}
                    </h1>
                    <p className="text-xs text-zinc-500">
                        {showForgotPassword
                            ? "Enter your details to regain access"
                            : (activeTab === 'login' ? "Enter your credentials to access your account" : "Enter your email below to create your account")}
                    </p>
                </div>

                <div className="space-y-6">
                    {/* Toggle Tabs */}
                    {!showForgotPassword && (
                        <div className="flex border-b border-zinc-800">
                            <button
                                onClick={() => setActiveTab('login')}
                                className={`flex-1 pb-3 text-xs font-medium transition-colors relative ${activeTab === 'login' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                Log In
                                {activeTab === 'login' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />}
                            </button>
                            <button
                                onClick={() => setActiveTab('signup')}
                                className={`flex-1 pb-3 text-xs font-medium transition-colors relative ${activeTab === 'signup' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                Sign Up
                                {activeTab === 'signup' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />}
                            </button>
                        </div>
                    )}

                    {/* Forms Section */}
                    {showForgotPassword ? (
                        <form onSubmit={resetStep === 'request' ? handleForgotPasswordRequest : handleResetPassword} className="space-y-4">
                            <div className="space-y-3.5">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-zinc-400">Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="name@example.com"
                                        required
                                        disabled={resetStep === 'verify'}
                                        className="w-full bg-[#121214] border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors disabled:opacity-50"
                                    />
                                </div>
                                {resetStep === 'verify' && (
                                    <>
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-medium text-zinc-400">Verification Code</label>
                                            <input
                                                type="text"
                                                value={otp}
                                                onChange={(e) => setOtp(e.target.value)}
                                                placeholder="000000"
                                                maxLength={6}
                                                required
                                                className="w-full bg-[#121214] border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white text-center tracking-[0.5em] font-mono placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-medium text-zinc-400">New Password</label>
                                            <input
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="••••••••"
                                                required
                                                className="w-full bg-[#121214] border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="pt-2 space-y-3">
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full inline-flex items-center justify-center rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-zinc-200 active:bg-zinc-300 transition-colors disabled:opacity-50"
                                >
                                    {isLoading ? "Loading..." : (resetStep === 'request' ? "Send Reset Code" : "Update Password")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowForgotPassword(false)}
                                    className="w-full text-xs text-zinc-500 hover:text-white transition-colors py-1"
                                >
                                    Back to login
                                </button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-3.5">
                                {activeTab === 'signup' && (
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-medium text-zinc-400">Name</label>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="John Doe"
                                            className="w-full bg-[#121214] border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                                        />
                                    </div>
                                )}
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-zinc-400">Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="name@example.com"
                                        required
                                        className="w-full bg-[#121214] border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[11px] font-medium text-zinc-400">Password</label>
                                        {activeTab === 'login' && (
                                            <button
                                                type="button"
                                                onClick={() => setShowForgotPassword(true)}
                                                className="text-[11px] text-zinc-500 hover:text-white transition-colors"
                                            >
                                                Forgot?
                                            </button>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            required
                                            className="w-full bg-[#121214] border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
                                        >
                                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                                {activeTab === 'signup' && (
                                    <div className="flex items-center gap-2 pt-1 text-xs text-zinc-500">
                                        <input type="checkbox" className="rounded border-zinc-800 bg-zinc-900" required />
                                        <span>I agree to the Terms of Service and Privacy Policy</span>
                                    </div>
                                )}
                            </div>

                            <div className="pt-2 space-y-4">
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full inline-flex items-center justify-center rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-zinc-200 active:bg-zinc-300 transition-colors disabled:opacity-50"
                                >
                                    {isLoading ? "Loading..." : (activeTab === 'login' ? "Sign In" : "Create Account")}
                                </button>

                                <div className="relative">
                                    <div className="absolute inset-0 flex items-center">
                                        <span className="w-full border-t border-zinc-800" />
                                    </div>
                                    <div className="relative flex justify-center text-[10px] uppercase">
                                        <span className="bg-[#09090B] px-2 text-zinc-500 font-medium">Or continue with</span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handleGoogleLogin()}
                                    className="w-full inline-flex items-center justify-center rounded-lg border border-zinc-800 bg-transparent px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-900 transition-colors"
                                >
                                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.908 3.152-1.928 4.176-1.228 1.216-3.144 2.568-6.912 2.568-6.14 0-10.956-4.96-10.956-11s4.816-11 10.956-11c3.316 0 5.676 1.308 7.468 3.036l2.308-2.308c-1.992-1.912-4.572-3.404-9.776-3.404-8.82 0-15.704 7.152-15.704 15.704s6.884 15.704 15.704 15.704c4.76 0 8.356-1.572 11.164-4.524 2.892-2.892 3.792-6.944 3.792-10.32 0-.968-.088-1.896-.248-2.768h-14.708z" />
                                    </svg>
                                    Google
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                {/* Footer Section */}
                <div className="mt-8 text-center">
                    <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium">
                        © 2026 ZENIFY. PROPRIETARY SOFTWARE.
                    </p>
                </div>
            </div>

            {/* Notifications */}
            {toast && (
                <div className={`fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg z-50 text-xs font-medium ${toast.type === 'error' ? 'bg-[#121214] border-red-900/50 text-red-500' : 'bg-[#121214] border-zinc-800 text-white'}`}>
                    {toast.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    {toast.msg}
                </div>
            )}
        </div>
    );
}
