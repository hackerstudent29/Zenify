import type { Metadata } from "next";
import { Inter, Outfit, Plus_Jakarta_Sans, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import Providers from "../components/providers";
import AppLayout from "@/components/app-layout";
import AuthGuard from "@/components/auth-guard";
import { Toaster } from "sonner";
import { NotificationListener } from "@/components/shared/NotificationListener";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-plus-jakarta" });
const cormorantGaramond = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["300", "400", "500", "600", "700"]
});

export const metadata: Metadata = {
  title: "Zenify - Modern Streaming",
  description: "Experience music like never before.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
      </head>
      <body className={cn(outfit.className, outfit.variable, plusJakarta.variable, cormorantGaramond.variable, inter.variable, "bg-background text-foreground h-screen flex flex-col")}>
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
