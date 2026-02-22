"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { PlayerBar } from "@/components/player-bar";
import { TopBar } from "@/components/top-bar";
import { MobileNav } from "@/components/mobile-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isAuthPage = pathname?.startsWith("/login") || pathname?.startsWith("/register");

    if (isAuthPage) {
        return <div className="h-full w-full bg-[var(--background)]">{children}</div>;
    }

    return (
        <div className="app-container group">
            <aside className="area-sidebar overflow-hidden hidden md:block">
                <Sidebar />
            </aside>

            <header className="area-topbar glass z-50">
                <TopBar />
            </header>

            <main className="area-main overflow-y-auto overflow-x-hidden bg-background scroll-smooth pb-24 md:pb-0">
                <div className="max-w-[1600px] min-h-full">
                    {children}
                </div>
            </main>

            <footer className="area-player z-50 flex items-center bg-transparent hidden md:flex">
                <PlayerBar />
            </footer>

            <MobileNav />
            {/* Mobile Player Bar */}
            <div className="md:hidden fixed bottom-16 left-0 right-0 z-50 h-16 bg-[#15171C]/90 backdrop-blur-xl border-t border-white/5 px-2">
                <PlayerBar />
            </div>
        </div>
    );
}
