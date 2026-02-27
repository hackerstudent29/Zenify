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
        <div className="group flex items-center justify-between py-4 px-5 rounded-2xl hover:bg-white/[0.03] transition-all duration-200 border border-transparent hover:border-white/5">
            <div className="flex items-center gap-4 min-w-0">
                {Icon && (
                    <div className="shrink-0 w-9 h-9 rounded-xl bg-white/[0.04] border border-white/5 flex items-center justify-center text-white/30 group-hover:text-rose-400 group-hover:border-rose-500/20 group-hover:bg-rose-500/5 transition-all duration-200">
                        <Icon size={16} />
                    </div>
                )}
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-white/80 group-hover:text-white transition-colors">{label}</span>
                        {badge && (
                            <span className="text-[9px] font-black uppercase tracking-widest text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded-full">
                                {badge}
                            </span>
                        )}
                    </div>
                    {description && (
                        <p className="text-[11px] text-white/30 font-medium mt-0.5 leading-relaxed">{description}</p>
                    )}
                </div>
            </div>
            <div className="shrink-0 ml-4">{children}</div>
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
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="rounded-3xl border border-white/[0.06] bg-white/[0.02] overflow-hidden"
        >
            {/* Card header */}
            <div className="px-6 pt-6 pb-5 border-b border-white/[0.05] flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                    <Icon size={18} />
                </div>
                <div>
                    <h2 className="text-[15px] font-bold text-white tracking-tight">{title}</h2>
                    <p className="text-[11px] text-white/35 font-medium">{subtitle}</p>
                </div>
            </div>
            {/* Card body */}
            <div className="px-2 py-2">
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
            <SelectTrigger className="w-[148px] h-8 bg-white/[0.06] border-white/10 text-white/80 text-[12px] font-semibold rounded-xl hover:bg-white/10 transition-colors focus:ring-rose-500/30 focus:ring-1">
                <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#111113] border-white/10 text-white/80 rounded-xl">
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

    const scrollTo = (id: SectionId) => {
        setActiveSection(id);
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    return (
        <div className="w-full">
            <div className="w-full px-6 md:px-8 py-8 flex gap-8 lg:gap-10 items-start">

                {/* ── LEFT NAV ────────────────── */}
                <aside className="hidden lg:flex flex-col gap-1 w-52 shrink-0 sticky top-24">
                    {/* Title */}
                    <div className="mb-6 px-2">
                        <span className="text-[9px] font-black uppercase tracking-[0.35em] text-rose-500">Configuration</span>
                        <div className="flex items-center gap-3 mt-1">
                            <h1 className="text-3xl font-black tracking-tighter text-white">Settings</h1>
                            <AnimatePresence>
                                {saveStatus !== "idle" && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.85 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.85 }}
                                        className={cn(
                                            "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] font-bold uppercase tracking-widest",
                                            saveStatus === "saving" && "bg-white/5 border-white/10 text-zinc-400",
                                            saveStatus === "saved" && "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
                                            saveStatus === "error" && "bg-red-500/10 border-red-500/20 text-red-400"
                                        )}
                                    >
                                        {saveStatus === "saving" && <Loader2 size={9} className="animate-spin" />}
                                        {saveStatus === "saved" && <CheckCircle size={9} />}
                                        {saveStatus === "error" && <AlertTriangle size={9} />}
                                        {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : "Failed"}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {NAV_SECTIONS.map(({ id, label, icon: Icon }) => {
                        const isActive = activeSection === id;
                        return (
                            <button
                                key={id}
                                onClick={() => scrollTo(id)}
                                className={cn(
                                    "group relative flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all duration-200 text-[13px] font-semibold",
                                    isActive
                                        ? "text-white"
                                        : "text-white/40 hover:text-white/70 hover:bg-white/[0.03]"
                                )}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="nav-active"
                                        className="absolute inset-0 rounded-2xl bg-white/[0.06] border border-white/[0.08]"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                                    />
                                )}
                                <div className={cn(
                                    "relative z-10 w-7 h-7 rounded-xl flex items-center justify-center transition-all duration-200",
                                    isActive
                                        ? "bg-rose-500/15 text-rose-400"
                                        : "text-white/30 group-hover:text-white/60"
                                )}>
                                    <Icon size={15} />
                                </div>
                                <span className="relative z-10">{label}</span>
                                {isActive && (
                                    <div className="ml-auto relative z-10 w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
                                )}
                            </button>
                        );
                    })}
                </aside>

                {/* ── CONTENT ─────────────────── */}
                <div className="flex-1 space-y-6 min-w-0 pb-40">

                    {/* Mobile title */}
                    <div className="lg:hidden mb-4">
                        <span className="text-[9px] font-black uppercase tracking-[0.35em] text-rose-500">Configuration</span>
                        <h1 className="text-3xl font-black tracking-tighter text-white mt-1">Settings</h1>
                        <p className="text-sm text-white/30 font-medium mt-1">Control your experience and privacy.</p>
                    </div>

                    {/* ── AUDIO ─── */}
                    <SectionCard id="audio" icon={Volume2} title="Audio" subtitle="Quality and playback gain management">
                        <SettingRow label="Streaming Fidelity" icon={Cpu} description="Balance between bandwidth and audio clarity">
                            <StyledSelect
                                value={preferences.audioQuality}
                                onValueChange={v => handleSelect("audioQuality", v)}
                                disabled={isSaving}
                                options={[
                                    { value: "low", label: "Standard" },
                                    { value: "high", label: "High Res" },
                                    { value: "lossless", label: "Lossless" },
                                ]}
                            />
                        </SettingRow>
                        <SettingRow label="Volume Normalization" icon={Zap} description="Maintain consistent gain levels across all tracks">
                            <Switch
                                checked={preferences.normalizeVolume}
                                onCheckedChange={v => handleToggle("normalizeVolume", v)}
                                disabled={isSaving}
                            />
                        </SettingRow>
                        <SettingRow label="Explicit Content Filter" icon={EyeOff} description="Hide tracks with explicit language markers">
                            <Switch
                                checked={preferences.explicitFilter}
                                onCheckedChange={v => handleToggle("explicitFilter", v)}
                                disabled={isSaving}
                            />
                        </SettingRow>
                    </SectionCard>

                    {/* ── PLAYBACK ─── */}
                    <SectionCard id="playback" icon={Play} title="Playback" subtitle="Transition and sequencing behavior">
                        <SettingRow label="Fluid Crossfade" icon={Music} description="Seamlessly blend the end and start of tracks" badge="Beta">
                            <Switch
                                checked={preferences.crossfade}
                                onCheckedChange={v => handleToggle("crossfade", v)}
                                disabled={isSaving}
                            />
                        </SettingRow>
                        <SettingRow label="Infinite Autoplay" icon={Repeat} description="Continue with smart track selection after queue ends">
                            <Switch
                                checked={preferences.autoplay}
                                onCheckedChange={v => handleToggle("autoplay", v)}
                                disabled={isSaving}
                            />
                        </SettingRow>
                        <SettingRow label="Gapless Playback" icon={Headphones} description="Remove silence between tracks for a live‑album feel">
                            <Switch
                                checked={false}
                                onCheckedChange={() => { }}
                                disabled={true}
                            />
                        </SettingRow>
                    </SectionCard>

                    {/* ── AESTHETICS ─── */}
                    <SectionCard id="aesthetics" icon={Palette} title="Aesthetics" subtitle="Visual workspace configuration">
                        <SettingRow label="Accent Color" icon={Zap} description="Primary interaction and highlight color">
                            <StyledSelect
                                value={preferences.accentColor}
                                onValueChange={v => handleSelect("accentColor", v)}
                                disabled={isSaving}
                                options={[
                                    { value: "rose", label: "Zenify Rose" },
                                    { value: "violet", label: "Deep Violet" },
                                    { value: "cyan", label: "Electric Cyan" },
                                ]}
                            />
                        </SettingRow>
                        <SettingRow label="Compact Layout" icon={Layers} description="Increase information density across all views">
                            <Switch
                                checked={preferences.compactMode}
                                onCheckedChange={v => handleToggle("compactMode", v)}
                                disabled={isSaving}
                            />
                        </SettingRow>
                        <SettingRow label="Motion Reduce" icon={Shuffle} description="Minimize animations for accessibility or performance">
                            <Switch
                                checked={false}
                                onCheckedChange={() => { }}
                                disabled={false}
                            />
                        </SettingRow>
                    </SectionCard>

                    {/* ── NOTIFICATIONS ─── */}
                    <SectionCard id="notifications" icon={Bell} title="Notifications" subtitle="Alerts, digests and release updates">
                        <SettingRow label="Email Digests" icon={Mail} description="Weekly account summaries and listening reports">
                            <Switch
                                checked={preferences.emailNotifications}
                                onCheckedChange={v => handleToggle("emailNotifications", v)}
                                disabled={isSaving}
                            />
                        </SettingRow>
                        <SettingRow label="New Release Alerts" icon={Radio} description="Get notified when artists you follow drop new music">
                            <Switch
                                checked={preferences.newReleaseAlerts}
                                onCheckedChange={v => handleToggle("newReleaseAlerts", v)}
                                disabled={isSaving}
                            />
                        </SettingRow>
                        <SettingRow label="Playlist Updates" icon={Globe} description="Notify when collaborative playlists are modified">
                            <Switch
                                checked={preferences.playlistUpdates}
                                onCheckedChange={v => handleToggle("playlistUpdates", v)}
                                disabled={isSaving}
                            />
                        </SettingRow>
                    </SectionCard>

                    {/* ── PRIVACY ─── */}
                    <SectionCard id="privacy" icon={Shield} title="Privacy" subtitle="Visibility, session and activity controls">
                        <SettingRow label="Stealth Mode" icon={Lock} description="Hide your listening activity from all followers">
                            <Switch
                                checked={preferences.privateSession}
                                onCheckedChange={v => handleToggle("privateSession", v)}
                                disabled={isSaving}
                            />
                        </SettingRow>
                        <SettingRow label="Broadcast Activity" icon={Activity} description="Show your real-time listening on your public profile">
                            <Switch
                                checked={preferences.listeningActivity}
                                onCheckedChange={v => handleToggle("listeningActivity", v)}
                                disabled={isSaving}
                            />
                        </SettingRow>
                        <SettingRow label="Followers Visible" icon={Users} description="Allow others to see who follows your profile">
                            <Switch
                                checked={true}
                                onCheckedChange={() => { }}
                                disabled={isSaving}
                            />
                        </SettingRow>
                    </SectionCard>

                </div>
            </div>
        </div>
    );
}
