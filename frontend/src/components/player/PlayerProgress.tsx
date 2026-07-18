"use client";

import React, { useState, useEffect } from "react";
import * as Slider from "@radix-ui/react-slider";
import { motion } from "framer-motion";
import { usePlayerStore } from "@/store/player";
import { audioEngine } from "@/lib/audio-engine";
import { cn } from "@/lib/utils";

function formatTime(s: number) {
 if (!s || isNaN(s)) return "0:00";
 const mins = Math.floor(s / 60);
 const secs = Math.floor(s % 60).toString().padStart(2, '0');
 return `${mins}:${secs}`;
}

export function MobileScrubber({ isLyricsOpen }: { isLyricsOpen?: boolean }) {
 const currentTime = usePlayerStore(s => s.currentTime);
 const duration = usePlayerStore(s => s.duration);
 const setCurrentTime = usePlayerStore(s => s.setCurrentTime);
 const [localTime, setLocalTime] = useState(currentTime);
 const lastSeekTime = React.useRef(0);

 useEffect(() => { 
 if (Date.now() - lastSeekTime.current > 500) {
 setLocalTime(currentTime); 
 }
 }, [currentTime]);

 const remaining = (duration || 0) - localTime;

 return (
 <div className={cn("mb-4 w-full mobile-controls-scrubber transition-all duration-500", isLyricsOpen ? "px-0" : "px-0")}>
 <Slider.Root
 className="relative flex items-center select-none touch-none w-full h-7 cursor-pointer group"
 value={[localTime]}
 max={duration || 100}
 onValueChange={(val) => {
 setLocalTime(val[0]);
 lastSeekTime.current = Date.now();
 const audio = audioEngine.getActiveAudioElement();
 if (audio) { audio.currentTime = val[0]; setCurrentTime(val[0]); }
 }}
 onValueCommit={(val) => {
 lastSeekTime.current = Date.now();
 const audio = audioEngine.getActiveAudioElement();
 if (audio) { audio.currentTime = val[0]; setCurrentTime(val[0]); }
 }}
 >
 <Slider.Track className="relative grow rounded-full h-2 bg-white/10 backdrop-blur-md border border-white/5 overflow-hidden">
 <Slider.Range className="opacity-0" />
 <motion.div 
  className={cn(
    "absolute top-0 left-0 bottom-0 bg-brand-gradient rounded-full pointer-events-none",
    !isLyricsOpen && "shadow-[0_0_10px_rgba(var(--accent-brand-rgb),0.5)]"
  )}
  initial={false}
  animate={isLyricsOpen ? undefined : { width: `${(duration ? (localTime / duration) * 100 : 0)}%` }}
  style={isLyricsOpen ? { width: `${(duration ? (localTime / duration) * 100 : 0)}%` } : undefined}
  transition={isLyricsOpen ? undefined : { type: "tween", duration: 0.15, ease: "easeOut" }}
  />
 </Slider.Track>
 <Slider.Thumb className="block w-4 h-4 opacity-0 pointer-events-none" />
 </Slider.Root>
 <div className="flex justify-between mt-1 tabular-nums text-[13px] font-bold text-white/80 tracking-wider">
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
 <div className="absolute bottom-0 left-5 right-5 h-[2px] overflow-hidden z-[11] rounded-full bg-white/20 backdrop-blur-sm border-none">
 <motion.div
 className="h-full bg-brand-gradient"
 animate={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
 transition={{ duration: 1, ease: "linear" }}
 />
 </div>
 );
}

export function PCFullScreenScrubber({ isLyricsOpen }: { isLyricsOpen?: boolean }) {
	const currentTime = usePlayerStore(s => s.currentTime);
	const duration = usePlayerStore(s => s.duration);
	const setCurrentTime = usePlayerStore(s => s.setCurrentTime);
	const [localTime, setLocalTime] = useState(currentTime);
	const lastSeekTime = React.useRef(0);

	useEffect(() => { 
		if (Date.now() - lastSeekTime.current > 500) {
			setLocalTime(currentTime); 
		}
	}, [currentTime]);

	const remaining = (duration || 0) - localTime;

	return (
		<div className={cn("flex items-center w-full gap-4 mx-auto transition-all duration-500", isLyricsOpen ? "max-w-4xl" : "max-w-3xl")}>
			<span className="text-[13px] font-bold text-white/80 w-12 text-right tabular-nums tracking-widest">{formatTime(localTime)}</span>
			<Slider.Root
				className="relative flex items-center select-none touch-none w-full h-7 cursor-pointer group"
				value={[localTime]}
				max={duration || 100}
				onValueChange={(val) => {
					setLocalTime(val[0]);
					lastSeekTime.current = Date.now();
					const audio = audioEngine.getActiveAudioElement();
					if (audio) { audio.currentTime = val[0]; setCurrentTime(val[0]); }
				}}
				onValueCommit={(val) => {
					lastSeekTime.current = Date.now();
					const audio = audioEngine.getActiveAudioElement();
					if (audio) { audio.currentTime = val[0]; setCurrentTime(val[0]); }
				}}
			>
				<Slider.Track className="relative grow rounded-full h-2 bg-white/10 backdrop-blur-sm border border-white/5 overflow-hidden">
					<Slider.Range className="opacity-0" />
					<motion.div 
						className={cn(
							"absolute top-0 left-0 bottom-0 bg-brand-gradient rounded-full pointer-events-none",
							!isLyricsOpen && "group-hover:shadow-[0_0_10px_rgba(var(--accent-brand-rgb),0.5)] transition-shadow"
						)}
						initial={false}
						animate={isLyricsOpen ? undefined : { width: `${(duration ? (localTime / duration) * 100 : 0)}%` }}
						style={isLyricsOpen ? { width: `${(duration ? (localTime / duration) * 100 : 0)}%` } : undefined}
						transition={isLyricsOpen ? undefined : { type: "tween", duration: 0.15, ease: "easeOut" }}
					/>
				</Slider.Track>
				<Slider.Thumb className="block w-4 h-4 opacity-0 pointer-events-none transition-transform" />
			</Slider.Root>
			<span className="text-[13px] font-bold text-white/80 w-12 tabular-nums tracking-widest">-{formatTime(remaining > 0 ? remaining : 0)}</span>
		</div>
	);
}

export function PCPlayerBarScrubber() {
 const currentTime = usePlayerStore(s => s.currentTime);
 const duration = usePlayerStore(s => s.duration);
 const setCurrentTime = usePlayerStore(s => s.setCurrentTime);
 const [localTime, setLocalTime] = useState(currentTime);
 const lastSeekTime = React.useRef(0);

 useEffect(() => { 
 if (Date.now() - lastSeekTime.current > 500) {
 setLocalTime(currentTime); 
 }
 }, [currentTime]);

 return (
 <div className="flex items-center w-full gap-3 mt-1.5 px-2">
 <span className="text-[11px] font-medium text-[#a7a7a7] w-10 text-right tabular-nums">{formatTime(localTime)}</span>
 <Slider.Root
 className="relative flex items-center select-none touch-none w-full h-6 cursor-pointer group"
 value={[localTime]}
 max={duration || 100}
 onValueChange={(val) => {
 setLocalTime(val[0]);
 lastSeekTime.current = Date.now();
 const audio = audioEngine.getActiveAudioElement();
 if (audio) { audio.currentTime = val[0]; setCurrentTime(val[0]); }
 }}
 onValueCommit={(val) => {
 lastSeekTime.current = Date.now();
 const audio = audioEngine.getActiveAudioElement();
 if (audio) { audio.currentTime = val[0]; setCurrentTime(val[0]); }
 }}
 >
 <Slider.Track className="relative grow rounded-full h-2 bg-white/10 backdrop-blur-sm border border-white/5 overflow-hidden">
 <Slider.Range className="opacity-0" />
 <motion.div 
 className="absolute top-0 left-0 bottom-0 bg-brand-gradient group-hover:shadow-[0_0_10px_rgba(var(--accent-brand-rgb),0.5)] pointer-events-none rounded-full transition-shadow"
 initial={false}
 animate={{ width: `${(duration ? (localTime / duration) * 100 : 0)}%` }}
 transition={{ type: "tween", duration: 0.15, ease: "easeOut" }}
 />
 </Slider.Track>
 <Slider.Thumb className="block w-4 h-4 opacity-0 pointer-events-none transition-transform" />
 </Slider.Root>
 <span className="text-[11px] font-medium text-[#a7a7a7] w-10 tabular-nums">{formatTime(duration)}</span>
 </div>
 );
}
