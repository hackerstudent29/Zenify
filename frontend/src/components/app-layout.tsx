"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { PlayerBar } from "@/components/player-bar";
import { TopBar } from "@/components/top-bar";
import { MobileNav } from "@/components/mobile-nav";
import { cn } from "@/lib/utils";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isAuthPage = pathname?.startsWith("/login") || pathname?.startsWith("/register");

    if (isAuthPage) {
        return <div className="h-full w-full bg-[var(--background)]">{children}</div>;
    }

    return (
        <div className="app-container group">
            <aside className="area-sidebar overflow-hidden lg:block hidden">
                <Sidebar />
            </aside>

            <header className="area-topbar glass z-50">
                <TopBar />
            </header>

            <main className="area-main overflow-y-auto overflow-x-hidden bg-background scroll-smooth relative">
                <div className="max-w-[1600px] min-h-full pb-32 lg:pb-0">
                    {children}
                </div>
            </main>

            <footer className="area-player z-[110] flex items-center bg-transparent pointer-events-none">
                <div className="w-full pointer-events-auto h-full lg:mb-0 mb-16">
                    <PlayerBar />
                </div>
            </footer>

            <MobileNav />
        </div>
    );
}
