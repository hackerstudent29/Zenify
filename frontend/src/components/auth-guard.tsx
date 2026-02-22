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

    // Only check session ONCE on mount or when essentially needed
    useEffect(() => {
        let isMounted = true;

        const checkSession = async () => {
            if (!isMounted) return;

            try {
                const res = await api.get('/auth/me');
                const isAuthPage = pathname?.startsWith("/login") || pathname?.startsWith("/register");

                if (res.data && isMounted && !isAuthPage) {
                    const token = useAuthStore.getState().accessToken;
                    // Only update store if we have a token (or if we rely purely on cookies)
                    // If we have no token but res.data works, we are in a cookie-only env
                    login(res.data, token || "");
                }
            } catch (error: any) {
                if (!isMounted) return;

                const isAuthError = error.response?.status === 401 || error.response?.status === 403;
                const isAuthPage = pathname?.startsWith("/login") || pathname?.startsWith("/register");

                if (isAuthError && !isAuthPage) {
                    logout();
                    router.replace('/login');
                }
            } finally {
                if (isMounted) setIsChecking(false);
            }
        };

        checkSession();

        return () => { isMounted = false; };
    }, []); // Empty dependency array = Only runs once on mount

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
