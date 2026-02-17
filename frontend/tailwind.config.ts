import type { Config } from "tailwindcss";

const colors = {
    background: '#0F172A', // Slate 900
    foreground: '#F8FAFC', // Slate 50
    primary: '#818CF8',    // Indigo 400
    secondary: '#1E293B',  // Slate 800
    accent: '#38BDF8',     // Sky 400
    muted: '#94A3B8',      // Slate 400
    border: '#334155',     // Slate 700
};

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: colors.background,
                foreground: colors.foreground,
                primary: {
                    DEFAULT: colors.primary,
                    foreground: '#FFFFFF',
                },
                secondary: {
                    DEFAULT: colors.secondary,
                    foreground: colors.foreground,
                },
                accent: {
                    DEFAULT: colors.accent,
                    foreground: '#FFFFFF',
                },
                muted: {
                    DEFAULT: colors.muted,
                    foreground: '#F1F5F9',
                },
                border: colors.border,
            },
            backgroundImage: {
                "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
                "gradient-conic":
                    "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
            },
        },
    },
    plugins: [],
};
export default config;
