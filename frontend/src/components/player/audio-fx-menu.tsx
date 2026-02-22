"use client";

import { usePlayerStore } from "@/store/player";
import {
    SlidersHorizontal,
    Activity,
    Clock,
    Waves,
    Disc
} from "lucide-react";
import * as Slider from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";
import { audioEngine } from "@/lib/audio-engine";

export function AudioFxMenu() {
    const { audioFx, setFx } = usePlayerStore();

    const eqLabels = ["Bass", "Mid", "Treble"];

    return (
        <div className="w-[320px] bg-zinc-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 shadow-2xl space-y-8">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <Activity size={16} className="text-rose-500" />
                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">Studio Audio Suite</h3>
                </div>
                <button
                    onClick={() => {
                        audioEngine.resume();
                        setFx({ eq: [0, 0, 0], reverb: 'none', is8D: false, speed: 1, pitch: 1 });
                    }}
                    className="text-[9px] font-bold uppercase tracking-widest text-rose-500/70 hover:text-rose-500 transition-colors"
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
                                >
                                    <Slider.Track className="bg-white/5 relative grow rounded-full w-[3px]">
                                        <Slider.Range className="absolute bg-rose-500 w-full rounded-full" />
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
                        <button onClick={() => { audioEngine.resume(); setFx({ eq: [0, 0, 0] }); }} className="px-2 py-1.5 rounded-lg border border-white/10 text-[9px] font-bold text-white/60 hover:bg-white/5 hover:text-white transition-all">Flat</button>
                        <button onClick={() => { audioEngine.resume(); setFx({ eq: [6, 1, 3] }); }} className="px-2 py-1.5 rounded-lg border border-white/10 text-[9px] font-bold text-white/60 hover:bg-white/5 hover:text-white transition-all">Bass Boost</button>
                        <button onClick={() => { audioEngine.resume(); setFx({ eq: [-2, 5, 2] }); }} className="px-2 py-1.5 rounded-lg border border-white/10 text-[9px] font-bold text-white/60 hover:bg-white/5 hover:text-white transition-all">Vocal</button>
                    </div>
                </div>

                {/* Reverb Presets */}
                <div className="space-y-2 pt-2">
                    <div className="flex justify-between text-[8px] font-bold text-white/30 uppercase tracking-widest">
                        <span>Reverb Space</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <button onClick={() => { audioEngine.resume(); setFx({ reverb: 'none' }); }} className={cn("px-2 py-1.5 rounded-lg border text-[9px] font-bold transition-all", audioFx.reverb === 'none' ? "bg-rose-500/10 border-rose-500/30 text-rose-500" : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white")}>None</button>
                        <button onClick={() => { audioEngine.resume(); setFx({ reverb: 'warehouse' }); }} className={cn("px-2 py-1.5 rounded-lg border text-[9px] font-bold transition-all", audioFx.reverb === 'warehouse' ? "bg-rose-500/10 border-rose-500/30 text-rose-500" : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white")}>Small Hall</button>
                        <button onClick={() => { audioEngine.resume(); setFx({ reverb: 'cathedral' }); }} className={cn("px-2 py-1.5 rounded-lg border text-[9px] font-bold transition-all", audioFx.reverb === 'cathedral' ? "bg-rose-500/10 border-rose-500/30 text-rose-500" : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white")}>Church</button>
                    </div>
                </div>
            </div>

            {/* Spatial & 8D */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Waves size={14} className="text-white/40" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">Spatial Engine</span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            audioEngine.resume();
                            setFx({ is8D: !audioFx.is8D });
                        }}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-300",
                            audioFx.is8D
                                ? "bg-rose-500/10 border-rose-500/30 text-rose-500"
                                : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                        )}
                    >
                        <Disc size={14} className={cn(audioFx.is8D && "animate-spin")} style={{ animationDuration: '3s' }} />
                        <span className="text-[10px] font-black uppercase">8D Audio</span>
                    </button>
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
                    >
                        <Slider.Track className="bg-white/5 relative grow rounded-full h-[3px]">
                            <Slider.Range className="absolute bg-white/40 h-full group-hover:bg-rose-500 transition-colors" />
                        </Slider.Track>
                        <Slider.Thumb className="block w-2.5 h-2.5 bg-white rounded-full shadow-2xl focus:outline-none focus:ring-1 focus:ring-rose-500" />
                    </Slider.Root>
                </div>
            </div>
        </div>
    );
}
