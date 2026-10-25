"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/store/ui";

export default function SettingsPage() {
  const router = useRouter();
  const openSettings = useUIStore((s) => s.openSettings);

  useEffect(() => {
    openSettings();
    if (typeof window !== "undefined") {
      if (window.history.length > 1) {
        router.back();
      } else {
        router.push("/");
      }
    }
  }, [openSettings, router]);

  return null;
}
