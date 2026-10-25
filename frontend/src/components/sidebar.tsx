"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { usePlayerStore } from "@/store/player";
import api from "@/lib/api";
import { useState, type ComponentType, type ReactNode } from "react";
import { CreatePlaylistModal } from "./create-playlist-modal";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ZenifyLogo } from "./shared/ZenifyLogo";

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */
const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 } as const;
const APPLE_RED = "#fa233b";
const COLLAPSED_W = 72; // icon x-position is identical in both states (centre = 36px)

/* ------------------------------------------------------------------ */
/* Styles: pure CSS springs (linear() easings from globals.css).       */
/* No per-frame JS: sidebar width, labels, collapses, icons.           */
/* ------------------------------------------------------------------ */
const SIDEBAR_CSS = `
.sb-root{
  --sd:var(--spring-smooth-d,530ms);   --se:var(--spring-smooth,cubic-bezier(.22,1,.36,1));
  --sn-d:var(--spring-snappy-d,430ms); --sn:var(--spring-snappy,cubic-bezier(.2,.9,.3,1.08));
  --bo-d:var(--spring-bouncy-d,860ms); --bo:var(--spring-bouncy,cubic-bezier(.3,1.4,.5,1));
  transition:width var(--sd) var(--se),background-color .3s ease;
}
.sb-label{transition:opacity .22s ease,transform var(--sd) var(--se);}
.sb-root[data-collapsed="true"] .sb-label{opacity:0;transform:translateX(-8px);pointer-events:none;}
.sb-divider{opacity:0;transition:opacity .3s ease;}
.sb-root[data-collapsed="true"] .sb-divider{opacity:1;}

.sb-press{transition:transform var(--sn-d) var(--sn),background-color .2s ease,color .2s ease;}
.sb-press:active{transform:scale(.97);transition-duration:80ms;}

.sb-collapse{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows var(--sd) var(--se),opacity .22s ease;}
.sb-collapse.is-open{grid-template-rows:1fr;opacity:1;}

.sb-chev{display:flex;transition:transform var(--sn-d) var(--sn);}
.sb-chev[data-open="true"]{transform:rotate(90deg);}

/* Edge tab */
.sb-tab{position:absolute;left:100%;margin-left:-1px;top:calc(50% - 36px);width:22px;height:72px;
  transform-origin:0 50%;transition:transform var(--sn-d) var(--sn);cursor:pointer;outline:none;}
.sb-tab:hover{transform:scaleX(1.16);}
.sb-tab:active{transform:scaleX(.92);transition-duration:80ms;}
.sb-tab:focus-visible{filter:drop-shadow(0 0 0 2px rgba(255,255,255,.6));}
.sb-arrow{position:absolute;left:5px;top:50%;margin-top:-7px;display:flex;color:rgba(255,255,255,.7);
  transition:transform var(--sn-d) var(--sn),color .2s ease;}
.sb-tab:hover .sb-arrow{color:#fff;}
.sb-root[data-collapsed="false"] .sb-arrow{transform:rotate(180deg);}

/* Icons: static; animate on hover, squash on press */
.sb-i{display:block;overflow:visible;transition:transform var(--sn-d) var(--sn);}
.sb-i *{transition:transform var(--bo-d) var(--bo),opacity .3s ease;}
.sb-o{transform-box:view-box;transform-origin:12px 12px;}
.sb-led{transform-box:fill-box;transform-origin:center;}
@media (hover:hover){
  .sb-row:hover .sb-hop{transform:translateY(-2px);}
  .sb-row:hover .sb-needle{transform:rotate(55deg);}
  .sb-row:hover .sb-note{transform:rotate(-10deg);}
  .sb-row:hover .sb-beat{transform:scale(1.16);}
  .sb-row:hover .sb-tilt{transform:rotate(-12deg);}
  .sb-row:hover .sb-spin{transform:rotate(120deg);}
  .sb-row:hover .sb-hands{transform:rotate(90deg);}
  .sb-row:hover .sb-led{transform:scale(1.6);}
  .sb-row:hover .sb-pop{transform:scale(1.1);}
  .sb-row:hover .sb-gear{transform:rotate(60deg);}
  .sb-row:hover .sb-nudge{transform:translateX(2px);}
  .sb-row:hover .sb-plus{transform:rotate(90deg);}
}
.sb-row:active .sb-i{transform:scale(.86);transition-duration:80ms;}

@media (prefers-reduced-motion:reduce){
  .sb-root,.sb-root *{transition-duration:1ms!important;}
}
`;

/* ------------------------------------------------------------------ */
/* SF Symbols-style icons: outline when idle, duotone fill when active */
/* ------------------------------------------------------------------ */
type IconProps = { filled?: boolean; size?: number };
type IconType = ComponentType<IconProps>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;
const fp = (f?: boolean) => (f ? { fill: "currentColor", fillOpacity: 0.22 } : { fill: "none" });

const HomeI: IconType = ({ filled, size = 20 }) => (
  <svg {...base} width={size} height={size} className="sb-i">
    <g className="sb-o sb-hop">
      <path d="M3.5 10.8 12 3.8l8.5 7V19a1.6 1.6 0 0 1-1.6 1.6H5.1A1.6 1.6 0 0 1 3.5 19Z" {...fp(filled)} />
      <path d="M9.5 20.6v-5.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v5.2" />
    </g>
  </svg>
);
const CompassI: IconType = ({ filled, size = 20 }) => (
  <svg {...base} width={size} height={size} className="sb-i">
    <circle cx="12" cy="12" r="9" {...fp(filled)} />
    <g className="sb-o sb-needle">
      <path d="M15.6 8.4 13.4 13.4 8.4 15.6 10.6 10.6Z" fill="currentColor" fillOpacity={filled ? 0.9 : 0.15} />
    </g>
  </svg>
);
const PlaylistI: IconType = ({ filled, size = 20 }) => (
  <svg {...base} width={size} height={size} className="sb-i">
    <path d="M3.5 7h10M3.5 11.5h8M3.5 16h5" />
    <g className="sb-o sb-note">
      <circle cx="16.5" cy="17" r="2.5" {...fp(filled)} />
      <path d="M19 17V5.5M19 5.5c0 2 2.5 2 2.5 4.5" />
    </g>
  </svg>
);
const HeartI: IconType = ({ filled, size = 20 }) => (
  <svg {...base} width={size} height={size} className="sb-i">
    <g className="sb-o sb-beat">
      <path d="M12 20.5s-8.5-5-8.5-11A4.75 4.75 0 0 1 12 6.6a4.75 4.75 0 0 1 8.5 2.9c0 6-8.5 11-8.5 11Z" {...fp(filled)} />
    </g>
  </svg>
);
const MicI: IconType = ({ filled, size = 20 }) => (
  <svg {...base} width={size} height={size} className="sb-i">
    <g className="sb-o sb-tilt">
      <rect x="9" y="3" width="6" height="11" rx="3" {...fp(filled)} />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
    </g>
  </svg>
);
const DiscI: IconType = ({ filled, size = 20 }) => (
  <svg {...base} width={size} height={size} className="sb-i">
    <g className="sb-o sb-spin">
      <circle cx="12" cy="12" r="9" {...fp(filled)} />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 3a9 9 0 0 1 6.4 2.6" />
    </g>
  </svg>
);
const ClockI: IconType = ({ filled, size = 20 }) => (
  <svg {...base} width={size} height={size} className="sb-i">
    <circle cx="12" cy="12" r="9" {...fp(filled)} />
    <g className="sb-o sb-hands">
      <path d="M12 7v5l3.2 2" />
    </g>
  </svg>
);
const DriveI: IconType = ({ filled, size = 20 }) => (
  <svg {...base} width={size} height={size} className="sb-i">
    <path d="M5.2 13 7.4 5.8A2 2 0 0 1 9.3 4.4h5.4a2 2 0 0 1 1.9 1.4L18.8 13" />
    <rect x="3" y="13" width="18" height="7" rx="2.5" {...fp(filled)} />
    <path d="M7 16.5h4" />
    <circle className="sb-led" cx="17" cy="16.5" r="0.9" fill="currentColor" />
  </svg>
);
const ShieldI: IconType = ({ filled, size = 20 }) => (
  <svg {...base} width={size} height={size} className="sb-i">
    <g className="sb-o sb-pop">
      <path d="M12 3 4.5 5.8v5.7c0 4.6 3.1 8 7.5 9.7 4.4-1.7 7.5-5.1 7.5-9.7V5.8Z" {...fp(filled)} />
      <path d="m8.8 12.2 2.2 2.2 4.2-4.4" />
    </g>
  </svg>
);
const GearI: IconType = ({ filled, size = 20 }) => (
  <svg {...base} width={size} height={size} className="sb-i">
    <g className="sb-o sb-gear">
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        {...fp(filled)}
      />
      <circle cx="12" cy="12" r="3" />
    </g>
  </svg>
);
const LogoutI: IconType = ({ size = 20 }) => (
  <svg {...base} width={size} height={size} className="sb-i">
    <path d="M9.5 4.5H7A2.5 2.5 0 0 0 4.5 7v10A2.5 2.5 0 0 0 7 19.5h2.5" />
    <g className="sb-nudge">
      <path d="m14 8 4 4-4 4M18 12H9.5" />
    </g>
  </svg>
);
const PlusI: IconType = ({ size = 14 }) => (
  <svg {...base} strokeWidth={2.2} width={size} height={size} className="sb-i">
    <g className="sb-o sb-plus">
      <path d="M12 5v14M5 12h14" />
    </g>
  </svg>
);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function ActivePill() {
  // Shared element: slides between items with a spring when the route changes
  return (
    <motion.span
      layoutId="sidebar-active-pill"
      transition={SPRING}
      className="absolute inset-0 rounded-[9px] bg-white/[0.1]"
    />
  );
}

/** CSS-grid collapse: spring easing, interruptible, no JS layout measuring */
function Collapse({ open, className, children }: { open: boolean; className?: string; children: ReactNode }) {
  return (
    <div
      className={cn("sb-collapse", open && "is-open")}
      aria-hidden={!open}
      {...(!open ? ({ inert: "" } as any) : {})}
    >
      <div className={cn("min-h-0 overflow-hidden", className)}>{children}</div>
    </div>
  );
}

const ROW_BASE =
  "sb-row sb-press group relative flex h-9 w-full items-center overflow-hidden rounded-[9px] px-[14px] text-[15px] tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-white/30";

/* ------------------------------------------------------------------ */
/* Link item                                                           */
/* ------------------------------------------------------------------ */
interface AnimatedSidebarLinkProps {
  href: string;
  icon: IconType;
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
  iconClassName,
}: AnimatedSidebarLinkProps) {
  return (
    <Link
      id={id}
      data-tour={dataTour}
      href={href}
      onClick={(e) => e.stopPropagation()}
      title={isSidebarCollapsed ? label : undefined}
      className={cn(ROW_BASE, isActive ? "text-white" : "text-white/90 hover:bg-white/[0.06]", className)}
    >
      {isActive && <ActivePill />}
      <span
        style={isActive ? { color: APPLE_RED } : undefined}
        className={cn(
          "relative z-10 flex h-5 w-5 shrink-0 transition-colors duration-200",
          !isActive && "text-white/60 group-hover:text-white/90",
          iconClassName
        )}
      >
        <Icon filled={isActive} />
      </span>
      <span className="sb-label relative z-10 ml-2.5 whitespace-nowrap font-medium">{label}</span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Button item                                                         */
/* ------------------------------------------------------------------ */
interface AnimatedSidebarButtonProps {
  icon: IconType;
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
  iconClassName,
}: AnimatedSidebarButtonProps) {
  return (
    <button
      type="button"
      data-no-spring
      onClick={onClick}
      title={isSidebarCollapsed ? title || label : undefined}
      className={cn(ROW_BASE, "font-medium hover:bg-white/[0.06]", isActive ? "text-white" : "text-white/90", className)}
    >
      <span
        className={cn(
          "relative z-10 flex h-5 w-5 shrink-0 text-white/60 transition-colors duration-200 group-hover:text-white/90",
          iconClassName
        )}
      >
        <Icon />
      </span>
      {label && <span className="sb-label relative z-10 ml-2.5 whitespace-nowrap">{label}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Edge-attached toggle tab: a curved tab that grows out of the        */
/* sidebar's right edge with concave blends at top and bottom          */
/* ------------------------------------------------------------------ */
const TAB_FILL = "M0 0 Q0 8 8 8 H10 Q20 8 20 18 V54 Q20 64 10 64 H8 Q0 64 0 72 Z";
const TAB_EDGE = "M0 0 Q0 8 8 8 H10 Q20 8 20 18 V54 Q20 64 10 64 H8 Q0 64 0 72";

function EdgeTab({
  collapsed,
  onToggle,
  translucent,
}: {
  collapsed: boolean;
  onToggle: () => void;
  translucent: boolean;
}) {
  return (
    <button
      type="button"
      data-no-spring
      className="sb-tab z-50"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      <svg width="22" height="72" viewBox="0 0 22 72" className="absolute inset-0 overflow-visible" aria-hidden>
        <path d={TAB_FILL} fill={translucent ? "rgba(28,28,30,0.72)" : "#1c1c1e"} />
        <path d={TAB_EDGE} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      </svg>
      <span className="sb-arrow">
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
  const { logout, user, isAuthenticated } = useAuthStore();
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [libExpanded, setLibExpanded] = useState(true);
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
    { label: "Home", icon: HomeI, href: "/", isActive: pathname === "/" },
    { label: "Discover", icon: CompassI, href: "/discover", isActive: pathname === "/discover" || pathname === "/search" },
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
      data-collapsed={isSidebarCollapsed}
      onClick={toggleSidebar}
      style={{
        fontFamily: "var(--font-ui)",
        WebkitFontSmoothing: "antialiased",
        width: isSidebarCollapsed ? COLLAPSED_W : "var(--sidebar-width, 250px)",
      }}
      className={cn(
        "sb-root sticky top-0 left-0 z-20 h-screen shrink-0 select-none",
        isAlbumPage ? "bg-transparent" : "bg-[#1c1c1e]"
      )}
    >
      <style>{SIDEBAR_CSS}</style>

      {/* Clipped column: keeps labels from spilling while the width springs */}
      <div
        onClick={toggleSidebar}
        className="flex h-full w-full flex-col overflow-hidden border-r border-white/[0.08]"
      >
        {/* Logo area: logo sits at a fixed left offset so its centre never moves */}
        <div className="relative flex h-[72px] shrink-0 items-center border-b border-white/[0.08] pl-5">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={isSidebarCollapsed ? "mark" : "full"}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={SPRING}
              className="flex cursor-pointer select-none items-center"
              onClick={(e) => {
                e.stopPropagation();
                router.push("/");
              }}
              title="Zenify Home"
            >
              {isSidebarCollapsed ? <ZenifyLogo markOnly size={32} /> : <ZenifyLogo size={42} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Scrollable nav (extra top padding moves Home slightly lower) */}
        <div
          className="no-scrollbar flex-1 overflow-y-auto px-3 pt-4"
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
            <div className="relative mb-1 h-7">
              <button
                type="button"
                data-no-spring
                tabIndex={isSidebarCollapsed ? -1 : 0}
                aria-hidden={isSidebarCollapsed}
                onClick={(e) => {
                  e.stopPropagation();
                  setLibExpanded(!libExpanded);
                }}
                className="sb-label group flex h-7 w-full items-center gap-1 px-[14px] text-[13px] font-semibold tracking-[-0.005em] text-white/50 outline-none transition-colors duration-200 hover:text-white/80"
              >
                <span>Library</span>
                <span
                  className="sb-chev opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  data-open={libExpanded}
                >
                  <ChevronRight size={13} strokeWidth={2.5} />
                </span>
              </button>
              <div className="sb-divider pointer-events-none absolute inset-x-2 top-1/2 h-px bg-white/[0.08]" />
            </div>

            <Collapse open={libExpanded || isSidebarCollapsed} className="space-y-0.5">
              {/* Playlists */}
              <div className="w-full">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isSidebarCollapsed) router.push("/library?tab=playlists");
                    else setPlaylistsExpanded(!playlistsExpanded);
                  }}
                  title={isSidebarCollapsed ? "Playlists" : undefined}
                  className={cn(
                    ROW_BASE,
                    "cursor-pointer justify-between hover:bg-white/[0.06]",
                    playlistsActive ? "text-white" : "text-white/90"
                  )}
                >
                  {playlistsActive && <ActivePill />}
                  <div className="relative z-10 flex min-w-0 items-center">
                    <span
                      style={playlistsActive ? { color: APPLE_RED } : undefined}
                      className={cn(
                        "flex h-5 w-5 shrink-0 transition-colors duration-200",
                        !playlistsActive && "text-white/60 group-hover:text-white/90"
                      )}
                    >
                      <PlaylistI filled={playlistsActive} />
                    </span>
                    <span className="sb-label ml-2.5 whitespace-nowrap font-medium">Playlists</span>
                  </div>

                  <div
                    className="sb-label relative z-10 -mr-1.5 flex items-center gap-0.5"
                    aria-hidden={isSidebarCollapsed}
                  >
                    <button
                      type="button"
                      data-no-spring
                      tabIndex={isSidebarCollapsed ? -1 : 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsCreateModalOpen(true);
                      }}
                      className="sb-row sb-press flex h-6 w-6 items-center justify-center rounded-full text-white/50 outline-none transition-colors duration-200 hover:bg-white/10 hover:text-white"
                      title="New Playlist"
                      aria-label="New Playlist"
                    >
                      <PlusI />
                    </button>
                    <span className="sb-chev h-6 w-5 items-center justify-center text-white/40" data-open={playlistsExpanded}>
                      <ChevronRight size={13} strokeWidth={2.5} />
                    </span>
                  </div>
                </div>

                {/* Recent playlists */}
                <Collapse open={!isSidebarCollapsed && playlistsExpanded} className="space-y-0.5 pb-1 pl-[34px] pt-0.5">
                  {recentPlaylists.map((p: any) => {
                    const isPActive = pathname === `/playlist/${p.id}`;
                    return (
                      <Link
                        key={p.id}
                        href={`/playlist/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        title={p.name}
                        className={cn(
                          "block h-8 truncate rounded-[9px] px-2.5 text-[14px] leading-8 outline-none transition-colors duration-200",
                          isPActive
                            ? "bg-white/[0.1] font-medium text-white"
                            : "text-white/70 hover:bg-white/[0.06] hover:text-white"
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
                      onClick={(e) => e.stopPropagation()}
                      className="block h-8 px-2.5 text-[13px] font-medium leading-8 text-white/50 transition-colors duration-200 hover:text-white"
                    >
                      Show all {playlists.length}
                    </Link>
                  )}
                </Collapse>
              </div>

              <AnimatedSidebarLink
                href="/library?tab=liked"
                icon={HeartI}
                label="Liked Songs"
                isActive={pathname.startsWith("/library") && activeTab === "liked"}
                isSidebarCollapsed={isSidebarCollapsed}
              />
              <AnimatedSidebarLink
                href="/library?tab=artists"
                icon={MicI}
                label="Artists"
                isActive={pathname.startsWith("/library") && activeTab === "artists"}
                isSidebarCollapsed={isSidebarCollapsed}
              />
              <AnimatedSidebarLink
                href="/library?tab=albums"
                icon={DiscI}
                label="Albums"
                isActive={activeTab === "albums" || pathname.startsWith("/album/")}
                isSidebarCollapsed={isSidebarCollapsed}
              />
              <AnimatedSidebarLink
                href="/section/recently-played"
                icon={ClockI}
                label="Recently Played"
                isActive={pathname.includes("recently-played") || pathname === "/history"}
                isSidebarCollapsed={isSidebarCollapsed}
              />
              <AnimatedSidebarLink
                id="tour-device-music"
                dataTour="device-music"
                href="/local-library"
                icon={DriveI}
                label="Device"
                isActive={pathname.startsWith("/local-library")}
                isSidebarCollapsed={isSidebarCollapsed}
              />
            </Collapse>
          </div>
        </div>

        {/* Pinned footer: Admin, Settings, Logout */}
        <div
          className="shrink-0 space-y-0.5 border-t border-white/[0.08] px-3 py-2"
          style={{ marginBottom: currentTrack ? 90 : 0 }}
        >
          {isAdmin && (
            <AnimatedSidebarLink
              href="/admin"
              icon={ShieldI}
              label="Admin Console"
              isActive={pathname.startsWith("/admin")}
              isSidebarCollapsed={isSidebarCollapsed}
            />
          )}
          <AnimatedSidebarButton
            onClick={(e) => {
              e.stopPropagation();
              useUIStore.getState().openSettings();
            }}
            icon={GearI}
            label="Settings"
            isSidebarCollapsed={isSidebarCollapsed}
          />
          <AnimatedSidebarButton
            onClick={(e) => {
              e.stopPropagation();
              handleLogout();
            }}
            icon={LogoutI}
            label="Logout"
            isSidebarCollapsed={isSidebarCollapsed}
            className="hover:!text-[#fa233b]"
            iconClassName="group-hover:!text-[#fa233b]"
          />
          <Collapse open={!isSidebarCollapsed}>
            <div className="px-[14px] pt-2 text-[11px] font-medium text-white/30">
              <span className="font-zenify not-italic">zenify</span> v2.5.3
            </div>
          </Collapse>
        </div>
      </div>

      {/* Edge-attached toggle tab (outside the clipped column so it can overhang) */}
      <EdgeTab
        collapsed={isSidebarCollapsed}
        translucent={isAlbumPage}
        onToggle={() => setSidebarCollapsed(!isSidebarCollapsed)}
      />

      <CreatePlaylistModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
    </div>
  );
}