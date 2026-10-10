"use client";

import { useUIStore } from "@/store/ui";
import { ZenifyLogoSplash } from "./ZenifyLogoSplash";

export function GlobalLoginSplash() {
  const showLoginSplash = useUIStore((s) => s.showLoginSplash);
  const setShowLoginSplash = useUIStore((s) => s.setShowLoginSplash);

  if (!showLoginSplash) return null;

  return <ZenifyLogoSplash onComplete={() => setShowLoginSplash(false)} />;
}

export default GlobalLoginSplash;
