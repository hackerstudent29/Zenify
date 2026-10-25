"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home as HomeIcon,
  Compass,
  ListMusic,
  Heart,
  Mic,
  HardDrive,
  Settings,
  ShieldCheck,
  Plus,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { usePlayerStore } from "@/store/player";
import api from "@/lib/api";
import { useState, type ReactNode } from "react";
import { CreatePlaylistModal } from "./create-playlist-modal";
import { useQuery } from "@tanstack/react-query";
import { ZenifyLogo } from "./shared/ZenifyLogo";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */
const APPLE_RED = "#fa233b";
const COLLAPSED_W = 72; // icon centre = 36px in both states, so icons never shift
const BAR_BG = "#1c1c1e";
const LINE = "rgba(255,255,255,0.08)"; // the ONE edge hairline (same colour for line + tab outline)
const TAB_TOP = 6;
const TAB_H = 72;

/** Real spring (stiffness 140, damping 16.6, ~4.5% overshoot) as a CSS linear() easing. No JS per frame. */
const SPRING_LINEAR =
  "linear(0,0.0279,0.0987,0.196,0.3067,0.4212,0.5322,0.6349,0.7265,0.8053,0.871,0.924,0.9653,0.9962,1.0181,1.0326,1.0411,1.0449,1.0452,1.043,1.0392,1.0345,1.0294,1.0242,1.0193,1.0148,1.0109,1.0076,1.0048,1.0026,1.001,0.9997,0.9989,0.9983,1)";

const SPRING = "ease-[var(--spring)]"; // sidebar width, edge tab, chevrons
const SMOOTH = "ease-[cubic-bezier(0.32,0.72,0,1)]"; // fades, collapses, small moves (no overshoot)

/**
 * Icon animation = "draw on" (like SF Symbols): on hover the icon's strokes trace themselves in.
 * No scaling, no bouncing, no popping. Tiny and static, so it costs nothing.
 */
const ICON_CSS = `
@keyframes sb-draw{from{stroke-dashoffset:34}to{stroke-dashoffset:0}}
@media (hover:hover){
  .sb-row:hover .sb-ic *{stroke-dasharray:60;animation:sb-draw 620ms cubic-bezier(.32,.72,0,1) both}
}
@media (prefers-reduced-motion:reduce){
  .sb-row:hover .sb-ic *{animation:none;stroke-dasharray:none}
}`;

// Slightly airy rows: 38px tall with a 4px gap between them
const ROW =
  "sb-row group relative flex h-[38px] w-full items-center overflow-hidden rounded-[9px] px-[14px] text-[15px] font-medium tracking-[-0.01em] " +
  "outline-none transition-[background-color,color,transform] duration-200 active:scale-[0.98] " +
  "focus-visible:ring-2 focus-visible:ring-white/30";

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */
function RowIcon({ icon: Icon, active }: { icon: LucideIcon; active?: boolean }) {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center transition-colors duration-200"
      style={active ? { color: APPLE_RED } : undefined}
    >
      <Icon
        size={20}
        strokeWidth={1.8}
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.22 : 0}
        className={cn("sb-ic", !active && "text-white/60 transition-colors duration-200 group-hover:text-white/90")}
      />
    </span>
  );
}

function Label({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "ml-3 whitespace-nowrap transition-opacity duration-200",
        collapsed ? "opacity-0" : "opacity-100"
      )}
    >
      {children}
    </span>
  );
}

function NavLink({
  href,
  icon,
  label,
  active,
  collapsed,
  id,
  dataTour,
  onClick,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  collapsed: boolean;
  id?: string;
  dataTour?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        id={id}
        data-tour={dataTour}
        onClick={onClick}
        title={collapsed ? label : undefined}
        className={cn(ROW, "text-left cursor-pointer", active ? "bg-white/[0.1] text-white" : "text-white/90 hover:bg-white/[0.06]")}
      >
        <RowIcon icon={icon} active={active} />
        <Label collapsed={collapsed}>{label}</Label>
      </button>
    );
  }

  return (
    <Link
      id={id}
      data-tour={dataTour}
      href={href}
      title={collapsed ? label : undefined}
      className={cn(ROW, active ? "bg-white/[0.1] text-white" : "text-white/90 hover:bg-white/[0.06]")}
    >
      <RowIcon icon={icon} active={active} />
      <Label collapsed={collapsed}>{label}</Label>
    </Link>
  );
}

/** Height + fade collapse using CSS grid rows (cheap, interruptible) */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300",
        SMOOTH,
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}
      {...(!open ? ({ inert: "" } as any) : {})}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Edge tab. The sidebar's right hairline is drawn as two segments     */
/* that stop exactly where the tab starts; the tab's own outline       */
/* continues the same line around its curve. One line, never two.      */
/* ------------------------------------------------------------------ */
const TAB_FILL = "M0 0 Q0 8 8 8 H10 Q20 8 20 18 V54 Q20 64 10 64 H8 Q0 64 0 72 Z";
const TAB_EDGE = "M0 0 Q0 8 8 8 H10 Q20 8 20 18 V54 Q20 64 10 64 H8 Q0 64 0 72";

function EdgeTab({
  collapsed,
  translucent,
  onToggle,
}: {
  collapsed: boolean;
  translucent: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className={cn(
        "group/tab absolute z-50 w-[22px] origin-left cursor-pointer outline-none",
        "transition-transform duration-300 hover:scale-x-[1.1] active:scale-x-[0.94] active:duration-75",
        SMOOTH
      )}
      style={{ left: "100%", marginLeft: -1, top: TAB_TOP, height: TAB_H }}
    >
      <svg width="22" height={TAB_H} viewBox="0 0 22 72" className="absolute inset-0 overflow-visible" aria-hidden>
        <path d={TAB_FILL} fill={translucent ? "rgba(28,28,30,0.72)" : BAR_BG} />
        <g transform="translate(0.5 0)">
          <path d={TAB_EDGE} fill="none" stroke={LINE} strokeWidth="1" />
        </g>
      </svg>
      <span
        className={cn(
          "absolute left-[5px] top-1/2 -mt-[7px] flex text-white/65 transition-[transform,color] duration-[720ms] group-hover/tab:text-white",
          SPRING,
          !collapsed && "rotate-180"
        )}
      >
        <ChevronRight size={14} strokeWidth={2.6} />
      </span>
    </button>
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
  const { user, isAuthenticated } = useAuthStore();
  const collapsed = useUIStore((s) => s.isSidebarCollapsed);
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed);
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [playlistsExpanded, setPlaylistsExpanded] = useState(true);

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
    enabled: !!isAuthenticated,
  });

  const recentPlaylists = (Array.isArray(playlists) ? playlists : [])
    .slice()
    .sort((a: any, b: any) => {
      const tA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const tB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return tB - tA;
    })
    .slice(0, 3);

  if (pathname === "/login" || pathname === "/register" || !isAuthenticated) return null;

  const isAlbumPage = pathname.startsWith("/album/");
  const playlistsActive =
    (pathname.startsWith("/library") && activeTab === "playlists") || pathname.startsWith("/playlist/");

  return (
    <>
      <style>{ICON_CSS}</style>

      {/* Outer element has NO overflow clipping so the edge tab can overhang the content */}
      <aside
        id="tour-sidebar"
        data-tour="sidebar"
        data-collapsed={collapsed}
        style={
          {
            "--spring": SPRING_LINEAR,
            width: collapsed ? COLLAPSED_W : "var(--sidebar-width, 250px)",
            fontFamily: 'var(--font-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif)',
            WebkitFontSmoothing: "antialiased",
          } as React.CSSProperties
        }
        className={cn(
          "sticky top-0 left-0 z-20 h-screen shrink-0 select-none",
          "transition-[width] duration-[720ms]",
          SPRING
        )}
      >
        {/* Clipped column (no CSS border: the edge line is drawn below so the tab can join it) */}
        <div
          className={cn(
            "flex h-full w-full flex-col overflow-hidden",
            isAlbumPage ? "bg-transparent" : "bg-[#1c1c1e]"
          )}
        >
          {/* Logo: full wordmark when open, the Z mark when closed (cross-fade, centred on x=36) */}
          <div className="relative h-[72px] shrink-0">
            <button
              type="button"
              onClick={() => router.push("/")}
              title="Zenify Home"
              tabIndex={collapsed ? -1 : 0}
              className={cn(
                "absolute left-[18px] top-1/2 -translate-y-1/2 outline-none transition-opacity duration-300",
                collapsed ? "pointer-events-none opacity-0" : "opacity-100"
              )}
            >
              <ZenifyLogo size={42} />
            </button>
            <button
              type="button"
              onClick={() => router.push("/")}
              title="Zenify Home"
              tabIndex={collapsed ? 0 : -1}
              className={cn(
                "absolute left-5 top-1/2 -translate-y-1/2 outline-none transition-opacity duration-300",
                collapsed ? "opacity-100" : "pointer-events-none opacity-0"
              )}
            >
              <ZenifyLogo markOnly size={32} />
            </button>
          </div>

          {/* One continuous list with a little breathing room between rows */}
          <nav className="shrink-0 px-3">
            <div id="tour-sidebar-nav" data-tour="sidebar-nav" className="flex flex-col gap-1">
              <NavLink href="/" icon={HomeIcon} label="Home" active={pathname === "/"} collapsed={collapsed} />
              <NavLink
                href="/discover"
                icon={Compass}
                label="Discover"
                active={pathname === "/discover" || pathname === "/search"}
                collapsed={collapsed}
              />

              <div id="tour-sidebar-library" data-tour="sidebar-library" className="flex flex-col gap-1">
                {/* Playlists with the 3 most recent directly underneath */}
                <div className="flex flex-col">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (collapsed) router.push("/library?tab=playlists");
                      else setPlaylistsExpanded(!playlistsExpanded);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLElement).click()}
                    title={collapsed ? "Playlists" : undefined}
                    className={cn(
                      ROW,
                      "cursor-pointer justify-between",
                      playlistsActive ? "bg-white/[0.1] text-white" : "text-white/90 hover:bg-white/[0.06]"
                    )}
                  >
                    <div className="flex min-w-0 items-center">
                      <RowIcon icon={ListMusic} active={playlistsActive} />
                      <Label collapsed={collapsed}>Playlists</Label>
                    </div>

                    <div
                      className={cn(
                        "-mr-1.5 flex items-center gap-0.5 transition-opacity duration-200",
                        collapsed && "pointer-events-none opacity-0"
                      )}
                    >
                      <button
                        type="button"
                        tabIndex={collapsed ? -1 : 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsCreateModalOpen(true);
                        }}
                        title="New Playlist"
                        aria-label="New Playlist"
                        className="group/plus flex h-6 w-6 items-center justify-center rounded-full text-white/50 outline-none transition-[background-color,color,transform] duration-200 hover:bg-white/10 hover:text-white active:scale-90"
                      >
                        <Plus
                          size={14}
                          strokeWidth={2.2}
                          className={cn("transition-transform duration-500 group-hover/plus:rotate-90", SMOOTH)}
                        />
                      </button>
                      <ChevronRight
                        size={13}
                        strokeWidth={2.5}
                        className={cn(
                          "mx-0.5 text-white/40 transition-transform duration-[560ms]",
                          SPRING,
                          playlistsExpanded && "rotate-90"
                        )}
                      />
                    </div>
                  </div>

                  <Collapse open={!collapsed && playlistsExpanded}>
                    <div className="space-y-0.5 pb-0.5 pl-[34px] pt-1">
                      {recentPlaylists.map((p: any) => {
                        const on = pathname === `/playlist/${p.id}`;
                        return (
                          <Link
                            key={p.id}
                            href={`/playlist/${p.id}`}
                            title={p.name}
                            className={cn(
                              "block h-8 truncate rounded-[9px] px-2.5 text-[14px] leading-8 outline-none transition-colors duration-200",
                              on ? "bg-white/[0.1] font-medium text-white" : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                            )}
                          >
                            {p.name}
                          </Link>
                        );
                      })}
                      {recentPlaylists.length === 0 && (
                        <div className="h-8 px-2.5 text-[13px] leading-8 text-white/40">No playlists yet</div>
                      )}
                      {Array.isArray(playlists) && playlists.length > 3 && (
                        <Link
                          href="/library?tab=playlists"
                          className="block h-8 px-2.5 text-[13px] font-medium leading-8 text-white/50 transition-colors duration-200 hover:text-white"
                        >
                          Show all {playlists.length}
                        </Link>
                      )}
                    </div>
                  </Collapse>
                </div>

                <NavLink
                  href="/library?tab=liked"
                  icon={Heart}
                  label="Liked Songs"
                  active={pathname.startsWith("/library") && activeTab === "liked"}
                  collapsed={collapsed}
                />
                <NavLink
                  href="/library?tab=artists"
                  icon={Mic}
                  label="Artists"
                  active={pathname.startsWith("/library") && activeTab === "artists"}
                  collapsed={collapsed}
                />
                <NavLink
                  id="tour-device-music"
                  dataTour="device-music"
                  href="/local-library"
                  icon={HardDrive}
                  label="Device"
                  active={pathname.startsWith("/local-library")}
                  collapsed={collapsed}
                />
              </div>

              {isAdmin && (
                <NavLink
                  href="/admin"
                  icon={ShieldCheck}
                  label="Admin Console"
                  active={pathname.startsWith("/admin")}
                  collapsed={collapsed}
                />
              )}
              <NavLink
                href="#"
                icon={Settings}
                label="Settings"
                active={useUIStore((s) => s.isSettingsOpen)}
                collapsed={collapsed}
                onClick={() => useUIStore.getState().openSettings()}
              />
            </div>
          </nav>

          {/* Version pinned to the bottom, clear of the player */}
          <div
            className={cn(
              "mt-auto px-[26px] text-[11px] font-medium text-white/30 transition-opacity duration-200",
              collapsed && "opacity-0"
            )}
            style={{ paddingBottom: currentTrack ? 98 : 12 }}
          >
            <span className="font-zenify not-italic">zenify</span> v2.5.3
          </div>
        </div>

        {/* The single edge hairline, in two pieces that stop where the tab begins and resumes where it ends */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 w-px"
          style={{ height: TAB_TOP, background: LINE }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 right-0 w-px"
          style={{ top: TAB_TOP + TAB_H, background: LINE }}
        />

        {/* Edge-attached open/close tab, at the top */}
        <EdgeTab
          collapsed={collapsed}
          translucent={isAlbumPage}
          onToggle={() => setSidebarCollapsed(!collapsed)}
        />
      </aside>

      {/* Outside the <aside> so sticky/transitions can never offset or clip the modal */}
      <CreatePlaylistModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
    </>
  );
}