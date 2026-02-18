import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: '#0E0F13', // bg
                surface: '#15171C',    // surface
                elevated: '#1B1D24',   // elevated
                border: 'rgba(255,255,255,0.05)', // border

                primary: '#CFC8B6',    // accent (warm sand)
                primarySoft: 'rgba(207,200,182,0.12)', // accentSoft

                textPrimary: '#F2F2F3',
                textSecondary: '#A3A4AB',
                textMuted: '#64666F',
                danger: '#D06A6A',

                // Keep these for compatibility if needed, but map them to new system where possible
                foreground: '#F2F2F3',
                secondary: '#1B1D24',
                muted: '#64666F',
                accent: '#CFC8B6',
            },
            fontFamily: {
                sans: ['var(--font-inter)', 'sans-serif'], // We'll add Inter in layout
            },
            borderRadius: {
                'card': '10px',
                'player': '14px',
            },
            spacing: {
                'section': '42px',
                'internal': '18px',
            }
        },
    },
    plugins: [],
};
export default config;
