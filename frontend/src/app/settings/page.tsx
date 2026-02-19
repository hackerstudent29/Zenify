"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    Volume2,
    Play,
    Palette,
    Bell,
    Lock,
    Shield,
    Globe,
    Smartphone,
    Music,
    Users,
    Cpu,
    Zap,
    Sparkles,
    CheckCircle,
    AlertTriangle
} from "lucide-react";

const SectionHeader = ({ icon: Icon, title, description }: { icon: any, title: string, description: string }) => (
    <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-white/5 rounded-2xl border border-white/5 group-hover:border-accent/40 transition-colors">
            <Icon className="w-6 h-6 text-accent" />
        </div>
        <div className="space-y-0.5">
            <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
            <p className="text-sm text-zinc-500 font-medium">{description}</p>
        </div>
    </div>
);

export default function SettingsPage() {
    const { user, updateUser } = useAuthStore();
    const [preferences, setPreferences] = useState({
        audioQuality: "high",
        crossfade: false,
        autoplay: true,
        normalizeVolume: true,
        explicitFilter: false,
        theme: "dark",
        accentColor: "green",
        compactMode: false,
        emailNotifications: true,
        newReleaseAlerts: true,
        playlistUpdates: true,
        privateSession: false,
        listeningActivity: true
    });
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

    useEffect(() => {
        if (user?.preferences) {
            setPreferences(prev => ({ ...prev, ...user.preferences }));
        }
    }, [user]);

    const handlePreferenceUpdate = async (updatedPrefs: any) => {
        setIsSaving(true);
        setSaveStatus("saving");
        const { id, userId, createdAt, updatedAt, ...cleanPrefs } = updatedPrefs;
        try {
            await api.put("/auth/preferences", cleanPrefs);
            updateUser({ preferences: updatedPrefs });
            setSaveStatus("saved");
            setTimeout(() => setSaveStatus("idle"), 2000);
        } catch (error) {
            console.error("Failed to update preference", error);
            setSaveStatus("error");
            setTimeout(() => setSaveStatus("idle"), 3000);
            // In case of error, we might want to revert local state, 
            // but for simple toggles, it's often jarring.
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggle = (key: string, value: boolean) => {
        const next = { ...preferences, [key]: value };
        setPreferences(next);
        handlePreferenceUpdate(next);
    };

    const handleSelect = (key: string, value: string) => {
        const next = { ...preferences, [key]: value };
        setPreferences(next);
        handlePreferenceUpdate(next);
    };

    const Section = ({ icon, title, description, children }: { icon: any, title: string, description: string, children: React.ReactNode }) => (
        <motion.section
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="premium-card p-4 sm:p-8 bg-white/[0.01] border-white/5"
        >
            <SectionHeader icon={icon} title={title} description={description} />
            <div className="space-y-4">
                {children}
            </div>
        </motion.section>
    );

    const SettingItem = ({ label, description, icon: ItemIcon, children }: { label: string, description?: string, icon?: any, children: React.ReactNode }) => (
        <div className="flex items-center justify-between py-4 border-b border-white/5 last:border-0 hover:bg-white/[0.02] -mx-4 px-4 rounded-xl transition-colors group/item">
            <div className="flex items-center gap-4">
                {ItemIcon && (
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-zinc-500 group-hover/item:text-accent transition-all">
                        <ItemIcon size={18} />
                    </div>
                )}
                <div className="space-y-0.5">
                    <div className="text-sm font-bold text-zinc-200 group-hover/item:text-white transition-colors">{label}</div>
                    {description && <div className="text-[11px] text-zinc-500 font-medium">{description}</div>}
                </div>
            </div>
            <div className="flex items-center">
                {children}
            </div>
        </div>
    );

    return (
        <div className="w-full px-8 lg:px-16 pb-32 pt-12 relative overflow-hidden">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="max-w-[1000px] mx-auto space-y-12"
            >
                <div className="flex items-end justify-between border-b border-white/5 pb-8">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="w-4 h-4 text-accent" />
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Configuration</span>
                        </div>
                        <h1 className="text-5xl font-black tracking-tighter text-white">Settings</h1>
                        <p className="text-zinc-500 font-medium">Control your experience and privacy.</p>
                    </div>

                    <AnimatePresence>
                        {saveStatus !== "idle" && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-full border text-[10px] font-bold uppercase tracking-widest",
                                    saveStatus === "saving" && "bg-white/5 border-white/10 text-zinc-400",
                                    saveStatus === "saved" && "bg-emerald-500/10 border-emerald-500/20 text-emerald-500",
                                    saveStatus === "error" && "bg-red-500/10 border-red-500/20 text-red-500"
                                )}
                            >
                                {saveStatus === "saving" && <div className="w-2 h-2 rounded-full bg-zinc-400 animate-pulse" />}
                                {saveStatus === "saved" && <CheckCircle size={12} />}
                                {saveStatus === "error" && <AlertTriangle size={12} />}
                                {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Synchronized" : "Sync Failed"}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="space-y-8">
                    <Section icon={Volume2} title="Audio" description="Quality and gain management.">
                        <SettingItem label="Streaming Fidelity" icon={Cpu} description="Balance between bandwidth and clarity.">
                            <Select
                                value={preferences.audioQuality}
                                onValueChange={(v) => handleSelect("audioQuality", v)}
                                disabled={isSaving}
                            >
                                <SelectTrigger className="w-[140px] h-9 bg-white/5 border-white/5 text-zinc-200 font-bold rounded-lg hover:bg-white/10 transition-colors">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-white/10 text-zinc-200">
                                    <SelectItem value="low">Standard</SelectItem>
                                    <SelectItem value="high">High Res</SelectItem>
                                    <SelectItem value="lossless">Lossless</SelectItem>
                                </SelectContent>
                            </Select>
                        </SettingItem>
                        <SettingItem label="Normalization" icon={Zap} description="Maintains consistent gain across all tracks.">
                            <Switch
                                checked={preferences.normalizeVolume}
                                onCheckedChange={(v) => handleToggle("normalizeVolume", v)}
                                disabled={isSaving}
                            />
                        </SettingItem>
                    </Section>

                    <Section icon={Play} title="Playback" description="Transition and sequence behavior.">
                        <SettingItem label="Fluid Crossfade" icon={Music} description="Seamlessly blend tracks.">
                            <Switch
                                checked={preferences.crossfade}
                                onCheckedChange={(v) => handleToggle("crossfade", v)}
                                disabled={isSaving}
                            />
                        </SettingItem>
                        <SettingItem label="Infinite Autoplay" icon={Smartphone} description="Smart Selection mode.">
                            <Switch
                                checked={preferences.autoplay}
                                onCheckedChange={(v) => handleToggle("autoplay", v)}
                                disabled={isSaving}
                            />
                        </SettingItem>
                    </Section>

                    <Section icon={Palette} title="Aesthetics" description="Visual workspace configuration.">
                        <SettingItem label="Accent Theme" icon={Zap} description="Primary interaction color.">
                            <Select
                                value={preferences.accentColor}
                                onValueChange={(v) => handleSelect("accentColor", v)}
                                disabled={isSaving}
                            >
                                <SelectTrigger className="w-[140px] h-9 bg-white/5 border-white/5 text-zinc-200 font-bold rounded-lg">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-white/10 text-zinc-200">
                                    <SelectItem value="green">Zen Green</SelectItem>
                                    <SelectItem value="violet">Deep Violet</SelectItem>
                                </SelectContent>
                            </Select>
                        </SettingItem>
                        <SettingItem label="Compact Layout" icon={Smartphone} description="Higher information density.">
                            <Switch
                                checked={preferences.compactMode}
                                onCheckedChange={(v) => handleToggle("compactMode", v)}
                                disabled={isSaving}
                            />
                        </SettingItem>
                    </Section>

                    <Section icon={Bell} title="System" description="Notifications and alerts.">
                        <SettingItem label="Email Digests" icon={Globe} description="Weekly account summaries.">
                            <Switch
                                checked={preferences.emailNotifications}
                                onCheckedChange={(v) => handleToggle("emailNotifications", v)}
                                disabled={isSaving}
                            />
                        </SettingItem>
                        <SettingItem label="Release Alerts" icon={Zap} description="New content from artists.">
                            <Switch
                                checked={preferences.newReleaseAlerts}
                                onCheckedChange={(v) => handleToggle("newReleaseAlerts", v)}
                                disabled={isSaving}
                            />
                        </SettingItem>
                    </Section>

                    <Section icon={Shield} title="Privacy" description="Visibility and session state.">
                        <SettingItem label="Stealth Mode" icon={Lock} description="Hide activity from followers.">
                            <Switch
                                checked={preferences.privateSession}
                                onCheckedChange={(v) => handleToggle("privateSession", v)}
                                disabled={isSaving}
                            />
                        </SettingItem>
                        <SettingItem label="Public Activity" icon={Users} description="Broadcast history.">
                            <Switch
                                checked={preferences.listeningActivity}
                                onCheckedChange={(v) => handleToggle("listeningActivity", v)}
                                disabled={isSaving}
                            />
                        </SettingItem>
                    </Section>
                </div>
            </motion.div>
        </div>
    );
}
