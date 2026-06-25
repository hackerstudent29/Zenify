"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn, getMediaUrl } from "@/lib/utils";
import {
 Home, Search, Library, Plus, Heart, LogOut,
 Settings, User as UserIcon, Shield, Music,
 Sparkles, Radio, Star, Clock, ListMusic,
 ChevronDown, ChevronRight, Disc, Mic2,
 Calendar, Flame, CreditCard
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { usePlayerStore } from "@/store/player";
import api from "@/lib/api";
import { useState } from "react";
import { CreatePlaylistModal } from "./create-playlist-modal";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ZenifyLogo } from "./shared/ZenifyLogo";

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

 // Collapsible states for sections
 const [libExpanded, setLibExpanded] = useState(true);
 const [playlistsExpanded, setPlaylistsExpanded] = useState(true);

 const isAdmin = user?.role === 'ADMIN';

 // Premium ultra-responsive spring transition configuration shared by all layout changes


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

 const handleLogout = () => {
 logout();
 router.push("/login"); // Instant navigation
 api.post("auth/logout").catch(() => { }); // Background cleanup
 };

 if (pathname === '/login' || pathname === '/register' || !isAuthenticated) return null;

 const navItems = [
 { label: "Home", icon: Home, href: "/" },
 { label: "Discover", icon: Search, href: "/search" },
 { label: "Library", icon: Library, href: "/library" },
 ];

 const toggleSidebar = (e: React.MouseEvent) => {
 // Only toggle if clicking the background container, not its children items
 if (e.target === e.currentTarget) {
 setSidebarCollapsed(!isSidebarCollapsed);
 }
 };

 const isGlassmorphism = user?.preferences?.sidebarStyle === "glassmorphism";

 return (
 <div
 className={cn(
 "flex flex-col h-full w-full select-none relative overflow-hidden bg-[#0A0A0C]",
 isGlassmorphism
 ? "my-3 ml-3 mr-1.5 h-[calc(100vh-24px)] rounded-2xl border border-white/10 bg-black/45 backdrop-blur-[32px] ring-1 ring-white/5 shadow-[0_30px_60px_rgba(0,0,0,0.6)] isolate"
 : "h-full border-r border-white/5"
 )}
 onClick={toggleSidebar}
 >
 {/* Logo area */}
 <div
 className={cn(
 "px-6 h-[64px] flex items-center group cursor-pointer border-b border-white/5 overflow-hidden",
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
 <ZenifyLogo size={isSidebarCollapsed ? 24 : 36} />
 </div>

 <div className={cn(
 "flex-1 overflow-y-auto space-y-6 no-scrollbar",
 isSidebarCollapsed ? "px-1.5 py-3" : "px-3 py-6"
 )} onClick={toggleSidebar}>
 {/* Main Section */}
 <div>
 <div className="space-y-1">
 {navItems.map((item) => {
 const isActive = item.href === '/' 
 ? pathname === '/' 
 : pathname.startsWith(item.href);
 return (
 <Link
 key={item.href}
 href={item.href}
 onClick={(e) => e.stopPropagation()}
 className={cn(
 "sidebar-item",
 isActive && "active",
 isSidebarCollapsed && "justify-center px-0 h-12"
 )}
 title={isSidebarCollapsed ? item.label : ""}
 >
 <item.icon size={20} />
 {!isSidebarCollapsed && (
 <span className="whitespace-nowrap opacity-100">
 {item.label}
 </span>
 )}
 </Link>
 );
 })}

 </div>
 </div>

 {/* Library Section */}
 <div>
 <button
 onClick={(e) => { e.stopPropagation(); !isSidebarCollapsed && setLibExpanded(!libExpanded); }}
 className={cn(
 "sidebar-section-title flex items-center justify-between w-full group py-1 cursor-pointer hover:text-white transition-colors",
 isSidebarCollapsed && "justify-center"
 )}
 >
 {!isSidebarCollapsed && <span className="text-[11px] text-white/50 font-bold uppercase tracking-wider">Your Library</span>}
 {!isSidebarCollapsed && (libExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
 </button>

 <div className={cn(
 "space-y-0.5 transition-all duration-300 overflow-hidden",
 isSidebarCollapsed ? "flex flex-col gap-2 items-center" : (libExpanded ? "h-auto opacity-100" : "h-0 opacity-0 pointer-events-none")
 )}>
 <Link
 href="/library?tab=liked"
 onClick={(e) => e.stopPropagation()}
 className={cn(
 "sidebar-item text-[15px] w-full",
 (pathname.startsWith("/library") && activeTab === "liked") && "active",
 isSidebarCollapsed && "justify-center px-0 h-12"
 )}
 title={isSidebarCollapsed ? "Liked Songs" : ""}
 >
 <Heart size={isSidebarCollapsed ? 20 : 18} />
 {!isSidebarCollapsed && <span className="whitespace-nowrap font-semibold">Liked Songs</span>}
 </Link>
 <Link
 href="/library?tab=artists"
 onClick={(e) => e.stopPropagation()}
 className={cn(
 "sidebar-item text-[15px] w-full",
 (pathname.startsWith("/library") && activeTab === "artists") && "active",
 isSidebarCollapsed && "justify-center px-0 h-12"
 )}
 title={isSidebarCollapsed ? "Artists" : ""}
 >
 <Mic2 size={isSidebarCollapsed ? 20 : 18} />
 {!isSidebarCollapsed && <span className="whitespace-nowrap font-semibold">Artists</span>}
 </Link>
 <Link
 href="/library?tab=albums"
 onClick={(e) => e.stopPropagation()}
 className={cn(
 "sidebar-item text-[15px] w-full",
 (activeTab === "albums" || pathname.startsWith('/album/')) && "active",
 isSidebarCollapsed && "justify-center px-0 h-12"
 )}
 title={isSidebarCollapsed ? "Albums" : ""}
 >
 <Disc size={isSidebarCollapsed ? 20 : 18} />
 {!isSidebarCollapsed && <span className="whitespace-nowrap font-semibold">Albums</span>}
 </Link>
 </div>
 </div>

 {/* Playlists Section */}
 {/* Playlists Section */}
 <div className={cn(
 "transition-all duration-300 overflow-hidden",
 isSidebarCollapsed ? "opacity-0 h-0 pointer-events-none" : "opacity-100 h-auto"
 )}>
 <div className="sidebar-section-title flex items-center justify-between w-full py-1">
 <button
 onClick={(e) => { e.stopPropagation(); setPlaylistsExpanded(!playlistsExpanded); }}
 className="flex items-center gap-2 cursor-pointer"
 >
 <span>Playlists</span>
 {playlistsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
 </button>
 <button
 onClick={(e) => { e.stopPropagation(); setIsCreateModalOpen(true); }}
 className="hover:text-accent transition-colors cursor-pointer"
 >
 <Plus size={14} />
 </button>
 </div>

 <AnimatePresence>
 {playlistsExpanded && (
 <motion.div
 initial={{ height: 0, opacity: 0 }}
 animate={{ height: "auto", opacity: 1 }}
 exit={{ height: 0, opacity: 0 }}
 transition={{ duration: 0.2, ease: "easeInOut" }}
 className="overflow-hidden space-y-0.5"
 >
 {(Array.isArray(playlists) ? playlists : []).map((p: any) => (
 <Link key={p.id} href={`/playlist/${p.id}`} onClick={(e) => e.stopPropagation()} className={cn("sidebar-item", pathname.startsWith(`/playlist/${p.id}`) && "active")}>
 <ListMusic size={18} />
 <span className="truncate">{p.name}</span>
 </Link>
 ))}
 {(!playlists || playlists.length === 0) && (
 <div className="px-4 py-3 text-[11px] text-muted-dark italic">No playlists created</div>
 )}
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 </div>

 {/* Profile Section at Bottom */}
 <div
 className={cn("mt-auto pb-4", isSidebarCollapsed ? "px-2 pt-2" : "px-3 pt-6")}
 style={{ paddingBottom: currentTrack ? "calc(90px + 1rem)" : undefined }}
 onClick={toggleSidebar}
 >
 {/* User Overview */}

 <div className="space-y-1">
 {isAdmin && (
 <Link
 href="/admin"
 onClick={(e) => e.stopPropagation()}
 className={cn(
 "sidebar-item mb-1",
 pathname.startsWith("/admin") && "active",
 isSidebarCollapsed && "justify-center px-0 h-12"
 )}
 title={isSidebarCollapsed ? "Admin Console" : ""}
 >
 <Shield size={isSidebarCollapsed ? 20 : 18} />
 {!isSidebarCollapsed && <span className="whitespace-nowrap">Admin Console</span>}
 </Link>
 )}

 <Link
 href="/pricing"
 onClick={(e) => e.stopPropagation()}
 className={cn(
 "sidebar-item",
 pathname.startsWith("/pricing") && "active",
 isSidebarCollapsed && "justify-center px-0 h-12"
 )}
 title={isSidebarCollapsed ? "Pricing" : ""}
 >
 <CreditCard size={20} />
 {!isSidebarCollapsed && <span className="whitespace-nowrap">Pricing</span>}
 </Link>
 <Link
 href="/settings"
 onClick={(e) => e.stopPropagation()}
 className={cn("sidebar-item", pathname.startsWith("/settings") && "active", isSidebarCollapsed && "justify-center px-0 h-12")}
 title={isSidebarCollapsed ? "Settings" : ""}
 >
 <Settings size={20} />
 {!isSidebarCollapsed && <span className="whitespace-nowrap">Settings</span>}
 </Link>
 <button
 onClick={(e) => { e.stopPropagation(); handleLogout(); }}
 className={cn("sidebar-item w-full text-muted-dark hover:text-[#EF4444] cursor-pointer", isSidebarCollapsed && "justify-center px-0 h-12")}
 title={isSidebarCollapsed ? "Logout" : ""}
 >
 <LogOut size={20} />
 {!isSidebarCollapsed && <span className="whitespace-nowrap">Logout</span>}
 </button>
 </div>

 {!isSidebarCollapsed && (
 <div className="px-4 mt-6 text-[10px] text-muted-dark font-medium uppercase tracking-[0.2em] opacity-30">
 <span className="font-zenify not-italic">zenify</span> v0.1
 </div>
 )}
 </div>

 <CreatePlaylistModal
 isOpen={isCreateModalOpen}
 onClose={() => setIsCreateModalOpen(false)}
 />
 </div>
 );
}
