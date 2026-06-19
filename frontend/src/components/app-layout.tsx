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
import React, { useEffect, useCallback, useState } from "react";
import { audioEngine } from "@/lib/audio-engine";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuthStore } from "@/store/authStore";
import { GlobalLyricsSidebar } from "@/components/shared/GlobalLyricsSidebar";

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
 const isLyricSyncPage = pathname?.includes("/admin/lyric-sync");

 // Pause global player automatically when entering Lyric Sync Studio
 React.useEffect(() => {
 if (isLyricSyncPage) {
 const player = usePlayerStore.getState();
 if (player.isPlaying) {
 player.togglePlay();
 }
 }
 }, [pathname, isLyricSyncPage]);

 const showHeader = !isLyricSyncPage;

  const scrollRef = React.useRef<HTMLElement>(null);
  useEffect(() => {
    const resetScroll = () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
      window.scrollTo(0, 0);
    };

    resetScroll();
    const handle = requestAnimationFrame(resetScroll);
    return () => cancelAnimationFrame(handle);
  }, [pathname]);

  // Prevent accidental clicks on buttons/links while scrolling on mobile
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    const handleScroll = () => {
      document.body.classList.add('is-scrolling');
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        document.body.classList.remove('is-scrolling');
      }, 150);
    };

    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
      clearTimeout(scrollTimeout);
    };
  }, []);

  if (isAuthPage) {
 return <div className="h-full w-full bg-[var(--background)]">{children}</div>;
 }

 return (
 <div className={cn(
 "flex flex-col w-full bg-[#0a0a0b] text-foreground h-[100dvh] overflow-hidden"
 )}>
 <FullScreenPlayer />
 {/* Main Wrapper — scales down when mobile player is expanded */}
 <motion.div 
 className={cn(
 "flex-1 flex flex-row relative bg-[#0a0a0b] overflow-hidden"
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
 "flex-1 flex flex-col relative overflow-hidden",
 user?.preferences?.sidebarStyle === "glassmorphism" && !isFullScreenPlayerOpen && !isMobile
 ? "my-3 mr-3 ml-1.5 h-[calc(100vh-24px)] rounded-2xl border border-white/10 bg-transparent backdrop-blur-sm ring-1 ring-white/5 shadow-[0_30px_60px_rgba(0,0,0,0.6)] isolate"
 : ""
 )}>
 <AnimatePresence>
 {showHeader && (
 <header 
  className={cn(
  "z-[100] transition-all duration-300 shrink-0 w-full",
  user?.preferences?.sidebarStyle === "glassmorphism" && !isFullScreenPlayerOpen
  ? "bg-black/75 backdrop-blur-[20px] border-b border-white/5"
  : "glass",
  isMobile 
  ? "sticky top-0 pt-[env(safe-area-inset-top,0px)] border-b border-white/10 bg-black/40 backdrop-blur-3xl shadow-[0_4px_30px_rgba(0,0,0,0.5)]" 
  : "h-auto safe-area-top"
  )}
  style={{
  height: isMobile ? "calc(2.9rem + env(safe-area-inset-top, 0px))" : "auto"
  }}
 >
 <div className={cn("w-full", isMobile ? "h-full" : "h-[var(--header-height)]")}>
 <TopBar />
 </div>
 </header>
 )}
 </AnimatePresence>

 <main ref={scrollRef} className="flex-1 overflow-x-hidden relative overflow-y-auto" style={isMobile ? undefined : { overscrollBehaviorY: 'auto' }}>
 <div className={cn(
 "w-full min-h-full transition-transform duration-500 ease-[0.16,1,0.3,1] transform-gpu origin-top-left",
 // PC: if minimized, pb-8. If visible, pb-28. Mobile: pb-32.
 (currentTrack && !isLyricSyncPage) 
 ? (isMobile ? "pb-32" : (isPlayerMinimized ? "pb-8" : "pb-28")) 
 : "pb-20 sm:pb-0",
 isSidebarCollapsed && !isMobile ? "scale-[1.025]" : "scale-100"
 )}>
 {children}
 </div>
 </main>
 </div>
 {!isMobile && <GlobalLyricsSidebar />}
 </motion.div>

 {/* Desktop Player — hidden on mobile, visible sm+ only */}
 {!isMobile && isMobile !== null && (
 <footer className={cn(
 "fixed z-[800] transition-[left,transform,opacity] duration-400 ease-[0.16,1,0.3,1]",
 "right-0 bottom-0 pointer-events-none",
 (!currentTrack || isLyricSyncPage) && "translate-y-full opacity-0"
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
 ? "max-w-4xl mx-auto w-[calc(100%-3rem)] mb-6 rounded-full border border-white/10 bg-black/40 backdrop-blur-[40px] ring-1 ring-white/5 shadow-[0_30px_60px_rgba(0,0,0,0.8)] h-[72px] overflow-hidden"
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
 "fixed bottom-0 left-0 right-0 z-[200] flex flex-col pointer-events-none",
 (!isMobile || isAuthPage) && "hidden"
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
 <div className={cn(!isMobile && "hidden")}>
 <PremiumMobilePlayer hidePlayer={isLyricSyncPage} />
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
