import "./globals.css";
import Providers from "../components/providers";
import AppLayout from "@/components/app-layout";
import AuthGuard from "@/components/auth-guard";
import { Toaster } from "sonner";
import { NotificationListener } from "@/components/shared/NotificationListener";
import { DynamicTitle } from "@/components/shared/DynamicTitle";
import { GlobalLoginSplash } from "@/components/auth/GlobalLoginSplash";

import { CookieConsentBanner } from "@/components/shared/CookieConsentBanner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Toaster 
        position="top-center" 
        duration={4500} 
        toastOptions={{
          className: "border border-brand/40 bg-zinc-950/95 text-white backdrop-blur-xl shadow-[0_8px_32px_rgba(225,29,72,0.25)] rounded-2xl font-medium text-[13px]",
          descriptionClassName: "text-zinc-400 text-xs",
        }}
      />
      <Providers>
        <AuthGuard>
          <AppLayout>
            {children}
          </AppLayout>
          <GlobalLoginSplash />
          <NotificationListener />
          <DynamicTitle />
          <CookieConsentBanner />
        </AuthGuard>
      </Providers>
    </>
  );
}
