"use client";

import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { PlayerBar } from "@/components/player-bar";
import { TopBar } from "@/components/top-bar";
import { MobileNav } from "@/components/mobile-nav";
import { PremiumMobilePlayer } from "@/components/mobile/PremiumMobilePlayer";
import { DownloadModal } from "@/components/shared/DownloadModal";
import { FullScreenPlayer } from "@/components/player/full-screen-player";
import { AudioFxModal } from "@/components/player/audio-fx-modal";
import { GlobalAudio } from "@/components/player/global-audio";
import { QueuePanel } from "@/components/player/queue-panel";
import { cn } from "@/lib/utils";
import { Maximize2 } from "lucide-react";
import { BatchImportToast } from "@/components/shared/batch-import-toast";
import { ShortcutHelpModal } from "@/components/shared/shortcut-help-modal";
import { motion, AnimatePresence } from "framer-motion";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useShortcutStore } from "@/store/shortcuts";
import { useEffect, useCallback, useState } from "react";
import { audioEngine } from "@/lib/audio-engine";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuthStore } from "@/store/authStore";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const currentTrack = usePlayerStore(state => state.currentTrack);
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const togglePlay = usePlayerStore(state => state.togglePlay);
    const playNext = usePlayerStore(state => state.playNext);
    const playPrev = usePlayerStore(state => state.playPrev);
    const volume = usePlayerStore(state => state.volume);
    const toggleShuffle = usePlayerStore(state => state.toggleShuffle);
    const toggleRepeat = usePlayerStore(state => state.toggleRepeat);

    const isSidebarCollapsed = useUIStore(state => state.isSidebarCollapsed);
    const isPlayerMinimized = useUIStore(state => state.isPlayerMinimized);
    const setPlayerMinimized = useUIStore(state => state.setPlayerMinimized);
    const setFullScreenPlayerOpen = useUIStore(state => state.setFullScreenPlayerOpen);
    const isFullScreenPlayerOpen = useUIStore(state => state.isFullScreenPlayerOpen);
    const isAudioFxOpen = useUIStore(state => state.isAudioFxOpen);
    const setAudioFxOpen = useUIStore(state => state.setAudioFxOpen);
    const { user } = useAuthStore();

    const shortcuts = useShortcutStore(state => state.shortcuts);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const isMobile = useIsMobile();

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable ||
                target.closest('[data-no-shortcuts]')
            ) {
                return;
            }

            // Normalize
            const pressed = [];
            if (e.ctrlKey) pressed.push('Ctrl');
            if (e.metaKey) pressed.push('Meta');
            if (e.shiftKey) pressed.push('Shift');
            if (e.altKey) pressed.push('Alt');

            // Exclude modifier keys themselves from being the main key
            if (!['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) {
                // Use e.code directly without slicing 'Key' prefix
                pressed.push(e.code);
            }

            const combo = pressed.join('+');
            const mapping = shortcuts.find(s => s.key === combo);

            if (mapping) {
                e.preventDefault();
                audioEngine.resume();

                switch (mapping.action) {
                    case 'play_pause': usePlayerStore.getState().togglePlay(); break;
                    case 'next_track': usePlayerStore.getState().playNext(); break;
                    case 'prev_track': usePlayerStore.getState().playPrev(); break;
                    case 'toggle_shuffle': usePlayerStore.getState().toggleShuffle(); break;
                    case 'toggle_repeat': usePlayerStore.getState().toggleRepeat(); break;

                    case 'seek_forward_5': {
                        const { currentTime, duration, setCurrentTime } = usePlayerStore.getState();
                        const next = Math.min(currentTime + 5, duration);
                        const active = audioEngine.getActiveAudioElement();
                        if (active) active.currentTime = next;
                        setCurrentTime(next);
                        break;
                    }
                    case 'seek_backward_5': {
                        const { currentTime, setCurrentTime } = usePlayerStore.getState();
                        const prev = Math.max(currentTime - 5, 0);
                        const active = audioEngine.getActiveAudioElement();
                        if (active) active.currentTime = prev;
                        setCurrentTime(prev);
                        break;
                    }
                    case 'seek_forward_10': {
                        const { currentTime, duration, setCurrentTime } = usePlayerStore.getState();
                        const next = Math.min(currentTime + 10, duration);
                        const active = audioEngine.getActiveAudioElement();
                        if (active) active.currentTime = next;
                        setCurrentTime(next);
                        break;
                    }
                    case 'seek_backward_10': {
                        const { currentTime, setCurrentTime } = usePlayerStore.getState();
                        const prev = Math.max(currentTime - 10, 0);
                        const active = audioEngine.getActiveAudioElement();
                        if (active) active.currentTime = prev;
                        setCurrentTime(prev);
                        break;
                    }

                    case 'volume_up':
                        usePlayerStore.getState().setVolume(Math.min(usePlayerStore.getState().volume + 0.1, 1));
                        break;
                    case 'volume_down':
                        usePlayerStore.getState().setVolume(Math.max(usePlayerStore.getState().volume - 0.1, 0));
                        break;
                    case 'mute_toggle':
                        usePlayerStore.getState().setVolume(usePlayerStore.getState().volume === 0 ? 0.8 : 0);
                        break;

                    case 'open_queue':
                        useUIStore.getState().setIsQueueOpen(!useUIStore.getState().isQueueOpen);
                        break;
                    case 'toggle_mini_player':
                        useUIStore.getState().setPlayerMinimized(!useUIStore.getState().isPlayerMinimized);
                        break;
                    case 'fullscreen_player':
                        useUIStore.getState().setFullScreenPlayerOpen(!useUIStore.getState().isFullScreenPlayerOpen);
                        break;
                    case 'focus_search':
                        const searchInput = document.querySelector('input[type="text"], input[type="search"]') as HTMLElement;
                        if (searchInput) {
                            searchInput.focus();
                        } else {
                            router.push('/search');
                        }
                        break;
                    case 'show_help':
                        setIsHelpOpen(true);
                        break;
                    case 'toggle_audio_fx':
                }
            } else if (e.code === 'Escape') {
                if (isHelpOpen) {
                    setIsHelpOpen(false);
                } else if (useUIStore.getState().isAudioFxOpen) {
                    useUIStore.getState().setAudioFxOpen(false);
                } else if (useUIStore.getState().isFullScreenPlayerOpen) {
                    useUIStore.getState().setFullScreenPlayerOpen(false);
                } else if (!useUIStore.getState().isPlayerMinimized) {
                    useUIStore.getState().setPlayerMinimized(true);
                }
            }
        };

        const unlockAudio = () => {
            audioEngine.resume();
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('touchstart', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
        };
        window.addEventListener('click', unlockAudio);
        window.addEventListener('touchstart', unlockAudio);
        window.addEventListener('keydown', unlockAudio);

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('touchstart', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
        };
    }, [shortcuts, isHelpOpen, router]);

    const isAuthPage = pathname?.startsWith("/login") || pathname?.startsWith("/register");

    if (isAuthPage) {
        return <div className="h-full w-full bg-[var(--background)]">{children}</div>;
    }

    const showHeader = !isMobile || (
        pathname === "/" ||
        pathname === "/search" ||
        pathname === "/library" ||
        pathname === "/radio"
    );

    return (
        <div className={cn(
            "flex w-full bg-[#0a0a0b] text-foreground",
            isMobile ? "min-h-screen overflow-y-visible" : "h-screen overflow-hidden"
        )}>
            <FullScreenPlayer />
            {/* Main Wrapper — scales down when mobile player is expanded */}
            <motion.div 
                className={cn(
                    "flex-1 flex flex-row relative bg-[#0a0a0b]",
                    isMobile ? "min-h-screen overflow-y-visible" : "overflow-hidden"
                )}
                animate={{
                    scale: isFullScreenPlayerOpen ? (isMobile ? 0.93 : 0.98) : 1,
                    y: isFullScreenPlayerOpen ? (isMobile ? 10 : 0) : 0,
                    borderRadius: isFullScreenPlayerOpen ? "24px" : "0px",
                }}
                transition={{ type: "spring", stiffness: 350, damping: 32, mass: 0.8 }}
            >
                {/* Sidebar (Desktop) */}
                {!isMobile && (
                    <aside
                        className={cn(
                            "flex flex-col relative z-40 transition-[width] duration-400 ease-[0.16,1,0.3,1]",
                            user?.preferences?.sidebarStyle === "glassmorphism" && !isFullScreenPlayerOpen
                                ? "bg-transparent border-none"
                                : "bg-[var(--surface)] border-r border-white/5"
                        )}
                        style={{ width: isSidebarCollapsed ? '72px' : '250px' }}
                    >
                        <Sidebar />
                    </aside>
                )}

                {/* Content Area */}
                <div className={cn(
                    "flex-1 flex flex-col relative transition-all duration-300",
                    isMobile ? "min-h-screen overflow-y-visible" : "overflow-hidden",
                    user?.preferences?.sidebarStyle === "glassmorphism" && !isFullScreenPlayerOpen && !isMobile
                        ? "my-3 mr-3 ml-1.5 h-[calc(100vh-24px)] rounded-2xl border border-white/10 bg-transparent backdrop-blur-sm ring-1 ring-white/5 shadow-[0_30px_60px_rgba(0,0,0,0.6)] isolate"
                        : ""
                )}>
                    <AnimatePresence>
                        {showHeader && (
                            <motion.header 
                                initial={isMobile ? { height: 0, opacity: 0 } : {}}
                                animate={{ 
                                    height: isMobile ? "calc(3.5rem + env(safe-area-inset-top, 0px))" : "auto", 
                                    opacity: 1 
                                }}
                                exit={isMobile ? { height: 0, opacity: 0 } : {}}
                                transition={{ type: "spring", stiffness: 350, damping: 32, mass: 0.8 }}
                                className={cn(
                                    "z-50 transition-all duration-300 overflow-hidden",
                                    user?.preferences?.sidebarStyle === "glassmorphism" && !isFullScreenPlayerOpen
                                        ? "bg-black/75 backdrop-blur-[20px] border-b border-white/5"
                                        : "glass",
                                    isMobile 
                                        ? "pt-[env(safe-area-inset-top,0px)] flex items-center border-b border-white/5" 
                                        : "h-auto safe-area-top"
                                )}
                            >
                                <div className={isMobile ? "w-full" : "h-[var(--header-height)]"}>
                                    <TopBar />
                                </div>
                            </motion.header>
                        )}
                    </AnimatePresence>

                    <main className={cn(
                        "flex-1 overflow-x-hidden scroll-smooth relative",
                        isMobile ? "overflow-y-visible" : "overflow-y-auto"
                    )} style={isMobile ? undefined : { overscrollBehaviorY: 'auto' }}>
                        <div className={cn(
                            "w-full min-h-full",
                            currentTrack ? "pb-52 sm:pb-32" : "pb-28 sm:pb-0"
                        )}>
                            {children}
                        </div>
                    </main>
                </div>
            </motion.div>

            {/* Desktop Player — hidden on mobile, visible sm+ only */}
            {!isMobile && isMobile !== null && (
                <footer className={cn(
                    "fixed z-[800] transition-[left,transform,opacity] duration-400 ease-[0.16,1,0.3,1]",
                    "right-0 bottom-0 pointer-events-none",
                    !currentTrack && "translate-y-full opacity-0"
                )}
                    style={{ left: isSidebarCollapsed ? '72px' : '250px' }}
                >
                    <AnimatePresence>
                        {!isFullScreenPlayerOpen && (
                            <motion.div 
                                initial={{ y: 80, opacity: 0 }}
                                animate={isPlayerMinimized ? { y: 80, opacity: 0 } : { y: 0, opacity: 1 }}
                                exit={{ y: 80, opacity: 0 }}
                                transition={{ type: "spring", stiffness: 380, damping: 35, mass: 0.8 }}
                                className={cn(
                                    "pointer-events-auto",
                                    user?.preferences?.globalPlayerStyle === "glassmorphism"
                                        ? "max-w-4xl mx-auto w-[calc(100%-3rem)] mb-6 rounded-full border border-white/10 bg-black/60 backdrop-blur-[40px] ring-1 ring-white/5 shadow-[0_30px_60px_rgba(0,0,0,0.7)] h-[72px] overflow-hidden"
                                        : "w-full h-[var(--player-height)] bg-black border-t border-white/10 shadow-2xl"
                                )}
                            >
                                <PlayerBar />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Restore Trigger when minimized */}
                    {isPlayerMinimized && (
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="absolute bottom-4 right-8 pointer-events-auto"
                        >
                            <button
                                onClick={() => useUIStore.getState().setPlayerMinimized(false)}
                                className="flex items-center gap-3 px-5 py-2.5 bg-white/10 border border-white/30 hover:bg-white text-white hover:text-black rounded-full text-[10px] font-black uppercase tracking-widest shadow-[0_0_20px_rgba(255,255,255,0.1)] backdrop-blur-xl transition-all active:scale-95 group"
                            >
                                <Maximize2 size={14} className="group-hover:rotate-12 transition-transform" />
                                Restore Player
                            </button>
                        </motion.div>
                    )}
                </footer>
            )}

            {/* Mobile Bottom Bar — uses CSS for visibility to avoid hydration gaps */}
            <motion.div 
                className={cn(
                    "fixed bottom-0 left-0 right-0 z-[200] flex flex-col pointer-events-none md:hidden",
                    isAuthPage && "hidden"
                )}
                animate={{
                    y: (isMobile && isFullScreenPlayerOpen) ? 100 : 0,
                    opacity: (isMobile && isFullScreenPlayerOpen) ? 0 : 1,
                }}
                transition={{ type: "spring", stiffness: 350, damping: 32, mass: 0.8 }}
            >
                <div className="pointer-events-auto flex flex-col items-stretch">
                    {!pathname?.startsWith('/about') && (
                        <MobileNav />
                    )}
                </div>
            </motion.div>

            {/* Mobile Player — also root level for better z-depth */}
            {!isAuthPage && !pathname?.startsWith('/about') && (
                <div className="md:hidden">
                    <PremiumMobilePlayer />
                </div>
            )}

            <DownloadModal />
            <GlobalAudio />
            <AudioFxModal />
            <QueuePanel />
            <BatchImportToast />
            <ShortcutHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
        </div>
    );
}
