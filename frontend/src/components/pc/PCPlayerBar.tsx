"use client";

import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { Volume2, VolumeX, Maximize2, Settings2, Heart, ScrollText } from "lucide-react";
import {
  SwiftUIPlay,
  SwiftUIPause,
  SwiftUIShuffle,
  SwiftUIRepeat,
  SwiftUIForward,
  SwiftUIBackward,
  SwiftUIQueue,
} from "@/components/ui/SwiftUIIcons";
import { cn, cleanTitle, getTrackCover, formatDisplayTitle } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { audioEngine } from "@/lib/audio-engine";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { ArtistLinks } from "@/components/shared/ArtistLinks";
import { applyArtworkTheme, extractArtworkAverageColor } from "@/lib/theme";

const formatDuration = (s?: number | null) => {
  if (!s || isNaN(s)) return "0:00";
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export function PCPlayerBar() {
  const router = useRouter();
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const playNext = usePlayerStore((state) => state.playNext);
  const playPrev = usePlayerStore((state) => state.playPrev);
  const volume = usePlayerStore((state) => state.volume);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const isShuffled = usePlayerStore((state) => state.isShuffled);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const repeatMode = usePlayerStore((state) => state.repeatMode);
  const toggleRepeat = usePlayerStore((state) => state.toggleRepeat);
  const duration = usePlayerStore((state) => state.duration);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const setCurrentTime = usePlayerStore((state) => state.setCurrentTime);

  const {
    isPlayerMinimized,
    setPlayerMinimized,
    setFullScreenPlayerOpen,
    isAudioFxOpen,
    setAudioFxOpen,
    isQueueOpen,
    setIsQueueOpen,
    isLyricsOpen,
    setIsLyricsOpen,
  } = useUIStore();
  const queryClient = useQueryClient();

  // Local scrub state
  const [localTime, setLocalTime] = useState(currentTime);
  const lastSeekTime = useRef(0);

  useEffect(() => {
    if (Date.now() - lastSeekTime.current > 400) {
      setLocalTime(currentTime);
    }
  }, [currentTime]);

  const performSeek = (targetSec: number) => {
    lastSeekTime.current = Date.now();
    if (!duration || duration <= 0) return;
    const clampedTime = Math.max(0, Math.min(targetSec, Math.max(0, duration - 1.0)));
    setLocalTime(clampedTime);
    setCurrentTime(clampedTime);

    const audio = audioEngine.getActiveAudioElement();
    if (audio) {
      try {
        audio.currentTime = clampedTime;
        const targetVol = usePlayerStore.getState().volume ?? 1;
        audioEngine.setVolume(targetVol);
      } catch (e) {
        console.warn("Seek error:", e);
      }
    }
  };

  const safeMax = duration && duration > 0 ? duration : 1;

  // Dynamically extract artwork color and tint theme variables
  useEffect(() => {
    if (!currentTrack) return;
    const cover = getTrackCover(currentTrack);
    if (!cover) return;
    extractArtworkAverageColor(cover).then((rgb) => {
      if (rgb) {
        applyArtworkTheme(rgb[0], rgb[1], rgb[2]);
      }
    });
  }, [currentTrack?.id]);

  // Like state for the current track
  const { data: likedTrackIds } = useQuery({
    queryKey: ["liked-track-ids"],
    queryFn: async () => {
      const res = await api.get("tracks/liked");
      const arr = Array.isArray(res.data) ? res.data : res.data?.items || [];
      return arr.map((t: any) => t.id);
    },
    staleTime: 1000 * 60 * 5,
  });
  const isCurrentTrackLiked = currentTrack ? likedTrackIds?.includes(currentTrack.id) : false;

  const toggleLikeMutation = useMutation({
    mutationFn: async () => {
      if (!currentTrack) return;
      await api.post(`tracks/${currentTrack.id}/like`);
    },
    onMutate: async () => {
      if (!currentTrack) return;
      await queryClient.cancelQueries({ queryKey: ["liked-track-ids"] });
      const previousLikedIds = queryClient.getQueryData<string[]>(["liked-track-ids"]);
      const newLikedIds = previousLikedIds
        ? previousLikedIds.includes(currentTrack.id)
          ? previousLikedIds.filter((id) => id !== currentTrack.id)
          : [...previousLikedIds, currentTrack.id]
        : [currentTrack.id];
      queryClient.setQueryData(["liked-track-ids"], newLikedIds);
      return { previousLikedIds };
    },
    onError: (err, newTodo, context) => {
      if (context?.previousLikedIds) {
        queryClient.setQueryData(["liked-track-ids"], context.previousLikedIds);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["liked-track-ids"] });
      queryClient.invalidateQueries({ queryKey: ["liked-tracks"] });
    },
  });

  const handleHidePlayer = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const interactive =
      target.closest("button") ||
      target.closest('[role="slider"]') ||
      target.closest("a") ||
      target.closest(".slider-root");
    if (interactive) return;
    setPlayerMinimized(true);
  };

  if (!currentTrack) return null;

  const inactiveBtn = "text-white/60 hover:text-white transition-colors";
  const activeBtn = "text-brand drop-shadow-md";
  const whiteBtn = "text-white/80 hover:text-white transition-colors";

  return (
    <AnimatePresence>
      <motion.div
        key="pc-player-bar"
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 32, mass: 0.8 }}
        onClick={handleHidePlayer}
        className="player-capsule w-full max-w-[834px] h-[70px] rounded-full mx-auto px-4 md:px-5 flex items-center justify-between gap-3 relative select-none"
      >
        {/* 1. Left Playback Controls: Shuffle, Previous, Play/Pause, Next, Repeat */}
        <div className="flex items-center gap-3.5 md:gap-4 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={toggleShuffle}
            className={cn("p-1 transition-all active:scale-90 outline-none cursor-pointer", isShuffled ? activeBtn : inactiveBtn)}
            title={`Shuffle: ${isShuffled ? "On" : "Off"}`}
          >
            <SwiftUIShuffle size={16} stroke="currentColor" />
          </button>

          <button
            onClick={playPrev}
            className={cn("p-1 transition-all active:scale-90 outline-none cursor-pointer", whiteBtn)}
            title="Previous"
          >
            <SwiftUIBackward size={18} fill="currentColor" />
          </button>

          <button
            onClick={togglePlay}
            className="flex items-center justify-center p-1 text-white hover:text-white/90 active:scale-95 transition-all outline-none cursor-pointer"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <SwiftUIPause size={24} fill="currentColor" />
            ) : (
              <SwiftUIPlay size={24} fill="currentColor" className="ml-0.5" />
            )}
          </button>

          <button
            onClick={() => playNext(true)}
            className={cn("p-1 transition-all active:scale-90 outline-none cursor-pointer", whiteBtn)}
            title="Next"
          >
            <SwiftUIForward size={18} fill="currentColor" />
          </button>

          <button
            onClick={toggleRepeat}
            className={cn(
              "relative p-1 transition-all active:scale-90 flex items-center justify-center outline-none cursor-pointer",
              repeatMode !== "off" ? activeBtn : inactiveBtn
            )}
            title={`Repeat: ${repeatMode}`}
          >
            <SwiftUIRepeat size={16} stroke="currentColor" />
            {repeatMode !== "off" && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[7px] font-black mt-0.5 text-brand">
                  {repeatMode === "one" ? "1" : repeatMode === "two" ? "2" : "∞"}
                </span>
              </div>
            )}
          </button>
        </div>

        {/* 2. Middle: Inner Display Card with Artwork, Title, Artist, & Integrated Scrubber */}
        <div
          className="flex-1 min-w-0 max-w-[340px] md:max-w-[400px] h-[52px] bg-black/40 hover:bg-black/55 border border-white/10 rounded-xl px-2.5 py-1.5 flex flex-col justify-between cursor-pointer transition-colors relative overflow-hidden group shadow-inner"
          onClick={(e) => {
            e.stopPropagation();
            setFullScreenPlayerOpen(true);
            setPlayerMinimized(false);
          }}
        >
          {/* Top Row: Artwork + Title/Artist + Status Pill */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="h-7 w-7 rounded-md overflow-hidden shrink-0 bg-zinc-800 shadow relative">
                <img
                  src={getTrackCover(currentTrack)}
                  alt="Cover"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex flex-col min-w-0 text-left justify-center flex-1 overflow-hidden">
                <span
                  className="text-[13px] md:text-[14px] font-semibold text-white truncate leading-tight tracking-tight hover:underline cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/track/${currentTrack.id}`);
                  }}
                >
                  {formatDisplayTitle(cleanTitle(currentTrack.title))}
                </span>
                <span className="text-[11px] md:text-[12px] font-normal text-white/60 truncate leading-none mt-0.5">
                  <ArtistLinks
                    track={currentTrack}
                    maxArtists={2}
                    linkClassName="hover:underline text-white/60 hover:text-white"
                  />
                </span>
              </div>
            </div>

            {/* Preview / Play Pill Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-white/15 hover:bg-white/25 text-white transition-all active:scale-95 shadow-sm flex items-center gap-1 cursor-pointer"
            >
              {isPlaying ? "Playing" : "Preview"}
            </button>
          </div>

          {/* Bottom Row: Integrated Progress Scrubber */}
          <div className="w-full flex items-center gap-1.5 pt-0.5" onClick={(e) => e.stopPropagation()}>
            <span className="text-[9px] font-medium text-white/40 tabular-nums select-none shrink-0 w-6 text-right">
              {formatDuration(localTime)}
            </span>
            <div className="flex-1 relative flex items-center">
              <Slider.Root
                className="relative flex items-center select-none touch-none w-full h-3 cursor-pointer group/slider"
                value={[Math.min(localTime, safeMax)]}
                max={safeMax}
                onValueChange={(val) => {
                  setLocalTime(val[0]);
                  lastSeekTime.current = Date.now();
                }}
                onValueCommit={(val) => {
                  performSeek(val[0]);
                }}
              >
                <Slider.Track className="relative grow rounded-full h-[3px] bg-white/15 overflow-hidden">
                  <motion.div
                    className="absolute top-0 left-0 bottom-0 bg-white group-hover/slider:bg-brand rounded-full transition-colors"
                    initial={false}
                    animate={{ width: `${duration ? (localTime / duration) * 100 : 0}%` }}
                    transition={{ type: "tween", duration: 0.1, ease: "easeOut" }}
                  />
                </Slider.Track>
                <Slider.Thumb className="block w-2 h-2 bg-white rounded-full shadow-md opacity-0 group-hover/slider:opacity-100 transition-opacity outline-none" />
              </Slider.Root>
            </div>
            <span className="text-[9px] font-medium text-white/40 tabular-nums select-none shrink-0 w-6 text-left">
              {formatDuration(duration)}
            </span>
          </div>
        </div>

        {/* 3. Right Action Controls: Like, Studio FX, Lyrics, Queue, Volume, Fullscreen */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Like Button */}
          <button
            onClick={() => toggleLikeMutation.mutate()}
            className={cn("p-1 transition-all active:scale-90 outline-none cursor-pointer", isCurrentTrackLiked ? "text-brand" : inactiveBtn)}
            title={isCurrentTrackLiked ? "Unlike" : "Like"}
          >
            <Heart size={16} fill={isCurrentTrackLiked ? "currentColor" : "none"} />
          </button>

          {/* Studio FX */}
          <button
            id="tour-fx"
            onClick={() => setAudioFxOpen(!isAudioFxOpen)}
            className={cn("p-1 transition-colors outline-none cursor-pointer", isAudioFxOpen ? activeBtn : inactiveBtn)}
            title="Studio FX"
          >
            <Settings2 size={16} className={cn(isAudioFxOpen && "animate-pulse")} />
          </button>

          {/* Lyrics */}
          <button
            id="tour-lyrics"
            data-tour="lyrics"
            onClick={() => setIsLyricsOpen(!isLyricsOpen)}
            className={cn("p-1 transition-colors outline-none cursor-pointer", isLyricsOpen ? activeBtn : inactiveBtn)}
            title="Lyrics"
          >
            <ScrollText size={16} />
          </button>

          {/* Queue */}
          <button
            onClick={() => setIsQueueOpen(!isQueueOpen)}
            className={cn("p-1 transition-colors outline-none cursor-pointer", isQueueOpen ? activeBtn : inactiveBtn)}
            title="Queue"
          >
            <SwiftUIQueue size={16} stroke="currentColor" />
          </button>

          {/* Volume Control */}
          <div className="flex items-center gap-1.5 w-20 md:w-24 group/vol">
            <button
              onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
              className={cn("transition-colors p-0.5 cursor-pointer", inactiveBtn)}
              title={volume === 0 ? "Unmute" : "Mute"}
            >
              {volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} className={cn(volume > 0 && activeBtn)} />}
            </button>
            <Slider.Root
              className="relative flex items-center select-none touch-none w-full h-3 cursor-pointer"
              value={[volume * 100]}
              max={100}
              step={1}
              onValueChange={([val]) => setVolume(val / 100)}
            >
              <Slider.Track className="bg-white/15 relative grow rounded-full h-[3px]">
                <Slider.Range className="absolute bg-white group-hover/vol:bg-brand rounded-full h-full transition-colors" />
              </Slider.Track>
              <Slider.Thumb className="block w-2.5 h-2.5 bg-white rounded-full shadow-md opacity-0 group-hover/vol:opacity-100 transition-opacity outline-none" />
            </Slider.Root>
          </div>

          {/* Fullscreen Expand */}
          <button
            onClick={() => setFullScreenPlayerOpen(true)}
            className={cn("p-1 transition-colors outline-none cursor-pointer", inactiveBtn)}
            title="Full Screen Player"
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
