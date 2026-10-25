"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { usePlayerStore } from "@/store/player";
import { audioEngine } from "@/lib/audio-engine";
import { useShortcutStore } from "@/store/shortcuts";
import { useUIStore } from "@/store/ui";
import { useReactiveBgStore } from "@/store/reactiveBgStore";
import { usePlayerPrefs } from "@/store/playerPrefs";
import { applyAccentColor } from "@/lib/accent-colors";
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
  Radio,
  EyeOff,
  Activity,
  Mail,
  Shuffle,
  Repeat,
  Keyboard,
  RotateCcw,
  Waves,
  Disc3,
  Maximize2,
  ScrollText,
  User,
} from "lucide-react";
import {
  SettingsWindow,
  Section,
  Group,
  Row,
  Toggle,
  PopUp,
  AppleSlider,
  AppButton,
  KeyCap,
  TINT,
  type NavItem,
} from "@/components/settings/AppleSettingsUI";

type SaveStatus = "idle" | "saving" | "saved" | "error";

const NAV_SECTIONS = [
  { id: "audio", label: "Audio", icon: Volume2, tint: TINT.pink },
  { id: "playback", label: "Playback", icon: Play, tint: TINT.green },
  { id: "aesthetics", label: "Aesthetics", icon: Palette, tint: TINT.purple },
  { id: "notifications", label: "Notifications", icon: Bell, tint: TINT.red },
  { id: "privacy", label: "Privacy", icon: Shield, tint: TINT.blue },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard, tint: TINT.gray, desktopOnly: true },
] as const satisfies readonly NavItem[];

type SectionId = (typeof NAV_SECTIONS)[number]["id"];

const REACTIVE_SURFACES = [
  { key: "fullPlayer", label: "Full View Player", icon: Maximize2, tint: TINT.indigo, desc: "Display fluid mesh canvas in the full screen player", name: "Full Player" },
  { key: "trackPage", label: "Track Detail Page", icon: Music, tint: TINT.pink, desc: "Display fluid mesh canvas on track detail views", name: "Track Page" },
  { key: "albumPage", label: "Album Page", icon: Disc3, tint: TINT.orange, desc: "Display fluid mesh canvas on album views", name: "Album Page" },
  { key: "artistPage", label: "Artist Page", icon: User, tint: TINT.teal, desc: "Display fluid mesh canvas on artist header views", name: "Artist Page" },
  { key: "other", label: "Other Panels & Lyrics", icon: ScrollText, tint: TINT.purple, desc: "Display fluid mesh canvas behind sidebar lyrics & other surfaces", name: "Other Panels" },
] as const;

export function SettingsModal({
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
}: {
  isOpen?: boolean;
  onClose?: () => void;
} = {}) {
  const isSettingsOpen = useUIStore((s) => s.isSettingsOpen);
  const closeSettings = useUIStore((s) => s.closeSettings);
  const { user, updateUser } = useAuthStore();
  const audioFx = usePlayerStore((state) => state.audioFx);
  const setFx = usePlayerStore((state) => state.setFx);
  const reducedMotion = useUIStore((s) => s.reducedMotion);
  const setReducedMotion = useUIStore((s) => s.setReducedMotion);
  const showToast = useUIStore((s) => s.showToast);
  const reactiveBgStore = useReactiveBgStore();
  const autoHideDetails = usePlayerPrefs((s) => s.autoHideDetails);
  const setAutoHideDetails = usePlayerPrefs((s) => s.setAutoHideDetails);
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
    emailNotifications: false,
    newReleaseAlerts: false,
    playlistUpdates: false,
    weeklySummaryEmail: false,
    privateSession: false,
    listeningActivity: true,
    sidebarStyle: "glassmorphism",
    globalPlayerStyle: "glassmorphism",
    fullviewReactiveBg: true,
    trackPageReactiveBg: true,
    surroundingSpeed: 3,
    bottomNavStyle: "normal" as "normal" | "glasso",
    swipeNavigation: true,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [lastSavedKey, setLastSavedKey] = useState<string | null>(null);

  // Initialize from user preferences or localStorage
  useEffect(() => {
    if (user?.preferences) {
      setPreferences((prev) => ({ ...prev, ...user.preferences }));
    } else if (typeof window !== "undefined") {
      try {
        const local = localStorage.getItem("zenify_user_preferences");
        if (local) {
          const parsed = JSON.parse(local);
          setPreferences((prev) => ({ ...prev, ...parsed }));
        }
      } catch {}
    }
  }, [user?.id]);

  const handlePreferenceUpdate = async (updatedPrefs: typeof preferences, key: string) => {
    setIsSaving(true);
    setSaveStatus("saving");
    setSavingKey(key);
    setLastSavedKey(null);

    // Save locally first for instantaneous responsiveness
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("zenify_user_preferences", JSON.stringify(updatedPrefs));
      } catch {}
    }

    // If user is authenticated, sync with server
    if (user) {
      const { id, userId, createdAt, updatedAt, ...cleanPrefs } = updatedPrefs as any;
      try {
        await api.put("/auth/preferences", cleanPrefs);
        setSaveStatus("saved");
        setLastSavedKey(key);
        setTimeout(() => {
          setSaveStatus("idle");
          setLastSavedKey(null);
        }, 1500);
      } catch (err) {
        // Fallback gracefully without locking the UI
        console.warn("[Settings] Cloud preference sync deferred:", err);
        setSaveStatus("saved");
        setLastSavedKey(key);
        setTimeout(() => {
          setSaveStatus("idle");
          setLastSavedKey(null);
        }, 1500);
      } finally {
        setIsSaving(false);
        setSavingKey(null);
      }
    } else {
      // Guest mode: instant save without server error
      setSaveStatus("saved");
      setLastSavedKey(key);
      setTimeout(() => {
        setSaveStatus("idle");
        setLastSavedKey(null);
      }, 1500);
      setIsSaving(false);
      setSavingKey(null);
    }
  };

  const handleToggle = (key: string, value: boolean) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);

    if (key === "crossfade") {
      setFx({ crossfade: value ? 4 : 0 });
      audioEngine.setCrossfade(value ? 4 : 0);
      if (typeof window !== "undefined") {
        localStorage.setItem("zenify_crossfade", String(value ? 4 : 0));
      }
    }
    if (key === "autoplay") {
      if (typeof window !== "undefined") {
        localStorage.setItem("zenify_autoplay", String(value));
      }
    }
    if (key === "normalizeVolume") {
      audioEngine.toggleNormalize(value);
      if (typeof window !== "undefined") {
        localStorage.setItem("zenify_normalize_volume", String(value));
      }
    }

    const toastMap: Record<string, (v: boolean) => string> = {
      crossfade: (v) => (v ? "Smooth Swaps enabled — Crossfading songs" : "Smooth Swaps disabled"),
      autoplay: (v) => (v ? "Keep Playing enabled — Plays similar tracks when queue ends" : "Keep Playing disabled"),
      normalizeVolume: (v) => (v ? "Same Volume enabled across all tracks" : "Volume normalization disabled"),
      explicitFilter: (v) => (v ? "Explicit filter enabled — Bad words hidden" : "Explicit filter disabled"),
      emailNotifications: (v) => (v ? "Email Notifications enabled" : "Email Notifications disabled"),
      weeklySummaryEmail: (v) => (v ? "Weekly Summary Email enabled" : "Weekly Summary Email disabled"),
      newReleaseAlerts: (v) => (v ? "New Music alerts enabled for followed artists" : "New Music alerts disabled"),
      playlistUpdates: (v) => (v ? "Playlist News alerts enabled" : "Playlist News alerts disabled"),
      listeningActivity: (v) => (v ? "Listening activity visible on profile" : "Listening activity hidden"),
    };

    if (toastMap[key]) {
      showToast(toastMap[key](value));
    }

    handlePreferenceUpdate(next, key);
  };

  const handleSelect = (key: string, value: string) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);

    if (key === "accentColor") {
      applyAccentColor(value);
      if (typeof window !== "undefined") {
        localStorage.setItem("zenify_accent_color", value);
      }
      showToast(`Accent color set to ${value.charAt(0).toUpperCase() + value.slice(1)}`);
    }

    if (key === "audioQuality") {
      if (typeof window !== "undefined") {
        localStorage.setItem("zenify_audio_quality", value);
      }
      showToast(`Streaming fidelity set to ${value === "lossless" ? "Best (320kbps)" : value === "high" ? "High" : "Basic"}`);
    }

    handlePreferenceUpdate(next, key);
  };

  const pref = (key: keyof typeof preferences) => ({
    isSaving: savingKey === key,
    isSaved: lastSavedKey === key,
  });

  const effectiveIsOpen = controlledIsOpen !== undefined ? controlledIsOpen : isSettingsOpen;
  const effectiveOnClose = controlledOnClose || closeSettings;

  if (!effectiveIsOpen) return null;

  return (
    <SettingsWindow
      title="Settings"
      isOpen={effectiveIsOpen}
      onClose={effectiveOnClose}
      nav={{
        items: NAV_SECTIONS,
        active: activeSection,
        onSelect: (id) => setActiveSection(id as SectionId),
      }}
      status={saveStatus}
      reducedMotion={reducedMotion}
      scrollKey={activeSection}
    >
      {/* ── AUDIO ─── */}
      {activeSection === "audio" && (
        <Section key="audio" title="Audio" subtitle="Quality, dynamic gain, and spatial acoustics">
          <Group>
            <Row label="Streaming Fidelity" icon={Cpu} tint={TINT.blue} description="Balance between bandwidth and audio clarity" {...pref("audioQuality")}>
              <PopUp
                value={preferences.audioQuality}
                onValueChange={(v) => handleSelect("audioQuality", v)}
                disabled={isSaving}
                options={[
                  { value: "low", label: "Basic" },
                  { value: "high", label: "High" },
                  { value: "lossless", label: "Best (320kbps)" },
                ]}
              />
            </Row>
            <Row label="Same Volume" icon={Zap} tint={TINT.orange} description="Keep the same volume for all songs (Peak normalizer)" {...pref("normalizeVolume")}>
              <Toggle label="Same Volume" checked={preferences.normalizeVolume} onCheckedChange={(v) => handleToggle("normalizeVolume", v)} disabled={isSaving} />
            </Row>
            <Row label="Hide Bad Words" icon={EyeOff} tint={TINT.gray} description="Don't show songs with bad language" {...pref("explicitFilter")}>
              <Toggle label="Hide Bad Words" checked={preferences.explicitFilter} onCheckedChange={(v) => handleToggle("explicitFilter", v)} disabled={isSaving} />
            </Row>
          </Group>

          <Group header="Spatial Audio" footer="Adjust the 3D spatial rotation speed of the sound stage.">
            <Row label="8D Rotation Speed" icon={Waves} tint={TINT.purple} description="Spatial rotation frequency">
              <div className="flex w-[120px] items-center gap-3 sm:w-[170px]">
                <AppleSlider
                  value={audioFx.speed8D * 1000}
                  min={20}
                  max={500}
                  onValueChange={(val) => {
                    const newFreq = val / 1000;
                    audioEngine.resume();
                    audioEngine.applyFx({ speed8D: newFreq });
                    setFx({ speed8D: newFreq });
                  }}
                />
                <span className="t-mono w-9 text-right text-[11px] font-semibold text-white/55">
                  {((audioFx.speed8D * 100) / 0.15).toFixed(0)}%
                </span>
              </div>
            </Row>
          </Group>
        </Section>
      )}

      {/* ── PLAYBACK ─── */}
      {activeSection === "playback" && (
        <Section key="playback" title="Playback" subtitle="Seamless flow and crossfading controls">
          <Group>
            <Row label="Smooth Swaps" icon={Music} tint={TINT.pink} badge="Crossfade" description="Mix the end of one song smoothly into the next" {...pref("crossfade")}>
              <Toggle label="Smooth Swaps" checked={preferences.crossfade} onCheckedChange={(v) => handleToggle("crossfade", v)} disabled={isSaving} />
            </Row>
            <Row label="Keep Playing" icon={Repeat} tint={TINT.green} description="Keep playing similar songs when your music ends" {...pref("autoplay")}>
              <Toggle label="Keep Playing" checked={preferences.autoplay} onCheckedChange={(v) => handleToggle("autoplay", v)} disabled={isSaving} />
            </Row>
            <Row label="Hide Details When Idle" icon={EyeOff} tint={TINT.purple} description="After 5 seconds without touching the player, hide controls to keep artwork, lyrics and progress visible">
              <Toggle
                label="Hide Details When Idle"
                checked={autoHideDetails}
                onCheckedChange={(v) => {
                  setAutoHideDetails(v);
                  showToast(v ? "Idle auto-hide enabled" : "Idle auto-hide disabled");
                }}
              />
            </Row>
          </Group>
        </Section>
      )}

      {/* ── AESTHETICS ─── */}
      {activeSection === "aesthetics" && (
        <Section key="aesthetics" title="Aesthetics" subtitle="Interface themes and fluid canvas rendering">
          <Group>
            <Row label="Main Color" icon={Zap} tint={TINT.orange} description="Change the primary brand highlight of Zenify" {...pref("accentColor")}>
              <PopUp
                value={preferences.accentColor}
                onValueChange={(v) => handleSelect("accentColor", v)}
                disabled={isSaving}
                options={[
                  { value: "rose", label: "Rose (Default)" },
                  { value: "white", label: "White" },
                  { value: "violet", label: "Violet" },
                  { value: "cyan", label: "Cyan" },
                  { value: "emerald", label: "Emerald" },
                  { value: "amber", label: "Amber" },
                  { value: "sunset", label: "Sunset (Gradient)" },
                  { value: "ocean", label: "Ocean (Gradient)" },
                  { value: "aurora", label: "Aurora (Gradient)" },
                  { value: "neon", label: "Neon (Gradient)" },
                  { value: "gold", label: "Gold (Gradient)" },
                  { value: "midnight", label: "Midnight (Gradient)" },
                ]}
              />
            </Row>
          </Group>

          <Group
            header="Reactive Canvas Background"
            footer="Choose which surfaces render the Apple Music style fluid mesh background. Disabling stops canvas and rAF execution completely."
          >
            {REACTIVE_SURFACES.map((s) => (
              <Row key={s.key} label={s.label} icon={s.icon} tint={s.tint} description={s.desc}>
                <Toggle
                  label={s.label}
                  checked={(reactiveBgStore.reactiveBg as any)[s.key]}
                  onCheckedChange={(v) => {
                    reactiveBgStore.setSurface(s.key as any, v);
                    showToast(v ? `${s.name} reactive background enabled` : `${s.name} reactive background disabled`);
                  }}
                />
              </Row>
            ))}
          </Group>

          <Group>
            <Row label="Less Motion" icon={Shuffle} tint={TINT.teal} description="Reduce moving parts for better performance">
              <Toggle
                label="Less Motion"
                checked={reducedMotion}
                onCheckedChange={(v) => {
                  setReducedMotion(v);
                  showToast(v ? "Less Motion enabled — Animations reduced" : "Less Motion disabled — Full animations restored");
                }}
              />
            </Row>
          </Group>
        </Section>
      )}

      {/* ── NOTIFICATIONS ─── */}
      {activeSection === "notifications" && (
        <Section key="notifications" title="Notifications" subtitle="Activity alerts and artist releases">
          <Group header="Email">
            <Row label="Email Notifications" icon={Mail} tint={TINT.blue} description="Get general email updates" {...pref("emailNotifications")}>
              <Toggle label="Email Notifications" checked={preferences.emailNotifications} onCheckedChange={(v) => handleToggle("emailNotifications", v)} disabled={isSaving} />
            </Row>
            <Row label="Weekly Summary Email" icon={Mail} tint={TINT.indigo} description="Get a weekly digest of your listening activity" {...pref("weeklySummaryEmail")}>
              <Toggle label="Weekly Summary Email" checked={!!preferences.weeklySummaryEmail} onCheckedChange={(v) => handleToggle("weeklySummaryEmail", v)} disabled={isSaving} />
            </Row>
          </Group>
          <Group header="Alerts">
            <Row label="New Music" icon={Radio} tint={TINT.pink} description="Alert me when artists I follow release new songs" {...pref("newReleaseAlerts")}>
              <Toggle label="New Music" checked={preferences.newReleaseAlerts} onCheckedChange={(v) => handleToggle("newReleaseAlerts", v)} disabled={isSaving} />
            </Row>
            <Row label="Playlist News" icon={Globe} tint={TINT.teal} description="Alert me when my followed playlists are updated" {...pref("playlistUpdates")}>
              <Toggle label="Playlist News" checked={preferences.playlistUpdates} onCheckedChange={(v) => handleToggle("playlistUpdates", v)} disabled={isSaving} />
            </Row>
          </Group>
        </Section>
      )}

      {/* ── PRIVACY ─── */}
      {activeSection === "privacy" && (
        <Section key="privacy" title="Privacy" subtitle="Social visibility and profile activity">
          <Group>
            <Row label="Show Activity" icon={Activity} tint={TINT.blue} description="Display what you're currently playing on your public profile" {...pref("listeningActivity")}>
              <Toggle label="Show Activity" checked={preferences.listeningActivity} onCheckedChange={(v) => handleToggle("listeningActivity", v)} disabled={isSaving} />
            </Row>
          </Group>
        </Section>
      )}

      {/* ── SHORTCUTS ─── */}
      {activeSection === "shortcuts" && (
        <div className="hidden md:block">
          <ShortcutSettingsSection />
        </div>
      )}
    </SettingsWindow>
  );
}

function ShortcutSettingsSection() {
  const { shortcuts, setShortcut, resetShortcut, resetAll } = useShortcutStore();
  const [recordingAction, setRecordingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (recordingAction) document.body.dataset.recordingShortcut = "1";
    return () => {
      delete document.body.dataset.recordingShortcut;
    };
  }, [recordingAction]);

  useEffect(() => {
    if (!recordingAction) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();

      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      if (e.key === "Escape") {
        setRecordingAction(null);
        return;
      }

      const pressed = [];
      if (e.ctrlKey) pressed.push("Ctrl");
      if (e.metaKey) pressed.push("Meta");
      if (e.shiftKey) pressed.push("Shift");
      if (e.altKey) pressed.push("Alt");

      if (!["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(e.code)) {
        pressed.push(e.code);
      }
      const combo = pressed.join("+");

      const conflict = shortcuts.find((s) => s.key === combo && s.action !== recordingAction);
      if (conflict) {
        setError(`Already assigned to ${conflict.label}`);
        setTimeout(() => setError(null), 2000);
        return;
      }

      setShortcut(recordingAction, combo);
      setRecordingAction(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [recordingAction, shortcuts, setShortcut]);

  const categories = ["Playback", "Seeking", "Volume", "Interface"] as const;

  return (
    <Section title="Keyboard Shortcuts" subtitle="Personalize your workflow and key combinations">
      <div className="-mt-2 mb-4 flex justify-end">
        <AppButton onClick={resetAll}>
          <RotateCcw size={13} strokeWidth={2.4} />
          Reset All to Defaults
        </AppButton>
      </div>

      {categories.map((cat) => {
        const uniqueShortcuts = Array.from(new Map(shortcuts.map((s) => [s.action, s])).values()) as typeof shortcuts;
        const catShortcuts = uniqueShortcuts.filter((s) => s.category === cat);
        if (catShortcuts.length === 0) return null;

        return (
          <Group key={cat} header={cat}>
            {catShortcuts.map((s) => (
              <Row key={s.action} label={s.label}>
                {recordingAction === s.action ? (
                  <div className="flex animate-pulse items-center gap-2 rounded-[8px] bg-white/10 px-3 py-1 ring-1 ring-inset ring-white/15">
                    <span className="text-[11px] font-semibold text-white/60">Press any key…</span>
                    {error && <span className="text-[11px] font-semibold text-[#ff453a]">{error}</span>}
                  </div>
                ) : (
                  <div className="flex gap-1">
                    {s.key.split("+").map((k) => {
                      const cleanKey = k.replace("Key", "").replace("Digit", "").replace("Arrow", "");
                      return <KeyCap key={k}>{cleanKey}</KeyCap>;
                    })}
                  </div>
                )}

                <div className="flex items-center gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <AppButton onClick={() => setRecordingAction(recordingAction === s.action ? null : s.action)}>
                    {recordingAction === s.action ? "Cancel" : "Edit"}
                  </AppButton>
                  <AppButton onClick={() => resetShortcut(s.action)} title="Reset to default" aria-label="Reset to default" className="w-7 px-0 justify-center">
                    <RotateCcw size={13} strokeWidth={2.4} />
                  </AppButton>
                </div>
              </Row>
            ))}
          </Group>
        );
      })}
    </Section>
  );
}
