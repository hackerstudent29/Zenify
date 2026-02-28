"use client";

import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Shuffle, Repeat, ListMusic, Maximize2, Settings2, Download, Heart } from "lucide-react";
import { cn, getMediaUrl } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import ElasticSlider from "./ui/elastic-slider";
import { audioEngine } from "@/lib/audio-engine";
import { AudioFxMenu } from "./player/audio-fx-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track } from "@/store/player";

export function PlayerBar() {
    // Granular selectors to prevent re-renders when unrelated state (like currentTime) updates
    const currentTrack = usePlayerStore(state => state.currentTrack);
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const togglePlay = usePlayerStore(state => state.togglePlay);
    const playNext = usePlayerStore(state => state.playNext);
    const playPrev = usePlayerStore(state => state.playPrev);
    const volume = usePlayerStore(state => state.volume);
    const setVolume = usePlayerStore(state => state.setVolume);
    const isShuffled = usePlayerStore(state => state.isShuffled);
    const toggleShuffle = usePlayerStore(state => state.toggleShuffle);
    const repeatMode = usePlayerStore(state => state.repeatMode);
    const toggleRepeat = usePlayerStore(state => state.toggleRepeat);
    const audioFx = usePlayerStore(state => state.audioFx);
    const currentTime = usePlayerStore(state => state.currentTime);
    const duration = usePlayerStore(state => state.duration);
    const setCurrentTime = usePlayerStore(state => state.setCurrentTime);
    const setDuration = usePlayerStore(state => state.setDuration);

    const { isPlayerMinimized, setPlayerMinimized, openDownloadModal } = useUIStore();
    const queryClient = useQueryClient();

    // Like state for the current track
    const { data: likedTrackIds } = useQuery({
        queryKey: ['liked-track-ids'],
        queryFn: async () => {
            const res = await api.get('/tracks/liked');
            return (res.data as Track[]).map(t => t.id);
        },
        staleTime: 1000 * 60 * 5,
    });
    const isCurrentTrackLiked = currentTrack ? likedTrackIds?.includes(currentTrack.id) : false;
    const toggleLikeMutation = useMutation({
        mutationFn: async () => {
            if (!currentTrack) return;
            await api.post(`/tracks/${currentTrack.id}/like`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
            queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
        }
    });

    const audioRefA = useRef<HTMLAudioElement>(null);
    const audioRefB = useRef<HTMLAudioElement>(null);
    const [activeAudio, setActiveAudio] = useState<'A' | 'B'>('A');
    const [loopA, setLoopA] = useState<number | null>(null);
    const [loopB, setLoopB] = useState<number | null>(null);
    const [showFx, setShowFx] = useState(false);
    const fxRef = useRef<HTMLDivElement>(null);

    // Toggle minimize on single click
    const handleHidePlayer = (e: React.MouseEvent) => {
        // Don't minimize if clicking interactive elements
        const target = e.target as HTMLElement;
        const interactive = target.closest('button') ||
            target.closest('[role="slider"]') ||
            target.closest('a');

        if (interactive) return;

        setPlayerMinimized(true);
    };

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
            applyFx(); // Re-apply all settings (volume, EQ, 8D) after graph is rebuilt
        }
    }, [currentTrack]); // Using currentTrack as stable trigger to avoid HMR size changes

    // Apply FX
    const applyFx = () => {
        audioEngine.setVolume(volume);
        audioEngine.setEq(0, audioFx.eq[0]); // Bass
        audioEngine.setEq(1, audioFx.eq[1]); // Mid
        audioEngine.setEq(2, audioFx.eq[2]); // Treble
        audioEngine.toggle8D(audioFx.is8D, audioFx.direction8D);
        audioEngine.setPlaybackSpeed(audioFx.speed, audioFx.pitch === 1);
        audioEngine.setReverb(audioFx.reverb);
        audioEngine.setReverbMix(audioFx.reverb === 'none' ? 0 : 0.6); // Increased mix for better audibility
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

            const handleEnded = () => {
                playNext();
            };

            activeRef.current.addEventListener('timeupdate', handleTimeUpdate);
            activeRef.current.addEventListener('ended', handleEnded);

            return () => {
                activeRef.current?.removeEventListener('timeupdate', handleTimeUpdate);
                activeRef.current?.removeEventListener('ended', handleEnded);
            };
        }
    }, [activeAudio, currentTrack, playNext]);

    useEffect(() => {
        const activeRef = getActiveRef();
        if (currentTrack && activeRef.current) {
            const src = getMediaUrl(currentTrack.audioUrl) || "";
            activeRef.current.src = src;
            activeRef.current.load();
            audioEngine.resume();
            applyFx();
            activeRef.current.play().catch(() => { });
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
                    key="stable-player-bar-container"
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    onClick={handleHidePlayer}
                    className="w-full h-full px-4 md:px-8 flex items-center justify-between transition-all duration-300 relative select-none cursor-default bg-black"
                >
                    {/* Mobile Progress Bar - Top Overlay */}
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="md:hidden absolute top-0 left-0 right-0 h-[2px] bg-white/5 overflow-hidden"
                    >
                        <motion.div
                            initial={false}
                            animate={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                            className="h-full bg-brand"
                            transition={{ ease: "linear", duration: 0.2 }}
                        />
                    </div>

                    <audio ref={audioRefA} crossOrigin="anonymous" onEnded={playNext} />
                    <audio ref={audioRefB} crossOrigin="anonymous" onEnded={playNext} className="hidden" />

                    {/* Track Info (Left) */}
                    <div
                        className="flex items-center gap-3 md:gap-4 md:w-1/3 min-w-0 pr-4 cursor-default h-full"
                    >
                        <div
                            onClick={(e) => { e.stopPropagation(); setFullScreenPlayerOpen(true); }}
                            className="relative h-10 w-10 md:h-14 md:w-14 group flex-shrink-0 cursor-pointer overflow-hidden rounded-md shadow-2xl transition-transform active:scale-95 hover:scale-105"
                        >
                            <img
                                src={getMediaUrl(currentTrack.coverUrl) || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200"}
                                alt="Cover"
                                className="h-full w-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                <Maximize2 size={16} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            {!currentTrack.coverUrl && (
                                <div className="absolute inset-0 bg-black/20 pointer-events-none" />
                            )}
                        </div>
                        <div className="flex flex-col min-w-0 overflow-hidden">
                            <div className="flex items-center gap-2">
                                <h4 className="text-[12px] md:text-[13px] font-bold text-foreground truncate leading-tight tracking-tight">
                                    {currentTrack.title}
                                </h4>
                                <button
                                    onClick={(e) => { e.stopPropagation(); openDownloadModal(currentTrack); }}
                                    className="p-1 rounded-full text-white/20 hover:text-brand hover:bg-brand/10 transition-all"
                                >
                                    <Download size={12} />
                                </button>
                            </div>
                            <p
                                className="text-[10px] md:text-[11px] text-muted font-medium truncate mt-0.5 hover:text-foreground cursor-pointer transition-colors"
                            >
                                {currentTrack.artist.name}
                            </p>
                        </div>
                    </div>

                    {/* Main Controls (Center) */}
                    <div
                        className="flex flex-1 md:w-1/3 flex-col items-center justify-center gap-2 cursor-default h-full"
                    >
                        <div className="flex items-center justify-center gap-3 md:gap-5 w-full">
                            <button
                                onClick={(e) => { e.stopPropagation(); audioEngine.resume(); toggleShuffle(); }}
                                className={cn(
                                    "p-2 rounded-full transition-all duration-200 active:scale-90 hidden md:block",
                                    isShuffled ? "text-white" : "text-white/20 hover:text-white"
                                )}
                            >
                                <Shuffle size={16} strokeWidth={2.5} />
                            </button>

                            <button
                                onClick={(e) => { e.stopPropagation(); audioEngine.resume(); playPrev(); }}
                                className="p-2 text-brand/80 hover:text-brand transition-all active:scale-90"
                            >
                                <SkipBack size={20} fill="currentColor" strokeWidth={0} />
                            </button>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    audioEngine.resume();
                                    togglePlay();
                                }}
                                className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center text-black bg-white rounded-full hover:scale-110 transition-all active:scale-95 shadow-xl"
                            >
                                {isPlaying ? <Pause size={22} fill="currentColor" strokeWidth={0} /> : <Play size={22} fill="currentColor" strokeWidth={0} className="ml-1" />}
                            </button>

                            <button
                                onClick={(e) => { e.stopPropagation(); audioEngine.resume(); playNext(); }}
                                className="p-2 text-brand transition-all active:scale-90"
                            >
                                <SkipForward size={20} fill="currentColor" strokeWidth={0} />
                            </button>

                            <button
                                onClick={(e) => { e.stopPropagation(); audioEngine.resume(); toggleRepeat(); }}
                                className={cn(
                                    "p-2 rounded-full transition-all duration-200 active:scale-90 hidden md:block",
                                    repeatMode !== 'off' ? "text-white" : "text-white/20 hover:text-white"
                                )}
                            >
                                <Repeat size={16} strokeWidth={2.5} />
                            </button>

                            {/* Mobile Extras Trigger */}
                            <div className="flex items-center gap-1 md:hidden">
                                <button
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); toggleLikeMutation.mutate(); }}
                                    className={cn("p-2 rounded-full transition-all", isCurrentTrackLiked ? "text-brand" : "text-white/20 hover:text-brand")}
                                >
                                    <Heart size={18} className={cn(isCurrentTrackLiked && "fill-current")} />
                                </button>
                                <button
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); setShowFx(!showFx); }}
                                    className={cn(
                                        "p-2 rounded-full transition-all",
                                        showFx ? "text-brand" : "text-white/20 hover:text-white"
                                    )}
                                >
                                    <Settings2 size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="hidden md:flex w-full max-w-[520px] items-center gap-4 text-[10px] font-black text-white/20 tabular-nums tracking-widest leading-none">
                            <span className="w-10 text-right">{Math.floor(currentTime / 60)}:{(Math.floor(currentTime) % 60).toString().padStart(2, '0')}</span>
                            <Slider.Root
                                className="relative flex items-center select-none touch-none w-full h-4 group cursor-pointer"
                                value={[currentTime]}
                                max={duration || 100}
                                step={0.1}
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                onValueChange={(val) => {
                                    const activeRef = getActiveRef();
                                    if (activeRef.current) activeRef.current.currentTime = val[0];
                                }}
                                onDoubleClick={() => {
                                    const activeRef = getActiveRef();
                                    if (activeRef.current) activeRef.current.currentTime = 0;
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
                    <div
                        className="hidden md:flex md:w-1/3 items-center justify-end gap-4 cursor-default h-full"
                    >
                        <div className="flex items-center gap-1 md:gap-3">
                            <button
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); toggleLikeMutation.mutate(); }}
                                className={cn("p-2 rounded-full transition-all hidden md:block", isCurrentTrackLiked ? "text-brand" : "text-white/20 hover:text-brand")}
                            >
                                <Heart size={18} className={cn(isCurrentTrackLiked && "fill-current")} />
                            </button>
                            <button
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); setShowFx(!showFx); }}
                                className={cn(
                                    "p-2 rounded-full transition-all",
                                    showFx ? "text-brand" : "text-white/20 hover:text-white"
                                )}
                            >
                                <Settings2 size={18} />
                            </button>
                        </div>

                        <div className="flex items-center gap-2 w-32 group">
                            <button
                                onClick={(e) => { e.stopPropagation(); setVolume(volume === 0 ? 0.8 : 0); }}
                                className="text-brand/80 hover:text-brand transition-colors"
                            >
                                {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                            </button>
                            <Slider.Root
                                className="relative flex items-center select-none touch-none w-full h-4 cursor-pointer"
                                value={[volume * 100]}
                                max={100}
                                step={1}
                                onPointerDown={(e) => e.stopPropagation()}
                                onPointerMove={(e) => e.stopPropagation()}
                                onPointerUp={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                onValueChange={([val]) => setVolume(val / 100)}
                                onDoubleClick={(e) => { e.stopPropagation(); setVolume(0.8); }}
                            >
                                <Slider.Track className="bg-white/10 relative grow rounded-full h-[3px]">
                                    <Slider.Range className="absolute bg-brand rounded-full h-full group-hover:bg-brand transition-colors" />
                                </Slider.Track>
                                <Slider.Thumb className="block w-3 h-3 bg-white rounded-full shadow-lg outline-none" />
                            </Slider.Root>
                        </div>

                        <AnimatePresence>
                            {showFx && (
                                <motion.div
                                    ref={fxRef}
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                    className="fixed right-8 bottom-[calc(var(--player-height)+16px)] z-[200] pointer-events-auto"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <AudioFxMenu />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
