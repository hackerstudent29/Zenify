"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { GoogleOAuthProvider } from '@react-oauth/google';
import { PricingModal } from "@/components/PricingModal";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";

export default function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());
    const { isPricingModalOpen, setPricingModalOpen } = useUIStore();
    const { isAuthenticated } = useAuthStore();
    const [currentPlan, setCurrentPlan] = useState("Eclipse");

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
            </QueryClientProvider>
        </GoogleOAuthProvider>
    );
}
