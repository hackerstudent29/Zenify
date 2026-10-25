"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import {
  HouseIcon,
  CompassIcon,
  MusicIcon,
  HeartIcon,
  MicIcon,
  Disc3Icon,
  ClockIcon,
  HardDriveIcon,
  ShieldIcon,
  SettingsIcon,
  LogOutIcon,
  PlusIcon
} from "@animateicons/react/lucide";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { usePlayerStore } from "@/store/player";
import api from "@/lib/api";
import { useState, useRef } from "react";
import { CreatePlaylistModal } from "./create-playlist-modal";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ZenifyLogo } from "./shared/ZenifyLogo";

/* ------------------------------------------------------------------ */
/* Apple-style motion tokens                                           */
/* ------------------------------------------------------------------ */
const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 } as const;
const SPRING_SOFT = { type: "spring", stiffness: 300, damping: 32, mass: 0.9 } as const;
const APPLE_RED = "#fa233b";
const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Inter, system-ui, sans-serif';

type IconHandle = { startAnimation: () => void; stopAnimation: () => void } | null;

function ActivePill() {
  // Shared element: slides between items with a spring when the route changes
  return (
    <motion.span
      layoutId="sidebar-active-pill"
      transition={SPRING}
      className="absolute inset-0 rounded-[8px] bg-white/[0.1]"
    />
  );
}



/* ------------------------------------------------------------------ */
/* Link item                                                           */
/* ------------------------------------------------------------------ */
interface AnimatedSidebarLinkProps {
  href: string;
  icon: any;
  label: string;
  isActive?: boolean;
  isSidebarCollapsed?: boolean;
  id?: string;
  dataTour?: string;
  className?: string;
  iconClassName?: string;
}

function AnimatedSidebarLink({
  href,
  icon: Icon,
  label,
  isActive,
  isSidebarCollapsed,
  id,
  dataTour,
  className,
  iconClassName
}: AnimatedSidebarLinkProps) {
  const iconRef = useRef<IconHandle>(null);

  return (
    <motion.div whileTap={{ scale: 0.97 }} transition={SPRING}>
      <Link
        id={id}
        data-tour={dataTour}
        href={href}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => iconRef.current?.startAnimation?.()}
        onMouseLeave={() => iconRef.current?.stopAnimation?.()}
        title={isSidebarCollapsed ? label : undefined}
        className={cn(
          "group relative flex items-center h-9 rounded-[8px] text-[15px] tracking-[-0.01em] outline-none",
          "transition-colors duration-200 ease-out",
          "focus-visible:ring-2 focus-visible:ring-white/30",
          isActive ? "text-white" : "text-white/90 hover:bg-white/[0.06]",
          isSidebarCollapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
          className
        )}
      >
        {isActive && <ActivePill />}
        <Icon
          ref={iconRef}
          size={20}
          style={isActive ? { color: APPLE_RED } : undefined}
          className={cn(
            "relative z-10 shrink-0 transition-colors duration-200",
            !isActive && "text-white/60 group-hover:text-white/90",
            iconClassName
          )}
        />
        {!isSidebarCollapsed && (
          <span className="relative z-10 whitespace-nowrap font-medium">{label}</span>
        )}
      </Link>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Button item                                                         */
/* ------------------------------------------------------------------ */
interface AnimatedSidebarButtonProps {
  icon: any;
  label?: string;
  isActive?: boolean;
  isSidebarCollapsed?: boolean;
  title?: string;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
  iconClassName?: string;
}

function AnimatedSidebarButton({
  icon: Icon,
  label,
  isActive,
  isSidebarCollapsed,
  title,
  onClick,
  className,
  iconClassName
}: AnimatedSidebarButtonProps) {
  const iconRef = useRef<IconHandle>(null);

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={SPRING}
      onClick={onClick}
      onMouseEnter={() => iconRef.current?.startAnimation?.()}
      onMouseLeave={() => iconRef.current?.stopAnimation?.()}
      title={isSidebarCollapsed ? title || label : undefined}
      className={cn(
        "group relative flex items-center w-full h-9 rounded-[8px] text-[15px] font-medium tracking-[-0.01em] outline-none",
        "transition-colors duration-200 ease-out hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-white/30",
        isActive ? "text-white" : "text-white/90",
        isSidebarCollapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
        className
      )}
    >
      <Icon
        ref={iconRef}
        size={20}
        className={cn("shrink-0 text-white/60 group-hover:text-white/90 transition-colors duration-200", iconClassName)}
      />
      {!isSidebarCollapsed && label && <span className="whitespace-nowrap">{label}</span>}
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab");
  const { logout, user, isAuthenticated } = useAuthStore();
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [libExpanded, setLibExpanded] = useState(true);
  const [playlistsExpanded, setPlaylistsExpanded] = useState(true);

  // Hooks must run before any early return
  const playlistsIconRef = useRef<IconHandle>(null);
  const plusIconRef = useRef<IconHandle>(null);

  const isAdmin = user?.role === "ADMIN";

  const { data: playlists } = useQuery({
    queryKey: ["my-playlists"],
    queryFn: async () => {
      try {
        const res = await api.get("playlists/my");
        return Array.isArray(res.data) ? res.data : res.data?.items || [];
      } catch (e) {
        return [];
      }
    },
    enabled: !!isAuthenticated
  });

  const recentPlaylists = (Array.isArray(playlists) ? playlists : [])
    .slice()
    .sort((a: any, b: any) => {
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    })
    .slice(0, 3);

  const handleLogout = () => {
    logout();
    router.push("/login");
    api.post("auth/logout").catch(() => {});
  };

  if (pathname === "/login" || pathname === "/register" || !isAuthenticated) return null;

  const topNavItems = [
    { label: "Home", icon: HouseIcon, href: "/", isActive: pathname === "/" },
    { label: "Discover", icon: CompassIcon, href: "/discover", isActive: pathname === "/discover" || pathname === "/search" }
  ];

  const toggleSidebar = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setSidebarCollapsed(!isSidebarCollapsed);
  };

  const playlistsActive =
    (pathname.startsWith("/library") && activeTab === "playlists") || pathname.startsWith("/playlist/");
  const isAlbumPage = pathname.startsWith("/album/");

  return (
    <div
      id="tour-sidebar"
      data-tour="sidebar"
      onClick={toggleSidebar}
      style={{ fontFamily: FONT_STACK, WebkitFontSmoothing: "antialiased" }}
      className={cn(
        "relative sticky top-0 left-0 flex flex-col h-screen w-full select-none transition-all duration-700 ease-out border-r border-white/[0.08]",
        isAlbumPage ? "bg-[var(--side)] backdrop-blur-2xl" : "bg-[#1c1c1e]"
      )}
    >
      {/* Apple-style Edge-Attached Sidebar Toggle Button */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setSidebarCollapsed(!isSidebarCollapsed);
        }}
        className={cn(
          "absolute right-0 translate-x-1/2 top-[22px] z-50",
          "w-7 h-7 rounded-full",
          isAlbumPage ? "bg-[var(--side)] hover:brightness-125 border border-white/20 hover:border-white/35 active:scale-90" : "bg-[#1c1c1e] hover:bg-[#2c2c2e] active:bg-[#38383a]",
          "border border-white/20 hover:border-white/35",
          "shadow-[0_2px_8px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.08)]",
          "flex items-center justify-center text-white/75 hover:text-white",
          "transition-all duration-200 ease-out active:scale-90 cursor-pointer outline-none",
          "focus-visible:ring-2 focus-visible:ring-white/40"
        )}
        title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <motion.div
          animate={{ rotate: isSidebarCollapsed ? 0 : 180 }}
          transition={SPRING}
          className="flex items-center justify-center pointer-events-none"
        >
          <ChevronRight size={13} strokeWidth={2.5} />
        </motion.div>
      </button>

      {/* Logo Area */}
      <div
        className={cn(
          "flex items-center shrink-0 h-[72px] border-b border-white/[0.08] transition-all duration-300 relative",
          isSidebarCollapsed ? "justify-center px-0" : "justify-start px-5"
        )}
      >
        <motion.div
          layout="position"
          transition={SPRING}
          className="flex items-center cursor-pointer select-none"
          onClick={(e) => {
            e.stopPropagation();
            router.push("/");
          }}
          title="Zenify Home"
        >
          {isSidebarCollapsed ? (
            <ZenifyLogo markOnly size={32} />
          ) : (
            <ZenifyLogo size={42} />
          )}
        </motion.div>
      </div>

      {/* Scrollable nav */}
      <div
        className={cn("flex-1 overflow-y-auto no-scrollbar", isSidebarCollapsed ? "px-2" : "px-3")}
        style={{ paddingBottom: currentTrack ? "calc(90px + 1rem)" : "1rem" }}
        onClick={toggleSidebar}
      >
        {/* Top nav */}
        <div id="tour-sidebar-nav" data-tour="sidebar-nav" className="space-y-0.5">
          {topNavItems.map((item) => (
            <AnimatedSidebarLink
              key={item.label}
              href={item.href}
              icon={item.icon}
              label={item.label}
              isActive={item.isActive}
              isSidebarCollapsed={isSidebarCollapsed}
            />
          ))}
        </div>

        {/* Library */}
        <div id="tour-sidebar-library" data-tour="sidebar-library" className="mt-5">
          {!isSidebarCollapsed ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLibExpanded(!libExpanded);
              }}
              className="group flex items-center gap-1 w-full px-2.5 h-7 mb-1 text-[13px] font-semibold tracking-[-0.005em] text-white/50 hover:text-white/80 transition-colors duration-200 outline-none"
            >
              <span>Library</span>
              <motion.span
                animate={{ rotate: libExpanded ? 90 : 0 }}
                transition={SPRING}
                className="flex opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              >
                <ChevronRight size={13} strokeWidth={2.5} />
              </motion.span>
            </button>
          ) : (
            <div className="mx-2 mb-2 h-px bg-white/[0.08]" />
          )}

          <AnimatePresence initial={false}>
            {(libExpanded || isSidebarCollapsed) && (
              <motion.div
                key="library-items"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={SPRING_SOFT}
                className={cn("overflow-hidden", isSidebarCollapsed ? "space-y-1" : "space-y-0.5")}
              >
                {/* Playlists */}
                <div className="w-full">
                  <motion.div
                    whileTap={{ scale: 0.97 }}
                    transition={SPRING}
                    role="button"
                    tabIndex={0}
                    onMouseEnter={() => playlistsIconRef.current?.startAnimation?.()}
                    onMouseLeave={() => playlistsIconRef.current?.stopAnimation?.()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isSidebarCollapsed) router.push("/library?tab=playlists");
                      else setPlaylistsExpanded(!playlistsExpanded);
                    }}
                    title={isSidebarCollapsed ? "Playlists" : undefined}
                    className={cn(
                      "group relative flex items-center h-9 rounded-[8px] text-[15px] cursor-pointer outline-none",
                      "transition-colors duration-200 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-white/30",
                      playlistsActive ? "text-white" : "text-white/90",
                      isSidebarCollapsed ? "justify-center px-0" : "justify-between px-2.5"
                    )}
                  >
                    {playlistsActive && <ActivePill />}
                    <div className="relative z-10 flex items-center gap-2.5 min-w-0">
                      <MusicIcon
                        ref={playlistsIconRef}
                        size={20}
                        style={playlistsActive ? { color: APPLE_RED } : undefined}
                        className={cn(
                          "shrink-0 transition-colors duration-200",
                          !playlistsActive && "text-white/60 group-hover:text-white/90"
                        )}
                      />
                      {!isSidebarCollapsed && <span className="whitespace-nowrap font-medium">Playlists</span>}
                    </div>

                    {!isSidebarCollapsed && (
                      <div className="relative z-10 flex items-center gap-0.5">
                        <motion.button
                          whileTap={{ scale: 0.88 }}
                          transition={SPRING}
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsCreateModalOpen(true);
                          }}
                          onMouseEnter={() => plusIconRef.current?.startAnimation?.()}
                          onMouseLeave={() => plusIconRef.current?.stopAnimation?.()}
                          className="flex items-center justify-center w-6 h-6 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors duration-200 outline-none"
                          title="New Playlist"
                        >
                          <PlusIcon ref={plusIconRef} size={14} />
                        </motion.button>
                        <motion.span
                          animate={{ rotate: playlistsExpanded ? 90 : 0 }}
                          transition={SPRING}
                          className="flex w-5 h-6 items-center justify-center text-white/40"
                        >
                          <ChevronRight size={13} strokeWidth={2.5} />
                        </motion.span>
                      </div>
                    )}
                  </motion.div>

                  {/* Recent playlists */}
                  {!isSidebarCollapsed && (
                    <AnimatePresence initial={false}>
                      {playlistsExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={SPRING_SOFT}
                          className="overflow-hidden pl-[30px] space-y-0.5 pt-0.5 pb-1"
                        >
                          {recentPlaylists.map((p: any) => {
                            const isPActive = pathname === `/playlist/${p.id}`;
                            return (
                              <Link
                                key={p.id}
                                href={`/playlist/${p.id}`}
                                onClick={(e) => e.stopPropagation()}
                                title={p.name}
                                className={cn(
                                  "block h-8 leading-8 px-2.5 rounded-[8px] text-[14px] truncate transition-colors duration-200 outline-none",
                                  isPActive
                                    ? "bg-white/[0.1] text-white font-medium"
                                    : "text-white/70 hover:text-white hover:bg-white/[0.06]"
                                )}
                              >
                                {p.name}
                              </Link>
                            );
                          })}

                          {recentPlaylists.length === 0 && (
                            <div className="px-2.5 h-8 leading-8 text-[13px] text-white/40">No playlists yet</div>
                          )}

                          {Array.isArray(playlists) && playlists.length > 3 && (
                            <Link
                              href="/library?tab=playlists"
                              onClick={(e) => e.stopPropagation()}
                              className="block px-2.5 h-8 leading-8 text-[13px] font-medium text-white/50 hover:text-white transition-colors duration-200"
                            >
                              Show all {playlists.length}
                            </Link>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}
                </div>

                <AnimatedSidebarLink
                  href="/library?tab=liked"
                  icon={HeartIcon}
                  label="Liked Songs"
                  isActive={pathname.startsWith("/library") && activeTab === "liked"}
                  isSidebarCollapsed={isSidebarCollapsed}
                />
                <AnimatedSidebarLink
                  href="/library?tab=artists"
                  icon={MicIcon}
                  label="Artists"
                  isActive={pathname.startsWith("/library") && activeTab === "artists"}
                  isSidebarCollapsed={isSidebarCollapsed}
                />
                <AnimatedSidebarLink
                  href="/library?tab=albums"
                  icon={Disc3Icon}
                  label="Albums"
                  isActive={activeTab === "albums" || pathname.startsWith("/album/")}
                  isSidebarCollapsed={isSidebarCollapsed}
                />
                <AnimatedSidebarLink
                  href="/section/recently-played"
                  icon={ClockIcon}
                  label="Recently Played"
                  isActive={pathname.includes("recently-played") || pathname === "/history"}
                  isSidebarCollapsed={isSidebarCollapsed}
                />
                <AnimatedSidebarLink
                  id="tour-device-music"
                  dataTour="device-music"
                  href="/local-library"
                  icon={HardDriveIcon}
                  label="Device"
                  isActive={pathname.startsWith("/local-library")}
                  isSidebarCollapsed={isSidebarCollapsed}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Pinned footer: Admin, Settings, Logout */}
      <div
        className={cn(
          "shrink-0 border-t border-white/[0.08] space-y-0.5 py-2",
          isSidebarCollapsed ? "px-2" : "px-3"
        )}
        style={{ marginBottom: currentTrack ? 90 : 0 }}
      >
        {isAdmin && (
          <AnimatedSidebarLink
            href="/admin"
            icon={ShieldIcon}
            label="Admin Console"
            isActive={pathname.startsWith("/admin")}
            isSidebarCollapsed={isSidebarCollapsed}
          />
        )}
        <AnimatedSidebarLink
          href="/settings"
          icon={SettingsIcon}
          label="Settings"
          isActive={pathname.startsWith("/settings")}
          isSidebarCollapsed={isSidebarCollapsed}
        />
        <AnimatedSidebarButton
          onClick={(e) => {
            e.stopPropagation();
            handleLogout();
          }}
          icon={LogOutIcon}
          label="Logout"
          isSidebarCollapsed={isSidebarCollapsed}
          className="hover:!text-[#fa233b]"
        />
        {!isSidebarCollapsed && (
          <div className="px-2.5 pt-2 text-[11px] text-white/30 font-medium">
            <span className="font-zenify not-italic">zenify</span> v2.5.3
          </div>
        )}
      </div>

      <CreatePlaylistModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
    </div>
  );
}