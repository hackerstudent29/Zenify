import type { Metadata } from "next";
import { Inter, Outfit, Plus_Jakarta_Sans, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import Providers from "@/components/providers";
import AppLayout from "@/components/app-layout";
import AuthGuard from "@/components/auth-guard";
import ClickSpark from "@/components/ui/ClickSpark";

const inter = Inter({ subsets: ["latin"] });
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
};

import Script from "next/script";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
      </head>
      <Script
        src="https://zenpay-jshp.onrender.com/zenwallet-sdk.js"
        strategy="beforeInteractive"
      />
      <body className={cn(outfit.className, outfit.variable, plusJakarta.variable, cormorantGaramond.variable, "bg-background text-foreground h-screen flex flex-col")}>
        <ClickSpark
          sparkColor='rgba(225, 29, 72, 0.5)'
          sparkSize={10}
          sparkRadius={15}
          sparkCount={8}
          duration={400}
          className="flex-1"
        >
          <Providers>
            <AuthGuard>
              <AppLayout>
                {children}
              </AppLayout>
            </AuthGuard>
          </Providers>
        </ClickSpark>
      </body>
    </html>
  );
}
