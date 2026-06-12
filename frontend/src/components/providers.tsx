"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { GoogleOAuthProvider } from '@react-oauth/google';
import { PricingModal } from "@/components/PricingModal";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";

const ACCENT_COLORS: Record<string, { hex: string, rgb: string }> = {
 rose: { hex: "#e11d48", rgb: "225, 29, 72" },
 violet: { hex: "#8b5cf6", rgb: "139, 92, 246" },
 cyan: { hex: "#06b6d4", rgb: "6, 182, 212" },
 white: { hex: "#ffffff", rgb: "255, 255, 255" },
};

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
 const { isPricingModalOpen, setPricingModalOpen } = useUIStore();
 const { isAuthenticated, user } = useAuthStore();
 const [currentPlan, setCurrentPlan] = useState("Eclipse");

 // Dynamic Accent Color Sync
 useEffect(() => {
 const accent = user?.preferences?.accentColor || "rose";
 const theme = ACCENT_COLORS[accent] || ACCENT_COLORS.rose;

 const root = document.documentElement;
 root.style.setProperty('--accent-brand', theme.hex);
 root.style.setProperty('--accent-brand-rgb', theme.rgb);
 }, [user?.preferences?.accentColor]);

 useEffect(() => {
 if (isPricingModalOpen && isAuthenticated) {
 api.get("/auth/subscription")
 .then(res => setCurrentPlan(res.data?.status === 'ACTIVE' ? res.data.plan : "Eclipse"))
 .catch(() => setCurrentPlan("Eclipse"));
 }
 }, [isPricingModalOpen, isAuthenticated]);

 return (
 <GoogleOAuthProvider clientId="362498893988-fnrqfrbcb6nbs2j2gvnev10qabc4c2en.apps.googleusercontent.com">
 <QueryClientProvider client={queryClient}>
 {children}
 <PricingModal
 isOpen={isPricingModalOpen}
 onOpenChange={setPricingModalOpen}
 currentPlan={currentPlan}
 />
 <ConfirmModal />
 </QueryClientProvider>
 </GoogleOAuthProvider>
 );
}
