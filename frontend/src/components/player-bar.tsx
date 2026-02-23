"use client";

import { usePlayerStore } from "@/store/player";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Shuffle, Repeat, ListMusic, Maximize2, Settings2 } from "lucide-react";
import { cn, getMediaUrl } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import ElasticSlider from "./ui/elastic-slider";
import { audioEngine } from "@/lib/audio-engine";
import { AudioFxMenu } from "./player/audio-fx-menu";

export function PlayerBar() {
    const {
        currentTrack,
        isPlaying,
        togglePlay,
        playNext,
        playPrev,
        volume,
        setVolume,
        setIsPlaying,
        isShuffled,
        toggleShuffle,
        repeatMode,
        toggleRepeat,
        audioFx,
        setFx,
        queue
    } = usePlayerStore();

    const audioRefA = useRef<HTMLAudioElement>(null);
    const audioRefB = useRef<HTMLAudioElement>(null);
    const [activeAudio, setActiveAudio] = useState<'A' | 'B'>('A');
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [loopA, setLoopA] = useState<number | null>(null);
    const [loopB, setLoopB] = useState<number | null>(null);
    const [showFx, setShowFx] = useState(false);
    const fxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (fxRef.current && !fxRef.current.contains(event.target as Node)) {
                setShowFx(false);
            }
        };

        if (showFx) {
            document.addEventListener("mousedown", handleClickOutside);
        } else {
            document.removeEventListener("mousedown", handleClickOutside);
        }

        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showFx]);

    const getActiveRef = () => activeAudio === 'A' ? audioRefA : audioRefB;
    const getNextRef = () => activeAudio === 'A' ? audioRefB : audioRefA;

    // Initialize Audio Engine
    useEffect(() => {
        if (audioRefA.current && audioRefB.current) {
            audioEngine.init(audioRefA.current, audioRefB.current);
        }
    }, []);

    // Apply FX
    const applyFx = () => {
        audioEngine.setVolume(volume);
        audioEngine.setEq(0, audioFx.eq[0]); // Bass
        audioEngine.setEq(1, audioFx.eq[1]); // Mid
        audioEngine.setEq(2, audioFx.eq[2]); // Treble
        audioEngine.toggle8D(audioFx.is8D);
        audioEngine.setPlaybackSpeed(audioFx.speed, audioFx.pitch === 1);
        audioEngine.setReverb(audioFx.reverb);
        audioEngine.setReverbMix(audioFx.reverb === 'none' ? 0 : 0.3);
    };

    // Sync Audio FX
    useEffect(() => {
        const activeRef = getActiveRef();
        if (activeRef.current) {
            applyFx();
        }
    }, [volume, audioFx, activeAudio]);

    // Track Progress
    useEffect(() => {
        const activeRef = getActiveRef();
        if (activeRef.current) {
            const handleTimeUpdate = () => {
                setCurrentTime(activeRef.current?.currentTime || 0);
                setDuration(activeRef.current?.duration || 0);
            };
            activeRef.current.addEventListener('timeupdate', handleTimeUpdate);
            return () => activeRef.current?.removeEventListener('timeupdate', handleTimeUpdate);
        }
    }, [activeAudio, currentTrack]);

    useEffect(() => {
        const activeRef = getActiveRef();
        if (currentTrack && activeRef.current) {
            const src = getMediaUrl(currentTrack.audioUrl);
            if (activeRef.current.src !== src) {
                activeRef.current.src = src;
                if (isPlaying) {
                    audioEngine.resume();
                    applyFx();
                    activeRef.current.play().catch(() => { });
                }
            }
        }
    }, [currentTrack]);

    useEffect(() => {
        const activeRef = getActiveRef();
        if (activeRef.current) {
            if (isPlaying) {
                audioEngine.resume(); // Ensure context is awake before playing
                applyFx();
                activeRef.current.play().catch(() => { });
            } else {
                activeRef.current.pause();
            }
        }
    }, [isPlaying]);

    return (
        <AnimatePresence>
            {currentTrack && (
                <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    className={cn(
                        "w-full h-full md:px-8 flex items-center transition-all duration-300 relative",
                        "px-4 justify-between"
                    )}
                >
                    {/* Mobile Progress Bar - Top Overlay */}
                    <div className="md:hidden absolute top-0 left-0 right-0 h-[2px] bg-white/5 overflow-hidden">
                        <motion.div
                            initial={false}
                            animate={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                            className="h-full bg-accent"
                            transition={{ ease: "linear", duration: 0.2 }}
                        />
                    </div>

                    <audio ref={audioRefA} crossOrigin="anonymous" onEnded={playNext} />
                    <audio ref={audioRefB} crossOrigin="anonymous" onEnded={playNext} className="hidden" />

                    {/* Track Info (Left) */}
                    <div className="flex items-center gap-3 md:gap-4 md:w-1/3 min-w-0 pr-4">
                        <div className="relative h-10 w-10 md:h-14 md:w-14 group flex-shrink-0">
                            <img
                                src={getMediaUrl(currentTrack.coverUrl) || `https://api.dicebear.com/7.x/identicon/svg?seed=${currentTrack.id}`}
                                alt="Cover"
                                className="h-full w-full rounded-md object-cover shadow-lg"
                            />
                        </div>
                        <div className="flex flex-col min-w-0 overflow-hidden">
                            <h4 className="text-[12px] md:text-[13px] font-bold text-foreground truncate leading-tight tracking-tight">
                                {currentTrack.title}
                            </h4>
                            <p className="text-[10px] md:text-[11px] text-muted font-medium truncate mt-0.5 hover:text-foreground cursor-pointer transition-colors">
                                {currentTrack.artist.name}
                            </p>
                        </div>
                    </div>

                    {/* Main Controls (Center) */}
                    <div className="flex flex-1 md:w-1/3 flex-col items-center justify-center gap-2">
                        <div className="flex items-center justify-center gap-3 md:gap-5 w-full">
                            <button
                                onClick={() => { audioEngine.resume(); toggleShuffle(); }}
                                className={cn(
                                    "p-2 rounded-full transition-all duration-200 active:scale-90 hidden md:block",
                                    isShuffled ? "text-accent bg-accent/10" : "text-white/20 hover:text-white"
                                )}
                            >
                                <Shuffle size={16} strokeWidth={2.5} />
                            </button>

                            <button
                                onClick={() => { audioEngine.resume(); playPrev(); }}
                                className="p-2 text-rose-500/80 hover:text-rose-500 transition-all active:scale-90 shadow-glow"
                            >
                                <SkipBack size={20} fill="currentColor" strokeWidth={0} />
                            </button>

                            <button
                                onClick={() => {
                                    audioEngine.resume();
                                    togglePlay();
                                }}
                                className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center text-white bg-white/5 rounded-full hover:scale-110 hover:bg-white/10 transition-all active:scale-95"
                            >
                                {isPlaying ? <Pause size={22} fill="currentColor" strokeWidth={0} /> : <Play size={22} fill="currentColor" strokeWidth={0} className="ml-1" />}
                            </button>

                            <button
                                onClick={() => { audioEngine.resume(); playNext(); }}
                                className="p-2 text-rose-500/80 hover:text-rose-500 transition-all active:scale-90 shadow-glow"
                            >
                                <SkipForward size={20} fill="currentColor" strokeWidth={0} />
                            </button>

                            <button
                                onClick={() => { audioEngine.resume(); toggleRepeat(); }}
                                className={cn(
                                    "p-2 rounded-full transition-all duration-200 active:scale-90 hidden md:block",
                                    repeatMode !== 'off' ? "text-accent bg-accent/10" : "text-white/20 hover:text-white"
                                )}
                            >
                                <Repeat size={16} strokeWidth={2.5} />
                            </button>

                            {/* Mobile FX Button (Hidden on Desktop) */}
                            <div className="relative md:hidden ml-auto" ref={fxRef}>
                                <button
                                    onClick={() => setShowFx(!showFx)}
                                    className={cn(
                                        "p-2 rounded-full transition-all duration-300",
                                        showFx ? "bg-accent/20 text-accent shadow-[0_0_15px_rgba(168,85,247,0.3)]" : "text-white/20 hover:text-white hover:bg-white/5"
                                    )}
                                >
                                    <Settings2 size={18} />
                                </button>
                                <AnimatePresence>
                                    {showFx && (
                                        <>
                                            <motion.div
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                onClick={() => setShowFx(false)}
                                                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[190] pointer-events-auto"
                                            />
                                            <motion.div
                                                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                                                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                                                className="fixed inset-x-4 bottom-[calc(80px+var(--player-height))] z-[200] pointer-events-auto"
                                            >
                                                <AudioFxMenu />
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        <div className="hidden md:flex w-full max-w-[520px] items-center gap-4 text-[10px] font-black text-white/20 tabular-nums tracking-widest leading-none">
                            <span className="w-10 text-right">{Math.floor(currentTime / 60)}:{(Math.floor(currentTime) % 60).toString().padStart(2, '0')}</span>
                            <Slider.Root
                                className="relative flex items-center select-none touch-none w-full h-4 group cursor-pointer"
                                value={[currentTime]}
                                max={duration || 100}
                                step={0.1}
                                onValueChange={(val) => {
                                    const activeRef = getActiveRef();
                                    if (activeRef.current) activeRef.current.currentTime = val[0];
                                }}
                            >
                                <Slider.Track className="bg-white/5 relative grow rounded-full h-[3px]">
                                    <Slider.Range className="absolute bg-white/40 rounded-full h-full" />
                                </Slider.Track>
                                <Slider.Thumb className="hidden group-hover:block transition-all w-3 h-3 bg-white rounded-full shadow-lg outline-none cursor-grab active:cursor-grabbing" />
                            </Slider.Root>
                            <span className="w-10 text-left">{Math.floor(duration / 60)}:{(Math.floor(duration) % 60).toString().padStart(2, '0')}</span>
                        </div>
                    </div>

                    {/* Desktop Volume & Extras (Right) */}
                    <div className="hidden md:flex md:w-1/3 items-center justify-end gap-6 overflow-visible">
                        <div className="flex items-center gap-2 group/volume relative">
                            <button onClick={() => setVolume(volume === 0 ? 0.8 : 0)} className="text-white/40 hover:text-white transition-colors">
                                {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                            </button>
                            <div className="w-24">
                                <ElasticSlider
                                    value={volume}
                                    onChange={setVolume}
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button className="text-white/20 hover:text-white transition-colors">
                                <ListMusic size={18} />
                            </button>

                            <button className="text-white/20 hover:text-white transition-colors">
                                <Maximize2 size={18} />
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
