import type { Config } from "tailwindcss";
import { colors } from './src/lib/colors';

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
