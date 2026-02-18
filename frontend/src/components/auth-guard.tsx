"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { Music } from "lucide-react";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { isAuthenticated, setAuth, logout } = useAuthStore();
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        const checkSession = async () => {
            try {
                // If we're already authenticated in store, we trust it for now but still verify in background or on next request
                // In a robust app, we'd verify /me here.
                const res = await api.post('/auth/refresh');
                if (res.data.user) {
                    setAuth(res.data.user, res.data.accessToken);
                } else {
                    throw new Error("No user in session");
                }
            } catch (error: any) {
                // Only log non-auth errors to avoid noise
                if (error.response?.status !== 401) {
                    console.error("Session verification failed", error);
                }
                logout();
                if (!pathname?.startsWith('/login') && !pathname?.startsWith('/register')) {
                    router.replace('/login');
                }
            } finally {
                setIsChecking(false);
            }
        };

        if (!isAuthenticated) {
            checkSession();
        } else {
            setIsChecking(false);
        }
    }, [isAuthenticated, router, setAuth, logout, pathname]);

    // If we are on an auth page, we don't need the guard (though AppLayout handles visibility)
    const isAuthPage = pathname?.startsWith("/login") || pathname?.startsWith("/register");

    if (isChecking && !isAuthPage) {
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
