"use client";

import React, { useState, useEffect } from "react";
import * as Slider from "@radix-ui/react-slider";
import { motion } from "framer-motion";
import { usePlayerStore } from "@/store/player";
import { audioEngine } from "@/lib/audio-engine";

function formatTime(s: number) {
    if (!s || isNaN(s)) return "0:00";
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

export function MobileScrubber() {
    const currentTime = usePlayerStore(s => s.currentTime);
    const duration = usePlayerStore(s => s.duration);
    const setCurrentTime = usePlayerStore(s => s.setCurrentTime);
    const [localTime, setLocalTime] = useState(currentTime);

    useEffect(() => { setLocalTime(currentTime); }, [currentTime]);

    const remaining = (duration || 0) - localTime;

    return (
        <div className="mb-8 w-full px-5 mobile-controls-scrubber">
            <Slider.Root
                className="relative flex items-center select-none touch-none w-full h-10 cursor-pointer group"
                value={[localTime]}
                max={duration || 100}
                onValueChange={(val) => setLocalTime(val[0])}
                onValueCommit={(val) => {
                    const audio = audioEngine.getActiveAudioElement();
                    if (audio) { audio.currentTime = val[0]; setCurrentTime(val[0]); }
                }}
            >
                <Slider.Track className="relative grow rounded-full h-[6px] bg-white/20 overflow-hidden">
                    <Slider.Range className="absolute rounded-full h-full bg-brand shadow-[0_0_10px_rgba(var(--accent-brand-rgb),0.5)]" />
                </Slider.Track>
                <Slider.Thumb className="block w-4 h-4 bg-white rounded-full shadow-xl focus:outline-none scale-100 transition-transform active:scale-150" />
            </Slider.Root>
            <div className="flex justify-between mt-2 tabular-nums text-[12px] font-bold text-white/55 tracking-wider">
                <span>{formatTime(localTime)}</span>
                <span>-{formatTime(remaining > 0 ? remaining : 0)}</span>
            </div>
        </div>
    );
}

export function MiniPlayerProgress() {
    const currentTime = usePlayerStore(s => s.currentTime);
    const duration = usePlayerStore(s => s.duration);

    return (
        <div className="absolute bottom-0 left-6 right-6 h-[2px] overflow-hidden z-[11] rounded-full">
            <motion.div
                className="h-full bg-brand rounded-full"
                animate={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                transition={{ duration: 1, ease: "linear" }}
            />
        </div>
    );
}

export function PCFullScreenScrubber() {
    const currentTime = usePlayerStore(s => s.currentTime);
    const duration = usePlayerStore(s => s.duration);
    const setCurrentTime = usePlayerStore(s => s.setCurrentTime);
    const [localTime, setLocalTime] = useState(currentTime);

    useEffect(() => { setLocalTime(currentTime); }, [currentTime]);

    const remaining = (duration || 0) - localTime;

    return (
        <div className="flex items-center w-full gap-4 max-w-4xl mx-auto opacity-70 hover:opacity-100 transition-opacity">
            <span className="text-[11px] font-semibold text-white/50 w-10 text-right tabular-nums tracking-widest">{formatTime(localTime)}</span>
            <Slider.Root
                className="relative flex items-center select-none touch-none w-full h-5 cursor-pointer group"
                value={[localTime]}
                max={duration || 100}
                onValueChange={(val) => setLocalTime(val[0])}
                onValueCommit={(val) => {
                    const audio = audioEngine.getActiveAudioElement();
                    if (audio) { audio.currentTime = val[0]; setCurrentTime(val[0]); }
                }}
            >
                <Slider.Track className="relative grow rounded-full h-[4px] bg-white/10 overflow-hidden">
                    <Slider.Range className="absolute rounded-full h-full bg-white group-hover:bg-brand transition-colors" />
                </Slider.Track>
                <Slider.Thumb className="block w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none" />
            </Slider.Root>
            <span className="text-[11px] font-semibold text-white/50 w-10 tabular-nums tracking-widest">-{formatTime(remaining > 0 ? remaining : 0)}</span>
        </div>
    );
}

export function PCPlayerBarScrubber() {
    const currentTime = usePlayerStore(s => s.currentTime);
    const duration = usePlayerStore(s => s.duration);
    const setCurrentTime = usePlayerStore(s => s.setCurrentTime);
    const [localTime, setLocalTime] = useState(currentTime);

    useEffect(() => { setLocalTime(currentTime); }, [currentTime]);

    return (
        <div className="flex items-center w-full gap-3 mt-1.5 px-2">
            <span className="text-[11px] font-medium text-[#a7a7a7] w-10 text-right tabular-nums">{formatTime(localTime)}</span>
            <Slider.Root
                className="relative flex items-center select-none touch-none w-full h-4 cursor-pointer group"
                value={[localTime]}
                max={duration || 100}
                onValueChange={(val) => setLocalTime(val[0])}
                onValueCommit={(val) => {
                    const audio = audioEngine.getActiveAudioElement();
                    if (audio) { audio.currentTime = val[0]; setCurrentTime(val[0]); }
                }}
            >
                <Slider.Track className="relative grow rounded-full h-[4px] bg-[#4d4d4d] overflow-hidden">
                    <Slider.Range className="absolute rounded-full h-full bg-white group-hover:bg-[#1db954] transition-colors" />
                </Slider.Track>
                <Slider.Thumb className="block w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none" />
            </Slider.Root>
            <span className="text-[11px] font-medium text-[#a7a7a7] w-10 tabular-nums">{formatTime(duration)}</span>
        </div>
    );
}
