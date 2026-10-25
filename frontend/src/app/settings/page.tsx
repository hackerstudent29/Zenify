"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/store/ui";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { SEO } from "@/components/shared/SEO";

export default function SettingsPage() {
  const router = useRouter();
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);

  useEffect(() => {
    setSettingsOpen(true);
  }, [setSettingsOpen]);

  return (
    <>
      <SEO title="Settings – Zenify" noindex={true} path="/settings" />
      <SettingsModal
        isOpen={true}
        onClose={() => {
          setSettingsOpen(false);
          if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
          } else {
            router.push("/");
          }
        }}
      />
    </>
  );
}
