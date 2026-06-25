/** Shared accent color definitions — single source of truth */
export const ACCENT_COLORS: Record<string, { hex: string; rgb: string; gradient: string }> = {
  rose: { hex: "#e11d48", rgb: "225, 29, 72", gradient: "#e11d48" },
  violet: { hex: "#8b5cf6", rgb: "139, 92, 246", gradient: "#8b5cf6" },
  cyan: { hex: "#06b6d4", rgb: "6, 182, 212", gradient: "#06b6d4" },
  white: { hex: "#ffffff", rgb: "255, 255, 255", gradient: "#ffffff" },
  emerald: { hex: "#10b981", rgb: "16, 185, 129", gradient: "#10b981" },
  amber: { hex: "#f59e0b", rgb: "245, 158, 11", gradient: "#f59e0b" },
  // New Aesthetic Combos
  sunset: { hex: "#f43f5e", rgb: "244, 63, 94", gradient: "linear-gradient(135deg, #f97316 0%, #f43f5e 100%)" },
  ocean: { hex: "#0ea5e9", rgb: "14, 165, 233", gradient: "linear-gradient(135deg, #2dd4bf 0%, #0284c7 100%)" },
  aurora: { hex: "#8b5cf6", rgb: "139, 92, 246", gradient: "linear-gradient(135deg, #10b981 0%, #8b5cf6 100%)" },
  neon: { hex: "#ff00ff", rgb: "255, 0, 255", gradient: "linear-gradient(135deg, #00ffff 0%, #ff00ff 100%)" },
  gold: { hex: "#eab308", rgb: "234, 179, 8", gradient: "linear-gradient(135deg, #fde047 0%, #d97706 100%)" },
  midnight: { hex: "#6366f1", rgb: "99, 102, 241", gradient: "linear-gradient(135deg, #818cf8 0%, #1e1b4b 100%)" },
};

/** Instantly applies the accent color to CSS variables on :root */
export function applyAccentColor(colorKey: string) {
  const theme = ACCENT_COLORS[colorKey] ?? ACCENT_COLORS.rose;
  const root = document.documentElement;
  root.style.setProperty("--accent-brand", theme.hex);
  root.style.setProperty("--accent-brand-rgb", theme.rgb);
  root.style.setProperty("--accent-gradient", theme.gradient);
}
