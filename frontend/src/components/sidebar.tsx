"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
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
  const iconRef = useRef<{ startAnimation: () => void; stopAnimation: () => void } | null>(null);

  return (
    <Link
      id={id}
      data-tour={dataTour}
      href={href}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={() => iconRef.current?.startAnimation?.()}
      onMouseLeave={() => iconRef.current?.stopAnimation?.()}
      className={cn(
        "sidebar-item group",
        isActive && "active",
        isSidebarCollapsed && "justify-center px-0 h-12",
        className
      )}
      title={isSidebarCollapsed ? label : ""}
    >
      <Icon
        ref={iconRef}
        size={isSidebarCollapsed ? 20 : 18}
        className={cn("sidebar-icon shrink-0", iconClassName)}
      />
      {!isSidebarCollapsed && (
        <span className="whitespace-nowrap font-medium">
          {label}
        </span>
      )}
    </Link>
  );
}

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
  const iconRef = useRef<{ startAnimation: () => void; stopAnimation: () => void } | null>(null);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => iconRef.current?.startAnimation?.()}
      onMouseLeave={() => iconRef.current?.stopAnimation?.()}
      className={cn(
        "sidebar-item group",
        isActive && "active",
        isSidebarCollapsed && "justify-center px-0 h-12",
        className
      )}
      title={isSidebarCollapsed ? (title || label) : ""}
    >
      <Icon
        ref={iconRef}
        size={isSidebarCollapsed ? 20 : 18}
        className={cn("sidebar-icon shrink-0", iconClassName)}
      />
      {!isSidebarCollapsed && label && (
        <span className="whitespace-nowrap">
          {label}
        </span>
      )}
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab');
  const { logout, user, isAuthenticated } = useAuthStore();
  const isSidebarCollapsed = useUIStore(state => state.isSidebarCollapsed);
  const setSidebarCollapsed = useUIStore(state => state.setSidebarCollapsed);
  const currentTrack = usePlayerStore(state => state.currentTrack);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Collapsible states for library and playlists dropdown
  const [libExpanded, setLibExpanded] = useState(true);
  const [playlistsExpanded, setPlaylistsExpanded] = useState(true);

  const isAdmin = user?.role === 'ADMIN';

  const { data: playlists } = useQuery({
    queryKey: ['my-playlists'],
    queryFn: async () => {
      try {
        const res = await api.get('playlists/my');
        const arr = Array.isArray(res.data) ? res.data : (res.data?.items || []);
        return arr;
      } catch (e) { return []; }
    },
    enabled: !!isAuthenticated
  });

  // Recent playlists: sorted by last updated / created descending, top 3
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

  if (pathname === '/login' || pathname === '/register' || !isAuthenticated) return null;

  const playlistsIconRef = useRef<{ startAnimation: () => void; stopAnimation: () => void } | null>(null);
  const plusIconRef = useRef<{ startAnimation: () => void; stopAnimation: () => void } | null>(null);

  // Dedicated top navigation items: Home and Discover (Search moved into Discover)
  const topNavItems = [
    { 
      label: "Home", 
      icon: HouseIcon, 
      href: "/", 
      isActive: pathname === "/" 
    },
    { 
      label: "Discover", 
      icon: CompassIcon, 
      href: "/discover", 
      isActive: pathname === "/discover" || pathname === "/search" 
    },
  ];

  const toggleSidebar = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setSidebarCollapsed(!isSidebarCollapsed);
    }
  };

  // Brightness constraint: ONLY bright/radiant on track, album, playlist pages where reactive background is rendered
  const isTrackPage = pathname?.startsWith("/track/");
  const isAlbumPage = pathname?.startsWith("/album/");
  const isPlaylistPage = pathname?.startsWith("/playlist/");
  const isMediaPage = isTrackPage || isAlbumPage || isPlaylistPage;
  const showGlassSidebar = isMediaPage;

  return (
    <div
      id="tour-sidebar"
      data-tour="sidebar"
      className={cn(
        "flex flex-col h-full w-full select-none relative overflow-hidden",
        showGlassSidebar && "sidebar-glass-reactive",
        showGlassSidebar
          ? "my-3 ml-3 mr-1.5 h-[calc(100vh-24px)] rounded-2xl glass-panel isolate border border-white/10 backdrop-blur-2xl bg-zinc-950/40 shadow-2xl"
          : cn(
              "h-full border-r border-white/5",
              isMediaPage ? "bg-transparent" : "bg-[#0A0A0C]"
            )
      )}
      onClick={toggleSidebar}
    >
      {/* Logo area */}
      <div
        className={cn(
          "px-6 h-[72px] flex items-center group cursor-pointer border-b border-white/5 overflow-hidden shrink-0",
          isSidebarCollapsed ? "justify-center px-0" : ""
        )}
        onClick={(e) => {
          e.stopPropagation();
          if (isSidebarCollapsed) {
            setSidebarCollapsed(false);
          } else {
            router.push('/');
          }
        }}
      >
        <ZenifyLogo size={isSidebarCollapsed ? 28 : 46} />
      </div>

      <div 
        className={cn(
          "flex-1 overflow-y-auto space-y-6 no-scrollbar",
          isSidebarCollapsed ? "px-1.5 py-3" : "px-3 py-6"
        )} 
        style={{ paddingBottom: currentTrack ? "calc(90px + 2rem)" : "2.5rem" }}
        onClick={toggleSidebar}
      >
        {/* ========================================================= */}
        {/* TOP NAV: Home, Discover                                   */}
        {/* ========================================================= */}
        <div id="tour-sidebar-nav" data-tour="sidebar-nav">
          <div className="space-y-1">
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
        </div>

        {/* ========================================================= */}
        {/* YOUR LIBRARY                                              */}
        {/* ========================================================= */}
        <div id="tour-sidebar-library" data-tour="sidebar-library">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!isSidebarCollapsed) setLibExpanded(!libExpanded);
            }}
            className={cn(
              "sidebar-section-title flex items-center justify-between w-full group py-1 cursor-pointer hover:text-zinc-300 transition-colors mb-1.5",
              isSidebarCollapsed && "justify-center"
            )}
          >
            {!isSidebarCollapsed && (
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Your Library
              </span>
            )}
            {!isSidebarCollapsed && (
              libExpanded 
                ? <ChevronDown size={14} className="sidebar-icon" /> 
                : <ChevronRight size={14} className="sidebar-icon" />
            )}
          </button>

          <div className={cn(
            "space-y-0.5 transition-all duration-300",
            isSidebarCollapsed ? "flex flex-col gap-1 items-center" : (libExpanded ? "h-auto opacity-100" : "h-0 opacity-0 pointer-events-none overflow-hidden")
          )}>
            {/* 1. Playlists (with last 3 playlists dropdown) */}
            <div className="w-full">
              <div
                onMouseEnter={() => playlistsIconRef.current?.startAnimation?.()}
                onMouseLeave={() => playlistsIconRef.current?.stopAnimation?.()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isSidebarCollapsed) {
                    router.push("/library?tab=playlists");
                  } else {
                    setPlaylistsExpanded(!playlistsExpanded);
                  }
                }}
                className={cn(
                  "sidebar-item text-[15px] w-full justify-between group cursor-pointer",
                  ((pathname.startsWith("/library") && activeTab === "playlists") || pathname.startsWith("/playlist/")) && "active",
                  isSidebarCollapsed && "justify-center px-0 h-12"
                )}
                title={isSidebarCollapsed ? "Playlists" : ""}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <MusicIcon ref={playlistsIconRef} size={isSidebarCollapsed ? 20 : 18} className="sidebar-icon shrink-0" />
                  {!isSidebarCollapsed && (
                    <span className="whitespace-nowrap font-semibold">Playlists</span>
                  )}
                </div>

                {!isSidebarCollapsed && (
                  <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsCreateModalOpen(true);
                      }}
                      onMouseEnter={() => plusIconRef.current?.startAnimation?.()}
                      onMouseLeave={() => plusIconRef.current?.stopAnimation?.()}
                      className="p-1 hover:text-brand transition-colors rounded hover:bg-white/10"
                      title="Create Playlist"
                    >
                      <PlusIcon ref={plusIconRef} size={14} className="sidebar-icon" />
                    </button>
                    <div className="p-0.5">
                      {playlistsExpanded 
                        ? <ChevronDown size={14} className="sidebar-icon" /> 
                        : <ChevronRight size={14} className="sidebar-icon" />}
                    </div>
                  </div>
                )}
              </div>

              {/* Dropdown with last 3 playlists (created or modified) */}
              {!isSidebarCollapsed && (
                <AnimatePresence>
                  {playlistsExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden pl-7 pr-1 space-y-0.5 pt-0.5 pb-1"
                    >
                      {recentPlaylists.map((p: any) => {
                        const isPActive = pathname === `/playlist/${p.id}`;
                        return (
                          <Link
                            key={p.id}
                            href={`/playlist/${p.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              "flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-all truncate group",
                              isPActive && "text-brand bg-brand/10 font-medium"
                            )}
                            title={p.name}
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-white/20 group-hover:bg-brand transition-colors shrink-0" />
                            <span className="truncate">{p.name}</span>
                          </Link>
                        );
                      })}

                      {recentPlaylists.length === 0 && (
                        <div className="px-3 py-1.5 text-[11px] text-zinc-500 italic">
                          No playlists yet
                        </div>
                      )}

                      {Array.isArray(playlists) && playlists.length > 3 && (
                        <Link
                          href="/library?tab=playlists"
                          onClick={(e) => e.stopPropagation()}
                          className="block px-3 py-1 text-[11px] font-bold text-zinc-500 hover:text-brand uppercase tracking-wider transition-colors"
                        >
                          View all ({playlists.length}) →
                        </Link>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>

            {/* 2. Liked Songs */}
            <AnimatedSidebarLink
              href="/library?tab=liked"
              icon={HeartIcon}
              label="Liked Songs"
              isActive={pathname.startsWith("/library") && activeTab === "liked"}
              isSidebarCollapsed={isSidebarCollapsed}
              className="text-[15px]"
            />

            {/* 3. Artists */}
            <AnimatedSidebarLink
              href="/library?tab=artists"
              icon={MicIcon}
              label="Artists"
              isActive={pathname.startsWith("/library") && activeTab === "artists"}
              isSidebarCollapsed={isSidebarCollapsed}
              className="text-[15px]"
            />

            {/* 4. Albums */}
            <AnimatedSidebarLink
              href="/library?tab=albums"
              icon={Disc3Icon}
              label="Albums"
              isActive={activeTab === "albums" || pathname.startsWith('/album/')}
              isSidebarCollapsed={isSidebarCollapsed}
              className="text-[15px]"
            />

            {/* 5. Recently Played */}
            <AnimatedSidebarLink
              href="/section/recently-played"
              icon={ClockIcon}
              label="Recently Played"
              isActive={pathname.includes("recently-played") || pathname === "/history"}
              isSidebarCollapsed={isSidebarCollapsed}
              className="text-[15px]"
            />

            {/* 6. Device */}
            <AnimatedSidebarLink
              id="tour-device-music"
              dataTour="device-music"
              href="/local-library"
              icon={HardDriveIcon}
              label="Device"
              isActive={pathname.startsWith("/local-library")}
              isSidebarCollapsed={isSidebarCollapsed}
              className="text-[15px]"
            />
          </div>
        </div>

        {/* ========================================================= */}
        {/* BOTTOM SECTION: Admin Console, Settings, Logout           */}
        {/* (All in the same unified scrollable container)            */}
        {/* ========================================================= */}
        <div className={cn("pt-4 border-t border-white/5 space-y-1", isSidebarCollapsed ? "pt-2" : "pt-4")}>
          {/* Admin Console for Admin Users in the correct dedicated spot */}
          {isAdmin && (
            <AnimatedSidebarLink
              href="/admin"
              icon={ShieldIcon}
              label="Admin Console"
              isActive={pathname.startsWith("/admin")}
              isSidebarCollapsed={isSidebarCollapsed}
              className={cn(
                "text-[14px]",
                pathname.startsWith("/admin") 
                  ? "active text-brand font-bold" 
                  : "text-zinc-400 hover:text-brand"
              )}
              iconClassName={pathname.startsWith("/admin") ? "text-brand" : "text-zinc-400 group-hover:text-brand transition-colors"}
            />
          )}

          {/* Settings */}
          <AnimatedSidebarLink
            href="/settings"
            icon={SettingsIcon}
            label="Settings"
            isActive={pathname.startsWith("/settings")}
            isSidebarCollapsed={isSidebarCollapsed}
            className="text-[14px]"
          />

          {/* Logout */}
          <AnimatedSidebarButton
            onClick={(e) => { e.stopPropagation(); handleLogout(); }}
            icon={LogOutIcon}
            label="Logout"
            isSidebarCollapsed={isSidebarCollapsed}
            className="w-full text-zinc-500 hover:text-[#EF4444] cursor-pointer mt-1 text-[14px]"
          />

          {!isSidebarCollapsed && (
            <div className="px-4 pt-4 text-[10px] text-zinc-600 font-medium uppercase tracking-[0.2em]">
              <span className="font-zenify not-italic">zenify</span> v2.5.3
            </div>
          )}
        </div>
      </div>

      <CreatePlaylistModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
}
