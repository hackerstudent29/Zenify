import type { CSSProperties } from "react";

/**
 * Apple "liquid glass" tokens, tuned for a dark UI.
 * The dock, the search bubble and the mini player all use the SAME surface so they read as one material.
 * The full-screen sheet reuses it too, so the sheet → mini handoff is pixel-identical.
 */
export const GLASS_BLUR = "blur(26px) saturate(185%)";

// soft top-lit sheen over a dark smoky tint (keeps text legible over bright artwork)
const GLASS_BG =
  "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.05) 100%), rgba(28,28,32,0.42)";

// rim light: bright on top edge, faint on sides/bottom, plus a tiny inner glow
const GLASS_RIM = [
  "inset 0 1px 0 rgba(255,255,255,0.30)",
  "inset 0 -1px 0 rgba(255,255,255,0.07)",
  "inset 1px 0 0 rgba(255,255,255,0.10)",
  "inset -1px 0 0 rgba(255,255,255,0.10)",
  "inset 0 0 18px rgba(255,255,255,0.05)",
].join(", ");

export const GLASS_DROP = "0 10px 30px rgba(0,0,0,0.38), 0 2px 6px rgba(0,0,0,0.22)";

/** Glass without the outer shadow (used where the shadow is drawn by a separate, unclipped layer) */
export const glassInset: CSSProperties = {
  background: GLASS_BG,
  backdropFilter: GLASS_BLUR,
  WebkitBackdropFilter: GLASS_BLUR,
  boxShadow: GLASS_RIM,
};

/** Full glass surface: material + rim light + drop shadow */
export const glassSurface: CSSProperties = {
  ...glassInset,
  boxShadow: `${GLASS_RIM}, ${GLASS_DROP}`,
};

/** The sliding "lens" behind the active tab */
export const lensSurface: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.10) 100%)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(255,255,255,0.06), 0 2px 10px rgba(0,0,0,0.25)",
};

