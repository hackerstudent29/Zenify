"use client";

import { usePlayerStore } from "@/store/player";
import { Play, Pause, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

export function PlayerBar() {
    const { currentTrack, isPlaying, togglePlay, playNext, playPrev, volume, setVolume } = usePlayerStore();

    if (!currentTrack) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border h-20 px-4 flex items-center justify-between z-50">
            <div className="flex items-center w-1/3 space-x-4">
                {currentTrack.coverUrl && (
                    <img src={currentTrack.coverUrl} alt={currentTrack.title} className="h-14 w-14 rounded-md object-cover" />
                )}
                <div>
                    <h4 className="text-sm font-semibold text-white">{currentTrack.title}</h4>
                    <p className="text-xs text-muted-foreground">{currentTrack.artist}</p>
                </div>
            </div>

            <div className="flex flex-col items-center w-1/3">
                <div className="flex items-center space-x-6">
                    <Button variant="ghost" size="icon" onClick={playPrev} className="text-zinc-400 hover:text-white">
                        <SkipBack className="h-5 w-5 fill-current" />
                    </Button>
                    <Button
                        size="icon"
                        className="rounded-full bg-white text-black hover:bg-white/90 h-8 w-8"
                        onClick={togglePlay}
                    >
                        {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={playNext} className="text-zinc-400 hover:text-white">
                        <SkipForward className="h-5 w-5 fill-current" />
                    </Button>
                </div>
                {/* Progress bar placeholder */}
                <div className="w-full h-1 bg-secondary rounded-full mt-2 relative group cursor-pointer">
                    <div className="absolute top-0 left-0 h-full bg-white rounded-full w-1/3" />
                </div>
            </div>

            <div className="flex items-center justify-end w-1/3 space-x-2">
                <Volume2 className="h-5 w-5 text-zinc-400" />
                <div className="w-24 h-1 bg-secondary rounded-full relative cursor-pointer group">
                    <div className="absolute top-0 left-0 h-full bg-white rounded-full" style={{ width: `${volume * 100}%` }} />
                </div>
            </div>
        </div>
    );
}
