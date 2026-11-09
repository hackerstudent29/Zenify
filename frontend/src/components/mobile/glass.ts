import type { CSSProperties } from "react";

/**
 * Apple "liquid glass" tokens — crystal-clear optical glass with real refractions.
 * High transparency and 14px blur allow underlying artwork and content to vividly shine through.
 */
export const GLASS_BLUR = "blur(14px) saturate(190%)";

// Crystal-clear liquid glass tint: ultra-thin top specular sheen over transparent smoky body
const GLASS_BG =
  "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.01) 100%), rgba(20,20,24,0.16)";

// Specular rim light: crisp top lit edge, subtle lateral highlights, soft inner ambient glow
const GLASS_RIM = [
  "inset 0 1px 0.5px rgba(255,255,255,0.36)",
  "inset 0 -0.5px 0 rgba(255,255,255,0.05)",
  "inset 0.5px 0 0 rgba(255,255,255,0.08)",
  "inset -0.5px 0 0 rgba(255,255,255,0.08)",
  "inset 0 0 12px rgba(255,255,255,0.03)",
].join(", ");

export const GLASS_DROP = "0 8px 24px rgba(0,0,0,0.30), 0 2px 6px rgba(0,0,0,0.18)";

/** Glass without the outer shadow (used where the shadow is drawn by a separate layer) */
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

/** The sliding "lens" behind the active tab — water-drop liquid refraction with Apple Red glow */
export const lensSurface: CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(225,29,72,0.14) 60%, rgba(225,29,72,0.06) 100%)",
  boxShadow:
    "inset 0 1px 0.5px rgba(255,255,255,0.45), inset 0 -0.5px 0 rgba(225,29,72,0.25), 0 2px 10px rgba(0,0,0,0.24)",
};
