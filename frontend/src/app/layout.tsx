import "./globals.css";
import "@fontsource/outfit/latin-400.css";
import "@fontsource/outfit/latin-500.css";
import "@fontsource/outfit/latin-600.css";
import "@fontsource/outfit/latin-700.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/cormorant-garamond/latin-400.css";
import "@fontsource/cormorant-garamond/latin-600.css";
import Providers from "../components/providers";
import AppLayout from "@/components/app-layout";
import AuthGuard from "@/components/auth-guard";
import { GlobalNotification } from "@/components/shared/GlobalNotification";
import { NotificationListener } from "@/components/shared/NotificationListener";
import { GlobalLoginSplash } from "@/components/auth/GlobalLoginSplash";

import { CookieConsentBanner } from "@/components/shared/CookieConsentBanner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <GlobalNotification />
      <Providers>
        <AuthGuard>
          <AppLayout>
            {children}
          </AppLayout>
          <GlobalLoginSplash />
          <NotificationListener />
          <CookieConsentBanner />
        </AuthGuard>
      </Providers>
    </>
  );
}
