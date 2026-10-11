"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { ZenLoading } from "@/components/ui/ZenLoading";

/**
 * Public routes that do not require login:
 * - Terms of Service (/terms)
 * - Privacy Policy (/privacy)
 * - About Zenify (/about-zenify, /about/zenify)
 * - About Creator (/about, /creator, /about/creator, /about-creator)
 * - Local Library / Device audio player (/local-library)
 * - Authentication (/login, /register)
 */
export const isPublicRoute = (pathname?: string | null): boolean => {
  const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
  const current = (pathname && pathname !== '/') ? pathname : (hash || pathname || '');
  if (!current) return false;
  return (
    current.startsWith("/login") ||
    current.startsWith("/register") ||
    current.startsWith("/terms") ||
    current.startsWith("/privacy") ||
    current.startsWith("/about") ||
    current.startsWith("/creator") ||
    current.startsWith("/local-library")
  );
};

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, login, logout } = useAuthStore();
  const [isChecking, setIsChecking] = useState(true);

  const isAuthPage = pathname?.startsWith("/login") || pathname?.startsWith("/register");
  const isPublic = isPublicRoute(pathname);

  useEffect(() => {
    let isMounted = true;

    // Safety: force-show app after 2s if session fetch is slow
    const timeoutId = setTimeout(() => {
      if (isMounted) setIsChecking(false);
    }, 2000);

    const checkSession = async () => {
      if (!isMounted) return;

      // Don't check session on auth pages to avoid redirect loops
      if (isAuthPage) {
        setIsChecking(false);
        clearTimeout(timeoutId);
        return;
      }

      // If user has no access token stored and is on a public page, don't block or trigger 401
      const currentToken = useAuthStore.getState().accessToken;
      if (!currentToken && isPublic) {
        setIsChecking(false);
        clearTimeout(timeoutId);
        return;
      }

      try {
        const res = await api.get('auth/me');
        if (res.data && isMounted) {
          const token = useAuthStore.getState().accessToken;
          login(res.data, token || "");
        }
      } catch (err) {
        // Not authenticated, fallback to guest
        if (isMounted) logout();
      } finally {
        if (isMounted) setIsChecking(false);
      }
    };

    checkSession();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [isAuthPage, isPublic, login, logout]);

  // Redirect to login when check completes and user is not authenticated on a protected route
  useEffect(() => {
    if (!isChecking && !isAuthenticated && !isPublic) {
      router.replace('/login');
    }
  }, [isChecking, isAuthenticated, isPublic, router]);

  // Show loading spinner only on protected pages while checking session
  const shouldBlock = isChecking && !isPublic;

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
