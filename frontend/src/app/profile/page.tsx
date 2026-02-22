"use client";

import { useAuthStore } from "@/store/authStore";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ProfileSection } from "@/components/account/ProfileSection";
import { SubscriptionSection } from "@/components/account/SubscriptionSection";
import { SecuritySection } from "@/components/account/SecuritySection";
import { AnalyticsSection } from "@/components/account/AnalyticsSection";
import { DangerZone } from "@/components/account/DangerZone";
import { User, Shield, CreditCard, AlertOctagon, LogOut, Settings as SettingsIcon, Crown, BarChart3 } from "lucide-react";
import { cn, getMediaUrl } from "@/lib/utils";

export default function ProfilePage() {
    const { user, logout, isAuthenticated } = useAuthStore();
    const router = useRouter();

    const [activeTab, setActiveTab] = useState("profile");

    if (!isAuthenticated || !user) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
        );
    }

    const sections = [
        { id: "profile", title: "Profile", icon: User, component: ProfileSection },
        { id: "analytics", title: "Analytics", icon: BarChart3, component: AnalyticsSection },
        { id: "subscription", title: "Subscription", icon: CreditCard, component: SubscriptionSection },
        { id: "security", title: "Security", icon: Shield, component: SecuritySection },
        { id: "danger", title: "Danger Zone", icon: AlertOctagon, component: DangerZone, isDanger: true },
    ];

    const ActiveComponent = sections.find(s => s.id === activeTab)?.component || ProfileSection;

    return (
        <div className="w-full min-h-screen bg-background pb-20">
            {/* Immersive Backdrop Banner */}
            <div className="relative w-full h-40 overflow-hidden bg-zinc-900 shadow-inner">
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.05)_0,transparent_50%)]" />
                <div className="absolute inset-0 bg-accent/5 backdrop-blur-[1px]" />
            </div>

            {/* Profile Header & Navigation */}
            <div className="max-w-5xl mx-auto px-4 md:px-8 lg:px-12 -mt-24 relative z-20 space-y-6">
                <div className="flex flex-col md:flex-row gap-6 items-center justify-between text-center md:text-left">
                    <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="w-20 h-20 md:w-24 md:h-24 rounded-[1.2rem] bg-zinc-900 flex items-center justify-center border-4 border-zinc-950 shadow-[0_0_40px_rgba(139,92,246,0.3)] relative z-10 overflow-hidden group"
                        >
                            {/* Animated Lightning Edge Effect */}
                            <div className="absolute w-[150%] h-[150%] animate-[spin_3s_linear_infinite]" style={{
                                background: 'conic-gradient(from 0deg, transparent 0%, transparent 40%, rgba(139,92,246,0.8) 50%, transparent 60%, transparent 100%)'
                            }} />

                            {/* Inner Dark Mask to hide the center of the gradient */}
                            <div className="absolute inset-[2px] rounded-xl bg-zinc-900 border border-white/5 z-10" />

                            {/* Inner ambient blur */}
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
                            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tighter uppercase italic">
                                {user.name || user.email.split('@')[0]}
                            </h1>
                            <div className="flex items-center justify-center md:justify-start gap-2">
                                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{user.email}</p>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => logout()}
                        className="hidden md:flex items-center gap-2 px-5 py-2 rounded-full bg-zinc-800/50 hover:bg-red-500/10 border border-white/5 hover:border-red-500/20 text-xs font-semibold text-zinc-400 hover:text-red-500 transition-all backdrop-blur-sm cursor-pointer"
                    >
                        <LogOut size={14} />
                        Log Out
                    </button>
                </div>

                {/* Mobile specific logout for clean header */}
                <div className="md:hidden flex justify-center pt-2">
                    <button
                        onClick={() => logout()}
                        className="text-[9px] font-black text-red-500/80 uppercase tracking-[0.3em] px-5 py-2 bg-red-500/5 rounded-full border border-red-500/10 hover:bg-red-500/10 transition-colors"
                    >
                        Disconnect Terminal
                    </button>
                </div>

                {/* Navigation Bar (Tabs) */}
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

                {/* Main Content Area (Active Tab Only) */}
                <motion.main
                    key={activeTab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="pt-8"
                >
                    <ActiveComponent />
                </motion.main>
            </div>
        </div>
    );
}
