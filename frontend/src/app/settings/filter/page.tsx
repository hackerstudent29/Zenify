"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import {
    Volume2,
    EyeOff,
    Loader2,
    CheckCircle,
    AlertTriangle,
    Shield,
    Music,
    Users,
    ChevronLeft,
} from "lucide-react";
import Link from "next/link";

type SaveStatus = "idle" | "saving" | "saved" | "error";

function SettingRow({
    label,
    description,
    icon: Icon,
    children,
    isSaving,
    isSaved,
}: {
    label: string;
    description?: string;
    icon?: React.ElementType;
    children: React.ReactNode;
    isSaving?: boolean;
    isSaved?: boolean;
}) {
    return (
        <div className="group flex items-center justify-between py-5 px-6 rounded-3xl hover:bg-white/[0.04] transition-all duration-300 border border-transparent hover:border-white/5 mb-1">
            <div className="flex items-center gap-5 min-w-0">
                {Icon && (
                    <div className="shrink-0 w-11 h-11 flex items-center justify-center text-white/40 group-hover:text-brand transition-all duration-300">
                        <Icon size={20} />
                    </div>
                )}
                <div className="min-w-0">
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-white/90 group-hover:text-white transition-colors">{label}</span>
                    </div>
                    {description && (
                        <p className="text-xs text-zinc-500 font-medium mt-1 leading-relaxed">{description}</p>
                    )}
                </div>
            </div>
            <div className="shrink-0 ml-6 flex items-center gap-4">
                <AnimatePresence mode="wait">
                    {isSaving && (
                        <motion.div
                            initial={{ opacity: 0, x: 5 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -5 }}
                            className="text-[10px] font-bold tracking-wide text-zinc-500 flex items-center gap-1.5"
                        >
                            <Loader2 size={12} className="animate-spin" />
                            Saving
                        </motion.div>
                    )}
                    {isSaved && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="text-[10px] font-bold tracking-wide text-emerald-500 flex items-center gap-1.5"
                        >
                            <CheckCircle size={12} />
                            Saved
                        </motion.div>
                    )}
                </AnimatePresence>
                {children}
            </div>
        </div>
    );
}

export default function FilterSettingsPage() {
    const { user, updateUser } = useAuthStore();
    const [preferences, setPreferences] = useState({
        explicitFilter: false,
    });
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
    const [savingKey, setSavingKey] = useState<string | null>(null);
    const [lastSavedKey, setLastSavedKey] = useState<string | null>(null);

    useEffect(() => {
        if (user?.preferences) {
            setPreferences({
                explicitFilter: !!user.preferences.explicitFilter,
            });
        }
    }, [user]);

    const handlePreferenceUpdate = async (updatedPrefs: typeof preferences, key: string) => {
        setSaveStatus("saving");
        setSavingKey(key);
        setLastSavedKey(null);
        try {
            await api.put("/auth/preferences", updatedPrefs);
            updateUser({ preferences: { ...user?.preferences, ...updatedPrefs } });
            setSaveStatus("saved");
            setLastSavedKey(key);
            setTimeout(() => {
                setSaveStatus("idle");
                setLastSavedKey(null);
            }, 2000);
        } catch {
            setSaveStatus("error");
            setTimeout(() => setSaveStatus("idle"), 3000);
        } finally {
            setSavingKey(null);
        }
    };

    const handleToggle = (key: string, value: boolean) => {
        const next = { ...preferences, [key]: value };
        setPreferences(next);
        handlePreferenceUpdate(next, key);
    };

    return (
        <div className="w-full max-w-4xl mx-auto px-6 py-12">
            <div className="mb-12">
                <Link 
                    href="/settings"
                    className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-6 group w-fit"
                >
                    <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="text-sm font-bold">Back to Settings</span>
                </Link>
                <h1 className="text-4xl font-black text-white tracking-tight mb-2">Content Filters</h1>
                <p className="text-zinc-500 font-medium">Control what you hear and see on <span className="font-zenify">zenify</span>.</p>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[3rem] border border-white/[0.04] bg-white/[0.01] backdrop-blur-xl overflow-hidden shadow-2xl"
            >
                <div className="px-5 sm:px-10 py-8 sm:py-12">
                    <div className="space-y-2">
                        <SettingRow 
                            label="Explicit Content Filter" 
                            icon={EyeOff} 
                            description="Don't play songs containing explicit language or mature themes." 
                            isSaving={savingKey === "explicitFilter"} 
                            isSaved={lastSavedKey === "explicitFilter"}
                        >
                            <Switch
                                checked={preferences.explicitFilter}
                                onCheckedChange={v => handleToggle("explicitFilter", v)}
                            />
                        </SettingRow>

                        <SettingRow 
                            label="Artist Blocklist" 
                            icon={Users} 
                            description={<><span className="font-zenify">zenify</span> will never play tracks from artists you've blocked.</>}
                        >
                            <button className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-bold text-white/40 hover:text-white transition-all">
                                Manage Blocklist
                            </button>
                        </SettingRow>

                        <SettingRow 
                            label="Clean Radio Only" 
                            icon={Music} 
                            description="When starting a radio, only include clean versions of tracks."
                        >
                            <Switch
                                checked={false}
                                onCheckedChange={() => {}}
                                disabled={true}
                            />
                        </SettingRow>

                        <SettingRow 
                            label="Sensitive Topics" 
                            icon={Shield} 
                            description="Hide podcasts or tracks dealing with sensitive real-world events."
                        >
                            <Switch
                                checked={false}
                                onCheckedChange={() => {}}
                                disabled={true}
                            />
                        </SettingRow>
                    </div>
                </div>
            </motion.div>

            {saveStatus === "error" && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-400"
                >
                    <AlertTriangle size={18} />
                    <span className="text-xs font-bold">Failed to save preferences. Please check your connection.</span>
                </motion.div>
            )}
        </div>
    );
}
