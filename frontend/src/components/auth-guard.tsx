"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { Music } from "lucide-react";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { isAuthenticated, login, accessToken, logout } = useAuthStore();
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        if (!isAuthenticated || !accessToken) {
            // Let the checkSession handle redirection if needed
            // router.push("/login");
        }
    }, [isAuthenticated, accessToken, router]);

    // Validation logic...
    useEffect(() => {
        const validateToken = async () => {
            if (accessToken) {
                try {
                    const { data } = await api.get('/auth/me');
                    // We don't necessarily need to call login here unless we want to force update
                    // But we should ensure the user object in store is consistent
                    // login(data, accessToken); 
                } catch (e) {
                    // error handling
                }
            }
        }
        validateToken();
    }, [accessToken]);

    useEffect(() => {
        const checkSession = async () => {
            try {
                const res = await api.get('/auth/me');
                if (res.data) {
                    const token = useAuthStore.getState().accessToken;
                    if (token) login(res.data, token);
                }
            } catch (error: any) {
                const isNetworkError = error.message === "Network Error" || !error.response;
                const isAuthError = error.response?.status === 401 || error.response?.status === 403;

                if (isNetworkError) {
                    console.error("Zenify Auth: Network error or server unreachable. Retaining local session.");
                    setIsChecking(false);
                    return; // Don't logout on network blips
                }

                if (isAuthError) {
                    console.error("Zenify Auth: Session expired or invalid.");
                    if (pathname && !pathname.includes('/payment/callback') && !pathname.startsWith('/login') && !pathname.startsWith('/register')) {
                        logout();
                        router.replace('/login');
                    }
                } else {
                    console.error("Zenify Auth: Server error", error.response?.status);
                    // For 500s or other errors, we might want to stay logged in
                    // but stop the loading state.
                    setIsChecking(false);
                }
            } finally {
                setIsChecking(false);
            }
        };

        checkSession();
    }, [isAuthenticated, router, login, logout, pathname]);

    // Simplified guard logic
    const isAuthPage = pathname?.startsWith("/login") || pathname?.startsWith("/register");
    const shouldBlock = isChecking && !isAuthPage && !isAuthenticated;

    if (shouldBlock) {
        return (
            <div className="fixed inset-0 bg-[#0E0E10] flex flex-col items-center justify-center z-[9999]">
                <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center animate-pulse">
                        <Music className="text-violet-500 w-8 h-8" />
                    </div>
                </div>
                <p className="mt-8 text-xs font-bold uppercase tracking-[0.4em] text-zinc-500 animate-pulse">Restoring Session</p>
            </div>
        );
    }

    return <>{children}</>;
}
