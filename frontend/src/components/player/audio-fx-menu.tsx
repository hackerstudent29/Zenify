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
import { memo } from "react";

const AudioFxMenuComponent = function AudioFxMenu() {
    const audioFx = usePlayerStore(state => state.audioFx);
    const setFx = usePlayerStore(state => state.setFx);

    const eqLabels = ["Bass", "Mid", "Treble"];

    return (
        <div className="w-[320px] max-h-[70vh] overflow-y-auto bg-[#1c1c1e] border border-white/5 rounded-2xl p-6 shadow-2xl space-y-8 scrollbar-hide">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <Activity size={16} className="text-brand" />
                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">Studio Audio Suite</h3>
                </div>
                <button
                    onClick={() => {
                        audioEngine.resume();
                        setFx({ eq: [0, 0, 0], reverb: 'none', is8D: false, direction8D: 'clockwise', speed: 1, pitch: 1 });
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
                    {audioFx.eq.map((val, i) => (
                        <div key={i} className="flex flex-col items-center gap-2">
                            <div className="h-[80px] flex items-center">
                                <Slider.Root
                                    orientation="vertical"
                                    className="relative flex flex-col items-center select-none touch-none h-full w-4"
                                    value={[val]}
                                    max={12}
                                    min={-12}
                                    step={1}
                                    onValueChange={([newVal]) => {
                                        audioEngine.resume();
                                        const newEq = [...audioFx.eq];
                                        newEq[i] = newVal;
                                        setFx({ eq: newEq });
                                    }}
                                    onDoubleClick={() => {
                                        const newEq = [...audioFx.eq];
                                        newEq[i] = 0;
                                        setFx({ eq: newEq });
                                    }}
                                >
                                    <Slider.Track className="bg-white/5 relative grow rounded-full w-[3px]">
                                        <Slider.Range className="absolute bg-brand w-full rounded-full" />
                                    </Slider.Track>
                                    <Slider.Thumb className="block w-3 h-3 bg-white rounded-full shadow-lg focus:outline-none transition-transform active:scale-125" />
                                </Slider.Root>
                            </div>
                            <span className="text-[9px] font-black text-white/30 truncate">{eqLabels[i]}</span>
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
                            onClick={() => { audioEngine.resume(); setFx({ eq: [0, 0, 0] }); }}
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
                                setFx({ eq: isSelected ? [0, 0, 0] : [6, 1, 3] });
                            }}
                            className={cn(
                                "px-2 py-1.5 rounded-lg border text-[9px] font-bold transition-all",
                                JSON.stringify(audioFx.eq) === JSON.stringify([6, 1, 3])
                                    ? "bg-brand/10 border-brand/30 text-brand shadow-[0_0_20px_rgba(var(--accent-brand-rgb),0.1)]"
                                    : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white"
                            )}
                        >
                            Bass Boost
                        </button>
                        <button
                            onClick={() => {
                                audioEngine.resume();
                                const isSelected = JSON.stringify(audioFx.eq) === JSON.stringify([-2, 5, 2]);
                                setFx({ eq: isSelected ? [0, 0, 0] : [-2, 5, 2] });
                            }}
                            className={cn(
                                "px-2 py-1.5 rounded-lg border text-[9px] font-bold transition-all",
                                JSON.stringify(audioFx.eq) === JSON.stringify([-2, 5, 2])
                                    ? "bg-brand/10 border-brand/30 text-brand shadow-[0_0_20px_rgba(var(--accent-brand-rgb),0.1)]"
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
                            onClick={() => { audioEngine.resume(); setFx({ reverb: 'none' }); }}
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
                                setFx({ reverb: audioFx.reverb === 'warehouse' ? 'none' : 'warehouse' });
                            }}
                            className={cn(
                                "px-2 py-1.5 rounded-lg border text-[9px] font-bold transition-all",
                                audioFx.reverb === 'warehouse' ? "bg-brand/10 border-brand/30 text-brand shadow-[0_0_20px_rgba(var(--accent-brand-rgb),0.1)]" : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white"
                            )}
                        >
                            Small Hall
                        </button>
                        <button
                            onClick={() => {
                                audioEngine.resume();
                                setFx({ reverb: audioFx.reverb === 'cathedral' ? 'none' : 'cathedral' });
                            }}
                            className={cn(
                                "px-2 py-1.5 rounded-lg border text-[9px] font-bold transition-all",
                                audioFx.reverb === 'cathedral' ? "bg-brand/10 border-brand/30 text-brand shadow-[0_0_20px_rgba(var(--accent-brand-rgb),0.1)]" : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white"
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
                            setFx({ is8D: !audioFx.is8D });
                        }}
                        className={cn(
                            "w-full flex items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-300",
                            audioFx.is8D
                                ? "bg-brand/10 border-brand/50 text-brand shadow-[0_0_30px_rgba(var(--accent-brand-rgb),0.15)]"
                                : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
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
                                    className="absolute inset-y-1 bg-brand rounded-lg shadow-[0_0_20px_rgba(var(--accent-brand-rgb),0.3)]"
                                    initial={false}
                                    animate={{
                                        left: audioFx.direction8D === 'clockwise' ? '4px' : 'calc(50% + 2px)',
                                        right: audioFx.direction8D === 'clockwise' ? 'calc(50% + 2px)' : '4px',
                                    }}
                                    transition={{ type: "tween", duration: 0.15, ease: "circOut" }}
                                />

                                <button
                                    onClick={() => setFx({ direction8D: 'clockwise' })}
                                    className={cn(
                                        "relative flex-1 py-1.5 z-10 text-[10px] font-black uppercase tracking-widest transition-none",
                                        audioFx.direction8D === 'clockwise' ? "text-black" : "text-brand/60 hover:text-brand"
                                    )}
                                >
                                    Clockwise
                                </button>
                                <button
                                    onClick={() => setFx({ direction8D: 'counter-clockwise' })}
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
                    <Slider.Root
                        className="relative flex items-center select-none touch-none h-4 group cursor-pointer"
                        value={[audioFx.speed * 100]}
                        max={200}
                        min={50}
                        onValueChange={([val]) => {
                            audioEngine.resume();
                            setFx({ speed: val / 100 });
                        }}
                        onDoubleClick={() => setFx({ speed: 1, pitch: 1 })}
                    >
                        <Slider.Track className="bg-white/5 relative grow rounded-full h-[3px]">
                            <Slider.Range className="absolute bg-white/40 h-full group-hover:bg-brand transition-colors" />
                        </Slider.Track>
                        <Slider.Thumb className="block w-2.5 h-2.5 bg-white rounded-full shadow-2xl focus:outline-none focus:ring-1 focus:ring-brand" />
                    </Slider.Root>
                </div>
            </div>
        </div>
    );
}

export const AudioFxMenu = memo(AudioFxMenuComponent);
