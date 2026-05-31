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
    Keyboard,
    RotateCcw,
} from "lucide-react";
import { useShortcutStore } from "@/store/shortcuts";
import { useIsMobile } from "@/hooks/useIsMobile";

// ─── Types ────────────────────────────────────────────────
type SaveStatus = "idle" | "saving" | "saved" | "error";

const NAV_SECTIONS = [
    { id: "audio", label: "Audio", icon: Volume2 },
    { id: "playback", label: "Playback", icon: Play },
    { id: "aesthetics", label: "Aesthetics", icon: Palette },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "privacy", label: "Privacy", icon: Shield },
    { id: "shortcuts", label: "Shortcuts", icon: Keyboard, desktopOnly: true },
] as const;

type SectionId = typeof NAV_SECTIONS[number]["id"];

// ─── Sub-components ───────────────────────────────────────
function SettingRow({
    label,
    description,
    icon: Icon,
    children,
    badge,
    isSaving,
    isSaved,
}: {
    label: string;
    description?: string;
    icon?: React.ElementType;
    children: React.ReactNode;
    badge?: string;
    isSaving?: boolean;
    isSaved?: boolean;
}) {
    return (
        <div className="group flex items-center justify-between py-4 md:py-5 px-4 md:px-6 rounded-2xl md:rounded-3xl hover:bg-white/[0.04] transition-all duration-300 border border-transparent hover:border-white/5 mb-1">
            <div className="flex-1 flex items-center gap-3 md:gap-5 min-w-0 pr-3">
                {Icon && (
                    <div className="shrink-0 w-9 h-9 md:w-11 md:h-11 flex items-center justify-center text-white/40 group-hover:text-brand transition-all duration-300">
                        <Icon size={18} />
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 md:gap-3 font-[family-name:var(--font-plus-jakarta)] flex-wrap">
                        <span className="text-[13px] md:text-sm font-bold text-white/90 group-hover:text-white transition-colors">{label}</span>
                        {badge && (
                            <span className="shrink-0 text-[10px] font-bold tracking-tight text-brand bg-brand/10 border border-brand/20 px-2 py-0.5 rounded-full">
                                {badge}
                            </span>
                        )}
                    </div>
                    {description && (
                        <p className="text-[11px] md:text-xs text-zinc-500 font-medium mt-0.5 leading-relaxed font-[family-name:var(--font-plus-jakarta)] whitespace-normal">{description}</p>
                    )}
                </div>
            </div>
            <div className="shrink-0 ml-3 md:ml-6 flex items-center gap-4">
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
            <div className="px-5 sm:px-10 py-8 sm:py-12">
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
            <SelectTrigger className="w-[148px] h-8 bg-white/[0.06] border-white/10 text-white/80 text-[12px] font-semibold rounded-xl hover:bg-white/10 transition-colors focus:ring-brand/30 focus:ring-1 font-[family-name:var(--font-plus-jakarta)]">
                <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#111113] border-white/10 text-white/80 rounded-xl font-[family-name:var(--font-plus-jakarta)]">
                {options.map(o => (
                    <SelectItem key={o.value} value={o.value} className="text-[12px] font-semibold rounded-lg focus:bg-brand/10 focus:text-white">
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
    const isMobile = useIsMobile();
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
        sidebarStyle: "glassmorphism",
        globalPlayerStyle: "glassmorphism",
        fullviewReactiveBg: true,
        surroundingSpeed: 3,
    });
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
    const [savingKey, setSavingKey] = useState<string | null>(null);
    const [lastSavedKey, setLastSavedKey] = useState<string | null>(null);
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

    const handlePreferenceUpdate = async (updatedPrefs: typeof preferences, key: string) => {
        setIsSaving(true);
        setSaveStatus("saving");
        setSavingKey(key);
        setLastSavedKey(null);
        const { id, userId, createdAt, updatedAt, ...cleanPrefs } = updatedPrefs as any;
        try {
            await api.put("/auth/preferences", cleanPrefs);
            updateUser({ preferences: updatedPrefs });
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
            setIsSaving(false);
            setSavingKey(null);
        }
    };

    const handleToggle = (key: string, value: boolean) => {
        const next = { ...preferences, [key]: value };
        setPreferences(next);
        handlePreferenceUpdate(next, key);
    };

    const handleSelect = (key: string, value: string) => {
        const next = { ...preferences, [key]: value };
        setPreferences(next);
        handlePreferenceUpdate(next, key);
    };

    const selectSection = (id: SectionId) => {
        setActiveSection(id);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    return (
        <div className="w-full relative font-[family-name:var(--font-outfit)]">
            {/* ── FLOATING DOCK HEADER ────────────────── */}
            <div className="sticky top-0 z-[60] w-full pt-4 md:pt-8 pb-4 px-3 md:px-6 pointer-events-none flex justify-center">
                <motion.nav
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="flex items-center gap-1 p-1.5 rounded-3xl md:rounded-full bg-zinc-900/60 border border-white/10 backdrop-blur-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] pointer-events-auto overflow-x-auto no-scrollbar max-w-full w-full md:w-auto"
                >
                    {/* Compact Title/Logo for Dock */}
                    <div className="px-4 py-1.5 mr-1 border-r border-white/5 hidden md:flex items-center shrink-0">
                        <span className="text-[10px] font-bold tracking-tight text-white font-[family-name:var(--font-plus-jakarta)] leading-none pt-[1px]">Settings</span>
                    </div>

                    <div className="flex items-center gap-1 w-max px-2 md:px-0">
                        {NAV_SECTIONS.map(({ id, label, icon: Icon }) => {
                            const isActive = activeSection === id;
                            const isChanging = isActive && saveStatus !== "idle";
                            return (
                                <motion.button
                                    layout
                                    key={id}
                                    onClick={() => selectSection(id)}
                                    className={cn(
                                        "group relative flex items-center justify-center gap-2 px-3 py-2 md:px-4 rounded-full transition-all duration-500 text-[11px] font-bold tracking-tight shrink-0",
                                        (id as any) === 'shortcuts' ? "hidden md:flex" : "flex",
                                        isActive
                                            ? "bg-white/10 text-white"
                                            : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5",
                                        isChanging && saveStatus === "saved" && "bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                                    )}
                                >
                                    <span className="relative z-10 flex items-center gap-2">
                                        <motion.div layout transition={{ duration: 0.3 }}>
                                            <Icon size={15} className={cn(isActive && !isChanging ? "text-white" : "")} />
                                        </motion.div>

                                        <span className="inline-block">
                                            <AnimatePresence mode="popLayout" initial={false}>
                                                {isChanging ? (
                                                    <motion.span
                                                        key="status"
                                                        initial={{ opacity: 0, x: 10 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        exit={{ opacity: 0, x: -10 }}
                                                        transition={{ duration: 0.2 }}
                                                        className={cn(
                                                            "flex items-center gap-1.5 text-[10px] font-bold tracking-wide leading-none",
                                                            saveStatus === "saving" && "text-brand",
                                                            saveStatus === "saved" && "text-emerald-400",
                                                            saveStatus === "error" && "text-red-400"
                                                        )}
                                                    >
                                                        {saveStatus === "saving" && <Loader2 size={10} className="animate-spin shrink-0" />}
                                                        {saveStatus === "saved" && <CheckCircle size={10} className="shrink-0" />}
                                                        {saveStatus === "error" && <AlertTriangle size={10} className="shrink-0" />}
                                                        {saveStatus === "saving" ? "Saving..." : saveStatus.charAt(0).toUpperCase() + saveStatus.slice(1)}
                                                    </motion.span>
                                                ) : (
                                                    <motion.span
                                                        key="label"
                                                        initial={{ opacity: 0, x: -10 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        exit={{ opacity: 0, x: 10 }}
                                                        transition={{ duration: 0.2 }}
                                                        className="leading-none"
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
                    </div>
                </motion.nav>
            </div>

            <div className="w-full px-6 md:px-12 pt-4 pb-12">
                <AnimatePresence mode="wait">
                    {/* ── AUDIO ─── */}
                    {activeSection === "audio" && (
                        <SectionCard key="audio" id="audio" icon={Volume2} title="Audio" subtitle="Quality and playback gain management">
                            <SettingRow label="Streaming Fidelity" icon={Cpu} description="Balance between bandwidth and audio clarity" isSaving={savingKey === "audioQuality"} isSaved={lastSavedKey === "audioQuality"}>
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
                            <SettingRow label="Same Volume" icon={Zap} description="Keep the same volume for all songs" isSaving={savingKey === "normalizeVolume"} isSaved={lastSavedKey === "normalizeVolume"}>
                                <Switch
                                    checked={preferences.normalizeVolume}
                                    onCheckedChange={v => handleToggle("normalizeVolume", v)}
                                    disabled={isSaving}
                                />
                            </SettingRow>
                            <SettingRow label="Hide Bad Words" icon={EyeOff} description="Don't show songs with bad language" isSaving={savingKey === "explicitFilter"} isSaved={lastSavedKey === "explicitFilter"}>
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
                            <SettingRow label="Smooth Swaps" icon={Music} description="Mix the end of one song into the next" badge="Beta" isSaving={savingKey === "crossfade"} isSaved={lastSavedKey === "crossfade"}>
                                <Switch
                                    checked={preferences.crossfade}
                                    onCheckedChange={v => handleToggle("crossfade", v)}
                                    disabled={isSaving}
                                />
                            </SettingRow>
                            <SettingRow label="Keep Playing" icon={Repeat} description="Keep playing similar songs when your music ends" isSaving={savingKey === "autoplay"} isSaved={lastSavedKey === "autoplay"}>
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
                            <SettingRow label="Main Color" icon={Zap} description="Change the main color of the app" isSaving={savingKey === "accentColor"} isSaved={lastSavedKey === "accentColor"}>
                                <StyledSelect
                                    value={preferences.accentColor}
                                    onValueChange={v => handleSelect("accentColor", v)}
                                    disabled={isSaving}
                                    options={[
                                        { value: "rose", label: "Rose (Default)" },
                                        { value: "white", label: "White" },
                                        { value: "violet", label: "Violet" },
                                        { value: "cyan", label: "Cyan" },
                                    ]}
                                />
                            </SettingRow>
                            {!isMobile && (
                                <SettingRow label="Sidebar Layout" icon={Layers} description="Switch between modern transparent glass or solid layout" isSaving={savingKey === "sidebarStyle"} isSaved={lastSavedKey === "sidebarStyle"}>
                                    <StyledSelect
                                        value={preferences.sidebarStyle}
                                        onValueChange={v => handleSelect("sidebarStyle", v)}
                                        disabled={isSaving}
                                        options={[
                                            { value: "normal", label: "Normal (Solid)" },
                                            { value: "glassmorphism", label: "Glassmorphism" },
                                        ]}
                                    />
                                </SettingRow>
                            )}
                            <SettingRow label="Global Player Layout" icon={Music} description="Style for the main bottom player" isSaving={savingKey === "globalPlayerStyle"} isSaved={lastSavedKey === "globalPlayerStyle"}>
                                <StyledSelect
                                    value={preferences.globalPlayerStyle}
                                    onValueChange={v => handleSelect("globalPlayerStyle", v)}
                                    disabled={isSaving}
                                    options={[
                                        { value: "normal", label: "Normal (Solid)" },
                                        { value: "glassmorphism", label: "Glassmorphism" },
                                    ]}
                                />
                            </SettingRow>
                            <SettingRow label="Full Player Reactive Mesh" icon={Zap} description="Animate fluid background blobs in sync with music frequencies in the full player" isSaving={savingKey === "fullviewReactiveBg"} isSaved={lastSavedKey === "fullviewReactiveBg"}>
                                <Switch
                                    checked={preferences.fullviewReactiveBg}
                                    onCheckedChange={v => handleToggle("fullviewReactiveBg", v)}
                                    disabled={isSaving}
                                />
                            </SettingRow>
                            <SettingRow label="Track Page Reactive Mesh" icon={Zap} description="Animate fluid background blobs in sync with music frequencies on the track page" isSaving={savingKey === "trackPageReactiveBg"} isSaved={lastSavedKey === "trackPageReactiveBg"}>
                                <Switch
                                    checked={preferences.trackPageReactiveBg !== false}
                                    onCheckedChange={v => handleToggle("trackPageReactiveBg", v)}
                                    disabled={isSaving}
                                />
                            </SettingRow>
                            <SettingRow label="Small Mode" icon={Layers} description="Show more items on the screen at once" isSaving={savingKey === "compactMode"} isSaved={lastSavedKey === "compactMode"}>
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
                            <SettingRow label="Email Summary" icon={Mail} description="Get a weekly email about your activity" isSaving={savingKey === "emailNotifications"} isSaved={lastSavedKey === "emailNotifications"}>
                                <Switch
                                    checked={preferences.emailNotifications}
                                    onCheckedChange={v => handleToggle("emailNotifications", v)}
                                    disabled={isSaving}
                                />
                            </SettingRow>
                            <SettingRow label="New Music" icon={Radio} description="Alert me when artists I follow drop new songs" isSaving={savingKey === "newReleaseAlerts"} isSaved={lastSavedKey === "newReleaseAlerts"}>
                                <Switch
                                    checked={preferences.newReleaseAlerts}
                                    onCheckedChange={v => handleToggle("newReleaseAlerts", v)}
                                    disabled={isSaving}
                                />
                            </SettingRow>
                            <SettingRow label="Playlist News" icon={Globe} description="Alert me when my playlists are updated" isSaving={savingKey === "playlistUpdates"} isSaved={lastSavedKey === "playlistUpdates"}>
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
                            <SettingRow label="Secret Mode" icon={Lock} description="Hide what you're listening to from others" isSaving={savingKey === "privateSession"} isSaved={lastSavedKey === "privateSession"}>
                                <Switch
                                    checked={preferences.privateSession}
                                    onCheckedChange={v => handleToggle("privateSession", v)}
                                    disabled={isSaving}
                                />
                            </SettingRow>
                            <SettingRow label="Show Activity" icon={Activity} description="Display what you're playing on your profile" isSaving={savingKey === "listeningActivity"} isSaved={lastSavedKey === "listeningActivity"}>
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

                    {/* ── SHORTCUTS ─── */}
                    {activeSection === "shortcuts" && (
                        <div className="hidden md:block">
                            <ShortcutSettingsSection />
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

function ShortcutSettingsSection() {
    const { shortcuts, setShortcut, resetShortcut, resetAll } = useShortcutStore();
    const [recordingAction, setRecordingAction] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!recordingAction) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();

            // Don't record single modifier keys
            if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
            if (e.key === 'Escape') {
                setRecordingAction(null);
                return;
            }

            const pressed = [];
            if (e.ctrlKey) pressed.push('Ctrl');
            if (e.metaKey) pressed.push('Meta');
            if (e.shiftKey) pressed.push('Shift');
            if (e.altKey) pressed.push('Alt');

            // Exclude modifier keys themselves from being the main key
            if (!['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) {
                // Use e.code directly without slicing 'Key' prefix
                pressed.push(e.code);
            }
            const combo = pressed.join('+');

            // Conflict detection
            const conflict = shortcuts.find(s => s.key === combo && s.action !== recordingAction);
            if (conflict) {
                setError(`Already assigned to ${conflict.label}`);
                setTimeout(() => setError(null), 2000);
                return;
            }

            setShortcut(recordingAction, combo);
            setRecordingAction(null);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [recordingAction, shortcuts, setShortcut]);

    const categories = ['Playback', 'Seeking', 'Volume', 'Interface'] as const;

    return (
        <SectionCard id="shortcuts" icon={Keyboard} title="Keyboard Shortcuts" subtitle="Personalize your workflow">
            <div className="flex justify-end mb-8">
                <button
                    onClick={resetAll}
                    className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/30 text-xs font-bold text-white/40 hover:text-white transition-all"
                >
                    <RotateCcw size={14} />
                    Reset All to Defaults
                </button>
            </div>

            <div className="space-y-12">
                {categories.map(cat => {
                    const uniqueShortcuts = Array.from(new Map(shortcuts.map(s => [s.action, s])).values());
                    const catShortcuts = uniqueShortcuts.filter(s => s.category === cat);
                    if (catShortcuts.length === 0) return null;

                    return (
                        <div key={cat} className="space-y-4">
                            <h3 className="text-[10px] tracking-widest font-bold text-white/40 px-4 border-l-2 border-white/20">{cat}</h3>
                            <div className="space-y-1">
                                {catShortcuts.map(s => (
                                    <div key={s.action} className="group flex items-center justify-between py-4 px-6 rounded-3xl hover:bg-white/[0.04] transition-all duration-300 border border-transparent hover:border-white/10">
                                        <div className="min-w-0">
                                            <span className="text-sm font-bold text-white/60 group-hover:text-white transition-colors">{s.label}</span>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            {recordingAction === s.action ? (
                                                <div className="flex items-center gap-3 animate-pulse bg-white/10 px-4 py-2 rounded-xl border border-white/20">
                                                    <span className="text-[10px] font-bold tracking-tight text-white/40">Press any key...</span>
                                                    {error && <span className="text-[10px] font-bold tracking-tight text-red-500">{error}</span>}
                                                </div>
                                            ) : (
                                                <div className="flex gap-1.5">
                                                    {s.key.split('+').map(k => {
                                                        const cleanKey = k
                                                            .replace('Key', '')
                                                            .replace('Digit', '')
                                                            .replace('Arrow', '');
                                                        return (
                                                            <kbd key={k} className="px-2.5 py-1.5 rounded-xl bg-zinc-800 border-b-2 border-zinc-950 text-[10px] font-bold text-white min-w-[32px] text-center shadow-lg">
                                                                {cleanKey}
                                                            </kbd>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => setRecordingAction(s.action)}
                                                    className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-bold tracking-tight text-white/40 hover:text-white transition-all border border-white/10"
                                                >
                                                    {recordingAction === s.action ? 'Cancel' : 'Edit'}
                                                </button>
                                                <button
                                                    onClick={() => resetShortcut(s.action)}
                                                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all border border-white/10"
                                                    title="Reset to default"
                                                >
                                                    <RotateCcw size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </SectionCard>
    );
}
