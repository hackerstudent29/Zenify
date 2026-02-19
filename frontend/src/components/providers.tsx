"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { GoogleOAuthProvider } from '@react-oauth/google';
import { PricingModal } from "@/components/PricingModal";
import { useUIStore } from "@/store/ui";

export default function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());
    const { isPricingModalOpen, setPricingModalOpen } = useUIStore();

    return (
        <GoogleOAuthProvider clientId="362498893988-fnrqfrbcb6nbs2j2gvnev10qabc4c2en.apps.googleusercontent.com">
            <QueryClientProvider client={queryClient}>
                {children}
                <PricingModal
                    isOpen={isPricingModalOpen}
                    onOpenChange={setPricingModalOpen}
                />
            </QueryClientProvider>
        </GoogleOAuthProvider>
    );
}
