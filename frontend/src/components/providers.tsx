"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";

import { applyAccentColor } from "@/lib/accent-colors";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 60, // 1 hour
        gcTime: 1000 * 60 * 60 * 2, // 2 hours
        refetchOnWindowFocus: false, // Don't refetch just because user switched tabs
      },
    },
  }));
    const { isAuthenticated, user } = useAuthStore();
  
  // Dynamic Accent Color Sync
  useEffect(() => {
    const accent = user?.preferences?.accentColor || "rose";
    applyAccentColor(accent);
  }, [user?.preferences?.accentColor]);

  
  return (
    <QueryClientProvider client={queryClient}>
      {children}
            <ConfirmModal />
    </QueryClientProvider>
  );
}
