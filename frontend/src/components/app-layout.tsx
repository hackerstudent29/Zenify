"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { PlayerBar } from "@/components/player-bar";
import { TopBar } from "@/components/top-bar";
import { MobileNav } from "@/components/mobile-nav";
import { MobilePlayerBar } from "@/components/mobile/MobilePlayerBar";
import { DownloadModal } from "@/components/shared/DownloadModal";
import { FullScreenPlayer } from "@/components/player/full-screen-player";
import { cn } from "@/lib/utils";
import { Maximize2 } from "lucide-react";
import { BatchImportToast } from "@/components/shared/batch-import-toast";

import { motion } from "framer-motion";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { currentTrack } = usePlayerStore();
    const { isSidebarCollapsed, isPlayerMinimized } = useUIStore();
    const isAuthPage = pathname?.startsWith("/login") || pathname?.startsWith("/register");

    if (isAuthPage) {
        return <div className="h-full w-full bg-[var(--background)]">{children}</div>;
    }

    return (
        <div className="flex h-screen w-full bg-background overflow-hidden">
            {/* Sidebar (Desktop) */}
            <aside
                className="hidden lg:flex flex-col relative z-40 bg-[var(--surface)] border-r border-white/5 transition-[width] duration-400 ease-[0.16,1,0.3,1]"
                style={{ width: isSidebarCollapsed ? '72px' : '250px' }}
            >
                <Sidebar />
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col relative overflow-hidden">
                <header className="h-[var(--header-height)] glass z-50">
                    <TopBar />
                </header>

                <main className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth relative">
                    <div className={cn(
                        "w-full min-h-full",
                        currentTrack ? "pb-32 lg:pb-32" : "pb-20 lg:pb-0"
                    )}>
                        {children}
                    </div>
                </main>
            </div>

            {/* Desktop Player — hidden on mobile, visible lg+ only */}
            <footer className={cn(
                "hidden lg:block fixed z-[110] transition-all duration-500 ease-in-out",
                "left-0 right-0 bottom-0 pointer-events-none",
                !currentTrack && "translate-y-full opacity-0"
            )}>
                <div className={cn(
                    "w-full h-[var(--player-height)] bg-black border-t border-white/10 shadow-2xl transition-all duration-500 pointer-events-auto",
                    isPlayerMinimized ? "translate-y-full opacity-0" : "translate-y-0 opacity-100"
                )}>
                    <PlayerBar />
                </div>

                {/* Restore Trigger when minimized */}
                {isPlayerMinimized && (
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="absolute bottom-4 right-8 pointer-events-auto"
                    >
                        <button
                            onClick={() => useUIStore.getState().setPlayerMinimized(false)}
                            className="flex items-center gap-3 px-5 py-2.5 bg-brand/10 border border-brand/30 hover:bg-brand text-brand hover:text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-[0_0_20px_rgba(var(--accent-brand-rgb),0.2)] backdrop-blur-xl transition-all active:scale-95 group"
                        >
                            <Maximize2 size={14} className="group-hover:rotate-12 transition-transform" />
                            Restore Player
                        </button>
                    </motion.div>
                )}
            </footer>

            {/* Mobile Bottom Bar: player stacked above nav — mobile only */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[200] flex flex-col">
                <MobilePlayerBar />
                <MobileNav />
            </div>

            <DownloadModal />
            <FullScreenPlayer />
            <BatchImportToast />
        </div>
    );
}
