"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { ZenLoading } from "@/components/ui/ZenLoading";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { isAuthenticated, login, logout } = useAuthStore();
    const [isChecking, setIsChecking] = useState(true);

    // isAuthPage MUST be declared before the useEffect that depends on it.
    // Previously this was declared after the effect, making it always `undefined`
    // inside the closure, which caused the /auth/me check to run on the login page,
    // triggering a 401 → token refresh loop and the "No refresh token provided" error.
    const isAuthPage = pathname?.startsWith("/login") || pathname?.startsWith("/register");

    useEffect(() => {
        let isMounted = true;

        // Safety: never stay in 'checking' state for more than 5s
        const timeoutId = setTimeout(() => {
            if (isMounted) setIsChecking(false);
        }, 5000);

        const checkSession = async () => {
            if (!isMounted) return;

            // Skip the session check on auth pages entirely.
            // The login page handles navigation itself after a successful login.
            if (isAuthPage) {
                setIsChecking(false);
                clearTimeout(timeoutId);
                return;
            }

            try {
                const res = await api.get('/auth/me');
                if (res.data && isMounted) {
                    const token = useAuthStore.getState().accessToken;
                    login(res.data, token || "");
                }
            } catch {
                if (!isMounted) return;
                logout();
            } finally {
                if (isMounted) {
                    setIsChecking(false);
                    clearTimeout(timeoutId);
                }
            }
        };

        checkSession();

        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthPage]);

    // Redirect to login when check completes and user is not authenticated
    useEffect(() => {
        if (!isChecking && !isAuthenticated && !isAuthPage) {
            router.replace('/login');
        }
    }, [isChecking, isAuthenticated, isAuthPage, router]);

    // Show loading spinner only on protected pages while checking
    const shouldBlock = isChecking && !isAuthPage;

    if (shouldBlock) {
        return (
            <div className="fixed inset-0 bg-[#09090b] flex flex-col items-center justify-center z-[9999] gap-2">
                <ZenLoading size="lg" />
                <div className="mt-8 flex flex-col items-center gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/60 animate-pulse">Restoring Session</p>
                    <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">Syncing with archive</p>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
