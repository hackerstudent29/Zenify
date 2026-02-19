"use client";

import { usePlayerStore } from "@/store/player";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Shuffle, Repeat, ListMusic, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import ElasticSlider from "./ui/elastic-slider";

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
        toggleRepeat
    } = usePlayerStore();

    const audioRef = useRef<HTMLAudioElement>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        if (currentTrack && audioRef.current) {
            const src = currentTrack.audioUrl.startsWith('http')
                ? currentTrack.audioUrl
                : `http://localhost:3000${currentTrack.audioUrl}`;

            audioRef.current.src = src;
            audioRef.current.load();
            if (isPlaying) {
                audioRef.current.play().catch(() => setIsPlaying(false));
            }
        }
    }, [currentTrack]);

    useEffect(() => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.play().catch(() => setIsPlaying(false));
            } else {
                audioRef.current.pause();
            }
        }
    }, [isPlaying]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);

    return (
        <div className="w-full h-full px-8 grid grid-cols-3 items-center">
            <audio
                ref={audioRef}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onEnded={playNext}
            />

            {/* Track Info */}
            <div className="flex items-center gap-4 min-w-0">
                {currentTrack ? (
                    <>
                        <div className="relative h-14 w-14 group flex-shrink-0">
                            <img
                                src={currentTrack.coverUrl?.startsWith('http')
                                    ? currentTrack.coverUrl
                                    : `http://localhost:3000${currentTrack.coverUrl || ''}` || `https://api.dicebear.com/7.x/identicon/svg?seed=${currentTrack.id}`}
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

            {/* Main Controls */}
            <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-6">
                    <button
                        onClick={toggleShuffle}
                        className={cn("text-muted hover:text-foreground transition-colors p-1", isShuffled && "text-accent")}
                    >
                        <Shuffle size={14} strokeWidth={2.5} />
                    </button>
                    <button onClick={playPrev} className="text-muted hover:text-foreground transition-transform active:scale-90">
                        <SkipBack size={20} fill="currentColor" />
                    </button>
                    <button
                        onClick={togglePlay}
                        className="h-10 w-10 flex items-center justify-center rounded-full bg-foreground text-background hover:scale-105 transition-all shadow-xl active:scale-95"
                    >
                        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                    </button>
                    <button onClick={playNext} className="text-muted hover:text-foreground transition-transform active:scale-90">
                        <SkipForward size={20} fill="currentColor" />
                    </button>
                    <button
                        onClick={toggleRepeat}
                        className={cn("text-muted hover:text-foreground transition-colors p-1", repeatMode !== 'off' && "text-accent")}
                    >
                        <Repeat size={14} strokeWidth={2.5} />
                    </button>
                </div>

                <div className="w-full flex items-center gap-3 text-[10px] font-bold text-muted tabular-nums">
                    <span className="w-8 text-right">{Math.floor(currentTime / 60)}:{(Math.floor(currentTime) % 60).toString().padStart(2, '0')}</span>
                    <Slider.Root
                        className="relative flex items-center select-none touch-none w-full h-4 group cursor-pointer"
                        value={[currentTime]}
                        max={duration || 100}
                        step={1}
                        onValueChange={(val) => {
                            if (audioRef.current) audioRef.current.currentTime = val[0];
                            setCurrentTime(val[0]);
                        }}
                    >
                        <Slider.Track className="bg-white/10 relative grow rounded-full h-[3px] overflow-hidden group-hover:h-[5px] transition-all">
                            <Slider.Range className="absolute bg-white group-hover:bg-accent h-full transition-colors" />
                        </Slider.Track>
                        <Slider.Thumb className="block w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none" />
                    </Slider.Root>
                    <span className="w-8">{Math.floor(duration / 60)}:{(Math.floor(duration) % 60).toString().padStart(2, '0')}</span>
                </div>
            </div>

            {/* Volume & Queue */}
            <div className="flex items-center justify-end gap-2 pr-4">
                <button
                    className="p-2 text-zinc-400 hover:text-white transition-colors"
                >
                    <ListMusic className="w-4 h-4" />
                </button>

                <div className="w-32">
                    <ElasticSlider
                        defaultValue={volume * 100}
                        maxValue={100}
                        leftIcon={<Volume2 className="w-3 h-3 text-zinc-400" />}
                    />
                </div>
            </div>
        </div>
    );
}
