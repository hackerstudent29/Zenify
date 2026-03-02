"use client";

import { useAuthStore } from "@/store/authStore";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ProfileSection } from "@/components/account/ProfileSection";
import { SubscriptionSection } from "@/components/account/SubscriptionSection";
import { SecuritySection } from "@/components/account/SecuritySection";
import { AnalyticsSection } from "@/components/account/AnalyticsSection";
import { DangerZone } from "@/components/account/DangerZone";
import { User, Shield, CreditCard, AlertOctagon, LogOut, BarChart3, ChevronDown } from "lucide-react";
import { cn, getMediaUrl } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";

const sections = [
    { id: "profile", title: "Profile", icon: User, component: ProfileSection, isDanger: false },
    { id: "analytics", title: "Analytics", icon: BarChart3, component: AnalyticsSection, isDanger: false },
    { id: "subscription", title: "Subscription", icon: CreditCard, component: SubscriptionSection, isDanger: false },
    { id: "security", title: "Security", icon: Shield, component: SecuritySection, isDanger: false },
    { id: "danger", title: "Danger Zone", icon: AlertOctagon, component: DangerZone, isDanger: true },
];

/** Mobile: icon-only accordion — tap to expand/collapse each section */
function MobileProfile({ user, onLogout }: { user: any; onLogout: () => void }) {
    const [openId, setOpenId] = useState<string | null>(null);

    const toggle = (id: string) => setOpenId(prev => prev === id ? null : id);

    return (
        <div className="pb-48 pt-4 px-4 space-y-2">
            {/* User Header */}
            <div className="flex items-center gap-4 mb-6 px-1">
                <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden shrink-0 shadow-lg">
                    {user.avatarUrl
                        ? <img src={getMediaUrl(user.avatarUrl)} className="w-full h-full object-cover" alt="" />
                        : <div className="w-full h-full flex items-center justify-center text-xl font-black text-white">
                            {(user.username?.[0] || user.name?.[0] || user.email[0]).toUpperCase()}
                        </div>
                    }
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-lg font-black text-white truncate">{user.name || user.email.split("@")[0]}</p>
                    <p className="text-[11px] text-white/30 truncate">{user.email}</p>
                </div>
                <button
                    onClick={onLogout}
                    className="w-9 h-9 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 active:bg-red-500 active:text-white transition-all shrink-0"
                >
                    <LogOut size={15} />
                </button>
            </div>

            {/* Accordion Sections */}
            {sections.map((section) => {
                const isOpen = openId === section.id;
                const Comp = section.component;

                return (
                    <div key={section.id} className={cn(
                        "rounded-2xl border overflow-hidden transition-colors",
                        isOpen
                            ? section.isDanger ? "border-red-500/30 bg-red-500/5" : "border-white/10 bg-white/5"
                            : "border-white/5 bg-white/[0.02]"
                    )}>
                        {/* Row header */}
                        <button
                            onClick={() => toggle(section.id)}
                            className="w-full flex items-center gap-4 p-4 active:bg-white/5 transition-colors"
                        >
                            {/* Icon circle */}
                            <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                                isOpen
                                    ? section.isDanger ? "bg-red-500 text-white" : "bg-brand text-white"
                                    : "bg-white/8 text-white/50"
                            )}>
                                <section.icon size={18} />
                            </div>

                            {/* Animated label */}
                            <div className="flex-1 text-left overflow-hidden">
                                <AnimatePresence initial={false}>
                                    <motion.p
                                        key={isOpen ? "open" : "closed"}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 8 }}
                                        transition={{ duration: 0.15 }}
                                        className={cn(
                                            "text-[13px] font-bold truncate",
                                            isOpen
                                                ? section.isDanger ? "text-red-500" : "text-white"
                                                : "text-white/50"
                                        )}
                                    >
                                        {section.title}
                                    </motion.p>
                                </AnimatePresence>
                            </div>

                            {/* Chevron */}
                            <motion.div
                                animate={{ rotate: isOpen ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                                className="text-white/20 shrink-0"
                            >
                                <ChevronDown size={16} />
                            </motion.div>
                        </button>

                        {/* Expandable content */}
                        <AnimatePresence initial={false}>
                            {isOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-4 pb-5 pt-1 border-t border-white/5">
                                        <Comp />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                );
            })}
        </div>
    );
}

/** Desktop: original tab layout */
function DesktopProfile({ user, onLogout }: { user: any; onLogout: () => void }) {
    const [activeTab, setActiveTab] = useState("profile");
    const ActiveComponent = sections.find(s => s.id === activeTab)?.component || ProfileSection;

    return (
        <div className="w-full min-h-screen bg-background pb-20">
            <div className="relative w-full h-40 overflow-hidden bg-zinc-900 shadow-inner">
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.05)_0,transparent_50%)]" />
                <div className="absolute inset-0 bg-accent/5 backdrop-blur-[1px]" />
            </div>

            <div className="max-w-5xl mx-auto px-4 md:px-8 lg:px-12 -mt-24 relative z-20 space-y-6">
                <div className="flex flex-col md:flex-row gap-6 items-center justify-between text-center md:text-left">
                    <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="w-20 h-20 md:w-24 md:h-24 rounded-[1.2rem] bg-zinc-900 flex items-center justify-center border-4 border-zinc-950 shadow-[0_0_40px_rgba(139,92,246,0.3)] relative z-10 overflow-hidden group"
                        >
                            <div className="absolute w-[150%] h-[150%] animate-[spin_3s_linear_infinite]" style={{
                                background: 'conic-gradient(from 0deg, transparent 0%, transparent 40%, rgba(139,92,246,0.8) 50%, transparent 60%, transparent 100%)'
                            }} />
                            <div className="absolute inset-[2px] rounded-xl bg-zinc-900 border border-white/5 z-10" />
                            <div className="absolute inset-0 bg-gradient-to-tr from-[var(--accent)]/10 to-transparent z-10" />
                            {user.avatarUrl ? (
                                <img src={getMediaUrl(user.avatarUrl)} alt={user.name} className="w-full h-full object-cover rounded-[1.2rem] relative z-20" />
                            ) : (
                                <span className="text-3xl font-semibold text-white/80 relative z-20">
                                    {(user.username?.[0] || user.name?.[0] || user.email[0]).toUpperCase()}
                                </span>
                            )}
                        </motion.div>
                        <div className="space-y-1">
                            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tighter">
                                {user.name || user.email.split('@')[0]}
                            </h1>
                            <div className="flex items-center justify-center md:justify-start gap-2">
                                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                                <p className="text-[10px] text-zinc-500 font-bold tracking-tight">{user.email}</p>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onLogout}
                        className="hidden md:flex items-center gap-2 px-5 py-2 rounded-full bg-zinc-800/50 hover:bg-red-500/10 border border-white/5 hover:border-red-500/20 text-xs font-semibold text-zinc-400 hover:text-red-500 transition-all backdrop-blur-sm cursor-pointer"
                    >
                        <LogOut size={14} /> Log Out
                    </button>
                </div>

                <div className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-1.5 rounded-2xl shadow-2xl flex items-center gap-1 overflow-x-auto no-scrollbar">
                    {sections.map((section) => (
                        <button
                            key={section.id}
                            onClick={() => setActiveTab(section.id)}
                            className={cn(
                                "flex-1 min-w-[100px] flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all outline-none cursor-pointer",
                                activeTab === section.id
                                    ? (section.isDanger ? "bg-red-500/10 text-red-500 shadow-sm" : "bg-white/10 text-white shadow-sm")
                                    : "text-zinc-400 hover:text-white hover:bg-white/5",
                                section.isDanger && activeTab !== section.id && "hover:text-red-500 hover:bg-red-500/5"
                            )}
                        >
                            <section.icon size={16} />
                            <span>{section.title}</span>
                        </button>
                    ))}
                </div>

                <motion.main key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="pt-8">
                    <ActiveComponent />
                </motion.main>
            </div>
        </div>
    );
}

export default function ProfilePage() {
    const { user, logout, isAuthenticated } = useAuthStore();
    const router = useRouter();
    const isMobile = useIsMobile();

    useEffect(() => {
        if (!isAuthenticated) router.push("/login");
    }, [isAuthenticated, router]);

    if (!isAuthenticated || !user) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
        );
    }

    const handleLogout = () => { logout(); router.push("/login"); };

    return isMobile
        ? <MobileProfile user={user} onLogout={handleLogout} />
        : <DesktopProfile user={user} onLogout={handleLogout} />;
}
