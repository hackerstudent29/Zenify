import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { PlayerBar } from "@/components/player-bar";
import { cn } from "@/lib/utils";
import Providers from "@/components/providers";

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
        <Providers>
          <div className="flex-1 flex overflow-hidden">
            <div className="hidden md:flex">
              <Sidebar />
            </div>

            <main className="flex-1 overflow-y-auto w-full bg-gradient-to-b from-secondary/50 to-background p-6">
              {children}
            </main>
          </div>
          <PlayerBar />
        </Providers>
      </body>
    </html>
  );
}
