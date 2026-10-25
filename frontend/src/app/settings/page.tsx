"use client";

import { useEffect } from "react";
import { useUIStore } from "@/store/ui";

export default function SettingsPage() {
  const openSettings = useUIStore((s) => s.openSettings);

  useEffect(() => {
    openSettings();
  }, [openSettings]);

  return null;
}
