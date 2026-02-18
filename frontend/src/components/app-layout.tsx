"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { PlayerBar } from "@/components/player-bar";
import { TopBar } from "@/components/top-bar";
import { cn } from "@/lib/utils";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isAuthPage = pathname?.startsWith("/login") || pathname?.startsWith("/register");

    if (isAuthPage) {
        return <div className="h-full w-full bg-[var(--background)]">{children}</div>;
    }

    return (
        <div className="app-container group">
            <aside className="area-sidebar overflow-hidden">
                <Sidebar />
            </aside>

            <header className="area-topbar glass z-50">
                <TopBar />
            </header>

            <main className="area-main overflow-y-auto overflow-x-hidden bg-background scroll-smooth">
                <div className="max-w-[1600px] mx-auto min-h-full">
                    {children}
                </div>
            </main>

            <footer className="area-player glass z-50 flex items-center">
                <PlayerBar />
            </footer>
        </div>
    );
}
