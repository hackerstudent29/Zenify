"use client";

import { useEffect, useState, useRef } from "react";
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
    Shield,
    Music,
    Cpu,
    Zap,
    Globe,
    Lock,
    Users,
    Smartphone,
    CheckCircle,
    AlertTriangle,
    Loader2,
    ChevronRight,
    Radio,
    EyeOff,
    Activity,
    Mail,
    Layers,
    Headphones,
    Shuffle,
    Repeat,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────
type SaveStatus = "idle" | "saving" | "saved" | "error";

const NAV_SECTIONS = [
    { id: "audio", label: "Audio", icon: Volume2 },
    { id: "playback", label: "Playback", icon: Play },
    { id: "aesthetics", label: "Aesthetics", icon: Palette },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "privacy", label: "Privacy", icon: Shield },
] as const;

type SectionId = typeof NAV_SECTIONS[number]["id"];

// ─── Sub-components ───────────────────────────────────────
function SettingRow({
    label,
    description,
    icon: Icon,
    children,
    badge,
}: {
    label: string;
    description?: string;
    icon?: React.ElementType;
    children: React.ReactNode;
    badge?: string;
}) {
    return (
        <div className="group flex items-center justify-between py-5 px-6 rounded-3xl hover:bg-white/[0.04] transition-all duration-300 border border-transparent hover:border-white/5 mb-1">
            <div className="flex items-center gap-5 min-w-0">
                {Icon && (
                    <div className="shrink-0 w-11 h-11 flex items-center justify-center text-white/40 group-hover:text-rose-500 transition-all duration-300">
                        <Icon size={20} />
                    </div>
                )}
                <div className="min-w-0">
                    <div className="flex items-center gap-3 font-[family-name:var(--font-plus-jakarta)]">
                        <span className="text-sm font-bold text-white/90 group-hover:text-white transition-colors">{label}</span>
                        {badge && (
                            <span className="text-[10px] font-black uppercase tracking-widest text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
                                {badge}
                            </span>
                        )}
                    </div>
                    {description && (
                        <p className="text-xs text-zinc-500 font-medium mt-1 leading-relaxed font-[family-name:var(--font-plus-jakarta)]">{description}</p>
                    )}
                </div>
            </div>
            <div className="shrink-0 ml-6">{children}</div>
        </div>
    );
}

function SectionCard({
    id,
    title,
    subtitle,
    icon: Icon,
    children,
}: {
    id: string;
    title: string;
    subtitle: string;
    icon: React.ElementType;
    children: React.ReactNode;
}) {
    return (
        <motion.div
            id={id}
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-[3rem] border border-white/[0.04] bg-white/[0.01] backdrop-blur-xl overflow-hidden mb-12 shadow-2xl"
        >
            {/* Card body */}
            <div className="px-6 py-8">
                {children}
            </div>
        </motion.div>
    );
}

function StyledSelect({
    value,
    onValueChange,
    disabled,
    options,
}: {
    value: string;
    onValueChange: (v: string) => void;
    disabled: boolean;
    options: { value: string; label: string }[];
}) {
    return (
        <Select value={value} onValueChange={onValueChange} disabled={disabled}>
            <SelectTrigger className="w-[148px] h-8 bg-white/[0.06] border-white/10 text-white/80 text-[12px] font-semibold rounded-xl hover:bg-white/10 transition-colors focus:ring-rose-500/30 focus:ring-1 font-[family-name:var(--font-plus-jakarta)]">
                <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#111113] border-white/10 text-white/80 rounded-xl font-[family-name:var(--font-plus-jakarta)]">
                {options.map(o => (
                    <SelectItem key={o.value} value={o.value} className="text-[12px] font-semibold rounded-lg focus:bg-rose-500/10 focus:text-rose-300">
                        {o.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

// ─── Main Page ────────────────────────────────────────────
export default function SettingsPage() {
    const { user, updateUser } = useAuthStore();
    const [activeSection, setActiveSection] = useState<SectionId>("audio");
    const [preferences, setPreferences] = useState({
        audioQuality: "high",
        crossfade: false,
        autoplay: true,
        normalizeVolume: true,
        explicitFilter: false,
        theme: "dark",
        accentColor: "rose",
        compactMode: false,
        emailNotifications: true,
        newReleaseAlerts: true,
        playlistUpdates: true,
        privateSession: false,
        listeningActivity: true,
    });
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

    useEffect(() => {
        if (user?.preferences) {
            setPreferences(prev => ({ ...prev, ...user.preferences }));
        }
    }, [user]);

    // Intersection observer to update active nav item while scrolling
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        setActiveSection(entry.target.id as SectionId);
                    }
                });
            },
            { rootMargin: "-40% 0px -50% 0px" }
        );
        NAV_SECTIONS.forEach(s => {
            const el = document.getElementById(s.id);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, []);

    const handlePreferenceUpdate = async (updatedPrefs: typeof preferences) => {
        setIsSaving(true);
        setSaveStatus("saving");
        const { id, userId, createdAt, updatedAt, ...cleanPrefs } = updatedPrefs as any;
        try {
            await api.put("/auth/preferences", cleanPrefs);
            updateUser({ preferences: updatedPrefs });
            setSaveStatus("saved");
            setTimeout(() => setSaveStatus("idle"), 2000);
        } catch {
            setSaveStatus("error");
            setTimeout(() => setSaveStatus("idle"), 3000);
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

    const selectSection = (id: SectionId) => {
        setActiveSection(id);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    return (
        <div className="w-full relative font-[family-name:var(--font-outfit)]">
            {/* ── FLOATING DOCK HEADER ────────────────── */}
            <div className="sticky top-0 z-50 w-full pt-6 pb-2 px-6 flex justify-center pointer-events-none">
                <motion.nav
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="flex items-center gap-1 p-1 rounded-full bg-zinc-900/40 border border-white/5 backdrop-blur-3xl shadow-2xl pointer-events-auto"
                >
                    {/* Compact Title/Logo for Dock */}
                    <div className="px-3 py-1 mr-1 border-r border-white/5 hidden md:block">
                        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-rose-500 font-[family-name:var(--font-plus-jakarta)]">Settings</span>
                    </div>

                    {NAV_SECTIONS.map(({ id, label, icon: Icon }) => {
                        const isActive = activeSection === id;
                        const isChanging = isActive && saveStatus !== "idle";
                        return (
                            <motion.button
                                layout
                                key={id}
                                onClick={() => selectSection(id)}
                                className={cn(
                                    "group relative flex items-center gap-2 px-3 py-2 rounded-full transition-all duration-500 text-[11px] font-bold tracking-tight",
                                    isActive
                                        ? "text-white"
                                        : "text-zinc-500 hover:text-zinc-300",
                                    isChanging && saveStatus === "saved" && "bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                                )}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="nav-active"
                                        className="absolute inset-0 rounded-full bg-white/10 border border-white/5"
                                        transition={{ type: "spring", bounce: 0.15, duration: 0.6 }}
                                    />
                                )}

                                <span className="relative z-10 flex items-center gap-2 overflow-hidden">
                                    <motion.div layout transition={{ duration: 0.3 }}>
                                        <Icon size={14} className={cn(isActive && !isChanging ? "text-rose-400" : "")} />
                                    </motion.div>

                                    <span className="hidden sm:inline-block">
                                        <AnimatePresence mode="popLayout" initial={false}>
                                            {isChanging ? (
                                                <motion.span
                                                    key="status"
                                                    initial={{ opacity: 0, x: 10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: -10 }}
                                                    transition={{ duration: 0.2 }}
                                                    className={cn(
                                                        "flex items-center gap-1.5 uppercase text-[9px] font-black tracking-widest leading-none",
                                                        saveStatus === "saving" && "text-zinc-400",
                                                        saveStatus === "saved" && "text-emerald-400",
                                                        saveStatus === "error" && "text-red-400"
                                                    )}
                                                >
                                                    {saveStatus === "saving" && <Loader2 size={10} className="animate-spin shrink-0" />}
                                                    {saveStatus === "saved" && <CheckCircle size={10} className="shrink-0" />}
                                                    {saveStatus === "error" && <AlertTriangle size={10} className="shrink-0" />}
                                                    {saveStatus}
                                                </motion.span>
                                            ) : (
                                                <motion.span
                                                    key="label"
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: 10 }}
                                                    transition={{ duration: 0.2 }}
                                                    className="block leading-none"
                                                >
                                                    {label}
                                                </motion.span>
                                            )}
                                        </AnimatePresence>
                                    </span>
                                </span>
                            </motion.button>
                        );
                    })}

                </motion.nav>
            </div>

            <div className="w-full px-6 md:px-12 pt-4 pb-12">
                <AnimatePresence mode="wait">
                    {/* ── AUDIO ─── */}
                    {activeSection === "audio" && (
                        <SectionCard key="audio" id="audio" icon={Volume2} title="Audio" subtitle="Quality and playback gain management">
                            <SettingRow label="Streaming Fidelity" icon={Cpu} description="Balance between bandwidth and audio clarity">
                                <StyledSelect
                                    value={preferences.audioQuality}
                                    onValueChange={v => handleSelect("audioQuality", v)}
                                    disabled={isSaving}
                                    options={[
                                        { value: "low", label: "Basic" },
                                        { value: "high", label: "High" },
                                        { value: "lossless", label: "Best" },
                                    ]}
                                />
                            </SettingRow>
                            <SettingRow label="Same Volume" icon={Zap} description="Keep the same volume for all songs">
                                <Switch
                                    checked={preferences.normalizeVolume}
                                    onCheckedChange={v => handleToggle("normalizeVolume", v)}
                                    disabled={isSaving}
                                />
                            </SettingRow>
                            <SettingRow label="Hide Bad Words" icon={EyeOff} description="Don't show songs with bad language">
                                <Switch
                                    checked={preferences.explicitFilter}
                                    onCheckedChange={v => handleToggle("explicitFilter", v)}
                                    disabled={isSaving}
                                />
                            </SettingRow>
                        </SectionCard>
                    )}

                    {/* ── PLAYBACK ─── */}
                    {activeSection === "playback" && (
                        <SectionCard key="playback" id="playback" icon={Play} title="Playback" subtitle="How your music plays">
                            <SettingRow label="Smooth Swaps" icon={Music} description="Mix the end of one song into the next" badge="Beta">
                                <Switch
                                    checked={preferences.crossfade}
                                    onCheckedChange={v => handleToggle("crossfade", v)}
                                    disabled={isSaving}
                                />
                            </SettingRow>
                            <SettingRow label="Keep Playing" icon={Repeat} description="Keep playing similar songs when your music ends">
                                <Switch
                                    checked={preferences.autoplay}
                                    onCheckedChange={v => handleToggle("autoplay", v)}
                                    disabled={isSaving}
                                />
                            </SettingRow>
                            <SettingRow label="No Gaps" icon={Headphones} description="Remove the silence between songs">
                                <Switch
                                    checked={false}
                                    onCheckedChange={() => { }}
                                    disabled={true}
                                />
                            </SettingRow>
                        </SectionCard>
                    )}

                    {/* ── AESTHETICS ─── */}
                    {activeSection === "aesthetics" && (
                        <SectionCard key="aesthetics" id="aesthetics" icon={Palette} title="Aesthetics" subtitle="How the app looks">
                            <SettingRow label="Main Color" icon={Zap} description="Change the main color of the app">
                                <StyledSelect
                                    value={preferences.accentColor}
                                    onValueChange={v => handleSelect("accentColor", v)}
                                    disabled={isSaving}
                                    options={[
                                        { value: "rose", label: "Rose" },
                                        { value: "violet", label: "Violet" },
                                        { value: "cyan", label: "Cyan" },
                                    ]}
                                />
                            </SettingRow>
                            <SettingRow label="Small Mode" icon={Layers} description="Show more items on the screen at once">
                                <Switch
                                    checked={preferences.compactMode}
                                    onCheckedChange={v => handleToggle("compactMode", v)}
                                    disabled={isSaving}
                                />
                            </SettingRow>
                            <SettingRow label="Less Motion" icon={Shuffle} description="Reduce moving parts for better speed">
                                <Switch
                                    checked={false}
                                    onCheckedChange={() => { }}
                                    disabled={false}
                                />
                            </SettingRow>
                        </SectionCard>
                    )}

                    {/* ── NOTIFICATIONS ─── */}
                    {activeSection === "notifications" && (
                        <SectionCard key="notifications" id="notifications" icon={Bell} title="Notifications" subtitle="Alerts and updates">
                            <SettingRow label="Email Summary" icon={Mail} description="Get a weekly email about your activity">
                                <Switch
                                    checked={preferences.emailNotifications}
                                    onCheckedChange={v => handleToggle("emailNotifications", v)}
                                    disabled={isSaving}
                                />
                            </SettingRow>
                            <SettingRow label="New Music" icon={Radio} description="Alert me when artists I follow drop new songs">
                                <Switch
                                    checked={preferences.newReleaseAlerts}
                                    onCheckedChange={v => handleToggle("newReleaseAlerts", v)}
                                    disabled={isSaving}
                                />
                            </SettingRow>
                            <SettingRow label="Playlist News" icon={Globe} description="Alert me when my playlists are updated">
                                <Switch
                                    checked={preferences.playlistUpdates}
                                    onCheckedChange={v => handleToggle("playlistUpdates", v)}
                                    disabled={isSaving}
                                />
                            </SettingRow>
                        </SectionCard>
                    )}

                    {/* ── PRIVACY ─── */}
                    {activeSection === "privacy" && (
                        <SectionCard key="privacy" id="privacy" icon={Shield} title="Privacy" subtitle="Your safety and sharing">
                            <SettingRow label="Secret Mode" icon={Lock} description="Hide what you're listening to from others">
                                <Switch
                                    checked={preferences.privateSession}
                                    onCheckedChange={v => handleToggle("privateSession", v)}
                                    disabled={isSaving}
                                />
                            </SettingRow>
                            <SettingRow label="Show Activity" icon={Activity} description="Display what you're playing on your profile">
                                <Switch
                                    checked={preferences.listeningActivity}
                                    onCheckedChange={v => handleToggle("listeningActivity", v)}
                                    disabled={isSaving}
                                />
                            </SettingRow>
                            <SettingRow label="See Followers" icon={Users} description="Let others see who follows you">
                                <Switch
                                    checked={true}
                                    onCheckedChange={() => { }}
                                    disabled={isSaving}
                                />
                            </SettingRow>
                        </SectionCard>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
