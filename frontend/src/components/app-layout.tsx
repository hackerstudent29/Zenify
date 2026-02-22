"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { PlayerBar } from "@/components/player-bar";
import { TopBar } from "@/components/top-bar";
import { MobileNav } from "@/components/mobile-nav";
import { cn } from "@/lib/utils";

import { usePlayerStore } from "@/store/player";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { currentTrack } = usePlayerStore();
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
                <div className="max-w-[1600px] min-h-full pb-40 lg:pb-0">
                    {children}
                </div>
            </main>

            <footer className={cn(
                "z-[110] flex items-center bg-transparent pointer-events-none transition-all duration-500",
                "lg:area-player lg:relative",
                "fixed bottom-[calc(64px+env(safe-area-inset-bottom))] left-0 right-0 h-[var(--player-height)] px-2",
                !currentTrack && "translate-y-full opacity-0 pointer-events-none"
            )}>
                <div className="w-full pointer-events-auto h-full">
                    <div className="w-full h-full glass rounded-2xl md:rounded-none border border-white/5 shadow-2xl overflow-hidden">
                        <PlayerBar />
                    </div>
                </div>
            </footer>

            <MobileNav />
        </div>
    );
}
