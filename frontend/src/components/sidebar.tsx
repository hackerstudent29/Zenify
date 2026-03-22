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
import { useState, useMemo } from "react";
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
    const { isSidebarCollapsed, setSidebarCollapsed } = useUIStore();
    const { currentTrack } = usePlayerStore();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Collapsible states for sections
    const [libExpanded, setLibExpanded] = useState(true);
    const [playlistsExpanded, setPlaylistsExpanded] = useState(true);

    const isAdmin = user?.role === 'ADMIN';

    const { data: playlists } = useQuery({
        queryKey: ['my-playlists'],
        queryFn: async () => {
            try {
                const res = await api.get('playlists/my');
                return res.data;
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

    return (
        <motion.div
            initial={false}
            animate={{ width: isSidebarCollapsed ? 72 : 250 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col h-full bg-[var(--surface)] select-none relative border-r border-white/5 overflow-hidden"
            onClick={toggleSidebar}
        >
            {/* Logo area */}
            <div
                className={cn(
                    "px-6 h-[64px] flex items-center group cursor-pointer border-b border-white/5 overflow-hidden",
                    isSidebarCollapsed ? "justify-center px-0" : "gap-2.5"
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
                <ZenifyLogo size={isSidebarCollapsed ? 24 : 36} className="shadow-2xl shadow-accent/20 group-hover:scale-105 transition-transform" />
                {!isSidebarCollapsed && (
                    <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-2xl font-brand brand-gradient pt-1.5 leading-none"
                    >
                        Zenify
                    </motion.span>
                )}
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
                                    <AnimatePresence mode="wait">
                                        {!isSidebarCollapsed && (
                                            <motion.span
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -10 }}
                                                className="whitespace-nowrap"
                                            >
                                                {item.label}
                                            </motion.span>
                                        )}
                                    </AnimatePresence>
                                </Link>
                            );
                        })}

                    </div>
                </div>

                {/* Library Section */}
                <div>
                    {!isSidebarCollapsed ? (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); setLibExpanded(!libExpanded); }}
                                className="sidebar-section-title flex items-center justify-between w-full group py-1 cursor-pointer hover:text-white transition-colors"
                            >
                                <span className="text-[11px] text-white">Your Library</span>
                                {libExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>

                            <AnimatePresence>
                                {libExpanded && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2, ease: "easeInOut" }}
                                        className="overflow-hidden space-y-0.5"
                                    >
                                        <Link
                                            href="/library?tab=liked"
                                            onClick={(e) => e.stopPropagation()}
                                            className={cn("sidebar-item text-[15px]", (pathname.startsWith("/library") && activeTab === "liked") && "active")}
                                        >
                                            <Heart size={18} />
                                            <span className="font-semibold">Liked Songs</span>
                                        </Link>
                                        <Link
                                            href="/library?tab=artists"
                                            onClick={(e) => e.stopPropagation()}
                                            className={cn("sidebar-item text-[15px]", (pathname.startsWith("/library") && activeTab === "artists") && "active")}
                                        >
                                            <Mic2 size={18} />
                                            <span className="font-semibold">Artists</span>
                                        </Link>
                                        <Link
                                            href="/library?tab=albums"
                                            onClick={(e) => e.stopPropagation()}
                                            className={cn("sidebar-item text-[15px]", (activeTab === "albums" || pathname.startsWith('/album/')) && "active")}
                                        >
                                            <Disc size={18} />
                                            <span className="font-semibold">Albums</span>
                                        </Link>

                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </>
                    ) : (
                        <div className="flex flex-col gap-2 items-center">
                            <Link
                                href="/library?tab=liked"
                                onClick={(e) => e.stopPropagation()}
                                className={cn("sidebar-item justify-center px-0 w-full h-12", (pathname.startsWith("/library") && activeTab === "liked") && "active")}
                                title="Liked Songs"
                            >
                                <Heart size={20} />
                            </Link>
                            <Link
                                href="/library?tab=artists"
                                onClick={(e) => e.stopPropagation()}
                                className={cn("sidebar-item justify-center px-0 w-full h-12", (pathname.startsWith("/library") && activeTab === "artists") && "active")}
                                title="Artists"
                            >
                                <Mic2 size={20} />
                            </Link>
                            <Link
                                href="/library?tab=albums"
                                onClick={(e) => e.stopPropagation()}
                                className={cn("sidebar-item justify-center px-0 w-full h-12", (activeTab === "albums" || pathname.startsWith('/album/')) && "active")}
                                title="Albums"
                            >
                                <Disc size={20} />
                            </Link>
                        </div>
                    )}
                </div>

                {/* Playlists Section */}
                {!isSidebarCollapsed && (
                    <div>
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
                                    {playlists?.map((p: any) => (
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
                )}
            </div>

            {/* Profile Section at Bottom */}
            <div
                className={cn("mt-auto pb-4", isSidebarCollapsed ? "px-2 pt-2" : "px-3 pt-6")}
                style={{ paddingBottom: currentTrack ? "calc(90px + 1rem)" : undefined }}
                onClick={toggleSidebar}
            >
                {/* User Overview */}
                <Link
                    href="/profile"
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                        "flex items-center group mb-4 p-2 rounded-xl transition-all hover:bg-white/5",
                        isSidebarCollapsed ? "justify-center" : "gap-3"
                    )}
                >
                    <div className={cn(
                        "rounded-[10px] bg-zinc-900 border border-white/10 overflow-hidden flex items-center justify-center shrink-0 shadow-lg group-hover:border-accent/30 transition-colors",
                        isSidebarCollapsed ? "w-10 h-10" : "w-9 h-9"
                    )}>
                        {user?.avatarUrl ? (
                            <img 
                                src={getMediaUrl(user.avatarUrl)} 
                                className="w-full h-full object-cover" 
                                alt="" 
                            />
                        ) : (
                            <span className={cn("font-black text-accent", isSidebarCollapsed ? "text-sm" : "text-xs")}>
                                {(user?.name?.[0] || user?.email?.[0] || "U").toUpperCase()}
                            </span>
                        )}
                    </div>
                    {!isSidebarCollapsed && (
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-white/90 truncate leading-none mb-1">
                                {user?.name || user?.username || "User"}
                            </p>
                            <p className="text-[10px] font-medium text-white/30 truncate leading-none">
                                View Profile
                            </p>
                        </div>
                    )}
                </Link>

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
                            {!isSidebarCollapsed && <span>Admin Console</span>}
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
                        {!isSidebarCollapsed && <span>Pricing</span>}
                    </Link>
                    <Link
                        href="/settings"
                        onClick={(e) => e.stopPropagation()}
                        className={cn("sidebar-item", pathname.startsWith("/settings") && "active", isSidebarCollapsed && "justify-center px-0 h-12")}
                        title={isSidebarCollapsed ? "Settings" : ""}
                    >
                        <Settings size={20} />
                        {!isSidebarCollapsed && <span>Settings</span>}
                    </Link>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleLogout(); }}
                        className={cn("sidebar-item w-full text-muted-dark hover:text-[#EF4444] cursor-pointer", isSidebarCollapsed && "justify-center px-0 h-12")}
                        title={isSidebarCollapsed ? "Logout" : ""}
                    >
                        <LogOut size={20} />
                        {!isSidebarCollapsed && <span>Logout</span>}
                    </button>
                </div>

                {!isSidebarCollapsed && (
                    <div className="px-4 mt-6 text-[10px] text-muted-dark font-medium uppercase tracking-[0.2em] opacity-30">
                        Zenify v0.1
                    </div>
                )}
            </div>

            <CreatePlaylistModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
            />
        </motion.div>
    );
}
