/** Shared accent color definitions — single source of truth */
export const ACCENT_COLORS: Record<string, { hex: string; rgb: string }> = {
 rose: { hex: "#e11d48", rgb: "225, 29, 72" },
 violet: { hex: "#8b5cf6", rgb: "139, 92, 246" },
 cyan: { hex: "#06b6d4", rgb: "6, 182, 212" },
 white: { hex: "#ffffff", rgb: "255, 255, 255" },
 emerald: { hex: "#10b981", rgb: "16, 185, 129" },
 amber: { hex: "#f59e0b", rgb: "245, 158, 11" },
};

/** Instantly applies the accent color to CSS variables on :root */
export function applyAccentColor(colorKey: string) {
 const theme = ACCENT_COLORS[colorKey] ?? ACCENT_COLORS.rose;
 const root = document.documentElement;
 root.style.setProperty("--accent-brand", theme.hex);
 root.style.setProperty("--accent-brand-rgb", theme.rgb);
}
