"use client";

import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { getArtist } from "@/lib/api";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Play, Pause, Disc3, Music2, Heart, Share, BadgeCheck, Plus, X, Search, CheckCircle2, Shuffle } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { audioEngine } from "@/lib/audio-engine";
import { cn, getMediaUrl, getTrackCover, formatDisplayTitle, formatArtists } from "@/lib/utils";
import { useAlbumColor } from "@/hooks/useAlbumColor";
import { MarqueeText } from "@/components/shared/MarqueeText";
import { LiquidBackground } from "@/components/shared/LiquidBackground";
import { PopularTracks } from "./components/PopularTracks";
import { ArtistSpotlight } from "./components/ArtistSpotlight";
import { DiscographyTabs } from "./components/DiscographyTabs";
import { FansAlsoLike } from "./components/FansAlsoLike";
import { StatsForwardAbout } from "./components/StatsForwardAbout";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { ArrowLeft, MoreHorizontal, Download, Share2, User, Crown, Compass, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuSeparator,
 DropdownMenuTrigger,
 DropdownMenuSub,
 DropdownMenuSubTrigger,
 DropdownMenuPortal,
 DropdownMenuSubContent
} from "@/components/ui/dropdown-menu";

// Animated audio visualizer — 4 bars bouncing
function Visualizer() {
 return (
 <div className="flex items-end gap-[2px] h-[10px] w-5 justify-center mb-0.5">
 {[0.6, 1.0, 0.4, 0.8].map((initialH, i) => (
 <motion.span
 key={i}
 className="w-[3px] bg-red-500 rounded-full"
 animate={{ scaleY: [initialH, 1.2, initialH * 0.5, 1, initialH] }}
 transition={{ duration: 0.8 + i * 0.1, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" }}
 style={{ height: 10, transformOrigin: "bottom" }}
 />
 ))}
 </div>
 );
}

export default function ArtistPage() {
 const params = useParams();
 const router = useRouter();
 const id = params?.id as string;
 const queryClient = useQueryClient();
 const { setTrack, currentTrack, isPlaying, togglePlay } = usePlayerStore();
 const { setPlayerMinimized, openDownloadModal, isLyricsOpen, setStickyPageTitle, isFullScreenPlayerOpen } = useUIStore();

 // Ref on the visible artist name h1 in the hero
 const heroNameRef = useRef<HTMLHeadingElement>(null);

 const { data: artist, isLoading } = useQuery({
 queryKey: ['artist', id],
 queryFn: async () => {
 const res = await getArtist(id);
 return res.data;
 },
 enabled: !!id,
 });

  // IntersectionObserver: when half the text is hidden under the header, it slides up into the top bar
  useEffect(() => {
  if (!heroNameRef.current) return;
  const el = heroNameRef.current;
  const observer = new IntersectionObserver(
  ([entry]) => {
  setStickyPageTitle(entry.isIntersecting ? null : (artist?.name ?? null));
  },
  { threshold: 0.5, rootMargin: "-30px 0px 0px 0px" }
  );
  observer.observe(el);
  return () => {
  observer.disconnect();
  setStickyPageTitle(null);
  };
  }, [artist?.name, setStickyPageTitle]);

 const colors = useAlbumColor(artist?.imageUrl || artist?.coverUrl, artist?.aura_color);

 const { isAuthenticated } = useAuthStore();
 const { data: likedTrackIds } = useQuery({
 queryKey: ['liked-track-ids'],
 queryFn: async () => {
  const res = await api.get('tracks/liked');
  const arr = Array.isArray(res.data) ? res.data : (res.data?.items || []);
  return arr.map((t: any) => t.id);
 },
 staleTime: 1000 * 60 * 5,
 enabled: isAuthenticated
 });

 const { data: playlists } = useQuery({
 queryKey: ['my-playlists'],
 queryFn: async () => {
 try {
 const res = await api.get('playlists/my');
 const arr = Array.isArray(res.data) ? res.data : (res.data?.items || []);
 return arr;
 } catch (e) { return []; }
 },
 enabled: isAuthenticated
 });

 const toggleLike = async (trackId: string, e: React.MouseEvent) => {
 e.stopPropagation();
 try {
 await api.post(`tracks/${trackId}/like`);
 queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
 queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
 } catch (err) {}
 };

 const addToPlaylist = async (trackId: string, playlistId: string, e: React.MouseEvent) => {
 e.stopPropagation();
 try {
 await api.post(`playlists/${playlistId}/tracks`, { trackId });
 queryClient.invalidateQueries({ queryKey: ['my-playlists'] });
 } catch (err) {}
 };

 const shareTrack = (trackId: string, e: React.MouseEvent) => {
 e.stopPropagation();
 navigator.clipboard.writeText(`${window.location.origin}/track/${trackId}`);
 };

 const API_URL = (import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL) || 'https://zenify-production-111f.up.railway.app/api';
 const proxy = (url: string) => `${API_URL}/utils/proxy-image?url=${encodeURIComponent(url)}`;

 // Track-picker state
 const [showTrackPicker, setShowTrackPicker] = useState(false);
 const [trackSearch, setTrackSearch] = useState('');
 const [allTracks, setAllTracks] = useState<any[]>([]);
 const [tracksLoading, setTracksLoading] = useState(false);
 const [assigning, setAssigning] = useState<string | null>(null);
 const [justAssigned, setJustAssigned] = useState<string | null>(null);

 const openTrackPicker = async () => {
 setShowTrackPicker(true);
 setTracksLoading(true);
 try {
 const token = localStorage.getItem('token') || sessionStorage.getItem('token');
 const headers: Record<string, string> = {};
 if (token) {
 headers['Authorization'] = `Bearer ${token}`;
 }

 const res = await fetch(`${API_URL}/tracks?limit=500`, { headers });
 if (!res.ok) {
 throw new Error(`Failed to fetch tracks: ${res.status} ${res.statusText}`);
 }

 const data = await res.json();
 // Handle {items: [], total} or {data: []} or plain [] responses
 const tracks = Array.isArray(data)
 ? data
 : Array.isArray(data?.items)
 ? data.items
 : Array.isArray(data?.data)
 ? data.data
 : [];
 setAllTracks(tracks || []);
 } catch (err) {
 console.error('Failed to load tracks:', err);
 }
 setTracksLoading(false);
 };

 const assignTrack = async (trackId: string) => {
 if (!artist) return;
 setAssigning(trackId);
 try {
 await fetch(`${API_URL}/tracks/${trackId}`, {
 method: 'PUT',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${localStorage.getItem('token')}`,
 },
 body: JSON.stringify({ artistName: artist.name }),
 });
 setJustAssigned(trackId);
 setTimeout(() => setJustAssigned(null), 2000);
 queryClient.invalidateQueries({ queryKey: ['artist', id] });
 } catch { }
 setAssigning(null);
 };

 if (isLoading) {
 return (
 <div className="flex items-center justify-center min-h-[60vh] bg-black">
 <ZenLoading size="md" />
 </div>
 );
 }

 if (!artist) {
 return (
 <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 opacity-30 bg-black">
 <Disc3 size={64} strokeWidth={1} />
 <p className="text-sm font-bold tracking-tight text-white/40">Artist not found</p>
 </div>
 );
 }

 const isArtistActive = artist.topTracks?.some((t: any) => t.id === currentTrack?.id);

 const imageUrl = artist.imageUrl;

 const birthDateObj = artist.birthDate ? new Date(artist.birthDate) : null;
 const isValidDate = birthDateObj && !isNaN(birthDateObj.getTime());

 const formattedBirthDate = isValidDate
 ? birthDateObj.toLocaleDateString(undefined, {
 year: 'numeric',
 month: 'long',
 day: 'numeric'
 })
 : null;

 const age = isValidDate
 ? new Date().getFullYear() - birthDateObj.getFullYear()
 : null;

 const filteredTracks = (allTracks || []).filter(track => {
 const query = (trackSearch || "").toLowerCase();
 const titleMatch = track.title?.toLowerCase().includes(query);
 const artistMatch = (track.artist?.name || track.artistName || "").toLowerCase().includes(query);
 return titleMatch || artistMatch;
 });

 const handlePlayTopTracks = () => {
 if (!artist.topTracks?.length) return;
 if (isArtistActive) {
 togglePlay();
 } else {
 setTrack(artist.topTracks[0], artist.topTracks);
 setPlayerMinimized(false);
 }
 };

 const handleShufflePlay = () => {
 if (!artist.topTracks?.length) return;
 useUIStore.getState().setPlayerMinimized(false);
 const player = usePlayerStore.getState();
 if (!player.isShuffled) {
 player.toggleShuffle();
 }
 const randomTrack = artist.topTracks[Math.floor(Math.random() * artist.topTracks.length)];
 player.setTrack(randomTrack, artist.topTracks);
 };

 const handlePlayTrack = (track: any) => {
 if (window.getSelection()?.toString()) return;
 if (currentTrack?.id === track.id) {
 togglePlay();
 } else {
 setTrack(track, artist.topTracks);
 setPlayerMinimized(false);
 }
 };

 const bannerUrl = artist.coverUrl || artist.imageUrl || null;
return (
 <div className="min-h-screen w-full bg-black overflow-x-hidden text-white relative">
  {bannerUrl && !isFullScreenPlayerOpen && (
    <div 
      className="absolute top-0 left-0 right-0 h-[40vh] md:h-[50vh] overflow-hidden pointer-events-none z-0"
      style={{
        maskImage: "linear-gradient(to bottom, black 0%, black 50%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 50%, transparent 100%)",
      }}
    >
      <LiquidBackground coverUrl={bannerUrl} />
    </div>
  )}
 
 <div className="w-full relative z-10">
 <div className="relative h-[55vh] md:h-[70vh] w-full">
 <div className="relative h-full w-full overflow-hidden bg-transparent group/banner">
 {/* Background image with hover effect */}
 {bannerUrl ? (
 <img
 src={getMediaUrl(bannerUrl) || undefined}
 onError={(e) => {
 const el = e.target as HTMLImageElement;
 if (!el.src.includes('proxy-image')) el.src = proxy(bannerUrl || '');
 }}
 className="absolute inset-0 w-full h-full object-cover object-[50%_25%]"
 />
 ) : (
 <div className="absolute inset-0 bg-black/10" />
 )}

 {/* Gradient overlays */}
 <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
 <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/20 to-transparent" />

 <div className="absolute inset-0 flex flex-col justify-end px-6 pb-12 md:px-12 md:pb-16">
 <motion.div 
 initial={{ opacity: 0, y: 30 }} 
 animate={{ opacity: 1, y: 0 }} 
 transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
 className="text-left w-full min-w-0 overflow-visible z-10 relative"
 >
 <div className="w-full min-w-0">
 <h1 ref={heroNameRef} className="text-4xl md:text-5xl font-brand text-white tracking-tighter leading-[1.1] mb-4 drop-shadow-2xl pt-2 pb-1 font-black">
 {formatDisplayTitle(artist.name)}
 </h1>
 </div>

 {artist.role && (
 <p className="text-sm font-bold text-red-500 uppercase tracking-widest mb-4 opacity-90">
 {artist.role}
 </p>
 )}

 {/* Action buttons */}
 <div className="flex items-center gap-3">
 <button
 onClick={handlePlayTopTracks}
 className="flex-1 md:flex-initial h-12 px-10 rounded-xl bg-[#1c1c1e] border border-white/5 text-white hover:bg-[#2c2c2e] transition-all flex items-center justify-center gap-2 font-bold text-[15px] active:scale-95"
 >
 {isPlaying && isArtistActive ? (
 <Pause size={18} className="text-red-500" fill="currentColor" />
 ) : (
 <Play size={18} className="text-red-500" fill="currentColor" />
 )}
 {isPlaying && isArtistActive ? 'Pause' : 'Play'}
 </button>

 <button 
 onClick={handleShufflePlay}
 className="flex-1 md:flex-initial h-12 px-10 rounded-xl bg-[#1c1c1e] border border-white/5 text-white hover:bg-[#2c2c2e] transition-all flex items-center justify-center gap-2 font-bold text-[15px] active:scale-95"
 >
 <Shuffle size={18} className="text-red-500" fill="currentColor" />
 Shuffle
 </button>
 
 <button 
 onClick={openTrackPicker}
 className="hidden md:flex h-12 px-6 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all items-center gap-2 font-bold text-sm"
 >
 <Plus size={18} className="text-red-500" />
 Add
 </button>

 <button className="hidden md:flex w-12 h-12 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all items-center justify-center">
 <Share size={18} />
 </button>
 </div>
 </motion.div>
 </div>
 </div>
 </div>
  {/* ── MAIN CONTENT ─────────────────────────────────── */}
  <div className="px-6 md:px-12 mt-12 pb-24 max-w-[1600px] mx-auto w-full">
    
    <ArtistSpotlight 
      artist={artist} 
      onPlay={(track) => {
        if (currentTrack?.id === track.id) togglePlay();
        else setTrack(track, artist.topTracks);
      }} 
    />

    <PopularTracks
      tracks={artist.topTracks || []}
      currentTrackId={currentTrack?.id}
      isPlaying={isPlaying}
      likedTrackIds={likedTrackIds || []}
      onPlayTrack={(track) => handlePlayTrack(track)}
      onToggleLike={(trackId, e) => toggleLike(trackId, e)}
      renderDropdown={(track) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-2 text-white/30 hover:text-white transition-colors outline-none bg-transparent rounded-full hover:bg-white/10 opacity-0 group-hover:opacity-100 sm:opacity-100">
              <MoreHorizontal size={20} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 bg-[#0E0E10]/95 backdrop-blur-xl border-white/10" align="end">
            <DropdownMenuItem onClick={() => openDownloadModal(track)} className="cursor-pointer focus:bg-white/5 py-2.5">
              <Download size={14} className="mr-2 opacity-70" /> Download
            </DropdownMenuItem>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="cursor-pointer focus:bg-white/5 py-2.5">
                <Plus size={14} className="mr-2 opacity-70" /> Add to Playlist
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="bg-[#0E0E10]/95 backdrop-blur-xl border-white/10 w-48">
                  {(Array.isArray(playlists) ? playlists : []).map((p: any) => (
                    <DropdownMenuItem 
                      key={p.id} 
                      className="cursor-pointer focus:bg-white/5 py-2"
                      onClick={(e) => addToPlaylist(track.id, p.id, e)}
                    >
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub> 

            <DropdownMenuSeparator className="bg-white/5" />
            <DropdownMenuItem onClick={(e) => shareTrack(track.id, e)} className="cursor-pointer focus:bg-white/5 py-2.5">
              <Share2 size={14} className="mr-2 opacity-70" /> Share Link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    />

    <DiscographyTabs albums={artist.albums || []} />
    
    <FansAlsoLike currentArtistId={artist.id} />
    
    {/* ── ABOUT FOOTER CARD ─────────────────────────────── */}
    <section>
    <div className="flex items-center gap-3 mb-6">
    <Info size={24} className="text-brand" />
    <h2 className="text-2xl font-bold text-white tracking-tight">About {formatDisplayTitle(artist.name)}</h2>
    </div>
    
    <div className={cn(
    "rounded-xl overflow-hidden p-5 md:p-6 transition-all shadow-xl w-full",
    "bg-white/[0.02] hover:bg-white/[0.04] border border-white/5"
    )}>
    <div className="flex flex-col sm:flex-row gap-6 md:gap-8 items-center sm:items-start">
    {/* Left Col: Avatar + Name */}
    <div className="shrink-0 flex flex-col items-center gap-3">
    <div className="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden border border-white/10 bg-zinc-800 shadow-2xl">
    {imageUrl ? (
    <img
    src={getMediaUrl(imageUrl)}
    onError={(e) => {
    const el = e.target as HTMLImageElement;
    if (!el.src.includes('proxy-image')) el.src = proxy(imageUrl || '');
    }}
    className="w-full h-full object-cover"
    alt={artist.name}
    />
    ) : (
    <div className="w-full h-full flex items-center justify-center text-white/20 font-bold text-3xl">
    {artist.name?.charAt(0).toUpperCase()}
    </div>
    )}
    </div>
    <div className="text-center">
    <p className="text-lg font-bold text-white tracking-tight leading-tight">{formatDisplayTitle(artist.name)}</p>
    {artist.verified && (
    <div className="flex items-center justify-center gap-1.5 mt-1">
    <BadgeCheck size={12} className="text-brand" />
    <span className="text-[10px] font-bold text-brand uppercase tracking-wider">Verified Artist</span>
    </div>
    )}
    </div>
    </div>
  
    {/* Right Col: Bio + Metadata Grid */}
    <div className="flex-1 w-full min-w-0 flex flex-col justify-center">
    <p className="text-[13px] md:text-[14px] text-white/70 leading-relaxed mb-6 font-medium">
    {artist.bio || "No biography recorded for this artist yet."}
    </p>
    
    {(formattedBirthDate || artist.role || artist.trackCount !== undefined) && (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-white/[0.06]">
    {formattedBirthDate && (
    <div className="flex flex-col">
    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Born</p>
    <p className="text-[13px] font-bold text-white/90">{formattedBirthDate}</p>
    {age && <p className="text-[10px] text-white/40 mt-0.5 font-medium">{age} years old</p>}
    </div>
    )}
    {artist.role && (
    <div className="flex flex-col">
    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Role</p>
    <p className="text-[13px] font-bold text-white/90">{artist.role}</p>
    </div>
    )}
    <div className="flex flex-col">
    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Tracks</p>
    <p className="text-[13px] font-bold text-white/90">{artist.trackCount || 0}</p>
    </div>
    </div>
    )}
    </div>
    </div>
    </div>
    </section>

  </div>
  </div>

 {/* ── TRACK PICKER MODAL ─────────────────────────────── */}
 <AnimatePresence>
 {showTrackPicker && (
 <>
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
 onClick={() => setShowTrackPicker(false)}
 />
 <motion.div
 initial={{ opacity: 0, scale: 0.95, y: 20 }}
 animate={{ opacity: 1, scale: 1, y: 0 }}
 exit={{ opacity: 0, scale: 0.95, y: 20 }}
 className="fixed inset-x-4 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[540px] z-50 bg-[#111] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]"
 >
 <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
 <div>
 <p className="text-white font-semibold text-sm">Add Tracks to {artist.name}</p>
 <p className="text-[10px] text-white/30 mt-0.5">Click a track to assign it to this artist</p>
 </div>
 <button
 onClick={() => setShowTrackPicker(false)}
 className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"
 >
 <X size={14} />
 </button>
 </div>

 <div className="px-5 py-3 border-b border-white/[0.06]">
 <div className="relative">
 <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
 <input
 autoFocus
 type="text"
 placeholder="Search tracks or artists..."
 value={trackSearch}
 onChange={(e) => setTrackSearch(e.target.value)}
 className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/25 outline-none focus:border-brand/50 transition-colors"
 />
 </div>
 </div>

 <div className="flex-1 overflow-y-auto py-2 px-2">
 {tracksLoading ? (
 <div className="flex items-center justify-center py-12">
 <ZenLoading size="sm" />
 </div>
 ) : filteredTracks.length === 0 ? (
 <div className="flex items-center justify-center py-12 text-white/20 text-sm">No tracks found</div>
 ) : (
 filteredTracks.map((track) => {
 const isCurrentArtist = (track.artist?.name || track.artistName) === artist.name;
 const isJustDone = justAssigned === track.id;
 const isBusy = assigning === track.id;
 const cover = track.coverUrl || track.album?.coverUrl;
 return (
 <button
 key={track.id}
 onClick={() => !isCurrentArtist && assignTrack(track.id)}
 disabled={isBusy || isCurrentArtist}
 className={cn(
 "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left",
 isCurrentArtist ? "opacity-40 cursor-default" : "hover:bg-white/[0.05] active:scale-[0.98] cursor-pointer"
 )}
 >
 <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
 {cover ? <img src={getMediaUrl(cover)} className="w-full h-full object-cover" alt="" /> : (
 <div className="w-full h-full flex items-center justify-center">
 <Music2 size={12} className="text-zinc-600" />
 </div>
 )}
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-brand font-bold text-white truncate">{formatDisplayTitle(track.title)}</p>
 <div className="text-[12px] font-medium text-white/50 truncate">
 {formatArtists(track)}
 </div>
 </div>
 <div className="shrink-0">
 {isJustDone ? <CheckCircle2 size={16} className="text-green-400" />
 : isBusy ? <ZenLoading size="sm" />
 : isCurrentArtist ? <span className="text-[9px] text-white/20 font-black uppercase tracking-wider">Added</span>
 : <Plus size={14} className="text-white/20" />}
 </div>
 </button>
 );
 })
 )}
 </div>
 </motion.div>
 </>
 )}
 </AnimatePresence>
 </div>
 );
}
