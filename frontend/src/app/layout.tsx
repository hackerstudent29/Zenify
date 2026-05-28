import "./globals.css";
import { Inter } from "next/font/google";
import Providers from "../components/providers";
import AppLayout from "@/components/app-layout";
import AuthGuard from "@/components/auth-guard";
import { Toaster } from "sonner";
import { NotificationListener } from "@/components/shared/NotificationListener";

// Load Inter — the primary UI font for all body text, buttons, menus
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Toaster position="top-center" richColors duration={5000} />
        <Providers>
          <AuthGuard>
            <AppLayout>
              {children}
            </AppLayout>
            <NotificationListener />
          </AuthGuard>
        </Providers>
      </body>
    </html>
  );
}
