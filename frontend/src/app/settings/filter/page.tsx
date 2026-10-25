"use client";

import { useEffect, useState } from "react";
import { SEO } from "@/components/shared/SEO";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import api from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { EyeOff, AlertTriangle, Shield, Music, Users } from "lucide-react";
import {
  SettingsWindow,
  Section,
  Group,
  Row,
  Toggle,
  AppButton,
  TINT,
} from "@/components/settings/AppleSettingsUI";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function FilterSettingsPage() {
  const { user, updateUser } = useAuthStore();
  const reducedMotion = useUIStore((s) => s.reducedMotion);
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
    <>
      <SEO title="Filter Settings – Zenify" noindex={true} path="/settings/filter" />
      <SettingsWindow
        title="Content Filters"
        backHref="/settings"
        backLabel="Settings"
        status={saveStatus}
        reducedMotion={reducedMotion}
      >
        <Section
          title="Content Filters"
          subtitle="Control what you hear and see on zenify."
        >
          <Group>
            <Row
              label="Explicit Content Filter"
              icon={EyeOff}
              tint={TINT.gray}
              description="Don't play songs containing explicit language or mature themes."
              isSaving={savingKey === "explicitFilter"}
              isSaved={lastSavedKey === "explicitFilter"}
            >
              <Toggle
                label="Explicit Content Filter"
                checked={preferences.explicitFilter}
                onCheckedChange={(v) => handleToggle("explicitFilter", v)}
              />
            </Row>

            <Row
              label="Artist Blocklist"
              icon={Users}
              tint={TINT.red}
              description={
                <>
                  <span className="font-zenify">zenify</span> will never play tracks from artists you've blocked.
                </>
              }
            >
              <AppButton>Manage…</AppButton>
            </Row>

            <Row
              label="Clean Radio Only"
              icon={Music}
              tint={TINT.pink}
              description="When starting a radio, only include clean versions of tracks."
            >
              <Toggle label="Clean Radio Only" checked={false} onCheckedChange={() => {}} disabled />
            </Row>

            <Row
              label="Sensitive Topics"
              icon={Shield}
              tint={TINT.blue}
              description="Hide podcasts or tracks dealing with sensitive real-world events."
            >
              <Toggle label="Sensitive Topics" checked={false} onCheckedChange={() => {}} disabled />
            </Row>
          </Group>

          <AnimatePresence>
            {saveStatus === "error" && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 380, damping: 28 } }}
                exit={{ opacity: 0, y: 6, transition: { duration: 0.14 } }}
                className="flex items-center gap-2.5 rounded-[12px] bg-[#ff453a]/12 px-3.5 py-2.5 text-[#ff8a82] ring-1 ring-inset ring-[#ff453a]/30"
              >
                <AlertTriangle size={16} className="shrink-0 text-[#ff453a]" />
                <span className="text-[12.5px] font-semibold">
                  Failed to save preferences. Please check your connection.
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </Section>
      </SettingsWindow>
    </>
  );
}
