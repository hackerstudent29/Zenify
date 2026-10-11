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
      <Toaster position="top-center" richColors duration={5000} />
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
