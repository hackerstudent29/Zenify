"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Share2,
  RotateCcw,
  Sparkles,
  Clock,
  Flame,
  Calendar,
  List,
  Layers,
  ChevronLeft,
  ChevronRight,
  Music2,
  Mic2,
  Pause,
  ExternalLink,
} from 'lucide-react';
import api from '@/lib/api';
import notify from '@/lib/notify';
import { usePlayerStore } from '@/store/player';
import { useUIStore } from '@/store/ui';
import { GlassCard } from '@/components/ui/GlassCard';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SkeletonRow } from '@/components/ui/SkeletonRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { SEO } from '@/components/shared/SEO';
import { getTrackCover } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface ReplayData {
  year: number;
  totalMinutes: number;
  totalTracksListened: number;
  totalCompletedTracks: number;
  longestStreakDays: number;
  persona: {
    title: string;
    description: string;
    badge: string;
  };
  topTracks: Array<{
    id: string;
    title: string;
    artist: string;
    album?: string;
    coverUrl?: string;
    minutes: number;
    playCount: number;
  }>;
  topArtists: Array<{
    name: string;
    minutes: number;
    playCount: number;
    coverUrl?: string;
  }>;
  hourlyDistribution: number[];
  dayOfWeekDistribution: Array<{
    day: string;
    minutes: number;
    plays: number;
  }>;
  generatedAt: string;
}

const TOTAL_STORIES = 6;
const STORY_DURATION_MS = 6000;

export default function ReplayPage() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [viewMode, setViewMode] = useState<'story' | 'list'>('story');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [replayData, setReplayData] = useState<ReplayData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Story state
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 1

  const { currentTrack, isPlaying } = usePlayerStore();
  const { openShareSheet } = useUIStore();

  const fetchReplay = useCallback(async (year: number, force = false) => {
    try {
      if (force) setIsRefreshing(true);
      else setIsLoading(true);
      setErrorMessage(null);

      const endpoint = force ? `/me/replay/refresh?year=${year}` : `/me/replay?year=${year}`;
      const method = force ? 'post' : 'get';
      const res = await (api as any)[method](endpoint);

      if (res.data?.enabled === false) {
        setErrorMessage(res.data.message || 'Personalization is disabled.');
        setReplayData(null);
      } else if (res.data?.replay) {
        setReplayData(res.data.replay);
        setCurrentSlide(0);
        setProgress(0);
      }
    } catch (err: any) {
      console.error('[Replay] Fetch error:', err);
      setErrorMessage(err.response?.data?.message || 'Unable to load Replay data.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchReplay(selectedYear);
  }, [selectedYear, fetchReplay]);

  // Story Timer
  useEffect(() => {
    if (viewMode !== 'story' || isPaused || isLoading || !replayData || replayData.totalMinutes === 0) {
      return;
    }

    const interval = 50;
    const step = interval / STORY_DURATION_MS;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev + step >= 1) {
          // Advance slide
          setCurrentSlide((cur) => {
            if (cur < TOTAL_STORIES - 1) {
              return cur + 1;
            } else {
              setIsPaused(true);
              return cur;
            }
          });
          return 0;
        }
        return prev + step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [viewMode, isPaused, isLoading, replayData, currentSlide]);

  const goToSlide = (index: number) => {
    if (index >= 0 && index < TOTAL_STORIES) {
      setCurrentSlide(index);
      setProgress(0);
      setIsPaused(false);
    }
  };

  const nextSlide = () => {
    if (currentSlide < TOTAL_STORIES - 1) {
      goToSlide(currentSlide + 1);
    } else {
      goToSlide(0);
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      goToSlide(currentSlide - 1);
    }
  };

  const handleShareStory = () => {
    if (!replayData) return;
    const topTrack = replayData.topTracks[0];
    const topArtist = replayData.topArtists[0];

    openShareSheet({
      type: 'replay',
      track: topTrack ? { id: topTrack.id, title: topTrack.title, artist: topTrack.artist, coverUrl: topTrack.coverUrl } : undefined,
      replayData: {
        year: replayData.year,
        totalMinutes: replayData.totalMinutes,
        topTrack: topTrack?.title,
        topArtist: topArtist?.name,
        persona: replayData.persona,
      },
    });
  };

  return (
    <div className="min-h-screen bg-black text-white relative flex flex-col items-center pt-20 pb-24 px-4 sm:px-6 select-none font-sans">
      <SEO
        title={`Replay ${selectedYear} - Zenify`}
        description={`Your musical year in review. Discover your top tracks, artists, and listening persona.`}
      />

      {/* Header controls */}
      <div className="w-full max-w-xl flex items-center justify-between mb-4 z-20">
        <div className="flex items-center gap-2">
          {/* Year Selector */}
          <div className="flex items-center bg-white/10 backdrop-blur-xl border border-white/10 rounded-full p-0.5">
            {[currentYear, currentYear - 1].map((yr) => (
              <button
                key={yr}
                onClick={() => setSelectedYear(yr)}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${
                  selectedYear === yr ? 'bg-white text-black shadow' : 'text-white/60 hover:text-white'
                }`}
              >
                {yr}
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchReplay(selectedYear, true)}
            disabled={isRefreshing}
            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition text-white/70 hover:text-white disabled:opacity-40"
            title="Refresh Replay stats"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Story vs List View Toggle */}
        <div className="flex items-center bg-white/10 backdrop-blur-xl border border-white/10 rounded-full p-0.5">
          <button
            onClick={() => setViewMode('story')}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 ${
              viewMode === 'story' ? 'bg-brand text-white shadow' : 'text-white/60 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Story
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 ${
              viewMode === 'list' ? 'bg-brand text-white shadow' : 'text-white/60 hover:text-white'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            Overview
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="w-full max-w-xl space-y-4 pt-12">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      )}

      {/* Error / Personalization disabled */}
      {!isLoading && errorMessage && (
        <div className="w-full max-w-md pt-16">
          <EmptyState
            icon={Sparkles}
            title="Replay Unavailable"
            description={errorMessage}
            actionLabel="Open Settings"
            onAction={() => navigate('/settings')}
          />
        </div>
      )}

      {/* No listening history */}
      {!isLoading && !errorMessage && replayData && replayData.totalMinutes === 0 && (
        <div className="w-full max-w-md pt-16">
          <EmptyState
            icon={Sparkles}
            title={`Your ${selectedYear} Replay`}
            description="You haven't listened to enough music yet this year. Put on your favorite playlist and check back soon!"
            actionLabel="Explore Music"
            onAction={() => navigate('/discover')}
          />
        </div>
      )}

      {/* Main Replay Content */}
      {!isLoading && !errorMessage && replayData && replayData.totalMinutes > 0 && (
        <>
          {viewMode === 'story' ? (
            /* STORY MODE */
            <div
              className="relative w-full max-w-md aspect-[9/16] max-h-[82vh] rounded-[28px] overflow-hidden shadow-2xl border border-white/10 flex flex-col justify-between p-6 bg-gradient-to-b from-neutral-900 via-neutral-950 to-black select-none touch-none"
              onPointerDown={() => setIsPaused(true)}
              onPointerUp={() => setIsPaused(false)}
            >
              {/* Segmented Progress Bars */}
              <div className="flex gap-1.5 w-full z-20">
                {Array.from({ length: TOTAL_STORIES }).map((_, idx) => (
                  <div
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      goToSlide(idx);
                    }}
                    className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden cursor-pointer"
                  >
                    <div
                      className="h-full bg-white transition-all duration-75"
                      style={{
                        width:
                          idx < currentSlide
                            ? '100%'
                            : idx === currentSlide
                            ? `${progress * 100}%`
                            : '0%',
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Tap navigation hotspots */}
              <div className="absolute inset-0 flex z-10">
                <div
                  className="w-1/3 h-full cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    prevSlide();
                  }}
                />
                <div
                  className="w-2/3 h-full cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    nextSlide();
                  }}
                />
              </div>

              {/* Story Slides Content */}
              <div className="relative z-10 flex-1 flex flex-col justify-center my-auto pointer-events-none">
                <AnimatePresence mode="wait">
                  {currentSlide === 0 && (
                    /* Slide 1: Welcome & Total Minutes */
                    <motion.div
                      key="slide-0"
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.05 }}
                      transition={{ duration: 0.35 }}
                      className="text-center space-y-6"
                    >
                      <div className="inline-block px-3 py-1 rounded-full bg-brand/20 border border-brand/40 text-brand text-xs font-bold tracking-widest uppercase">
                        REPLAY {replayData.year}
                      </div>

                      <div className="space-y-2">
                        <div className="text-6xl sm:text-7xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-neutral-200 to-neutral-400">
                          {replayData.totalMinutes.toLocaleString()}
                        </div>
                        <div className="text-sm font-semibold tracking-wide uppercase text-white/50">
                          Total Minutes Listened
                        </div>
                      </div>

                      <p className="text-sm text-white/80 max-w-xs mx-auto leading-relaxed">
                        Across {replayData.totalTracksListened.toLocaleString()} unique songs and{' '}
                        {replayData.totalCompletedTracks.toLocaleString()} full playthroughs.
                      </p>
                    </motion.div>
                  )}

                  {currentSlide === 1 && (
                    /* Slide 2: Top 5 Tracks */
                    <motion.div
                      key="slide-1"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.35 }}
                      className="space-y-4"
                    >
                      <div className="text-center space-y-1">
                        <span className="text-xs font-bold tracking-widest text-brand uppercase">
                          HEAVY ROTATION
                        </span>
                        <h2 className="text-2xl font-bold tracking-tight">Your Top Songs</h2>
                      </div>

                      <div className="space-y-2.5">
                        {replayData.topTracks.slice(0, 5).map((track, idx) => (
                          <div
                            key={track.id}
                            className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10"
                          >
                            <span className="text-base font-black text-white/40 w-5 text-center">
                              {idx + 1}
                            </span>
                            <img
                              src={track.coverUrl || '/images/placeholder.png'}
                              alt={track.title}
                              className="w-10 h-10 rounded-lg object-cover bg-neutral-800"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{track.title}</p>
                              <p className="text-xs text-white/60 truncate">{track.artist}</p>
                            </div>
                            <div className="text-right text-xs text-white/40 font-mono">
                              {track.playCount} plays
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {currentSlide === 2 && (
                    /* Slide 3: Top 5 Artists */
                    <motion.div
                      key="slide-2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.35 }}
                      className="space-y-4"
                    >
                      <div className="text-center space-y-1">
                        <span className="text-xs font-bold tracking-widest text-brand uppercase">
                          IN YOUR EARS
                        </span>
                        <h2 className="text-2xl font-bold tracking-tight">Your Top Artists</h2>
                      </div>

                      <div className="space-y-2.5">
                        {replayData.topArtists.slice(0, 5).map((artist, idx) => (
                          <div
                            key={artist.name}
                            className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10"
                          >
                            <span className="text-base font-black text-white/40 w-5 text-center">
                              {idx + 1}
                            </span>
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-800 border border-white/10 shrink-0">
                              <img
                                src={artist.coverUrl || '/images/placeholder.png'}
                                alt={artist.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{artist.name}</p>
                              <p className="text-xs text-white/60 truncate">
                                {artist.minutes.toLocaleString()} minutes
                              </p>
                            </div>
                            <div className="text-right text-xs text-white/40 font-mono">
                              {artist.playCount} plays
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {currentSlide === 3 && (
                    /* Slide 4: Persona */
                    <motion.div
                      key="slide-3"
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.05 }}
                      transition={{ duration: 0.35 }}
                      className="text-center space-y-5"
                    >
                      <div className="text-7xl select-none filter drop-shadow-lg">
                        {replayData.persona.badge}
                      </div>

                      <div className="space-y-1">
                        <span className="text-xs font-bold tracking-widest text-brand uppercase">
                          LISTENER PERSONA
                        </span>
                        <h2 className="text-3xl font-black tracking-tight text-white">
                          {replayData.persona.title}
                        </h2>
                      </div>

                      <p className="text-sm text-white/80 max-w-xs mx-auto leading-relaxed">
                        {replayData.persona.description}
                      </p>
                    </motion.div>
                  )}

                  {currentSlide === 4 && (
                    /* Slide 5: Habits & Streaks */
                    <motion.div
                      key="slide-4"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.35 }}
                      className="space-y-5"
                    >
                      <div className="text-center space-y-1">
                        <span className="text-xs font-bold tracking-widest text-brand uppercase">
                          HABITS & RHYTHMS
                        </span>
                        <h2 className="text-2xl font-bold tracking-tight">Your Cadence</h2>
                      </div>

                      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Flame className="w-8 h-8 text-amber-500" />
                          <div>
                            <div className="text-xs text-white/60 uppercase font-semibold">
                              Longest Streak
                            </div>
                            <div className="text-xl font-black text-white">
                              {replayData.longestStreakDays} Consecutive Days
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                        <div className="text-xs text-white/60 uppercase font-semibold">
                          Weekly Rhythm
                        </div>
                        <div className="flex items-end justify-between h-20 pt-2 gap-1.5">
                          {replayData.dayOfWeekDistribution.map((d) => {
                            const maxPlays = Math.max(
                              ...replayData.dayOfWeekDistribution.map((x) => x.plays),
                              1
                            );
                            const heightPct = Math.max(12, Math.round((d.plays / maxPlays) * 100));
                            return (
                              <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                                <div
                                  className="w-full rounded-t-sm bg-brand/80 transition-all"
                                  style={{ height: `${heightPct}%` }}
                                />
                                <span className="text-[10px] text-white/50">{d.day}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {currentSlide === 5 && (
                    /* Slide 6: Grand Summary Showcase */
                    <motion.div
                      key="slide-5"
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.05 }}
                      transition={{ duration: 0.35 }}
                      className="space-y-4"
                    >
                      <div className="p-5 rounded-2xl bg-gradient-to-br from-neutral-800 to-neutral-900 border border-white/15 shadow-2xl space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold tracking-widest text-brand uppercase">
                            ZENIFY REPLAY '{String(replayData.year).slice(-2)}
                          </span>
                          <span className="text-base">{replayData.persona.badge}</span>
                        </div>

                        <div className="flex items-center gap-4">
                          {replayData.topTracks[0] && (
                            <img
                              src={replayData.topTracks[0].coverUrl || '/images/placeholder.png'}
                              alt="Top Track"
                              className="w-20 h-20 rounded-xl object-cover shadow-lg border border-white/10"
                            />
                          )}
                          <div className="min-w-0">
                            <div className="text-2xl font-black text-white">
                              {replayData.totalMinutes.toLocaleString()}
                            </div>
                            <div className="text-xs text-white/50 uppercase font-semibold">
                              Minutes Listened
                            </div>
                            <div className="mt-1 text-sm font-bold text-brand">
                              {replayData.persona.title}
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-white/10 pt-3 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-white/40 block">Top Track</span>
                            <span className="font-semibold text-white truncate block">
                              {replayData.topTracks[0]?.title || 'None'}
                            </span>
                          </div>
                          <div>
                            <span className="text-white/40 block">Top Artist</span>
                            <span className="font-semibold text-white truncate block">
                              {replayData.topArtists[0]?.name || 'None'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom Actions */}
              <div className="relative z-20 flex items-center justify-between pt-4 border-t border-white/10">
                <button
                  onClick={() => goToSlide(0)}
                  className="text-xs font-semibold text-white/60 hover:text-white flex items-center gap-1 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restart
                </button>

                <button
                  onClick={handleShareStory}
                  className="h-10 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share Story
                </button>
              </div>
            </div>
          ) : (
            /* LIST / OVERVIEW MODE (Accessible / Reduced Motion) */
            <div className="w-full max-w-xl space-y-6">
              {/* Header card */}
              <GlassCard className="p-6 text-center space-y-2">
                <div className="text-4xl">{replayData.persona.badge}</div>
                <h1 className="text-3xl font-black tracking-tight text-white">
                  {replayData.year} Year in Review
                </h1>
                <p className="text-sm text-brand font-semibold">{replayData.persona.title}</p>
                <p className="text-xs text-white/60 max-w-sm mx-auto">
                  {replayData.persona.description}
                </p>

                <div className="pt-4 grid grid-cols-3 gap-2 border-t border-white/10 mt-4">
                  <div>
                    <div className="text-2xl font-black text-white">
                      {replayData.totalMinutes.toLocaleString()}
                    </div>
                    <div className="text-[10px] uppercase font-semibold text-white/50">Minutes</div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-white">
                      {replayData.totalTracksListened.toLocaleString()}
                    </div>
                    <div className="text-[10px] uppercase font-semibold text-white/50">Songs</div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-white">
                      {replayData.longestStreakDays}
                    </div>
                    <div className="text-[10px] uppercase font-semibold text-white/50">
                      Day Streak
                    </div>
                  </div>
                </div>
              </GlassCard>

              {/* Top Tracks */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold tracking-wider uppercase text-white/70">
                  Top Songs
                </h3>
                <div className="space-y-2">
                  {replayData.topTracks.map((t, idx) => (
                    <GlassCard key={t.id} className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-bold text-white/40 w-4 text-center">
                          {idx + 1}
                        </span>
                        <img
                          src={t.coverUrl || '/images/placeholder.png'}
                          alt={t.title}
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{t.title}</p>
                          <p className="text-xs text-white/60 truncate">{t.artist}</p>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-white/40">{t.playCount} plays</span>
                    </GlassCard>
                  ))}
                </div>
              </div>

              {/* Top Artists */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold tracking-wider uppercase text-white/70">
                  Top Artists
                </h3>
                <div className="space-y-2">
                  {replayData.topArtists.map((a, idx) => (
                    <GlassCard key={a.name} className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-bold text-white/40 w-4 text-center">
                          {idx + 1}
                        </span>
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-800">
                          <img
                            src={a.coverUrl || '/images/placeholder.png'}
                            alt={a.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{a.name}</p>
                          <p className="text-xs text-white/60 truncate">
                            {a.minutes.toLocaleString()} minutes
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-white/40">{a.playCount} plays</span>
                    </GlassCard>
                  ))}
                </div>
              </div>

              {/* Share button */}
              <div className="pt-4 flex justify-center">
                <button
                  onClick={handleShareStory}
                  className="h-10 px-6 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                >
                  <Share2 className="w-4 h-4" />
                  Share Replay Story
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
