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

    // Sync Audio FX
    useEffect(() => {
        const activeRef = getActiveRef();
        if (activeRef.current) {
            audioEngine.setVolume(volume);
            audioEngine.setEq(0, audioFx.eq[0]); // Bass
            audioEngine.setEq(1, audioFx.eq[1]); // Mid
            audioEngine.setEq(2, audioFx.eq[2]); // Treble
            audioEngine.toggle8D(audioFx.is8D);
            audioEngine.setPlaybackSpeed(audioFx.speed, audioFx.pitch === 1);
            audioEngine.setReverb(audioFx.reverb);
            audioEngine.setReverbMix(audioFx.reverb === 'none' ? 0 : 0.3);
        }
    }, [volume, audioFx, activeAudio]);

    // A-B Loop Logic
    useEffect(() => {
        const interval = setInterval(() => {
            const activeRef = getActiveRef();
            if (activeRef.current && loopA !== null && loopB !== null && isPlaying) {
                if (activeRef.current.currentTime >= loopB) {
                    activeRef.current.currentTime = loopA;
                }
            }
        }, 100);
        return () => clearInterval(interval);
    }, [loopA, loopB, isPlaying, activeAudio]);

    useEffect(() => {
        const activeRef = getActiveRef();
        if (currentTrack && activeRef.current) {
            const src = getMediaUrl(currentTrack.audioUrl);
            activeRef.current.src = src;
            activeRef.current.load();
            if (isPlaying) {
                activeRef.current.play().catch(() => setIsPlaying(false));
            }
        }
    }, [currentTrack]);

    useEffect(() => {
        const activeRef = getActiveRef();
        if (activeRef.current) {
            activeRef.current.volume = 1; // Engine handles volume
            if (isPlaying) {
                audioEngine.resume();
                activeRef.current.play().catch(() => setIsPlaying(false));
            } else {
                activeRef.current.pause();
            }
        }
    }, [isPlaying, activeAudio]);

    // Preload next track for crossfade
    useEffect(() => {
        if (queue.length > 0 && currentTrack) {
            const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
            const nextTrack = queue[currentIndex + 1] || (repeatMode === 'all' ? queue[0] : null);
            const nextRef = getNextRef();
            if (nextTrack && nextRef.current) {
                nextRef.current.src = getMediaUrl(nextTrack.audioUrl);
                nextRef.current.load();
            }
        }
    }, [currentTrack, queue, repeatMode, activeAudio]);

    // Media Session & Global Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if user is typing in an input or textarea
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            if (e.code === 'Space') {
                e.preventDefault();
                togglePlay();
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        // Media Session API for Bluetooth/Hardware controls
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

            navigator.mediaSession.setActionHandler('play', () => {
                setIsPlaying(true);
            });
            navigator.mediaSession.setActionHandler('pause', () => {
                setIsPlaying(false);
            });
            navigator.mediaSession.setActionHandler('previoustrack', () => {
                playPrev();
            });
            navigator.mediaSession.setActionHandler('nexttrack', () => {
                playNext();
            });

            if (currentTrack) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: currentTrack.title,
                    artist: currentTrack.artist.name || 'Unknown Artist',
                    album: 'Zenify Album',
                    artwork: [
                        { src: currentTrack.coverUrl || '/default-cover.jpg', sizes: '512x512', type: 'image/jpeg' }
                    ]
                });
            }
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            if ('mediaSession' in navigator) {
                navigator.mediaSession.setActionHandler('play', null);
                navigator.mediaSession.setActionHandler('pause', null);
                navigator.mediaSession.setActionHandler('previoustrack', null);
                navigator.mediaSession.setActionHandler('nexttrack', null);
            }
        };
    }, [isPlaying, currentTrack, togglePlay, setIsPlaying, playNext, playPrev]);

    // Crossfade trigger (Temporarily disabled - causes uncontrollable dual playback)
    /* useEffect(() => {
        const interval = setInterval(() => {
            const activeRef = getActiveRef();
            if (activeRef.current && isPlaying && audioFx.crossfade > 0) {
                const timeLeft = activeRef.current.duration - activeRef.current.currentTime;
                // If within crossfade window and not already crossfading
                if (timeLeft <= audioFx.crossfade && timeLeft > 0.5) {
                    // Trigger engine crossfade
                    audioEngine.crossfade(activeAudio === 'B', audioFx.crossfade);

                    // Start next track on the other player
                    const nextRef = getNextRef();
                    if (nextRef.current && nextRef.current.paused) {
                        nextRef.current.play().then(() => {
                            // Switch active audio state after a small delay or instantly
                            // To keep it simple, we'll wait for the current one to end before officially switching store
                        }).catch(() => { });
                    }
                }
            }
        }, 500);
        return () => clearInterval(interval);
    }, [isPlaying, audioFx.crossfade, activeAudio]); */

    return (
        <div className="w-full h-full px-8 grid grid-cols-3 items-center">
            <audio
                ref={audioRefA}
                crossOrigin="anonymous"
                onTimeUpdate={(e) => activeAudio === 'A' && setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => activeAudio === 'A' && setDuration(e.currentTarget.duration)}
                onEnded={playNext}
            />
            <audio
                ref={audioRefB}
                crossOrigin="anonymous"
                onTimeUpdate={(e) => activeAudio === 'B' && setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => activeAudio === 'B' && setDuration(e.currentTarget.duration)}
                onEnded={playNext}
            />

            {/* Track Info */}
            <div className="flex items-center gap-4 min-w-0">
                {currentTrack ? (
                    <>
                        <div className="relative h-14 w-14 group flex-shrink-0">
                            <img
                                src={getMediaUrl(currentTrack.coverUrl) || `https://api.dicebear.com/7.x/identicon/svg?seed=${currentTrack.id}`}
                                alt="Cover"
                                className="h-full w-full rounded-md object-cover shadow-lg"
                            />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center">
                                <Maximize2 size={14} className="text-white" />
                            </div>
                        </div>
                        <div className="flex flex-col min-w-0">
                            <h4 className="text-[13px] font-bold text-foreground truncate leading-tight tracking-tight">
                                {currentTrack.title}
                            </h4>
                            <p className="text-[11px] text-muted font-medium truncate mt-0.5 hover:text-foreground cursor-pointer transition-colors">
                                {currentTrack.artist.name}
                            </p>
                        </div>
                        <button className="p-2 text-muted hover:text-[#EF4444] transition-colors ml-2">
                            <span className="sr-only">Like track</span>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.505 4.04 3 5.5L12 21l7-7Z" /></svg>
                        </button>
                    </>
                ) : (
                    <div className="text-xs text-muted-dark font-medium italic">Selecting archive entry...</div>
                )}
            </div>

            {/* Main Controls - Minimalist Pure */}
            <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-10">
                    <button
                        onClick={toggleShuffle}
                        className={cn("text-white/20 hover:text-white transition-colors duration-200", isShuffled && "text-accent")}
                    >
                        <Shuffle size={14} strokeWidth={2.5} />
                    </button>

                    <button onClick={() => { audioEngine.resume(); playPrev(); }} className="text-white/40 hover:text-white transition-all active:scale-90">
                        <SkipBack size={22} fill="currentColor" strokeWidth={0} />
                    </button>

                    <button
                        onClick={() => {
                            audioEngine.resume();
                            togglePlay();
                        }}
                        className="flex items-center justify-center text-white hover:scale-110 transition-all active:scale-95"
                    >
                        {isPlaying ? <Pause size={34} fill="currentColor" strokeWidth={0} /> : <Play size={34} fill="currentColor" strokeWidth={0} className="ml-1" />}
                    </button>

                    <button onClick={() => { audioEngine.resume(); playNext(); }} className="text-white/40 hover:text-white transition-all active:scale-90">
                        <SkipForward size={22} fill="currentColor" strokeWidth={0} />
                    </button>

                    <button
                        onClick={toggleRepeat}
                        className={cn("text-white/20 hover:text-white transition-colors duration-200", repeatMode !== 'off' && "text-accent")}
                    >
                        <Repeat size={14} strokeWidth={2.5} />
                    </button>
                </div>

                <div className="w-full max-w-[520px] flex items-center gap-4 text-[10px] font-black text-white/20 tabular-nums tracking-widest leading-none">
                    <span className="w-10 text-right">{Math.floor(currentTime / 60)}:{(Math.floor(currentTime) % 60).toString().padStart(2, '0')}</span>
                    <Slider.Root
                        className="relative flex items-center select-none touch-none w-full h-4 group cursor-pointer"
                        value={[currentTime]}
                        max={duration || 100}
                        step={0.1}
                        onValueChange={(val) => {
                            const activeRef = getActiveRef();
                            if (activeRef.current) activeRef.current.currentTime = val[0];
                            setCurrentTime(val[0]);
                        }}
                    >
                        <Slider.Track className="bg-white/5 relative grow rounded-full h-[3px]">
                            <Slider.Range className="absolute bg-white/40 h-full group-hover:bg-white" />
                            {/* Loop Markers */}
                            {loopA !== null && (
                                <div
                                    className="absolute h-full w-0.5 bg-accent/60 shadow-[0_0_8px_rgba(168,85,247,0.5)]"
                                    style={{ left: `${(loopA / duration) * 100}%` }}
                                />
                            )}
                            {loopB !== null && (
                                <div
                                    className="absolute h-full w-0.5 bg-accent/60 shadow-[0_0_8px_rgba(168,85,247,0.5)]"
                                    style={{ left: `${(loopB / duration) * 100}%` }}
                                />
                            )}
                        </Slider.Track>
                        <Slider.Thumb className="block w-3 h-3 bg-white rounded-full shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 focus:outline-none" />
                    </Slider.Root>
                    <span className="w-10">{Math.floor(duration / 60)}:{(Math.floor(duration) % 60).toString().padStart(2, '0')}</span>
                </div>
            </div>

            {/* Volume & Details */}
            <div className="flex items-center justify-end gap-6 pr-8 relative">
                <div className="flex flex-col items-center gap-1 group">
                    <button
                        onClick={() => {
                            if (loopA === null) setLoopA(currentTime);
                            else if (loopB === null) setLoopB(currentTime);
                            else { setLoopA(null); setLoopB(null); }
                        }}
                        className={cn("text-[8px] font-black p-1 hover:text-white transition-colors", (loopA !== null || loopB !== null) ? "text-accent" : "text-white/20")}
                    >
                        {loopA === null ? "LOOP A" : loopB === null ? "LOOP B" : "RESET"}
                    </button>
                    <div className="h-0.5 w-full bg-accent/0 group-hover:bg-accent/20 rounded-full transition-colors" />
                </div>

                <div className="flex items-center gap-4 group/vol">
                    <button
                        onClick={() => setVolume(volume === 0 ? 0.5 : 0)}
                        className="text-white/30 hover:text-white transition-colors"
                    >
                        {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>

                    <div className="relative flex items-center gap-4 w-[120px]">
                        <Slider.Root
                            className="relative flex items-center select-none touch-none w-full h-5 cursor-pointer group/slider"
                            value={[volume * 100]}
                            max={100}
                            step={1}
                            onValueChange={(val) => setVolume(val[0] / 100)}
                        >
                            <Slider.Track className="bg-white/5 relative grow rounded-full h-[3px]">
                                <Slider.Range className="absolute bg-white/30 group-hover/slider:bg-white h-full" />
                            </Slider.Track>
                            <Slider.Thumb className="block w-2.5 h-2.5 bg-white rounded-full shadow-2xl opacity-0 group-hover/slider:opacity-100 transition-opacity duration-200 focus:outline-none" />
                        </Slider.Root>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative flex items-center" ref={fxRef}>
                        <button
                            onClick={() => setShowFx(!showFx)}
                            className={cn("p-2 rounded-xl transition-all duration-300", showFx ? "bg-accent/10 text-accent shadow-[0_0_20px_rgba(168,85,247,0.15)]" : "text-white/20 hover:text-white hover:bg-white/5")}
                        >
                            <Settings2 className="w-5 h-5" />
                        </button>

                        <AnimatePresence>
                            {showFx && (
                                <motion.div
                                    initial={{ opacity: 0, y: 15, scale: 0.95, filter: 'blur(10px)' }}
                                    animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                                    exit={{ opacity: 0, y: 15, scale: 0.95, filter: 'blur(10px)' }}
                                    transition={{ type: "spring", damping: 20, stiffness: 300 }}
                                    className="absolute bottom-full right-0 mb-6 z-50"
                                >
                                    <AudioFxMenu />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <button className="text-white/20 hover:text-white transition-colors">
                        <ListMusic className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
