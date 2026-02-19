"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    Home, Search, Library, Plus, Heart, LogOut,
    Settings, User as UserIcon, Shield, Music,
    Sparkles, Radio, Star, Clock, ListMusic,
    ChevronDown, ChevronRight, Disc, Mic2,
    Calendar, Flame, CreditCard
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import api from "@/lib/api";
import { useState } from "react";
import { CreatePlaylistModal } from "./create-playlist-modal";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ZenifyLogo } from "./shared/ZenifyLogo";

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const { logout, user, isAuthenticated } = useAuthStore();
    const { setPricingModalOpen } = useUIStore();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Collapsible states
    const [libExpanded, setLibExpanded] = useState(true);
    const [playlistsExpanded, setPlaylistsExpanded] = useState(true);

    const isAdmin = user?.role === 'ADMIN';

    const { data: playlists } = useQuery({
        queryKey: ['my-playlists'],
        queryFn: async () => {
            try {
                const res = await api.get('/playlists/my');
                return res.data;
            } catch (e) { return []; }
        },
        enabled: !!isAuthenticated
    });

    const handleLogout = async () => {
        try { await api.post("/auth/logout"); } catch (error) { }
        logout();
        router.push("/login");
    };

    if (pathname === '/login' || pathname === '/register' || !isAuthenticated) return null;

    const navItems = [
        { label: "Home", icon: Home, href: "/" },
        { label: "Discover", icon: Sparkles, href: "/search" },
        { label: "Radio", icon: Radio, href: "/radio" },
    ];

    return (
        <div className="flex flex-col h-full w-full py-6 bg-[var(--surface)] select-none">
            {/* Logo area */}
            <div className="px-6 mb-8 flex items-center gap-2.5 group cursor-pointer" onClick={() => router.push('/')}>
                <ZenifyLogo size={36} className="shadow-2xl shadow-accent/20 group-hover:scale-105 transition-transform" />
                <span className="text-xl font-bold tracking-tight text-white">Zenify</span>
            </div>

            <div className="flex-1 overflow-y-auto px-3 space-y-6 no-scrollbar">
                {/* Main Section */}
                <div>
                    <div className="space-y-0.5">
                        {navItems.map((item) => {
                            const active = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "sidebar-item",
                                        active && "active"
                                    )}
                                >
                                    <item.icon size={18} />
                                    <span>{item.label}</span>
                                </Link>
                            );
                        })}

                        {/* Pricing Button */}
                        <button
                            onClick={() => setPricingModalOpen(true)}
                            className="sidebar-item w-full cursor-pointer hover:text-white"
                        >
                            <CreditCard size={18} />
                            <span>Pricing</span>
                        </button>
                    </div>
                </div>

                {/* Library Section */}
                <div>
                    <button
                        onClick={() => setLibExpanded(!libExpanded)}
                        className="sidebar-section-title flex items-center justify-between w-full group py-1 cursor-pointer"
                    >
                        <span>Library</span>
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
                                <Link href="/library" className={cn("sidebar-item", pathname === "/library" && "active")}>
                                    <Heart size={18} className="text-[#EF4444]" />
                                    <span>Liked Songs</span>
                                </Link>
                                <Link href="/search?type=artist" className="sidebar-item">
                                    <Mic2 size={18} />
                                    <span>Artists</span>
                                </Link>
                                <Link href="/search?type=album" className="sidebar-item">
                                    <Disc size={18} />
                                    <span>Albums</span>
                                </Link>
                                <Link href="/history" className="sidebar-item">
                                    <Clock size={18} />
                                    <span>Recently Played</span>
                                </Link>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Playlists Section */}
                <div>
                    <div className="sidebar-section-title flex items-center justify-between w-full py-1">
                        <button
                            onClick={() => setPlaylistsExpanded(!playlistsExpanded)}
                            className="flex items-center gap-2 cursor-pointer"
                        >
                            <span>Playlists</span>
                            {playlistsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
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
                                    <Link key={p.id} href={`/playlist/${p.id}`} className={cn("sidebar-item", pathname === `/playlist/${p.id}` && "active")}>
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
            <div className="px-3 pt-6 mt-auto">
                {isAdmin && (
                    <Link href="/admin" className="sidebar-item text-accent mb-1 bg-accent/5">
                        <Shield size={18} />
                        <span>Admin Console</span>
                    </Link>
                )}

                <div className="space-y-0.5">
                    <Link href="/profile" className={cn("sidebar-item", pathname === "/profile" && "active")}>
                        <UserIcon size={18} />
                        <span>Account</span>
                    </Link>
                    <Link href="/settings" className="sidebar-item">
                        <Settings size={18} />
                        <span>Settings</span>
                    </Link>
                    <button
                        onClick={handleLogout}
                        className="sidebar-item w-full text-muted-dark hover:text-[#EF4444] cursor-pointer"
                    >
                        <LogOut size={18} />
                        <span>Logout</span>
                    </button>
                </div>

                <div className="px-4 mt-6 text-[10px] text-muted-dark font-medium uppercase tracking-[0.2em] opacity-40">
                    Zenify v0.1
                </div>
            </div>

            <CreatePlaylistModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
            />
        </div>
    );
}
