"use client";

import { useEffect } from "react";
import { useUIStore } from "@/store/ui";
import { SEO } from "@/components/shared/SEO";

export default function SettingsPage() {
  const openSettings = useUIStore((s) => s.openSettings);

  useEffect(() => {
    openSettings();
  }, [openSettings]);

  return <SEO title="Settings – Zenify" path="/settings" noindex={true} />;
}
