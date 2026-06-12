"use client";

import { usePlayerStore } from "@/store/player";
import {
 SlidersHorizontal,
 Activity,
 Clock,
 Waves,
 Disc
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";
import { audioEngine } from "@/lib/audio-engine";
import { memo, useState, useEffect } from "react";

interface AudioFxMenuProps {
 className?: string;
}

const AudioFxMenuComponent = function AudioFxMenu({ className }: AudioFxMenuProps) {
 const audioFx = usePlayerStore(state => state.audioFx);
 const setFx = usePlayerStore(state => state.setFx);

 const [localEq, setLocalEq] = useState(audioFx.eq);
 useEffect(() => {
 setLocalEq(audioFx.eq);
 }, [audioFx.eq]);

 const eqLabels = ["Bass", "Mid", "Treble"];

 return (
 <div className={cn("flex flex-col space-y-8 scrollbar-hide", className)}>
 <div className="flex items-center justify-between pb-2 border-b border-white/5">
 <div className="flex items-center gap-2">
 <Activity size={16} className="text-brand" />
 <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">Studio Audio Suite</h3>
 </div>
 <button
 onClick={() => {
 audioEngine.resume();
 audioEngine.resetAll();
 setFx({ eq: [0, 0, 0], reverb: 'none', is8D: false, direction8D: 'clockwise', speed8D: 0.15, speed: 1, pitch: 1 });
 }}
 className="text-[9px] font-bold uppercase tracking-widest text-brand/70 hover:text-brand transition-colors"
 >
 Reset All
 </button>
 </div>


 {/* EQ Section */}
 <div className="space-y-4">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <SlidersHorizontal size={14} className="text-white/40" />
 <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">Equalizer</span>
 </div>
 </div>
 <div className="grid grid-cols-3 gap-4 pb-4 border-b border-white/5">
 {localEq.map((val, i) => (
 <div key={i} className="flex flex-col items-center gap-3">
 {/* Generous height + wide touch zone for mobile */}
 <div
 className="h-[100px] w-10 flex items-center justify-center"
 style={{ touchAction: 'none' }}
 onTouchMove={(e) => e.stopPropagation()}
 >
 <Slider.Root
 orientation="vertical"
 className="relative flex flex-col items-center select-none h-full"
 style={{ width: 16, touchAction: 'none' }}
 value={[val]}
 max={12}
 min={-12}
 step={1}
 onValueChange={([newVal]) => {
 audioEngine.resume();
 audioEngine.setEq(i, newVal);
 const newEq = [...localEq];
 newEq[i] = newVal;
 setLocalEq(newEq);
 }}
 onValueCommit={([newVal]) => {
 const newEq = [...localEq];
 newEq[i] = newVal;
 setFx({ eq: newEq });
 }}
 onDoubleClick={() => {
 audioEngine.setEq(i, 0);
 const newEq = [...localEq];
 newEq[i] = 0;
 setLocalEq(newEq);
 setFx({ eq: newEq });
 }}
 >
 <Slider.Track className="bg-white/10 relative grow rounded-full w-[4px]">
 <Slider.Range className="absolute bg-brand w-full rounded-full" />
 </Slider.Track>
 {/* Bigger thumb = easier to grab on mobile */}
 <Slider.Thumb
 className="block w-5 h-5 bg-white rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.6)] focus:outline-none transition-transform cursor-grab active:cursor-grabbing"
 style={{ touchAction: 'none' }}
 />
 </Slider.Root>
 </div>
 <div className="text-center">
 <span className="text-[9px] font-black text-white/30 uppercase tracking-wider">{eqLabels[i]}</span>
 <div className="text-[8px] text-white/20 font-mono tabular-nums">{val > 0 ? `+${val}` : val}</div>
 </div>
 </div>
 ))}
 </div>

 {/* EQ Presets */}
 <div className="space-y-2">
 <div className="flex justify-between text-[8px] font-bold text-white/30 uppercase tracking-widest">
 <span>EQ Presets</span>
 </div>
 <div className="grid grid-cols-3 gap-2">
 <button
 onClick={() => { 
 audioEngine.resume(); 
 [0,1,2].forEach(idx => audioEngine.setEq(idx, 0));
 setFx({ eq: [0, 0, 0] }); 
 }}
 className={cn(
 "px-2 py-1.5 rounded-lg border text-[9px] font-bold transition-all",
 JSON.stringify(audioFx.eq) === JSON.stringify([0, 0, 0])
 ? "bg-white/5 border-white/20 text-white"
 : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white"
 )}
 >
 Flat
 </button>
 <button
 onClick={() => {
 audioEngine.resume();
 const isSelected = JSON.stringify(audioFx.eq) === JSON.stringify([6, 1, 3]);
 const targetEq = isSelected ? [0, 0, 0] : [6, 1, 3];
 targetEq.forEach((val, idx) => audioEngine.setEq(idx, val));
 setFx({ eq: targetEq });
 }}
 className={cn(
 "px-2 py-1.5 rounded-lg border text-[9px] font-bold transition-all",
 JSON.stringify(audioFx.eq) === JSON.stringify([6, 1, 3])
 ? "bg-brand/10 border-brand/30 text-brand shadow-sm"
 : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white"
 )}
 >
 Bass Boost
 </button>
 <button
 onClick={() => {
 audioEngine.resume();
 const isSelected = JSON.stringify(audioFx.eq) === JSON.stringify([-2, 5, 2]);
 const targetEq = isSelected ? [0, 0, 0] : [-2, 5, 2];
 targetEq.forEach((val, idx) => audioEngine.setEq(idx, val));
 setFx({ eq: targetEq });
 }}
 className={cn(
 "px-2 py-1.5 rounded-lg border text-[9px] font-bold transition-all",
 JSON.stringify(audioFx.eq) === JSON.stringify([-2, 5, 2])
 ? "bg-brand/10 border-brand/30 text-brand shadow-sm"
 : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white"
 )}
 >
 Vocal
 </button>
 </div>
 </div>

 {/* Reverb Presets */}
 <div className="space-y-2 pt-2">
 <div className="flex justify-between text-[8px] font-bold text-white/30 uppercase tracking-widest">
 <span>Reverb Space</span>
 </div>
 <div className="grid grid-cols-3 gap-2">
 <button
 onClick={() => { 
 audioEngine.resume(); 
 audioEngine.setReverb('none');
 audioEngine.setReverbMix(0);
 setFx({ reverb: 'none' }); 
 }}
 className={cn(
 "px-2 py-1.5 rounded-lg border text-[9px] font-bold transition-all",
 audioFx.reverb === 'none' ? "bg-white/5 border-white/20 text-white" : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white"
 )}
 >
 None
 </button>
 <button
 onClick={() => {
 audioEngine.resume();
 const newVal = audioFx.reverb === 'warehouse' ? 'none' : 'warehouse';
 audioEngine.setReverb(newVal);
 audioEngine.setReverbMix(newVal === 'none' ? 0 : 0.6);
 setFx({ reverb: newVal });
 }}
 className={cn(
 "px-2 py-1.5 rounded-lg border text-[9px] font-bold transition-all",
 audioFx.reverb === 'warehouse' ? "bg-zinc-900/10 border-brand/30 text-brand shadow-sm" : "border-white/10 text-brand/60 hover:bg-white/5 hover:text-brand"
 )}
 >
 Small Hall
 </button>
 <button
 onClick={() => {
 audioEngine.resume();
 const newVal = audioFx.reverb === 'cathedral' ? 'none' : 'cathedral';
 audioEngine.setReverb(newVal);
 audioEngine.setReverbMix(newVal === 'none' ? 0 : 0.7);
 setFx({ reverb: newVal });
 }}
 className={cn(
 "px-2 py-1.5 rounded-lg border text-[9px] font-bold transition-all",
 audioFx.reverb === 'cathedral' ? "bg-zinc-900/10 border-brand/30 text-brand shadow-sm" : "border-white/10 text-brand/60 hover:bg-white/5 hover:text-brand"
 )}
 >
 Church
 </button>
 </div>
 </div>
 </div>

 {/* Spatial & 8D */}
 <div className="space-y-4">
 <div className="flex items-center gap-2">
 <Waves size={14} className="text-white/40" />
 <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">Spatial Engine</span>
 </div>
 <div className="space-y-3">
 <motion.button
 whileHover={{ scale: 1.01 }}
 whileTap={{ scale: 0.98 }}
 onClick={() => {
 audioEngine.resume();
 const nextVal = !audioFx.is8D;
 audioEngine.toggle8D(nextVal, audioFx.direction8D, audioFx.speed8D);
 setFx({ is8D: nextVal });
 }}
 className={cn(
 "w-full flex items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-300",
 audioFx.is8D
 ? "bg-zinc-900/10 border-brand/50 text-brand shadow-md"
 : "bg-white/5 border-white/5 text-brand/40 hover:bg-white/10"
 )}
 >
 <Disc size={14} className={cn(audioFx.is8D && "animate-spin")} style={{ animationDuration: '3s' }} />
 <span className="text-[10px] font-black uppercase tracking-widest">8D Spatializer</span>
 </motion.button>

 <AnimatePresence>
 {audioFx.is8D && (
 <motion.div
 initial={{ opacity: 0, height: 0 }}
 animate={{ opacity: 1, height: "auto" }}
 exit={{ opacity: 0, height: 0 }}
 className="relative flex p-1 bg-black/40 rounded-xl border border-white/5 overflow-hidden"
 >
 {/* Sliding Background - Performance Optimized */}
 <motion.div
 className="absolute inset-y-1 bg-brand rounded-lg shadow-sm"
 initial={false}
 animate={{
 left: audioFx.direction8D === 'clockwise' ? '4px' : 'calc(50% + 2px)',
 right: audioFx.direction8D === 'clockwise' ? 'calc(50% + 2px)' : '4px',
 }}
 transition={{ type: "tween", duration: 0.15, ease: "circOut" }}
 />

 <button
 onClick={() => {
 audioEngine.toggle8D(true, 'clockwise', audioFx.speed8D);
 setFx({ direction8D: 'clockwise' });
 }}
 className={cn(
 "relative flex-1 py-1.5 z-10 text-[10px] font-black uppercase tracking-widest transition-none",
 audioFx.direction8D === 'clockwise' ? "text-black" : "text-brand/60 hover:text-brand"
 )}
 >
 Clockwise
 </button>
 <button
 onClick={() => {
 audioEngine.toggle8D(true, 'counter-clockwise', audioFx.speed8D);
 setFx({ direction8D: 'counter-clockwise' });
 }}
 className={cn(
 "relative flex-1 py-1.5 z-10 text-[10px] font-black uppercase tracking-widest transition-none",
 audioFx.direction8D === 'counter-clockwise' ? "text-black" : "text-brand/60 hover:text-brand"
 )}
 >
 Counter
 </button>
 </motion.div>
 )}
 </AnimatePresence>


 </div>
 </div>

 {/* DJ Controls */}
 <div className="space-y-4">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Clock size={14} className="text-white/40" />
 <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">DJ Speed / Pitch</span>
 </div>
 </div>

 <div className="grid grid-cols-2 gap-2">
 <button
 onClick={() => {
 audioEngine.resume();
 if (audioFx.speed === 1.5 && audioFx.pitch === 1.5) {
 setFx({ speed: 1, pitch: 1 });
 } else {
 setFx({ speed: 1.5, pitch: 1.5 });
 }
 }}
 className={cn(
 "flex flex-col items-center p-2 rounded-xl border transition-all",
 (audioFx.speed === 1.5 && audioFx.pitch === 1.5)
 ? "bg-pink-500/10 border-pink-500/20 text-pink-500"
 : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
 )}
 >
 <span className="text-[9px] font-black uppercase">Nightcore</span>
 <span className="text-[7px] opacity-60">1.5x Speed Up</span>
 </button>
 <button
 onClick={() => {
 audioEngine.resume();
 if (audioFx.speed === 0.75 && audioFx.pitch === 0.75) {
 setFx({ speed: 1, pitch: 1 });
 } else {
 setFx({ speed: 0.75, pitch: 0.75 });
 }
 }}
 className={cn(
 "flex flex-col items-center p-2 rounded-xl border transition-all",
 (audioFx.speed === 0.75 && audioFx.pitch === 0.75)
 ? "bg-blue-500/10 border-blue-500/20 text-blue-500"
 : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
 )}
 >
 <span className="text-[9px] font-black uppercase">Daycore</span>
 <span className="text-[7px] opacity-60">0.75x Slowed</span>
 </button>
 </div>

 <div className="space-y-3 px-1">
 <div className="flex justify-between text-[10px] font-bold text-white/50 tracking-widest uppercase">
 <span>Song Speed</span>
 <span>{audioFx.speed.toFixed(2)}x</span>
 </div>
 <div
 style={{ touchAction: 'none' }}
 onTouchMove={(e) => e.stopPropagation()}
 >
 <Slider.Root
 className="relative flex items-center select-none h-6 cursor-pointer"
 style={{ touchAction: 'none' }}
 value={[audioFx.speed * 100]}
 max={200}
 min={50}
 onValueChange={([val]) => {
 const newSpeed = val / 100;
 audioEngine.resume();
 audioEngine.setPlaybackSpeed(newSpeed, audioFx.pitch === 1);
 setFx({ speed: newSpeed });
 }}
 onDoubleClick={() => setFx({ speed: 1, pitch: 1 })}
 >
 <Slider.Track className="bg-white/8 relative grow rounded-full h-[4px]">
 <Slider.Range className="absolute bg-brand/60 h-full" />
 </Slider.Track>
 <Slider.Thumb
 className="block w-4 h-4 bg-white rounded-full shadow-2xl focus:outline-none active:scale-125 transition-transform"
 style={{ touchAction: 'none' }}
 />
 </Slider.Root>
 </div>
 </div>
 </div>
 </div>
 );
}

export const AudioFxMenu = memo(AudioFxMenuComponent);
