"use client";

import { useReactiveBgStore } from "@/store/reactiveBgStore";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { PlayerBar } from "@/components/player-bar";
import { TopBar } from "@/components/top-bar";
import { MobileNav } from "@/components/mobile-nav";
import { PremiumMobilePlayer } from "@/components/mobile/PremiumMobilePlayer";
import { FullScreenPlayer } from "@/components/player/full-screen-player";
import { GlobalAudio } from "@/components/player/global-audio";
import { QueuePanel } from "@/components/player/queue-panel";
import { cn, getMediaUrl } from "@/lib/utils";
import { Maximize2, Check, X, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useShortcutStore } from "@/store/shortcuts";
import React, { useEffect, useCallback, useState } from "react";
import { audioEngine } from "@/lib/audio-engine";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuthStore } from "@/store/authStore";
import { GlobalLyricsSidebar } from "@/components/shared/GlobalLyricsSidebar";
import { Glass } from "@/components/ui/glass";

// Lazy-loaded auxiliary modals to minimize critical initial chunk size
const DownloadModal = React.lazy(() => import("@/components/shared/DownloadModal").then(m => ({ default: m.DownloadModal })));
const AddTrackToPlaylistModal = React.lazy(() => import("@/components/shared/AddTrackToPlaylistModal").then(m => ({ default: m.AddTrackToPlaylistModal })));
const AudioFxModal = React.lazy(() => import("@/components/player/audio-fx-modal").then(m => ({ default: m.AudioFxModal })));
const ShortcutHelpModal = React.lazy(() => import("@/components/shared/shortcut-help-modal").then(m => ({ default: m.ShortcutHelpModal })));
const UserOnboardingTour = React.lazy(() => import("@/components/shared/UserOnboardingTour").then(m => ({ default: m.UserOnboardingTour })));
const CloudSyncSidePopup = React.lazy(() => import("@/components/shared/CloudSyncSidePopup").then(m => ({ default: m.CloudSyncSidePopup })));
const BatchImportToast = React.lazy(() => import("@/components/shared/batch-import-toast").then(m => ({ default: m.BatchImportToast })));
const SettingsModal = React.lazy(() => import("@/components/settings/SettingsModal").then(m => ({ default: m.SettingsModal })));

/* ------------------------------------------------------------------ */
/*  Apple-style tokens                                                 */
/* ------------------------------------------------------------------ */
const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.6 } as const;
const SPRING_SOFT = { type: "spring", stiffness: 340, damping: 32, mass: 0.85 } as const;
// Apple's standard "ease out" curve for CSS transitions (valid Tailwind arbitrary value below)
const APPLE_EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]";
const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Inter, system-ui, sans-serif';
const SIDEBAR_EXPANDED = 260;
const SIDEBAR_COLLAPSED = 72;

function GlobalToast() {
 const toast = useUIStore(s => s.toast);
 const hideToast = useUIStore(s => s.hideToast);

 return (
 <AnimatePresence>
 {toast && (
 <motion.div
 initial={{ opacity: 0, y: 24, scale: 0.94 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, y: 24, scale: 0.94 }}
 transition={SPRING}
 style={{ fontFamily: FONT_STACK }}
 className={cn(
 "fixed bottom-8 right-8 z-[9999] flex items-center gap-3 px-4 py-3 rounded-[16px] border backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] min-w-[260px] max-w-[380px] pointer-events-auto",
 toast.type === "error"
 ? "bg-[#2c2c2e]/90 border-brand/40 text-rose-200 shadow-[0_0_35px_rgba(225,29,72,0.25)]"
 : "bg-[#2c2c2e]/85 border-white/10 text-white"
 )}
 >
 <div
 className={cn(
 "p-2 rounded-full shrink-0",
 toast.type === "error" ? "bg-brand/20 text-brand" : "bg-emerald-500/20 text-emerald-400"
 )}
 >
 {toast.type === "error" ? <AlertCircle size={16} /> : <Check size={16} />}
 </div>
 <div className="flex flex-col min-w-0 flex-1">
 <span className="text-[13px] font-semibold tracking-[-0.01em] text-white leading-tight">
 {toast.type === "error" ? "Error" : "Success"}
 </span>
 <span className="text-[12px] text-white/70 font-normal leading-tight truncate">
 {toast.msg}
 </span>
 </div>
 <motion.button
 whileHover={{ scale: 1.1 }}
 whileTap={{ scale: 0.88 }}
 transition={SPRING}
 onClick={hideToast}
 className="text-white/40 hover:text-white transition-colors duration-200 p-1 outline-none"
 >
 <X size={14} />
 </motion.button>
 </motion.div>
 )}
 </AnimatePresence>
 );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
 const pathname = usePathname();
 const router = useRouter();
 const isMobile = useIsMobile();
 const currentTrack = usePlayerStore(state => state.currentTrack);
 const { user, isAuthenticated } = useAuthStore();
 
 // Use page cover if available, fallback to playing track cover
 const pageCoverUrl = useUIStore(state => state.pageCoverUrl);
 const isMusicContentPage = pathname?.startsWith("/track/") || pathname?.startsWith("/album/") || pathname?.startsWith("/playlist/");
 const isPlaylistPage = pathname?.startsWith("/playlist/");
 const activeCoverUrl = isMusicContentPage ? (pageCoverUrl || currentTrack?.coverUrl) : (currentTrack?.coverUrl || pageCoverUrl);

 // removed unused subscription (isPlaying): it re-rendered the whole layout on every change
 // removed unused subscription (togglePlay): it re-rendered the whole layout on every change
 // removed unused subscription (playNext): it re-rendered the whole layout on every change
 // removed unused subscription (playPrev): it re-rendered the whole layout on every change
 // removed unused subscription (volume): it re-rendered the whole layout on every change
 // removed unused subscription (toggleShuffle): it re-rendered the whole layout on every change
 // removed unused subscription (toggleRepeat): it re-rendered the whole layout on every change

 const isLyricsOpen = useUIStore(state => state.isLyricsOpen);
 const isQueueOpen = useUIStore(state => state.isQueueOpen);
 const isSidebarCollapsed = useUIStore(state => state.isSidebarCollapsed);
 const isPlayerMinimized = useUIStore(state => state.isPlayerMinimized);
 const setPlayerMinimized = useUIStore(state => state.setPlayerMinimized);
 const setFullScreenPlayerOpen = useUIStore(state => state.setFullScreenPlayerOpen);
 const isFullScreenPlayerOpen = useUIStore(state => state.isFullScreenPlayerOpen);
 const isAudioFxOpen = useUIStore(state => state.isAudioFxOpen);
 const setAudioFxOpen = useUIStore(state => state.setAudioFxOpen);

 const shortcuts = useShortcutStore(state => state.shortcuts);
 const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const lastScrollTopRef = React.useRef(0);

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
 case 'open_settings':
					useUIStore.getState().toggleSettings();
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

 // removed unused useReactiveBgStore() subscription: it re-rendered the whole layout on every background update
  const isAuthPage = pathname?.startsWith("/login") || pathname?.startsWith("/register");
  const isOnboardingPage = pathname?.startsWith("/onboarding");
  const isOnboardingIncomplete = Boolean(
    user && (!user.preferences?.onboardingCompletedAt || !user.preferences?.onboardingCompleted)
  );

  React.useEffect(() => {
    if (isOnboardingIncomplete && !isOnboardingPage && !isAuthPage) {
      router.replace('/onboarding');
    }
  }, [isOnboardingIncomplete, isOnboardingPage, isAuthPage, router]);
  const isAlbumPage = pathname?.startsWith("/album/");
  const isInfoPage = pathname?.startsWith("/terms") || pathname?.startsWith("/privacy") || pathname?.startsWith("/about") || pathname?.startsWith("/creator");
  const isLyricSyncPage = pathname?.includes("/admin/lyric-sync");
  const hasSidebar = !isMobile && isAuthenticated;
  // One source of truth for the sidebar width (aside, content padding, header, player footer)
  const sidebarWidth = isSidebarCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

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
        const originalScrollBehavior = scrollRef.current.style.scrollBehavior;
        scrollRef.current.style.scrollBehavior = 'auto';
        scrollRef.current.scrollTop = 0;
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.style.scrollBehavior = originalScrollBehavior;
          }
        }, 0);
      }
      window.scrollTo(0, 0);
    };

    resetScroll();
    const handle = requestAnimationFrame(resetScroll);
    return () => cancelAnimationFrame(handle);
  }, [pathname]);

  // Prevent accidental clicks on buttons/links while scrolling on mobile & handle smart header hide/show
  useEffect(() => {
    if (!isMobile) {
      document.body.classList.remove('is-scrolling');
      setIsHeaderHidden(false);
      return;
    }
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    let scrollTimeout: NodeJS.Timeout;
    const handleScroll = () => {
      document.body.classList.add('is-scrolling');
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        document.body.classList.remove('is-scrolling');
      }, 150);

      const currentScroll = scrollEl.scrollTop;
      const diff = currentScroll - lastScrollTopRef.current;
      if (currentScroll <= 15) {
        setIsHeaderHidden(false);
      } else if (diff > 6 && currentScroll > 30) {
        setIsHeaderHidden(true);
      } else if (diff < -6) {
        setIsHeaderHidden(false);
      }
      lastScrollTopRef.current = currentScroll;
    };

    scrollEl.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      scrollEl.removeEventListener('scroll', handleScroll, { capture: true });
      clearTimeout(scrollTimeout);
      document.body.classList.remove('is-scrolling');
    };
  }, [isMobile]);

  useEffect(() => {
    setIsHeaderHidden(false);
    lastScrollTopRef.current = 0;
  }, [pathname]);

    if (isAuthPage || isOnboardingPage) {
    return <div className="h-full w-full bg-[#121214]">{children}</div>;
  }

 return (
 <div
 style={{ fontFamily: FONT_STACK, WebkitFontSmoothing: "antialiased" }}
 className={cn(
 "flex flex-col w-full text-foreground h-[100dvh] overflow-hidden relative z-0 transition-colors duration-700 ease-out",
 isAlbumPage ? "bg-[var(--page)]" : "bg-[#121214]"
 )}>
  
 <FullScreenPlayer />
 {isMobile && (
   <div 
     className={cn(
       "fixed inset-0 bg-black pointer-events-none z-[250] transition-opacity duration-300",
       isFullScreenPlayerOpen ? "opacity-45" : "opacity-0"
     )} 
   />
 )}
 {/* Main Wrapper */}
 <div 
 className={cn(
 "flex-1 flex flex-row relative overflow-hidden isolate"
 )}
 >
 {/* Sidebar (Desktop): static Apple Music style glass column on every page */}
 {hasSidebar && (
 <aside
 className={cn(
 "hidden md:flex flex-col shrink-0 w-[260px] h-full relative z-[120] pointer-events-auto overflow-hidden",
 "bg-[#121214]/60 backdrop-blur-2xl border-r border-white/10"
 )}
 >
   {/* Ambient Frosted Glass Background Layer */}
   {activeCoverUrl && (
     <div
       className="absolute -inset-10 bg-cover bg-center filter blur-3xl opacity-35 scale-125 transition-all duration-1000 pointer-events-none -z-10"
       style={{ backgroundImage: `url(${getMediaUrl(activeCoverUrl)})` }}
     />
   )}
   <div className="absolute inset-0 bg-black/25 pointer-events-none -z-10" />
 <Sidebar />
 </aside>
 )}

 {/* Content Area - Resizes dynamically when Queue or Lyrics is opened */}
 <div 
 className={cn(
 "flex-1 flex flex-col relative overflow-hidden transition-[margin] duration-500",
 APPLE_EASE,
 (isLyricsOpen || isQueueOpen) && !isMobile && "mr-[380px]"
 )}
 >
 <AnimatePresence>
 {showHeader && (
    <header 
    className={cn(
    "z-[100] pointer-events-none transition-all duration-300 w-full absolute top-0 left-0 right-0 safe-area-top",
    APPLE_EASE,
    isMobile 
      ? "bg-[#121214]/95 backdrop-blur-md border-b border-white/5" 
      : (pathname?.startsWith("/track/") || pathname?.startsWith("/album/") || pathname?.startsWith("/playlist/"))
        ? "bg-transparent"
        : "bg-gradient-to-b from-[#121214]/80 to-transparent",
    isMobile && isHeaderHidden && "-translate-y-full opacity-0 pointer-events-none"
    )}
  style={{
  height: isMobile ? "calc(3.5rem + env(safe-area-inset-top, 0px))" : "auto",
  paddingLeft: 0
  }}
 >
 <div className={cn("w-full pointer-events-auto", isMobile ? "h-full" : "h-[var(--header-height)]")}>
 <TopBar />
 </div>
 </header>
 )}
 </AnimatePresence>

 <main 
   ref={scrollRef} 
   className="flex-1 overflow-x-hidden relative overflow-y-auto scroll-smooth" 
   style={isMobile ? { paddingTop: 'calc(3.5rem + env(safe-area-inset-top, 0px))', WebkitOverflowScrolling: 'touch' } : { overscrollBehaviorY: 'auto' }}
 >
 <div className={cn(
 "w-full min-h-full transition-transform duration-500 transform-gpu origin-top-left",
 APPLE_EASE,
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
 </div>

 {/* Desktop Player: hidden on mobile, visible sm+ only */}
 {!isMobile && isMobile !== null && (
 <footer className={cn(
 "fixed z-[800] transition-[left,right,transform,opacity] duration-500",
 APPLE_EASE,
 "bottom-0 pointer-events-none",
 (!currentTrack || isLyricSyncPage) && "translate-y-full opacity-0"
 )}
 style={{
   left: hasSidebar ? "260px" : "0px",
   right: (isLyricsOpen || isQueueOpen) ? "380px" : "0px"
 }}
 >
 <AnimatePresence>
 {!isFullScreenPlayerOpen && (
 <motion.div 
 initial={{ y: 60, opacity: 0 }}
 animate={isPlayerMinimized ? { y: 60, opacity: 0 } : { y: 0, opacity: 1 }}
 exit={{ y: 60, opacity: 0 }}
 transition={SPRING}
    id="tour-player"
    data-tour="player"
    // Pill: sleek compact 660x66, lifted with mb-8
    className="pointer-events-auto relative mx-auto w-[660px] max-w-[calc(100%-2rem)] mb-8 rounded-full h-[66px]"
    >
      <div 
        className="absolute inset-0 pointer-events-none rounded-full overflow-hidden backdrop-blur-lg bg-black/10 border border-white/10"
        style={{
          boxShadow: "0 12px 28px -10px rgba(0,0,0,0.45)"
        }}
      >
        <div className="absolute -inset-1">
          <Glass
            className="w-full h-full"
            radius={33}
            blur={12}
            behind="transparent"
            optics={{
              chroma: 0.1,
              domeDepth: 40,
              edgeHighlight: 0,
              glow: 0.12,
              tint: 0.05,
              frost: 12
            }}
          >
            {/* Dummy element so the bare wrap glass engine measures height */}
            <div className="w-full h-[74px]" />
          </Glass>
        </div>
      </div>
      <div className="relative z-10 w-full h-full flex items-center justify-center pointer-events-auto">
        <PlayerBar />
      </div>
    </motion.div>
 )}
 </AnimatePresence>

 {/* Restore Trigger when minimized */}
 {isPlayerMinimized && (
 <motion.div
 initial={{ y: 20, opacity: 0, scale: 0.94 }}
 animate={{ y: 0, opacity: 1, scale: 1 }}
 transition={SPRING}
 className="absolute bottom-4 right-8 pointer-events-auto"
 >
 <motion.button
 whileHover={{ scale: 1.04 }}
 whileTap={{ scale: 0.94 }}
 transition={SPRING}
 onClick={() => useUIStore.getState().setPlayerMinimized(false)}
 className="flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/20 hover:bg-white text-white hover:text-black rounded-full text-[12px] font-semibold tracking-[-0.01em] shadow-[0_0_20px_rgba(255,255,255,0.08)] backdrop-blur-xl transition-colors duration-200 group outline-none"
 >
 <Maximize2 size={13} className="group-hover:rotate-12 transition-transform duration-300" />
 Restore Player
 </motion.button>
 </motion.div>
 )}
 </footer>
 )}

 {/* Mobile Bottom Bar: uses CSS for visibility to avoid hydration gaps */}
 <motion.div 
 className={cn(
 "fixed bottom-0 left-0 right-0 z-[200] flex flex-col pointer-events-none",
 (!isMobile || isAuthPage) && "hidden"
 )}
 animate={{
 y: (isMobile && isFullScreenPlayerOpen) ? 100 : 0,
 opacity: (isMobile && isFullScreenPlayerOpen) ? 0 : 1,
 scale: (isMobile && isFullScreenPlayerOpen) ? 0.94 : 1,
 }}
 transition={SPRING}
 >
 <div className="pointer-events-auto flex flex-col items-stretch">
 {!isInfoPage && (
 <MobileNav />
 )}
 </div>
 </motion.div>

 {/* Mobile Player: also root level for better z-depth */}
 {!isAuthPage && !isInfoPage && isMobile && (
 <PremiumMobilePlayer hidePlayer={isLyricSyncPage} />
 )}

 <React.Suspense fallback={null}>
   <DownloadModal />
   <AddTrackToPlaylistModal />
 </React.Suspense>
 <GlobalAudio />
 <React.Suspense fallback={null}>
   <AudioFxModal />
 </React.Suspense>
 <QueuePanel />
 <React.Suspense fallback={null}>
   <BatchImportToast />
   <CloudSyncSidePopup />
 </React.Suspense>
 <GlobalToast />
 <React.Suspense fallback={null}>
   <ShortcutHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
   <UserOnboardingTour />
    <SettingsModal />
 </React.Suspense>
 </div>
 );
}