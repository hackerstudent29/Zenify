import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import Providers from "@/components/providers";
import AppLayout from "@/components/app-layout";
import AuthGuard from "@/components/auth-guard";
import ClickSpark from "@/components/ui/ClickSpark";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Zenify - Modern Streaming",
  description: "Experience music like never before.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={cn(inter.className, "bg-background text-foreground h-screen flex flex-col")}>
        <ClickSpark
          sparkColor='rgba(168, 85, 247, 0.5)'
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
