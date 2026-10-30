# Zenify Frontend

High-performance web music streaming client built with **React 19**, **Vite 6**, **TypeScript**, and **Tailwind CSS**.

## Features

- **StudioFX DSP Panel**: Web Audio API audio processor featuring 10-band EQ, 8D spatial sound, convolver reverb, and speed/pitch warper rendered in a right-side glass panel.
- **Synced Multilingual Lyrics**: Sub-second karaoke lyric synchronization with syllable-level typography and autoscroll.
- **Liquid Glassmorphism UI**: Dynamic ambient album artwork mesh backgrounds with glassmorphic cards and miniplayer.
- **Offline Local Audio Player**: In-browser MP3, FLAC, WAV, and AAC local file scanner with ID3 tag extraction.

## Getting Started

First, install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

## Scripts

- `npm run dev` - Start Vite dev server on port 3001
- `npm run build` - Typecheck, run Vite build, and execute pre-rendering
- `npm run preview` - Preview production build locally
