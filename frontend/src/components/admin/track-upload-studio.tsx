"use client";

import React, { useState, useRef, useCallback } from "react";
import { CoverCropModal, type CropState } from "./CoverCropModal";
import { AudioTrimmer, type TrimState } from "./AudioTrimmer";
import {
 Upload,
 Image as ImageIcon,
 FileAudio,
 Check,
 Music,
 Mic2,
 ChevronLeft,
 ChevronRight,
 Sparkles,
 CheckCircle2,
 AlertCircle,
 Shield,
 AtSign,
 Lock,
 Unlock,
 MessageSquare,
 Download as DownloadIcon,
 Calendar,
 Clock
} from "lucide-react";
import { ZenifyText } from "@/components/shared/ZenifyText";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { ModernTimePicker } from "@/components/ui/modern-time-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn, getMediaUrl } from "@/lib/utils";
import api from "@/lib/api";
import { format } from "date-fns";
import { ZenLoading } from "@/components/ui/ZenLoading";

const GENRES = ["Cinema", "Electronic", "Hip-Hop / Rap", "R&B / Soul", "Pop", "Indie / Alternative", "Rock", "Jazz", "Classical", "Afrobeats", "Latin", "Ambient", "Lo-fi", "House", "Techno", "Trap"];
const TIMES = Array.from({ length: 48 }, (_, i) => {
 const h = Math.floor(i / 2),
 m = i % 2 === 0 ? "00" : "30",
 ap = h < 12 ? "AM" : "PM",
 h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
 return `${h12}:${m} ${ap}`;
});

interface TrackUploadStudioProps {
 onSuccess?: () => void;
 editMode?: boolean;
 initialTrack?: any;
}

// Mini audio progress slider for collection track previews
function TrackMiniSlider({ 
  getAudioRef, 
  isPlaying, 
  initialDuration, 
  onSeek 
}: { 
  getAudioRef: () => HTMLAudioElement | null; 
  isPlaying: boolean; 
  initialDuration?: number;
  onSeek?: (time: number) => void;
}) {
 const [currentTime, setCurrentTime] = useState(0);
 const [duration, setDuration] = useState(initialDuration || 0);
 const [isSeeking, setIsSeeking] = useState(false);

 React.useEffect(() => {
 if (initialDuration && initialDuration > 0 && (!duration || duration === 0)) {
 setDuration(initialDuration);
 }
 }, [initialDuration]);

 React.useEffect(() => {
 const interval = setInterval(() => {
 const el = getAudioRef();
 if (el) {
 if (!isSeeking) setCurrentTime(el.currentTime);
 if (el.duration && !isNaN(el.duration) && isFinite(el.duration) && el.duration > 0) {
 setDuration(el.duration);
 }
 }
 }, 200);

 return () => clearInterval(interval);
 }, [getAudioRef, isSeeking]);

 const handleSeekChange = (newTime: number) => {
 setCurrentTime(newTime);
 const el = getAudioRef();
 if (el) {
 try {
 el.currentTime = newTime;
 } catch (err) {
 console.warn('Seek failed:', err);
 }
 }
 if (onSeek) onSeek(newTime);
 };

 const pct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
 const fmt = (s: number) => {
 if (!s || isNaN(s) || !isFinite(s)) return '0:00';
 return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
 };

 return (
 <div className="flex items-center gap-2 mt-1 select-none">
 <span className="text-[9px] text-white/30 font-mono w-7 shrink-0">{fmt(currentTime)}</span>
 <input
 type="range"
 min={0}
 max={duration || 100}
 step={0.1}
 value={currentTime}
 onMouseDown={() => setIsSeeking(true)}
 onTouchStart={() => setIsSeeking(true)}
 onChange={e => handleSeekChange(Number(e.target.value))}
 onMouseUp={() => setIsSeeking(false)}
 onTouchEnd={() => setIsSeeking(false)}
 className="flex-1 h-1 rounded-full appearance-none cursor-pointer accent-brand bg-white/10"
 style={{ background: `linear-gradient(to right, var(--accent-brand, #8b5cf6) ${pct}%, rgba(255,255,255,0.1) ${pct}%)` }}
 />
 <span className="text-[9px] text-white/30 font-mono w-7 shrink-0 text-right">{fmt(duration)}</span>
 </div>
 );
}

export function TrackUploadStudio({ onSuccess, editMode = false, initialTrack }: TrackUploadStudioProps) {
 const [step, setStep] = useState(editMode ? 1 : 0);
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [isCommitted, setIsCommitted] = useState(false);

 // Form State
 const [audioError, setAudioError] = useState<string | null>(null);
 const [audioFile, setAudioFile] = useState<File | null>(null);
 const [audioName, setAudioName] = useState("");
 const [coverFile, setCoverFile] = useState<File | null>(null);
 const [imageUrlInput, setImageUrlInput] = useState("");
 const [audioUrlInput, setAudioUrlInput] = useState("");
 const [externalUrlInput, setExternalUrlInput] = useState("");
 const [isFetchingImage, setIsFetchingImage] = useState(false);
 const [isFetchingAudio, setIsFetchingAudio] = useState(false);
 const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
 const [audioUrlFromLink, setAudioUrlFromLink] = useState<string | null>(null); // Cloudinary URL from auto-fetch

 // Collection State
 const [collectionData, setCollectionData] = useState<any>(null);
 const [isCollectionMode, setIsCollectionMode] = useState(false);
 const [isBatchImporting, setIsBatchImporting] = useState(false);
 const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, activeTrack: "" });
 const [albumNameEdit, setAlbumNameEdit] = useState("");
 const [artistNameEdit, setArtistNameEdit] = useState("");
 const [labelNameEdit, setLabelNameEdit] = useState("Zenify");
 const [isEditingAlbum, setIsEditingAlbum] = useState(false);
 const [albumCoverOverride, setAlbumCoverOverride] = useState("");
 // Batch scheduling state
 const [batchReleaseMode, setBatchReleaseMode] = useState<"now" | "schedule" | "draft">("now");
 const [batchScheduledDate, setBatchScheduledDate] = useState("");
 const [batchScheduledTime, setBatchScheduledTime] = useState("12:00 PM");
 // Batch image fetcher state
 const [batchImageUrl, setBatchImageUrl] = useState("");
 const [batchImagePreview, setBatchImagePreview] = useState("");
 const [batchImageSelectedTracks, setBatchImageSelectedTracks] = useState<Set<number>>(new Set());
 const [isFetchingBatchImage, setIsFetchingBatchImage] = useState(false);
 // Per-track overrides: { [idx]: { included: bool, customUrl: string, previewUrl: string|null, isPlaying: bool } }
 const [trackOverrides, setTrackOverrides] = useState<Record<number, {
 included: boolean;
 customUrl: string;
 customImage: string;
 previewUrl: string | null;
 coverPreviewUrl: string | null;
 isPlaying: boolean;
 isFetching: boolean;
 isFetchingImage?: boolean;
 audioError?: string | null;
 }>>({});
 const trackAudioRefs = useRef<Record<number, HTMLAudioElement | null>>({});

 const [formData, setFormData] = useState({
 title: initialTrack?.title || "",
 artistName: initialTrack?.artist?.name || initialTrack?.artistName || "",
 genre: initialTrack?.genre || "",
 classification: initialTrack?.trackType?.toLowerCase() || "original",
 description: initialTrack?.description || "",
 releaseMode: (initialTrack?.releaseStatus?.toLowerCase() === 'scheduled' ? 'schedule' : initialTrack?.releaseStatus?.toLowerCase() === 'draft' ? 'draft' : 'now') as "now" | "schedule" | "draft",
 scheduledDate: initialTrack?.scheduledAt ? format(new Date(initialTrack.scheduledAt), 'yyyy-MM-dd') : "",
 scheduledTime: initialTrack?.scheduledAt ? format(new Date(initialTrack.scheduledAt), 'hh:mm a') : "12:00 PM",
 isUnlisted: initialTrack?.isUnlisted || false,
 allowDownloads: initialTrack?.allowDownloads ?? true,
 enableComments: initialTrack?.enableComments ?? true,
 copyrightLabel: initialTrack?.copyrightLabel || "",
 bpm: initialTrack?.bpm || "" as string | number,
 key: initialTrack?.key || "",
 featuredArtists: initialTrack?.featuredArtists || "",
 composers: initialTrack?.composers || "",
 lyrics: initialTrack?.lyrics || "",
 });

 const [artists, setArtists] = useState<any[]>([]);
 const [isFetchingArtists, setIsFetchingArtists] = useState(false);
 const [showArtistDropdown, setShowArtistDropdown] = useState(false);
 const [showBatchArtistDropdown, setShowBatchArtistDropdown] = useState(false);
 const [showFeaturedArtistDropdown, setShowFeaturedArtistDropdown] = useState(false);
 const artistDropdownRef = useRef<HTMLDivElement>(null);
 const batchArtistDropdownRef = useRef<HTMLDivElement>(null);
 const featuredArtistDropdownRef = useRef<HTMLDivElement>(null);

 // Fetch all existing artists on mount
 React.useEffect(() => {
   const fetchArtists = async () => {
     setIsFetchingArtists(true);
     try {
       const res = await api.get('/artists/admin');
       if (Array.isArray(res.data)) {
         setArtists(res.data);
       }
     } catch (err) {
       console.error("Failed to fetch artists:", err);
     } finally {
       setIsFetchingArtists(false);
     }
   };
   fetchArtists();
 }, []);

 // Click outside to close dropdowns
 React.useEffect(() => {
   function handleClickOutside(event: MouseEvent) {
     if (artistDropdownRef.current && !artistDropdownRef.current.contains(event.target as Node)) {
       setShowArtistDropdown(false);
     }
     if (batchArtistDropdownRef.current && !batchArtistDropdownRef.current.contains(event.target as Node)) {
       setShowBatchArtistDropdown(false);
     }
     if (featuredArtistDropdownRef.current && !featuredArtistDropdownRef.current.contains(event.target as Node)) {
       setShowFeaturedArtistDropdown(false);
     }
   }
   document.addEventListener("mousedown", handleClickOutside);
   return () => document.removeEventListener("mousedown", handleClickOutside);
 }, []);

 // Audio Preview State
 const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(initialTrack?.audioUrl || null);
 const [isPlaying, setIsPlaying] = useState(false);
 const [currentTime, setCurrentTime] = useState(0);
 const [duration, setDuration] = useState(initialTrack?.duration || 0);
 const audioRef = useRef<HTMLAudioElement | null>(null);

 const [isCertified, setIsCertified] = useState(editMode ? true : false);
 const [coverPreview, setCoverPreview] = useState<string | null>(initialTrack?.coverUrl || null);
 // Crop modal state
 const [cropSrc, setCropSrc] = useState<string | null>(null);
 // Keep original raw URL so Re-crop can reuse it without a new file pick
 const rawCoverSrcRef = useRef<string | null>(null);
 // Persist last crop position/zoom/rotate for Re-crop continuity
 const lastCropStateRef = useRef<CropState | undefined>(undefined);
 // Increment to force img remount after every crop (bypasses browser stale-src caching)
 const [cropCount, setCropCount] = useState(0);
 // Track previous preview URL so we can revoke it on update
 const prevCoverPreviewRef = useRef<string | null>(null);
 // Audio trimmer state
 const originalAudioFileRef = useRef<File | null>(null);
 const originalAudioUrlRef = useRef<string | null>(null);
 const lastTrimStateRef = useRef<TrimState | undefined>(undefined);

 // Alert State
 const [alert, setAlert] = useState<{ show: boolean, type: 'success' | 'error' | 'warning', title: string, message: string }>({
 show: false,
 type: 'success',
 title: '',
 message: ''
 });

 const showAlert = (type: 'success' | 'error' | 'warning', title: string, message: string) => {
 setAlert({ show: true, type, title, message });
 // Auto-close success alerts
 if (type === 'success') {
 setTimeout(() => setAlert(prev => ({ ...prev, show: false })), 4000);
 }
 };

 const STEPS = ["Media", "Metadata", "Release", "Review"];

 const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'audio' | 'cover') => {
 const file = e.target.files?.[0];
 if (!file) return;
 // Reset input so re-selecting same file still fires onChange
 e.target.value = "";

 if (type === 'audio') {
 if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
 const url = URL.createObjectURL(file);
 // Save originals so trimmer Reset can restore them
 if (originalAudioUrlRef.current) URL.revokeObjectURL(originalAudioUrlRef.current);
 originalAudioFileRef.current = file;
 originalAudioUrlRef.current = url;
 lastTrimStateRef.current = undefined;
 setAudioFile(file);
 setAudioName(file.name);
 setAudioPreviewUrl(url);
 setIsPlaying(false);
 setCurrentTime(0);
 setAudioError(null);
 } else {
 // New file selected — clear old crop state so modal starts fresh
 lastCropStateRef.current = undefined;
 if (rawCoverSrcRef.current) URL.revokeObjectURL(rawCoverSrcRef.current);
 const rawUrl = URL.createObjectURL(file);
 rawCoverSrcRef.current = rawUrl;
 setCropSrc(rawUrl);
 }
 };

 const handleCropDone = (croppedFile: File, previewUrl: string, state: CropState) => {
 // Revoke old preview blob to free memory (skip if it's an external URL)
 if (prevCoverPreviewRef.current?.startsWith('blob:')) {
 URL.revokeObjectURL(prevCoverPreviewRef.current);
 }
 prevCoverPreviewRef.current = previewUrl;
 setCoverFile(croppedFile);
 setCoverPreview(previewUrl);
 setCropCount(c => c + 1); // force <img> to remount with new key
 lastCropStateRef.current = state;
 setCropSrc(null);
 };

 const handleCropCancel = () => {
 // Just close — keep rawCoverSrcRef alive for future Re-crop clicks
 setCropSrc(null);
 };

 const handleReCrop = () => {
 if (rawCoverSrcRef.current) {
 setCropSrc(rawCoverSrcRef.current);
 }
 };

 const handleFetchImage = async () => {
 if (!imageUrlInput) return;
 setIsFetchingImage(true);
 try {
 // Native support for Base64 Data URIs (bypasses backend proxy)
 if (imageUrlInput.startsWith('data:image/')) {
 const res = await fetch(imageUrlInput);
 const blob = await res.blob();
 
 if (rawCoverSrcRef.current) URL.revokeObjectURL(rawCoverSrcRef.current);
 lastCropStateRef.current = undefined;
 const rawUrl = URL.createObjectURL(blob);
 rawCoverSrcRef.current = rawUrl;

 const previewUrl = URL.createObjectURL(blob);
 if (prevCoverPreviewRef.current?.startsWith('blob:')) URL.revokeObjectURL(prevCoverPreviewRef.current);
 prevCoverPreviewRef.current = previewUrl;

 setCoverFile(new File([blob], 'cover-from-data-uri.jpg', { type: blob.type }));
 setCoverPreview(previewUrl);
 setCropCount(c => c + 1);
 setImageUrlInput('');
 setIsFetchingImage(false);
 return;
 }

 const { getApiBaseUrl } = await import('@/lib/utils');
 const apiBase = getApiBaseUrl();
 const proxyUrl = `${apiBase}/utils/proxy-image?url=${encodeURIComponent(imageUrlInput)}`;

 const res = await fetch(proxyUrl);
 if (!res.ok) {
 let msg = "We couldn't retrieve that image.";
 try { const j = await res.json(); msg = j.error || msg; } catch { }
 throw new Error(msg);
 }

 const blob = await res.blob();
 if (!blob.type.startsWith('image/')) throw new Error('Not an image');

 // Revoke old raw URL and save fresh one for optional Re-crop
 if (rawCoverSrcRef.current) URL.revokeObjectURL(rawCoverSrcRef.current);
 lastCropStateRef.current = undefined;
 const rawUrl = URL.createObjectURL(blob);
 rawCoverSrcRef.current = rawUrl;

 // Apply directly to preview — no crop modal
 const previewUrl = URL.createObjectURL(blob);
 if (prevCoverPreviewRef.current?.startsWith('blob:')) URL.revokeObjectURL(prevCoverPreviewRef.current);
 prevCoverPreviewRef.current = previewUrl;

 setCoverFile(new File([blob], 'cover-from-url.jpg', { type: blob.type }));
 setCoverPreview(previewUrl);
 setCropCount(c => c + 1);
 setImageUrlInput('');
 } catch (err: any) {
 showAlert('error', 'Imagery Failed', err?.message || "We couldn't retrieve that image. Try right-clicking the image and choosing \"Copy image address\".");
 } finally {
 setIsFetchingImage(false);
 }
 };

 const handleFetchAudio = async () => {
 if (!audioUrlInput) return;
 setIsFetchingAudio(true);
 showAlert('warning', 'Connecting to Hub', `Fetching audio stream for the provided link...`);
 
 try {
 const res = await api.get(`/metadata/fetch?url=${encodeURIComponent(audioUrlInput)}&fetchAudio=true`);
 const data = res.data;
 if (!data || data.error) {
 showAlert('error', 'Fetch Interrupted', data?.error || "Invalid response from server");
 setIsFetchingAudio(false);
 return;
 }

 const { getMediaUrl } = await import('@/lib/utils');
 const previewUrlToUse = data.previewUrl || data.audioUrl;
 const resolvedAudioUrl = previewUrlToUse ? (getMediaUrl(previewUrlToUse, 'audio') || previewUrlToUse) : null;
 setAudioUrlFromLink(data.audioUrl);
 setAudioName(data.title || "Matched Track");
 setAudioPreviewUrl(resolvedAudioUrl);
 setDuration(data.duration || 0);

 if (data.audioError) {
 setAudioError(data.audioError);
 showAlert('error', 'Audio Missing', data.audioError);
 } else {
 setAudioError(null);
 if (!data.synced_lyrics && !data.lyrics) {
 showAlert('warning', 'No Lyrics Found', 'Could not find synced lyrics for this track length. Tip: Use "Official Audio" links instead of Music Videos for perfect lyric syncing.');
 } else if (!data.synced_lyrics && data.lyrics) {
 showAlert('warning', 'Only Plain Lyrics Found', 'No perfectly timed lyrics found for this exact audio length. Tip: Music Videos often fail sync due to intros. Try importing the "Official Audio" video.');
 }
 }
 } catch (e: any) {
 setAudioError(e.message || "We couldn't verify that link. Please check the URL and try again.");
 showAlert('error', 'Transmission Failed', "We couldn't verify that link. Please check the URL and try again.");
 } finally {
 setIsFetchingAudio(false);
 }
 };

 const handleTrimApply = (trimmedFile: File, trimmedUrl: string, state: TrimState) => {
 if (audioPreviewUrl?.startsWith('blob:') && audioPreviewUrl !== originalAudioUrlRef.current) {
 URL.revokeObjectURL(audioPreviewUrl);
 }
 lastTrimStateRef.current = state;
 setAudioFile(trimmedFile);
 setAudioName(trimmedFile.name);
 setAudioPreviewUrl(trimmedUrl);
 setDuration(state.end - state.start);
 setCurrentTime(0);
 setIsPlaying(false);
 };

 const handleTrimReset = () => {
 if (!originalAudioFileRef.current || !originalAudioUrlRef.current) return;
 if (audioPreviewUrl?.startsWith('blob:') && audioPreviewUrl !== originalAudioUrlRef.current) {
 URL.revokeObjectURL(audioPreviewUrl);
 }
 lastTrimStateRef.current = undefined;
 setAudioFile(originalAudioFileRef.current);
 setAudioName(originalAudioFileRef.current.name);
 setAudioPreviewUrl(originalAudioUrlRef.current);
 setDuration(0);
 setCurrentTime(0);
 setIsPlaying(false);
 };

 const initTrackOverrides = (tracks: any[]) => {
 const init: Record<number, any> = {};
 tracks.forEach((track, idx) => {
 const defaultAudio = track.audioUrl || track.previewUrl || "";
 init[idx] = { 
 included: true, 
 customUrl: defaultAudio, 
 customImage: track.cover || "", 
 previewUrl: track.previewUrl || track.audioUrl || null, 
 coverPreviewUrl: track.cover || null, 
 isPlaying: false, 
 isFetching: false,
 audioError: track.audioError || null
 };
 });
 setTrackOverrides(init);
 };

 const handleFetchTrackImage = (idx: number) => {
 const link = trackOverrides[idx]?.customImage?.trim();
 if (!link) return;
 setTrackField(idx, 'coverPreviewUrl', link);
 showAlert('success', 'Image Fetched', 'Track cover updated for preview.');
 };

 const setTrackField = (idx: number, field: string, value: any) => {
 setTrackOverrides(prev => ({ ...prev, [idx]: { ...prev[idx], [field]: value } }));
 };

 const handleFetchTrackPreview = async (idx: number, track: any) => {
 const override = trackOverrides[idx];
 const linkToUse = override?.customUrl?.trim() || track.audioUrl || track.previewUrl || null;
 setTrackField(idx, 'isFetching', true);

 // 1. Show info alert
 showAlert('warning', 'Fetching Sonic Data', `Synchronizing audio for "${track.title}" from ${linkToUse ? 'custom link' : 'search pool'}...`);

 // 2. Stop all audio immediately (both main and collection previews)
 if (audioRef.current) {
 audioRef.current.pause();
 setIsPlaying(false);
 }
 Object.keys(trackAudioRefs.current).forEach(k => {
 const ref = trackAudioRefs.current[+k];
 if (ref) { ref.pause(); }
 setTrackField(+k, 'isPlaying', false);
 });

 try {
 let audioUrl: string | null = null;
 let res: any;
 if (linkToUse) {
 // Fetch from custom URL
 res = await api.get(`/metadata/fetch?url=${encodeURIComponent(linkToUse)}&fetchAudio=true`);
 audioUrl = res.data?.previewUrl || res.data?.audioUrl || null;
 } else {
 // Search by track name
 const query = `${track.artist || collectionData.artist} - ${track.title}`;
 res = await api.get(`/metadata/fetch?url=${encodeURIComponent(query)}&fetchAudio=true&mode=search`);
 audioUrl = res.data?.previewUrl || res.data?.audioUrl || null;
 }
 if (audioUrl) {
 setTrackField(idx, 'previewUrl', audioUrl);
 if (res.data?.audioUrl) {
 setTrackField(idx, 'customUrl', res.data.audioUrl);
 }
 // ALWAYS update to the best found cover if we're doing a specific track check
 if (res.data?.cover) {
 setTrackField(idx, 'coverPreviewUrl', res.data.cover);
 }
 setTrackField(idx, 'audioError', null);
 showAlert('success', 'Sync Successful', `Audio and HQ Artwork for "${track.title}" has been synchronized.`);
 } else {
 const errMsg = res.data?.audioError || "No matching audio found in sonic hub.";
 setTrackField(idx, 'audioError', errMsg);
 showAlert('error', 'Fetch Failed', `${errMsg} Try pasting a custom YouTube link.`);
 }
 } catch (err: any) { 
const errMsg = err?.message || "Could not fetch preview.";
 setTrackField(idx, 'audioError', errMsg);
 showAlert('error', 'Fetch Failed', 'Could not fetch preview.'); 
 }
 finally { setTrackField(idx, 'isFetching', false); }
 };

  const [isAligningFormLyrics, setIsAligningFormLyrics] = useState(false);

  const handleAutoAlignFormLyrics = async () => {
    if (!formData.lyrics || !formData.lyrics.trim()) {
      showAlert("error", "No Lyrics", "Please paste plain lyrics text first.");
      return;
    }
    setIsAligningFormLyrics(true);
    try {
      const res = await api.post('/metadata/align-plain-lyrics', {
        audioUrl: audioPreviewUrl,
        plainLyrics: formData.lyrics
      });

      if (res.data?.success && res.data.rawLrc) {
        setFormData(prev => ({
          ...prev,
          synced_lyrics: JSON.stringify(res.data.syncedTokens),
          raw_lrc: res.data.rawLrc
        }));
        showAlert("success", "AI Sync Complete", `✨ Automatically generated timestamps for ${res.data.linesCount} lyric lines!`);
      } else {
        showAlert("error", "Sync Failed", "Could not generate AI timestamps.");
      }
    } catch (err: any) {
      showAlert("error", "Sync Error", err?.response?.data?.message || "Failed to align lyrics to audio.");
    } finally {
      setIsAligningFormLyrics(false);
    }
  };

 const handleToggleTrackPlay = (idx: number) => {
    const ref = trackAudioRefs.current[idx];
    if (!ref) return;
    const isCurrentlyPlaying = trackOverrides[idx]?.isPlaying;
    // Pause all others
    Object.keys(trackAudioRefs.current).forEach(k => {
      const r = trackAudioRefs.current[+k];
      if (r && +k !== idx) { 
        r.pause(); 
        setTrackField(+k, 'isPlaying', false); 
      }
    });
    if (isCurrentlyPlaying) { 
      ref.pause(); 
      setTrackField(idx, 'isPlaying', false); 
    } else { 
      const rawPreviewUrl = trackOverrides[idx]?.previewUrl;
      if (!rawPreviewUrl) {
        showAlert('error', 'Playback Blocked', 'No audio preview stream is available for this track. Click the spark icon to fetch audio.');
        return;
      }
      const targetSrc = getMediaUrl(rawPreviewUrl, 'audio');
      if (targetSrc && ref.src !== targetSrc) {
        ref.src = targetSrc;
        ref.load();
      }
      const playPromise = ref.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setTrackField(idx, 'isPlaying', true);
          })
          .catch((err) => {
            console.error("Track playback failed:", err);
            setTrackField(idx, 'isPlaying', false);
            if (err?.name === 'AbortError' || err?.message?.includes('interrupted')) return;
            showAlert('error', 'Playback Failed', 'Could not play the track preview. The source may be restricted, blocked, or in an unsupported format.');
          });
      } else {
        setTrackField(idx, 'isPlaying', true);
      }
    }
  };

 const handleFetchExternalMetadata = async () => {
 if (!externalUrlInput) return;
 setIsFetchingMetadata(true);

 showAlert('warning', 'Connecting to Hub', `Fetching metadata and sonic assets for the provided link...`);

 // Stop all audio immediately
 if (audioRef.current) {
 audioRef.current.pause();
 setIsPlaying(false);
 }
 Object.keys(trackAudioRefs.current).forEach(k => {
 const ref = trackAudioRefs.current[+k];
 if (ref) { ref.pause(); }
 setTrackField(+k, 'isPlaying', false);
 });

 try {
 const res = await api.get(`/metadata/fetch?url=${encodeURIComponent(externalUrlInput)}&fetchAudio=true`);
 const data = res.data;
 if (!data || data.error) {
 showAlert('error', 'Fetch Interrupted', data?.error || "Invalid response from server");
 setIsFetchingMetadata(false);
 return;
 }

 if (data.isCollection) {
 setCollectionData(data);
 setAlbumNameEdit(data.title || "");
 setArtistNameEdit(data.artist || "");
 setLabelNameEdit("Zenify");
 initTrackOverrides(data.tracks || []);
 setIsCollectionMode(true);
 setFormData(prev => ({
 ...prev,
 title: data.title || prev.title,
 artistName: data.artist || prev.artistName,
 genre: "Cinema",
 copyrightLabel: "Zenify"
 }));
 if (data.cover) setCoverPreview(data.cover);
 } else {
 setIsCollectionMode(false);
 setFormData(prev => ({
 ...prev,
 title: data.title || prev.title,
 artistName: data.artist || prev.artistName,
 genre: "Cinema",
 copyrightLabel: "Zenify",
 bpm: data.bpm || "",
 key: data.key || "",
 featuredArtists: data.featuredArtists || "",
 composers: data.composers || "",
 lyrics: data.lyrics || data.raw_lrc || "",
 synced_lyrics: data.synced_lyrics ? JSON.stringify(data.synced_lyrics) : "",
 raw_lrc: data.raw_lrc || "",
 description: data.description || "",
 }));

 if (data.cover) {
 setCoverPreview(data.cover);
 setCropSrc(null); // Clear any existing cropped/local image to show the new imported cover
 }

 // Clear audio file if we imported an external audio stream
      if (data.audioUrl) {
        setAudioFile(null);
      }

      const previewUrlToUse = data.previewUrl || data.audioUrl;
      if (previewUrlToUse) {
        const resolvedAudioUrl = getMediaUrl(previewUrlToUse, 'audio') || previewUrlToUse;

        setAudioUrlFromLink(data.audioUrl || data.previewUrl);
        setAudioName(data.title || "External Audio");
        setAudioPreviewUrl(resolvedAudioUrl);
        setDuration(data.duration || 0);
      }
 setExternalUrlInput("");
 }
 if (data.audioError) {
 setAudioError(data.audioError);
 showAlert('warning', 'Audio Import Warning', `Metadata for "${data.title || 'Track'}" matched, but audio fetch failed: ${data.audioError}`);
 } else {
 setAudioError(null);
 showAlert('success', 'Hub Connection Established', `Successfully matched metadata for "${data.title || 'Track'}". Content is ready for processing.`);
 
 if (!data.synced_lyrics && !data.lyrics) {
 setTimeout(() => showAlert('warning', 'No Lyrics Found', 'Could not find synced lyrics for this track length. Tip: Use "Official Audio" links instead of Music Videos for perfect lyric syncing.'), 4000);
 } else if (!data.synced_lyrics && data.lyrics) {
 setTimeout(() => showAlert('warning', 'Only Plain Lyrics Found', 'No perfectly timed lyrics found for this exact audio length. Tip: Music Videos often fail sync due to intros. Try importing the "Official Audio" video.'), 4000);
 }
 }
 } catch (e: any) {
 const errMsg = e.response?.data?.message || e.message || "We couldn't verify that link. Please check the URL and try again.";
 setAudioError(errMsg);
 showAlert('error', 'Transmission Failed', errMsg);
 } finally {
 setIsFetchingMetadata(false);
 }
 };


 const handleFetchBatchImage = async () => {
 if (!batchImageUrl.trim()) return;
 
 setIsFetchingBatchImage(true);
 try {
 const API_BASE = (import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL)?.replace('/api', '') || 'https://zenify-production-111f.up.railway.app';
 let targetUrl = batchImageUrl.trim();

 // Check if it's a media link (Apple Music, YouTube, Spotify) instead of a direct image
 if (
 targetUrl.includes('apple.com') || 
 targetUrl.includes('youtube.com') || 
 targetUrl.includes('youtu.be') || 
 targetUrl.includes('spotify.com')
 ) {
 try {
 const res = await api.get(`/metadata/fetch?url=${encodeURIComponent(targetUrl)}`);
 if (res.data && res.data.cover) {
 targetUrl = res.data.cover;
 }
 } catch (metaErr) {
 console.warn("Failed to extract image from media link, trying raw URL anyway.", metaErr);
 }
 }

 // Use proxy-image endpoint to fetch HQ version
 const proxyUrl = `${API_BASE}/api/utils/proxy-image?url=${encodeURIComponent(targetUrl)}&cb=${Date.now()}`;
 
 // Test if image loads
 const img = new Image();
 img.crossOrigin = 'anonymous';
 img.src = proxyUrl;
 
 await new Promise((resolve, reject) => {
 img.onload = resolve;
 img.onerror = reject;
 });
 
 setBatchImagePreview(proxyUrl);
 setBatchImageSelectedTracks(new Set());
 showAlert('success', 'Image Fetched', 'High-quality image loaded successfully!');
 } catch (err) {
 showAlert('error', 'Fetch Failed', 'Could not load image. Please check the URL and try again.');
 } finally {
 setIsFetchingBatchImage(false);
 }
 };

 const handleApplyBatchImage = () => {
 if (!batchImagePreview || batchImageSelectedTracks.size === 0) return;
 
 batchImageSelectedTracks.forEach(idx => {
 setTrackField(idx, 'coverPreviewUrl', batchImagePreview);
 });
 
 showAlert('success', 'Images Applied', `Applied HQ image to ${batchImageSelectedTracks.size} track${batchImageSelectedTracks.size !== 1 ? 's' : ''}!`);
 setBatchImageSelectedTracks(new Set());
 };

 const handleImportTrackFromCollection = async (track: any) => {
 setIsFetchingMetadata(true);
 try {
 const query = `${track.artist} - ${track.title}`;
 const res = await api.get(`/metadata/fetch?url=${encodeURIComponent(query)}&fetchAudio=true&mode=search`);
 const data = res.data;

 setFormData(prev => ({
 ...prev,
 title: track.title,
 artistName: track.artist,
 genre: "Cinema",
 copyrightLabel: "Zenify",
 lyrics: track.lyrics || data.lyrics || data.raw_lrc || "",
 bpm: data.bpm || "",
 key: data.key || "",
 featuredArtists: data.featuredArtists || "",
 composers: data.composers || "",
 description: data.description || "",
 }));

 if (collectionData.cover) {
 setCoverPreview(collectionData.cover);
 }

 const previewUrlToUse = data.previewUrl || data.audioUrl;
 if (previewUrlToUse) {
 const resolvedAudioUrl = getMediaUrl(previewUrlToUse, 'audio') || previewUrlToUse;
 setAudioUrlFromLink(data.audioUrl);
 setAudioName(track.title);
 setAudioPreviewUrl(resolvedAudioUrl);
 }

 if (data.audioError) {
 setAudioError(data.audioError);
 showAlert('warning', 'Audio Import Warning', `Metadata for "${track.title}" matched, but audio fetch failed: ${data.audioError}`);
 } else {
 setAudioError(null);
 showAlert('success', 'Track Imported', `"${track.title}" has been added to your upload queue with full metadata.`);
 }
 } catch (e: any) {
 const errMsg = e.response?.data?.message || e.message || "We encountered a problem while fetching this specific track.";
 setAudioError(errMsg);
 showAlert('error', 'Import Failed', errMsg);
 } finally {
 setIsFetchingMetadata(false);
 }
 };


 const handleBatchImport = async () => {
 if (!collectionData?.tracks || isBatchImporting) return;

 const selectedTracks = collectionData.tracks.filter((_: any, idx: number) =>
 trackOverrides[idx]?.included !== false
 );

 setIsBatchImporting(true);
 try {
 const albumTitle = albumNameEdit || collectionData.title;
 const finalArtist = artistNameEdit || collectionData.artist;

 // Prepare release status and scheduled time
 let releaseStatus = "PUBLISHED";
 let scheduledAt = null;
 if (batchReleaseMode === "schedule") {
 releaseStatus = "SCHEDULED";
 if (batchScheduledDate && batchScheduledTime) {
 const baseDate = new Date(batchScheduledDate);
 const match = batchScheduledTime.match(/(\d{2}):(\d{2})\s(AM|PM)/);
 if (match) {
 let hours = parseInt(match[1]);
 const minutes = parseInt(match[2]);
 const ampm = match[3];
 if (ampm === 'PM' && hours !== 12) hours += 12;
 if (ampm === 'AM' && hours === 12) hours = 0;
 baseDate.setHours(hours, minutes, 0, 0);
 scheduledAt = baseDate.toISOString();
 }
 }
 } else if (batchReleaseMode === "draft") {
 releaseStatus = "DRAFT";
 }

 const tracksToImport = selectedTracks.map((track: any) => {
 const origIdx = collectionData.tracks.indexOf(track);
 const over = trackOverrides[origIdx];
 const audioUrlToUse = over?.customUrl?.trim() || over?.previewUrl || track.audioUrl || track.previewUrl || `${track.artist || finalArtist} - ${track.title}`;
 return {
 title: track.isPlaceholder ? `Track ${origIdx + 1}` : (track.title || `Track ${origIdx + 1}`),
 artistName: track.artist && track.artist !== "Various Artists" ? track.artist : finalArtist,
 duration: track.duration || 0,
 genre: "Cinema",
 coverUrl: over?.coverPreviewUrl || track.cover || collectionData.cover,
 audioUrl: audioUrlToUse,
 customUrl: over?.customUrl?.trim() || track.audioUrl || track.previewUrl,
 albumTitle,
 copyrightLabel: labelNameEdit || "Zenify",
 lyrics: track.lyrics || "",
 releaseStatus,
 scheduledAt
 };
 });

 await api.post('/tracks/import-batch', { tracks: tracksToImport });

 setIsCollectionMode(false);
 if (onSuccess) onSuccess();
 setIsCommitted(true);
 showAlert('success', 'Background Import Started', `Importing ${selectedTracks.length} tracks in the background. You can leave this page.`);
 } catch (e) {
 showAlert('error', 'Batch Process Failed', "An unexpected error occurred while starting the batch import.");
 } finally {
 setIsBatchImporting(false);
 }
 };

 const togglePlayback = (e: React.MouseEvent) => {
     e.preventDefault();
     e.stopPropagation();
     if (!audioRef.current) return;
     if (isPlaying) {
       audioRef.current.pause();
       setIsPlaying(false);
     } else {
       if (!audioPreviewUrl) {
         showAlert('error', 'Playback Blocked', 'No audio stream is available to preview.');
         return;
       }
       const targetSrc = getMediaUrl(audioPreviewUrl, 'audio');
       if (targetSrc && audioRef.current.src !== targetSrc) {
         audioRef.current.src = targetSrc;
         audioRef.current.load();
       }
       const playPromise = audioRef.current.play();
       if (playPromise !== undefined) {
         playPromise
           .then(() => {
             setIsPlaying(true);
           })
           .catch((err: any) => {
             console.error("Audio playback failed:", err);
             setIsPlaying(false);
             const errName = err?.name || '';
             const errMsg = err?.message || '';
             if (errName === 'AbortError' || errMsg.includes('interrupted') || errMsg.includes('user gesture') || errMsg.includes('pause')) return;
             showAlert('error', 'Playback Failed', 'Could not play the audio preview. The source may be restricted, blocked, or in an unsupported format.');
           });
       } else {
         setIsPlaying(true);
       }
     }
   };

 const handleTimeUpdate = () => {
 if (audioRef.current) {
 setCurrentTime(audioRef.current.currentTime);
 }
 };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const d = audioRef.current.duration;
      if (isFinite(d) && d > 0) {
        setDuration(d);
      }
    }
  };

 const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
 const time = parseFloat(e.target.value);
 if (audioRef.current) {
 audioRef.current.currentTime = time;
 setCurrentTime(time);
 }
 };

 const formatTime = (time: number) => {
 const mins = Math.floor(time / 60);
 const secs = Math.floor(time % 60);
 return `${mins}:${secs.toString().padStart(2, '0')}`;
 };

 const formatFileSize = (bytes: number) => {
 if (bytes === 0) return '0 Bytes';
 const k = 1024;
 const sizes = ['Bytes', 'KB', 'MB', 'GB'];
 const i = Math.floor(Math.log(bytes) / Math.log(k));
 return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
 };

 const handleCommit = async () => {
 if (!isCertified) return;
 setIsLoading(true);
 setError(null);

 try {
 const data = new FormData();
 data.append('title', formData.title);
 data.append('artistName', formData.artistName);
 data.append('genre', formData.genre);
 data.append('description', formData.description);
 data.append('trackType', formData.classification.charAt(0).toUpperCase() + formData.classification.slice(1));
 data.append('isUnlisted', String(formData.isUnlisted));
 data.append('allowDownloads', String(formData.allowDownloads));
 data.append('enableComments', String(formData.enableComments));

 let releaseStatus = "PUBLISHED";
 if (formData.releaseMode === "schedule") {
 releaseStatus = "SCHEDULED";
 // Combine date and time for backend
 if (formData.scheduledDate && formData.scheduledTime) {
 const baseDate = new Date(formData.scheduledDate);
 const match = formData.scheduledTime.match(/(\d{2}):(\d{2})\s(AM|PM)/);
 if (match) {
 let hours = parseInt(match[1]);
 const mins = parseInt(match[2]);
 const period = match[3];
 if (period === 'PM' && hours !== 12) hours += 12;
 if (period === 'AM' && hours === 12) hours = 0;
 baseDate.setHours(hours, mins, 0, 0);
 }
 data.append('scheduledAt', baseDate.toISOString());
 }
 } else if (formData.releaseMode === "draft") {
 releaseStatus = "DRAFT";
 }
 data.append('releaseStatus', releaseStatus);

 if (formData.copyrightLabel) {
 const label = formData.copyrightLabel.startsWith('@') ? formData.copyrightLabel : `@${formData.copyrightLabel}`;
 data.append('copyrightLabel', label);
 }

 if (formData.bpm) data.append('bpm', String(formData.bpm));
 if (formData.key) data.append('key', formData.key);
 if (formData.featuredArtists) data.append('featuredArtists', formData.featuredArtists);
 if (formData.composers) data.append('composers', formData.composers);
 if (formData.lyrics) data.append('lyrics', formData.lyrics);
 if (duration) data.append('duration', String(Math.round(duration)));

 if (audioFile) data.append('audio', audioFile);
 else if (audioUrlFromLink) data.append('audioUrl', audioUrlFromLink);

 if (coverFile) data.append('cover', coverFile);
 else if (coverPreview && coverPreview.startsWith('http')) {
 // If it's an external URL (already mirrored by backend), pass it as coverUrl
 data.append('coverUrl', coverPreview);
 }

 if (editMode && initialTrack?.id) {
 await api.put(`/tracks/${initialTrack.id}`, data);
 onSuccess?.();
 showAlert('success', 'Frequencies Synchronized', `Changes to "${formData.title}" have been committed.`);
 return; // Early return to prevent showing the "Upload Successful" screen
 } else {
 if (audioFile || coverFile) {
 await api.post('/tracks/upload', data);
 } else if (audioUrlFromLink) {
 // Use batch import for external URLs so it's processed asynchronously and returns instantly
 const trackData = {
 title: formData.title,
 artistName: formData.artistName,
 genre: formData.genre,
 description: formData.description,
 trackType: formData.classification.charAt(0).toUpperCase() + formData.classification.slice(1),
 isUnlisted: formData.isUnlisted,
 allowDownloads: formData.allowDownloads,
 enableComments: formData.enableComments,
 releaseStatus: releaseStatus,
 scheduledAt: data.get('scheduledAt'),
 copyrightLabel: formData.copyrightLabel ? (formData.copyrightLabel.startsWith('@') ? formData.copyrightLabel : `@${formData.copyrightLabel}`) : null,
 bpm: formData.bpm || null,
 key: formData.key || null,
 featuredArtists: formData.featuredArtists || null,
 composers: formData.composers || null,
 lyrics: formData.lyrics || null,
 duration: duration ? Math.round(duration) : null,
 audioUrl: audioUrlFromLink,
 coverUrl: coverPreview && coverPreview.startsWith('http') ? coverPreview : null
 };
 await api.post('/tracks/import-batch', { tracks: [trackData] });
 } else {
 await api.post('/tracks/upload', data);
 }
 }

 setIsCommitted(true);
 onSuccess?.();
 showAlert('success', 'Release Authorized', `"${formData.title}" is now live on the hub.`);
 } catch (err: any) {
 setError(err.response?.data?.message || "Transmission interrupted. Please verify connection.");
 showAlert('error', 'Submission Failed', err.response?.data?.message || "We couldn't finalize your release. Please check your connection and try again.");
 } finally {
 setIsLoading(false);
 }
 };

 const canNext = [
 editMode || audioFile !== null || audioUrlFromLink !== null,
 formData.artistName.trim() && formData.title.trim() && formData.genre,
 true,
 isCertified && !isLoading
 ];

 if (isCommitted) {
 return (
 <motion.div
 initial={{ opacity: 0, scale: 0.95 }}
 animate={{ opacity: 1, scale: 1 }}
 className="flex flex-col items-center justify-center py-20 text-center"
 >
 <div className="w-20 h-20 rounded-full bg-brand/20 flex items-center justify-center mb-8 border border-brand/40 shadow-[0_0_40px_rgba(var(--accent-brand-rgb),0.2)]">
 <CheckCircle2 className="w-10 h-10 text-brand" />
 </div>
 <h2 className="text-4xl font-bold text-white mb-4 italic tracking-tight">Release Authorized</h2>
 <p className="text-muted text-sm max-w-sm leading-relaxed mb-10">
 {formData.title} by {formData.artistName} has been successfully distributed to the Zenify hub.
 </p>
 <button
 onClick={() => window.location.reload()}
 className="px-8 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95"
 >
 Return to Terminal
 </button>
 </motion.div>
 );
 }

 return (
 <div className="space-y-12">
 {/* Persistent Audio Player Element */}
 <audio
   ref={audioRef}
   src={getMediaUrl(audioPreviewUrl, 'audio') || undefined}
   onTimeUpdate={handleTimeUpdate}
   onLoadedMetadata={handleLoadedMetadata}
   onEnded={() => setIsPlaying(false)}
   className="sr-only"
 />

 {/* Cover Crop Modal */}
 {cropSrc && (
 <CoverCropModal
 rawSrc={cropSrc}
 initialState={lastCropStateRef.current}
 onDone={handleCropDone}
 onCancel={handleCropCancel}
 />
 )}

 {/* Step Indicator */}
 <div className="flex items-center gap-0 max-w-2xl mx-auto">
 {STEPS.map((s, i) => {
 const done = i < step;
 const active = i === step;
 return (
 <React.Fragment key={s}>
 <div className="flex flex-col items-center gap-4 relative">
 <div className={cn(
 "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 border",
 active ? "bg-brand border-brand shadow-[0_0_20px_rgba(var(--accent-brand-rgb),0.4)]" :
 done ? "bg-brand/30 border-brand/50" : "bg-white/5 border-white/10"
 )}>
 {done ? <Check size={12} className="text-white" /> :
 <span className={cn("text-[10px] font-bold", active ? "text-white" : "text-white/20")}>{i + 1}</span>}
 </div>
 <span className={cn(
 "text-[9px] font-bold uppercase tracking-widest absolute -bottom-7 whitespace-nowrap transition-colors",
 active ? "text-white" : done ? "text-white/60" : "text-white/20"
 )}>
 {s}
 </span>
 </div>
 {i < STEPS.length - 1 && (
 <div className="flex-1 h-[1px] mx-3 mb-0 relative overflow-hidden bg-white/5">
 <motion.div
 initial={{ x: "-100%" }}
 animate={{ x: done ? "0%" : "-100%" }}
 transition={{ duration: 0.5 }}
 className="absolute inset-0 bg-brand/40"
 />
 </div>
 )}
 </React.Fragment>
 );
 })}
 </div>

 <div className="pt-8">
 <div className="flex flex-col gap-2 mb-10">
 <span className="text-[10px] font-bold text-brand/60 uppercase tracking-[0.3em]">Upload Progress — Step {step + 1}</span>
 <h2 className="text-2xl md:text-4xl font-bold text-white tracking-tight font-serif italic">
 {step === 0 && "Upload Audio"}
 {step === 1 && "Track Details"}
 {step === 2 && "Release Settings"}
 {step === 3 && "Final Review"}
 </h2>
 </div>

 <div className="min-h-[300px]">
 <AnimatePresence mode="wait">
 <motion.div
 key={step}
 initial={{ opacity: 0, x: 20 }}
 animate={{ opacity: 1, x: 0 }}
 exit={{ opacity: 0, x: -20 }}
 className="space-y-6"
 >
 {step === 0 && (
 <div className="space-y-10">
 {/* Link Import Section */}
 <div className="max-w-4xl mx-auto space-y-4 pb-6">
 <div className="flex items-center gap-3">
 <Sparkles className="w-4 h-4 text-brand" />
 <p className="text-[10px] font-bold text-white uppercase tracking-[0.2em]">Auto-Import Metadata</p>
 </div>
 <div className="flex flex-col sm:flex-row gap-3">
 <div className="flex-1 relative">
 <input
 type="text"
 placeholder="Paste YouTube, Spotify or Apple Music link..."
 value={externalUrlInput}
 onChange={e => setExternalUrlInput(e.target.value)}
 onKeyDown={e => e.key === 'Enter' && handleFetchExternalMetadata()}
 className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/50 transition-all hover:border-brand/20"
 />
 </div>
 <button
 onClick={handleFetchExternalMetadata}
 disabled={!externalUrlInput || isFetchingMetadata}
 className="px-6 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-900 disabled:opacity-50 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
 >
 {isFetchingMetadata ? <ZenLoading size="xs" className="brightness-200" /> : <Music size={14} />}
 {isFetchingMetadata ? "Fetching Track..." : "Import Details"}
 </button>
 </div>
 <p className="text-[9px] text-white/20 font-medium leading-relaxed">
 Supports YouTube, Spotify &amp; Apple Music — auto-fetches metadata, cover art, and audio.
 </p>
 </div>

 {/* Collection Preview (Album/Playlist) */}
 <AnimatePresence>
 {isCollectionMode && collectionData && (
 <motion.div
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, scale: 0.95 }}
 className="max-w-7xl mx-auto mb-8"
 >
 <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
 {/* LEFT: High Quality Image Fetcher */}
 <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-4">
 <div className="flex items-center gap-2 mb-3">
 <ImageIcon size={14} className="text-brand" />
 <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80">HQ Image Fetcher</h4>
 </div>

 {/* Image URL Input */}
 <div className="space-y-2">
 <input
 type="text"
 placeholder="Paste image URL..."
 value={batchImageUrl}
 onChange={e => setBatchImageUrl(e.target.value)}
 className="w-full h-9 bg-black/40 border border-white/10 rounded-lg px-3 text-xs focus:outline-none focus:border-brand/50 text-white placeholder:text-white/20 transition-colors"
 />
 <button
 onClick={handleFetchBatchImage}
 disabled={!batchImageUrl.trim() || isFetchingBatchImage}
 className="w-full h-9 rounded-lg bg-zinc-900/10 border border-brand/20 text-brand text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-900 hover:text-brand transition-all disabled:opacity-50 flex items-center justify-center gap-2"
 >
 {isFetchingBatchImage ? <ZenLoading size="xs" /> : <Sparkles size={12} />}
 {isFetchingBatchImage ? 'Fetching...' : 'Fetch HQ Image'}
 </button>
 </div>

 {/* Image Preview */}
 {batchImagePreview && (
 <div className="space-y-3">
 <div className="w-full aspect-square rounded-lg overflow-hidden border border-white/10 shadow-xl">
 <img src={batchImagePreview} className="w-full h-full object-cover" alt="Preview" />
 </div>

 {/* Track Selection */}
 <div className="space-y-2">
 <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Select Tracks</p>
 <div className="max-h-[200px] overflow-y-auto space-y-1 custom-scrollbar pr-1">
 {collectionData.tracks?.map((track: any, idx: number) => (
 <button
 key={idx}
 onClick={() => {
 setBatchImageSelectedTracks(prev => {
 const newSet = new Set(prev);
 if (newSet.has(idx)) {
 newSet.delete(idx);
 } else {
 newSet.add(idx);
 }
 return newSet;
 });
 }}
 className={cn(
 "w-full flex items-center gap-2 p-2 rounded-lg border transition-all text-left",
 batchImageSelectedTracks.has(idx)
 ? "bg-brand/10 border-brand/30 text-white"
 : "bg-white/[0.02] border-white/5 text-white/60 hover:border-white/10"
 )}
 >
 <div className={cn(
 "w-4 h-4 rounded border flex items-center justify-center shrink-0",
 batchImageSelectedTracks.has(idx)
 ? "bg-brand border-brand"
 : "bg-white/5 border-white/20"
 )}>
 {batchImageSelectedTracks.has(idx) && <Check size={10} className="text-white" />}
 </div>
 <span className="text-[10px] font-bold truncate">{track.title}</span>
 </button>
 ))}
 </div>

 {/* Apply Button */}
 <button
 onClick={handleApplyBatchImage}
 disabled={batchImageSelectedTracks.size === 0}
 className="w-full h-9 rounded-lg bg-zinc-900 hover:bg-zinc-900 text-brand text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
 >
 <Check size={12} />
 Apply to {batchImageSelectedTracks.size} Track{batchImageSelectedTracks.size !== 1 ? 's' : ''}
 </button>
 </div>
 </div>
 )}
 </div>

 {/* RIGHT: Album Info & Track List */}
 <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/5 space-y-5">
 {/* Header */}
 <div className="flex flex-col md:flex-row items-center md:items-start gap-5">
 <div className="w-48 h-48 md:w-20 md:h-20 rounded-2xl md:rounded-xl overflow-hidden shadow-2xl border border-white/10 shrink-0">
 <img src={collectionData.cover} alt="Collection" className="w-full h-full object-cover" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 text-brand mb-1">
 <Sparkles size={12} />
 <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand">External Collection</span>
 </div>

 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2 mb-2">
 <h3 className="text-xl md:text-3xl font-bold text-white tracking-tight truncate">{albumNameEdit || collectionData.title}</h3>
 <button
 onClick={() => setIsEditingAlbum(v => !v)}
 className={cn(
 "text-[9px] font-bold uppercase tracking-widest shrink-0 flex items-center gap-1 transition-all px-2 py-1 rounded-full border",
 isEditingAlbum ? "bg-zinc-900 text-brand border-brand" : "text-brand/30 hover:text-brand border-white/10 bg-white/5"
 )}
 >
 ✦ {isEditingAlbum ? 'Close Edit' : 'Edit Info'}
 </button>
 </div>

 <p className="text-xs text-white/40 font-medium truncate">
 By {artistNameEdit || collectionData.artist} &bull; {collectionData.tracks?.filter((_: any, i: number) => trackOverrides[i]?.included !== false).length || 0} / {collectionData.tracks?.length || 0} Tracks Selected
 </p>

 <AnimatePresence>
 {isEditingAlbum && (
 <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-3 mt-4 overflow-hidden pr-2">
 <div>
 <label className="text-[9px] font-bold text-white/30 tracking-widest uppercase block mb-1">Album Title</label>
 <input value={albumNameEdit} onChange={e => setAlbumNameEdit(e.target.value)} className="w-full h-9 bg-black/40 border border-white/10 rounded-lg px-3 text-xs focus:outline-none focus:border-brand/50 text-white placeholder:text-white/20 transition-colors" placeholder={collectionData.title} />
 </div>
 <div>
 <label className="text-[9px] font-bold text-white/30 tracking-widest uppercase block mb-1">Artist Name (All Tracks)</label>
 <div className="relative" ref={batchArtistDropdownRef}>
 <input
 value={artistNameEdit}
 onChange={e => {
 setArtistNameEdit(e.target.value);
 setShowBatchArtistDropdown(true);
 }}
 onFocus={() => setShowBatchArtistDropdown(true)}
 className="w-full h-9 bg-black/40 border border-white/10 rounded-lg px-3 text-xs focus:outline-none focus:border-brand/50 text-white placeholder:text-white/20 transition-colors"
 placeholder={collectionData.artist || 'Artist Name'}
 />
 {showBatchArtistDropdown && (
 <div className="absolute left-0 right-0 mt-2 bg-[#0d0d11]/95 backdrop-blur-md border border-white/10 rounded-2xl max-h-60 overflow-y-auto z-[100] shadow-[0_10px_30px_rgba(0,0,0,0.5)] custom-scrollbar">
 {artists.filter(a => a.name.toLowerCase().includes(artistNameEdit.toLowerCase())).length > 0 ? (
 <div className="p-2 space-y-1">
 {artists
 .filter(a => a.name.toLowerCase().includes(artistNameEdit.toLowerCase()))
 .slice(0, 50)
 .map((artist) => (
 <button
 key={artist.id}
 type="button"
 onClick={() => {
 setArtistNameEdit(artist.name);
 setShowBatchArtistDropdown(false);
 }}
 className="w-full flex items-center gap-3 p-2 rounded-xl text-left hover:bg-white/5 transition-all text-xs text-white"
 >
 <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 bg-white/5 flex-shrink-0">
 {artist.imageUrl ? (
 <img src={getMediaUrl(artist.imageUrl)} className="w-full h-full object-cover" alt="" />
 ) : (
 <div className="w-full h-full flex items-center justify-center bg-brand/10 text-brand">
 <AtSign size={14} />
 </div>
 )}
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-1.5">
 <span className="font-bold truncate">{artist.name}</span>
 {artist.verified && (
 <CheckCircle2 size={12} className="text-brand shrink-0" />
 )}
 </div>
 <p className="text-[10px] text-white/30 truncate">
 {artist._count?.tracks || 0} Track{artist._count?.tracks !== 1 ? 's' : ''} &bull; {artist.role || 'Artist'}
 </p>
 </div>
 </button>
 ))
 }
 </div>
 ) : (
 <div className="p-4 text-center">
 <p className="text-xs text-white/40 mb-1">No matching existing artist</p>
 <span className="text-[9px] font-bold text-brand uppercase tracking-widest">
 Will create new artist profile
 </span>
 </div>
 )}
 </div>
 )}
 </div>
 </div>
 <div>
 <label className="text-[9px] font-bold text-white/30 tracking-widest uppercase block mb-1">Music Label</label>
 <input value={labelNameEdit} onChange={e => setLabelNameEdit(e.target.value)} className="w-full h-9 bg-black/40 border border-white/10 rounded-lg px-3 text-xs focus:outline-none focus:border-brand/50 text-white placeholder:text-white/20 transition-colors font-zenify" placeholder="zenify" />
 </div>
 <div>
 <label className="text-[9px] font-bold text-white/30 tracking-widest uppercase block mb-1">Album Cover Image URL Override</label>
 <div className="flex gap-2">
 <input value={albumCoverOverride} onChange={e => setAlbumCoverOverride(e.target.value)} className="w-full h-9 bg-black/40 border border-white/10 rounded-lg px-3 text-xs focus:outline-none focus:border-brand/50 text-white placeholder:text-white/20 transition-colors" placeholder="Paste image URL..." />
 {albumCoverOverride.trim() && (
 <button onClick={(e) => { e.preventDefault(); setCollectionData((prev: any) => ({ ...prev, cover: albumCoverOverride.trim() })); setAlbumCoverOverride(''); setIsEditingAlbum(false); }} className="px-3 h-9 rounded-lg bg-zinc-900/10 border border-brand/20 text-brand text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-900 hover:text-brand transition-all shrink-0">Use</button>
 )}
 </div>
 </div>
 </motion.div>
 )}
 </AnimatePresence>

 {!isEditingAlbum && (
 <>
 {/* Release Schedule Section */}
 <div className="pt-4 space-y-2">
 <p className="text-[9px] font-bold text-white/30 tracking-widest uppercase">Release Schedule</p>
 <div className="space-y-2">
 {[
 { id: 'now', label: 'Publish Now', icon: <Sparkles size={12} /> },
 { id: 'schedule', label: 'Schedule', icon: <Calendar size={12} /> },
 { id: 'draft', label: 'Draft', icon: <Lock size={12} /> }
 ].map(opt => (
 <div key={opt.id} className="space-y-2">
 <button
 onClick={() => {
 const newMode = opt.id as any;
 
 // If switching to schedule mode, set default date and time
 if (newMode === 'schedule' && !batchScheduledDate) {
 const now = new Date();
 // Set date to today
 const todayISO = now.toISOString();
 
 // Set time to 5 minutes from now
 const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);
 let hours = fiveMinutesLater.getHours();
 const minutes = fiveMinutesLater.getMinutes();
 const ampm = hours >= 12 ? 'PM' : 'AM';
 hours = hours % 12 || 12;
 const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
 
 setBatchReleaseMode(newMode);
 setBatchScheduledDate(todayISO);
 setBatchScheduledTime(formattedTime);
 } else {
 setBatchReleaseMode(newMode);
 }
 }}
 className={cn(
 "w-full flex items-center justify-between p-2.5 rounded-lg border transition-all text-left",
 batchReleaseMode === opt.id ? "bg-white/10 border-white/20 text-white" : "bg-white/2 border-white/5 text-white/50 hover:text-white hover:bg-white/5"
 )}
 >
 <div className="flex items-center gap-2">
 <div className={cn("w-6 h-6 rounded-md flex items-center justify-center border transition-colors", batchReleaseMode === opt.id ? "bg-white/10 border-white/20 text-white" : "bg-white/5 border-white/10 text-white/40")}>
 {opt.icon}
 </div>
 <p className="text-[10px] font-bold uppercase tracking-wider">{opt.label}</p>
 </div>
 <div className={cn("w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors", batchReleaseMode === opt.id ? "border-brand shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.3)]" : "border-white/10")}>
 {batchReleaseMode === opt.id && <div className="w-1.5 h-1.5 bg-brand rounded-full" />}
 </div>
 </button>

 {batchReleaseMode === opt.id && opt.id === 'schedule' && (
 <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-3 bg-white/5 rounded-lg border border-white/10 space-y-3">
 <div className="space-y-1.5">
 <label className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Select Date</label>
 <Popover>
 <PopoverTrigger asChild>
 <Button variant="outline" className={cn("w-full justify-start text-left font-normal bg-white/5 border-white/10 hover:bg-white/10 h-9 rounded-lg text-xs", !batchScheduledDate && "text-muted-foreground")}>
 <Calendar size={12} className="mr-2 opacity-50" />
 {batchScheduledDate ? format(new Date(batchScheduledDate), "PPP") : <span>Pick a date</span>}
 </Button>
 </PopoverTrigger>
 <PopoverContent className="w-auto p-0 border-white/10" align="start">
 <CalendarComponent
 mode="single"
 selected={batchScheduledDate ? new Date(batchScheduledDate) : undefined}
 onSelect={(date) => setBatchScheduledDate(date?.toISOString() || "")}
 disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
 initialFocus
 classNames={{
 day_button: "relative flex size-9 items-center justify-center rounded-lg p-0 text-zinc-300 hover:bg-white/10 group-data-[disabled]:opacity-20 group-data-[disabled]:text-white/40 group-data-[disabled]:cursor-not-allowed group-data-[selected]:bg-brand group-data-[selected]:text-white focus-visible:outline-none transition-colors",
 disabled: "opacity-20 text-white/40 pointer-events-none",
 day_disabled: "opacity-20 text-white/40 pointer-events-none",
 today: "after:absolute after:bottom-1 after:size-[3px] after:rounded-full after:bg-brand"
 }}
 />
 </PopoverContent>
 </Popover>
 </div>
 <div className="space-y-1.5">
 <label className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Select Time</label>
 <ModernTimePicker
 value={batchScheduledTime}
 onChange={(time: string) => setBatchScheduledTime(time)}
 disabled={false}
 selectedDate={batchScheduledDate}
 />
 </div>
 </motion.div>
 )}
 </div>
 ))}
 </div>
 </div>

 {/* Action Buttons */}
 <div className="pt-4 flex gap-3">
 <Button
 variant="outline"
 size="sm"
 onClick={() => setIsCollectionMode(false)}
 className="rounded-full bg-white/5 border-white/10 text-[10px] font-black uppercase tracking-widest px-5"
 >
 Cancel
 </Button>
 {collectionData.tracks && collectionData.tracks.length > 0 && (
 <Button
 size="sm"
 onClick={handleBatchImport}
 disabled={isBatchImporting}
 className="rounded-full bg-zinc-900 hover:bg-zinc-900 text-brand text-[10px] font-black uppercase tracking-widest px-7 shadow-lg shadow-brand/20 flex items-center gap-2"
 >
 {isBatchImporting ? <ZenLoading size="xs" className="brightness-200" /> : <Sparkles className="w-3 h-3" />}
 {isBatchImporting ? "Importing..." : "Import Selected"}
 </Button>
 )}
 </div>
 </>
 )}
 </div>{/* end flex-1 min-w-0 inner */}
 </div>{/* end flex-1 min-w-0 outer */}
 </div>{/* end header flex row */}

 {/* Track List */}
 <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1 custom-scrollbar">
 {collectionData.tracks?.map((track: any, idx: number) => {
 const over = trackOverrides[idx] || {
 included: true,
 customUrl: '',
 customImage: '',
 previewUrl: null,
 coverPreviewUrl: null,
 isPlaying: false,
 isFetching: false,
 isFetchingImage: false
 };
 const included = over.included !== false;
 return (
 <div
 key={idx}
 className={cn(
 "group rounded-2xl border transition-all duration-200 overflow-hidden",
 included
 ? "bg-white/[0.02] border-white/5 hover:border-white/10"
 : "bg-white/[0.01] border-white/[0.03] opacity-40"
 )}
 >
 <div className="flex flex-col md:flex-row md:items-center p-3 md:p-3 gap-3">
 {/* Mobile-only Big Cover */}
 <div className="w-full aspect-square rounded-xl overflow-hidden border border-white/10 shrink-0 relative md:hidden shadow-xl mt-1">
 <img src={getMediaUrl(over.coverPreviewUrl || track.cover || collectionData.cover, 'image')} className="w-full h-full object-cover absolute inset-0" />
 {over.coverPreviewUrl && over.coverPreviewUrl !== collectionData.cover && (
 <div className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-emerald-500/20 backdrop-blur-sm border border-emerald-500/30">
 <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
 <Check size={10} /> HQ Art
 </span>
 </div>
 )}
 </div>
 <div className="flex items-center gap-3 w-full">
 {/* Checkbox */}
 <button
 onClick={() => setTrackField(idx, 'included', !included)}
 className={cn(
 "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all",
 included
 ? "bg-brand border-brand"
 : "bg-white/5 border-white/20"
 )}
 >
 {included && <Check size={11} className="text-white" />}
 </button>
 
 {/* Track number */}
 <span className="text-[10px] font-black text-white/20 w-5 text-center shrink-0">{track.trackNumber || idx + 1}</span>

 {/* Desktop Cover */}
 <div className="w-10 h-10 rounded-sm overflow-hidden border border-white/10 shrink-0 hidden md:block relative group/cover">
 <img src={getMediaUrl(over.coverPreviewUrl || track.cover || collectionData.cover, 'image')} className="w-full h-full object-cover" />
 {over.coverPreviewUrl && over.coverPreviewUrl !== collectionData.cover && (
 <div className="absolute inset-0 bg-emerald-500/20 opacity-0 group-hover/cover:opacity-100 transition-opacity flex items-center justify-center">
 <Check size={12} className="text-emerald-400" />
 </div>
 )}
 </div>

 {/* Title + Artist */}
 <div className="flex-1 min-w-0 flex flex-col justify-center">
 <div className="flex items-center gap-2">
 <p className="text-sm font-bold text-white/90 truncate">{track.title}</p>
 {over.coverPreviewUrl && over.coverPreviewUrl !== collectionData.cover && (
 <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold uppercase tracking-wider shrink-0">HQ Art</span>
 )}
 </div>
 <p className="text-[10px] text-white/30 font-medium uppercase tracking-wider truncate pb-[1px]">{artistNameEdit || track.artist || collectionData.artist}</p>
 {over.audioError && (
 <p className="text-[10px] text-red-400/85 font-semibold mt-0.5 leading-tight select-text">⚠️ Error: {over.audioError}</p>
 )}
 </div>

 {/* Audio / Artwork Sync Action */}
 {!over.previewUrl ? (
 <button
 onClick={() => handleFetchTrackPreview(idx, track)}
 disabled={over.isFetching}
 className="w-10 h-10 rounded-full bg-zinc-900/10 border border-brand/20 flex items-center justify-center text-brand hover:bg-zinc-900 hover:text-brand transition-all shrink-0 animate-pulse"
 title="Fetch HQ Cover & Audio"
 >
 {over.isFetching ? <ZenLoading size="xs" /> : <Sparkles size={14} />}
 </button>
 ) : (
 <button
 onClick={() => handleToggleTrackPlay(idx)}
 className={cn(
 "w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all",
 over.isPlaying ? "bg-zinc-900 text-brand shadow-[0_0_15px_rgba(var(--accent-brand-rgb),0.4)]" : "bg-white/10 text-white/60 hover:bg-brand/30"
 )}
 >
 {over.isPlaying
 ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
 : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
 }
 </button>
 )}
 </div>
 </div>

 {/* Audio Waveform Slider - shown when previewUrl is ready */}
 {over.previewUrl && (
 <div className="px-3 pb-3">
 <audio
 ref={el => { trackAudioRefs.current[idx] = el; }}
 src={getMediaUrl(over.previewUrl, 'audio') || undefined}
 preload="metadata"
 onEnded={() => setTrackField(idx, 'isPlaying', false)}
 />
 <TrackMiniSlider
 getAudioRef={() => trackAudioRefs.current[idx]}
 isPlaying={over.isPlaying}
 initialDuration={track.duration}
 onSeek={() => {
 if (!over.isPlaying) {
 handleToggleTrackPlay(idx);
 }
 }}
 />
 </div>
 )}

 {/* Custom URL Override */}
 <div className="px-3 pb-3 flex flex-col gap-2">
 <div className="flex gap-2">
 <input
 type="text"
 placeholder="Override: paste a YouTube link for this track..."
 value={over.customUrl}
 onChange={e => setTrackField(idx, 'customUrl', e.target.value)}
 className="flex-1 bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-1.5 text-[11px] text-white/70 placeholder:text-white/20 focus:outline-none focus:border-brand/40 transition-all"
 />
 {over.customUrl.trim() && (
 <button
 onClick={() => handleFetchTrackPreview(idx, track)}
 disabled={over.isFetching}
 className="px-3 py-1.5 rounded-lg bg-zinc-900/10 border border-brand/20 text-brand text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-900 hover:text-brand transition-all disabled:opacity-50"
 >
 {over.isFetching ? '...' : 'Use'}
 </button>
 )}
 </div>
 <div className="flex gap-2">
 <input
 type="text"
 placeholder="🖼 Paste cover image URL to override..."
 value={over.customImage || ''}
 onChange={e => setTrackField(idx, 'customImage', e.target.value)}
 onKeyDown={e => { if (e.key === 'Enter' && over.customImage?.trim()) handleFetchTrackImage(idx); }}
 onBlur={() => { if (over.customImage?.trim()) handleFetchTrackImage(idx); }}
 className="flex-1 bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-1.5 text-[11px] text-white/70 placeholder:text-white/20 focus:outline-none focus:border-brand/40 transition-all"
 />
 {over.customImage?.trim() && (
 <button
 onClick={() => handleFetchTrackImage(idx)}
 className="px-3 py-1.5 rounded-lg bg-zinc-900/10 border border-brand/20 text-brand text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-900 hover:text-brand transition-all"
 >
 Apply
 </button>
 )}
 </div>
 </div>
 </div>
 );
 })}
 </div>{/* end track list */}
 </div>{/* end right panel */}
 </div>{/* end grid */}

 {/* Batch Progress */}
 {isBatchImporting && (
 <div className="p-4 rounded-2xl bg-brand/5 border border-brand/10 space-y-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center">
 <ZenLoading size="xs" />
 </div>
 <div>
 <p className="text-[10px] font-bold text-white uppercase tracking-widest">Processing Collection</p>
 <p className="text-[12px] font-bold text-brand">{batchProgress.activeTrack || "Preparing..."}</p>
 </div>
 </div>
 <span className="text-[10px] font-black text-white/40">{batchProgress.current} / {batchProgress.total}</span>
 </div>
 <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
 <motion.div
 className="h-full bg-brand"
 initial={{ width: 0 }}
 animate={{ width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%` }}
 />
 </div>
 </div>
 )}

 {(collectionData.tracks?.some((t: any) => t.isPlaceholder) || !collectionData.tracks) && (
 <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
 <AlertCircle className="text-amber-500 shrink-0" size={16} />
 <span className="text-[11px] font-bold text-amber-500/90 uppercase tracking-widest">
 Track names couldn't be retrieved. Use the link override per track to manually fix any.
 </span>
 </div>
 )}
 </motion.div>
 )}
 </AnimatePresence>

 <div className="flex flex-col md:flex-row gap-8 items-start max-w-4xl mx-auto">
 {/* Cover Art */}
 <div className="w-full md:w-[200px] shrink-0 space-y-3 relative z-20">
 <div className="flex items-center justify-between">
 <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-none">Artwork</p>
 {coverPreview && (
 <button
 type="button"
 onClick={handleReCrop}
 className="cursor-pointer text-[9px] font-bold text-brand hover:text-white uppercase tracking-widest transition-colors flex items-center gap-1"
 >
 ✦ Re-crop
 </button>
 )}
 </div>
 <label className="group relative aspect-square w-full rounded-xl bg-white/2 border border-dashed border-white/10 flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-brand/[0.04] hover:border-brand/40 overflow-hidden">
 <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, 'cover')} />
 {coverPreview ? (
 <>
 <img key={cropCount} src={getMediaUrl(coverPreview)} className="w-full h-full object-cover" />
 <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
 <span className="text-[10px] font-bold text-white uppercase tracking-widest bg-black/50 px-3 py-1.5 rounded-full backdrop-blur-sm">Change Photo</span>
 </div>
 </>
 ) : (
 <div className="text-center p-4 group- transition-transform">
 <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center mb-4 mx-auto group- transition-transform">
 <ImageIcon className="w-5 h-5 text-brand" />
 </div>
 <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest group-hover:text-brand transition-colors">Bind Cover</span>
 <p className="text-[8px] text-white/20 mt-1 font-medium">Auto-crops to 1:1 square</p>
 </div>
 )}
 </label>
 <div className="flex gap-2 items-center mt-2">
 <input
 type="text"
 placeholder="URL..."
 value={imageUrlInput}
 onChange={e => setImageUrlInput(e.target.value)}
 className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand/40 hover:border-brand/20 transition-all shadow-inner"
 />
 <button
 onClick={handleFetchImage}
 disabled={!imageUrlInput || isFetchingImage}
 className="bg-zinc-900 hover:bg-zinc-900 disabled:opacity-20 text-brand px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all active:scale-95 flex items-center justify-center min-w-[70px] border border-brand/20 shadow-lg shadow-brand/20"
 >
 {isFetchingImage ? <ZenLoading size="xs" className="brightness-200" /> : "Fetch"}
 </button>
 </div>
 </div>

 {/* Audio Assets */}
 <div className="flex-1 w-full space-y-4">
 <div className="flex items-center gap-2">
 <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-none">Sonic Master</p>
 </div>

 {audioError && (
 <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-[10px] text-red-400 font-semibold leading-relaxed select-text">
 ⚠️ Audio Fetch Error: {audioError}
 </div>
 )}

 <div className="grid grid-cols-1 gap-4">
 {(audioFile || audioPreviewUrl) ? (
 <div className="w-full p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-4 group hover:border-brand/20 transition-all">
 {/* Play Button */}
 <button
 onClick={togglePlayback}
 className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center text-brand shadow-lg active:scale-95 transition-all"
 >
 <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d={isPlaying ? "M6 19h4V5H6v14zm8-14v14h4V5h-4z" : "M8 5v14l11-7z"} /></svg>
 </button>

 <div className="flex-1 min-w-0 space-y-1.5">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2 min-w-0">
 <p className="text-[11px] font-bold text-white truncate">{audioName}</p>
 <span className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[8px] font-bold text-muted uppercase tracking-tighter shrink-0">{audioFile?.name.split('.').pop() || 'URL'}</span>
 </div>
 <span className="text-[10px] font-bold text-accent tabular-nums">{audioFile ? formatFileSize(audioFile.size) : 'STREAM'}</span>
 </div>

 <div className="flex items-center gap-3">
 <span className="text-[8px] text-muted font-medium tabular-nums w-6 shrink-0">{formatTime(currentTime)}</span>
 <div className="flex-1 relative h-6 flex items-center">
 <input
 type="range"
 min="0"
 max={duration}
 value={currentTime}
 onChange={handleSeek}
 className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-brand"
 style={{
 background: `linear-gradient(to right, var(--accent-brand) ${(currentTime / duration) * 100}%, rgba(255,255,255,0.05) ${(currentTime / duration) * 100}%)`,
 }}
 />
 </div>
 <span className="text-[8px] text-muted font-medium tabular-nums w-6 shrink-0">{formatTime(duration)}</span>
 </div>
 </div>

 <button
 onClick={(e) => { e.preventDefault(); setAudioFile(null); setAudioUrlFromLink(null); setAudioPreviewUrl(null); }}
 className="p-2 text-muted/30 hover:text-danger hover:bg-danger/5 rounded-lg transition-all shrink-0"
 >
 <AlertCircle size={14} />
 </button>
 </div>
 ) : (
 <label className="w-full h-[120px] rounded-2xl border border-dashed border-white/10 bg-white/2 hover:bg-brand/[0.04] hover:border-brand/40 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 group">
 <input type="file" accept="audio/*" className="hidden" onChange={(e) => handleFileChange(e, 'audio')} />
 <div className="text-center group- transition-transform">
 <div className="w-12 h-12 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center mb-4 mx-auto group- transition-transform">
 <Upload className="w-6 h-6 text-brand" />
 </div>
 <p className="text-[11px] font-bold text-white uppercase tracking-[0.2em] mb-1">Select Audio Asset</p>
 <p className="text-[8px] text-white/20 font-bold uppercase tracking-widest leading-none">FLAC · WAV · MP3</p>
 </div>
 </label>
 )}

 <div className="flex gap-2">
 <input
 type="text"
 placeholder="URL..."
 value={audioUrlInput}
 onChange={e => setAudioUrlInput(e.target.value)}
 onKeyDown={e => e.key === 'Enter' && handleFetchAudio()}
 className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand/40 hover:border-brand/20 transition-all shadow-inner"
 />
 <button
 onClick={handleFetchAudio}
 disabled={!audioUrlInput || isFetchingAudio}
 className="bg-zinc-900 hover:bg-zinc-900 disabled:opacity-20 text-brand px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all active:scale-95 flex items-center justify-center min-w-[70px] border border-brand/20 shadow-lg shadow-brand/20"
 >
 {isFetchingAudio ? <ZenLoading size="xs" className="brightness-200" /> : "Fetch"}
 </button>
 </div>
 </div>
 </div>
 </div>
 </div>
 )}

 {step === 1 && (
 <div className="space-y-8">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
 <div className="space-y-3">
 <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Artist Name</label>
 <div className="relative" ref={artistDropdownRef}>
 <input
 value={formData.artistName}
 onChange={(e) => {
 setFormData({ ...formData, artistName: e.target.value });
 setShowArtistDropdown(true);
 }}
 onFocus={() => setShowArtistDropdown(true)}
 placeholder="Enter artist or station name"
 className="input-premium w-full"
 />
 {showArtistDropdown && (
 <div className="absolute left-0 right-0 mt-2 bg-[#0d0d11]/95 backdrop-blur-md border border-white/10 rounded-2xl max-h-60 overflow-y-auto z-50 shadow-[0_10px_30px_rgba(0,0,0,0.5)] custom-scrollbar">
 {artists.filter(a => a.name.toLowerCase().includes(formData.artistName.toLowerCase())).length > 0 ? (
 <div className="p-2 space-y-1">
 {artists
 .filter(a => a.name.toLowerCase().includes(formData.artistName.toLowerCase()))
 .slice(0, 50)
 .map((artist) => (
 <button
 key={artist.id}
 type="button"
 onClick={() => {
 setFormData({ ...formData, artistName: artist.name });
 setShowArtistDropdown(false);
 }}
 className="w-full flex items-center gap-3 p-2 rounded-xl text-left hover:bg-white/5 transition-all text-xs text-white"
 >
 <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 bg-white/5 flex-shrink-0">
 {artist.imageUrl ? (
 <img src={getMediaUrl(artist.imageUrl)} className="w-full h-full object-cover" alt="" />
 ) : (
 <div className="w-full h-full flex items-center justify-center bg-brand/10 text-brand">
 <AtSign size={14} />
 </div>
 )}
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-1.5">
 <span className="font-bold truncate">{artist.name}</span>
 {artist.verified && (
 <CheckCircle2 size={12} className="text-brand shrink-0" />
 )}
 </div>
 <p className="text-[10px] text-white/30 truncate">
 {artist._count?.tracks || 0} Track{artist._count?.tracks !== 1 ? 's' : ''} &bull; {artist.role || 'Artist'}
 </p>
 </div>
 </button>
 ))
 }
 </div>
 ) : (
 <div className="p-4 text-center">
 <p className="text-xs text-white/40 mb-1">No matching existing artist</p>
 <span className="text-[9px] font-bold text-brand uppercase tracking-widest">
 Will create new artist profile
 </span>
 </div>
 )}
 </div>
 )}
 </div>
 </div>
 <div className="space-y-3">
 <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Track Title</label>
 <input
 value={formData.title}
 onChange={(e) => setFormData({ ...formData, title: e.target.value })}
 placeholder="Enter song title"
 className="input-premium"
 />
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
 <div className="space-y-3 relative" ref={featuredArtistDropdownRef}>
 <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted block">Featured Artists</label>
 <input
 value={formData.featuredArtists}
 onChange={(e) => {
 setFormData({ ...formData, featuredArtists: e.target.value });
 setShowFeaturedArtistDropdown(true);
 }}
 onFocus={() => setShowFeaturedArtistDropdown(true)}
 placeholder="e.g. Artist B, Artist C"
 className="input-premium border-white/5 bg-white/[0.02] w-full"
 />
 {showFeaturedArtistDropdown && (
 <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] bg-[#0d0d11]/95 backdrop-blur-md border border-white/10 rounded-2xl max-h-60 overflow-y-auto z-50 shadow-[0_10px_30px_rgba(0,0,0,0.5)] custom-scrollbar">
 {(() => {
 const parts = formData.featuredArtists.split(',');
 const lastPart = parts[parts.length - 1].trim();
 const filtered = artists.filter(a => a.name.toLowerCase().includes(lastPart.toLowerCase()));
 
 return filtered.length > 0 ? (
 <div className="p-2 space-y-1">
 {filtered.slice(0, 30).map((artist) => (
 <button
 key={artist.id}
 type="button"
 onClick={() => {
 const newParts = [...parts];
 if (newParts.length === 1) {
 newParts[0] = artist.name;
 } else {
 newParts[newParts.length - 1] = " " + artist.name;
 }
 setFormData({ ...formData, featuredArtists: newParts.join(',') + ", " });
 }}
 className="w-full flex items-center gap-3 p-2 rounded-xl text-left hover:bg-white/5 transition-all text-xs text-white"
 >
 <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 bg-white/5 flex-shrink-0">
 {artist.imageUrl ? (
 <img src={getMediaUrl(artist.imageUrl)} className="w-full h-full object-cover" alt="" />
 ) : (
 <div className="w-full h-full flex items-center justify-center bg-brand/10 text-brand">
 <AtSign size={14} />
 </div>
 )}
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-1.5">
 <span className="font-bold truncate">{artist.name}</span>
 {artist.verified && (
 <CheckCircle2 size={12} className="text-brand shrink-0" />
 )}
 </div>
 <p className="text-[10px] text-white/30 truncate">
 {artist._count?.tracks || 0} Track{artist._count?.tracks !== 1 ? 's' : ''} &bull; {artist.role || 'Artist'}
 </p>
 </div>
 </button>
 ))}
 </div>
 ) : (
 <div className="p-4 text-center">
 <p className="text-xs text-white/40 mb-1">Type to search existing artists</p>
 <span className="text-[9px] font-bold text-brand uppercase tracking-widest">
 Can be multiple, comma separated
 </span>
 </div>
 );
 })()}
 </div>
 )}
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-3">
 <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">BPM</label>
 <input
 type="number"
 value={formData.bpm}
 onChange={(e) => setFormData({ ...formData, bpm: e.target.value })}
 placeholder="128"
 className="input-premium border-white/5 bg-white/[0.02]"
 />
 </div>
 <div className="space-y-3">
 <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Key</label>
 <input
 value={formData.key}
 onChange={(e) => setFormData({ ...formData, key: e.target.value })}
 placeholder="C Minor"
 className="input-premium border-white/5 bg-white/[0.02]"
 />
 </div>
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
 <div className="space-y-3">
 <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Music Genre</label>
 <Select
 value={formData.genre}
 onValueChange={(value) => setFormData({ ...formData, genre: value })}
 >
 <SelectTrigger className="w-full bg-white/5 border-white/10 text-white rounded-xl h-[52px] px-4 focus:ring-brand/50">
 <SelectValue placeholder="Pick a genre" />
 </SelectTrigger>
 <SelectContent className="bg-surface border-white/10 text-white">
 {GENRES.map(g => (
 <SelectItem key={g} value={g} className="focus:bg-zinc-900 focus:text-brand">
 {g}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-3">
 <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Track Type</label>
 <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 gap-1 h-[52px]">
 {["original", "remix", "instrumental"].map(c => {
 const active = formData.classification === c;
 return (
 <button
 key={c}
 onClick={() => setFormData({ ...formData, classification: c })}
 className={cn(
 "flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1",
 active ? "border-brand bg-zinc-900/10 text-brand" : "border-white/5 text-brand/40 hover:bg-white/5"
 )}
 >
 {active && <Check size={12} className="text-brand" />}
 {c}
 </button>
 )
 })}
 </div>
 </div>
 </div>

 <div className="space-y-3">
 <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Composers / Songwriters</label>
 <input
 value={formData.composers}
 onChange={(e) => setFormData({ ...formData, composers: e.target.value })}
 placeholder="Name 1, Name 2..."
 className="input-premium border-white/5 bg-white/[0.02]"
 />
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
 <div className="space-y-3">
 <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Track Description</label>
 <textarea
 value={formData.description}
 onChange={(e) => setFormData({ ...formData, description: e.target.value })}
 placeholder="Tell us about the track — inspiration, credits, or a story..."
 className="input-premium min-h-[120px] resize-none border-white/10 focus:border-brand/40 bg-white/5"
 />
 </div>
 <div className="space-y-3">
 <div className="flex items-center justify-between">
 <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Lyrics</label>
 {formData.lyrics && (
 <button
 type="button"
 onClick={handleAutoAlignFormLyrics}
 disabled={isAligningFormLyrics}
 className="text-[10px] font-bold text-purple-300 hover:text-purple-200 flex items-center gap-1 bg-purple-950/60 border border-purple-500/40 px-2.5 py-1 rounded-full transition-all disabled:opacity-50"
 title="Auto-match plain lyrics with track audio to generate LRC timestamps (100% Free)"
 >
 {isAligningFormLyrics ? <ZenLoading size="xs" /> : <Sparkles size={11} className="text-purple-300" />}
 {isAligningFormLyrics ? "Matching..." : "✨ AI Auto-Match Timestamps"}
 </button>
 )}
 </div>
 <textarea
 value={formData.lyrics}
 onChange={(e) => setFormData({ ...formData, lyrics: e.target.value })}
 placeholder="Verse 1... Chorus... Bridge..."
 className="input-premium min-h-[120px] resize-none border-white/10 focus:border-brand/40 bg-white/5"
 />
 </div>
 </div>
 </div>
 )}

 {step === 2 && (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
 <div className="space-y-6">
 <div className="flex items-center gap-3 mb-2">
 <p className="text-[10px] font-bold text-white uppercase tracking-[0.2em]">Release Schedule</p>
 </div>
 <div className="space-y-2">
 {[
 { id: 'now', label: 'Publish Now', desc: 'Go live immediately', icon: <Sparkles size={14} /> },
 { id: 'schedule', label: 'Set a future date', desc: 'Set a future date', icon: <Calendar size={14} /> },
 { id: 'draft', label: 'Save Draft', desc: 'Internal archive only', icon: <Lock size={14} /> }
 ].map(opt => (
 <div key={opt.id} className="space-y-2">
 <button
 onClick={() => {
 const newMode = opt.id as any;
 
 // If switching to schedule mode, set default date and time
 if (newMode === 'schedule' && !formData.scheduledDate) {
 const now = new Date();
 // Set date to today
 const todayISO = now.toISOString();
 
 // Set time to 5 minutes from now
 const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);
 let hours = fiveMinutesLater.getHours();
 const minutes = fiveMinutesLater.getMinutes();
 const ampm = hours >= 12 ? 'PM' : 'AM';
 hours = hours % 12 || 12;
 const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
 
 setFormData({ 
 ...formData, 
 releaseMode: newMode,
 scheduledDate: todayISO,
 scheduledTime: formattedTime
 });
 } else {
 setFormData({ ...formData, releaseMode: newMode });
 }
 }}
 className={cn(
 "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left group",
 formData.releaseMode === opt.id ? "bg-white/10 border-white/20 text-white" : "bg-white/2 border-white/5 text-muted hover:text-foreground hover:bg-white/5"
 )}
 >
 <div className="flex items-center gap-3">
 <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center border transition-colors", formData.releaseMode === opt.id ? "bg-white/10 border-white/20 text-white" : "bg-white/5 border-white/10 text-muted")}>
 {opt.icon}
 </div>
 <div>
 <p className="text-[11px] font-bold uppercase tracking-wider">{opt.label}</p>
 <p className="text-[9px] opacity-40 uppercase">{opt.desc}</p>
 </div>
 </div>
 <div className={cn("w-4 h-4 rounded-full border flex items-center justify-center transition-colors", formData.releaseMode === opt.id ? "border-brand shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.3)]" : "border-white/10")}>
 {formData.releaseMode === opt.id && <div className="w-2 h-2 bg-brand rounded-full" />}
 </div>
 </button>

 {formData.releaseMode === opt.id && opt.id === 'schedule' && (
 <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-4">
 <div className="space-y-2">
 <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Select Date</label>
 <Popover>
 <PopoverTrigger asChild>
 <Button variant="outline" className={cn("w-full justify-start text-left font-normal bg-white/5 border-white/10 hover:bg-white/10 h-11 rounded-xl", !formData.scheduledDate && "text-muted-foreground")}>
 <Calendar size={14} className="mr-2 opacity-50" />
 {formData.scheduledDate ? format(new Date(formData.scheduledDate), "PPP") : <span>Pick a date</span>}
 </Button>
 </PopoverTrigger>
 <PopoverContent className="w-auto p-0 border-white/10" align="start">
 <CalendarComponent
 mode="single"
 selected={formData.scheduledDate ? new Date(formData.scheduledDate) : undefined}
 onSelect={(date) => setFormData({ ...formData, scheduledDate: date?.toISOString() || "" })}
 disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
 initialFocus
 classNames={{
 day_button: "relative flex size-9 items-center justify-center rounded-lg p-0 text-zinc-300 hover:bg-white/10 group-data-[disabled]:opacity-20 group-data-[disabled]:text-white/40 group-data-[disabled]:cursor-not-allowed group-data-[selected]:bg-brand group-data-[selected]:text-white focus-visible:outline-none transition-colors",
 disabled: "opacity-20 text-white/40 pointer-events-none",
 day_disabled: "opacity-20 text-white/40 pointer-events-none",
 today: "after:absolute after:bottom-1 after:size-[3px] after:rounded-full after:bg-brand"
 }}
 />
 </PopoverContent>
 </Popover>
 </div>
 <div className="space-y-2">
 <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Select Time</label>
 <ModernTimePicker
 value={formData.scheduledTime}
 onChange={(time: string) => setFormData({ ...formData, scheduledTime: time })}
 disabled={false}
 selectedDate={formData.scheduledDate}
 />
 </div>
 </motion.div>
 )}
 </div>
 ))}
 </div>
 </div>

 <div className="space-y-6">
 <div className="flex items-center gap-3 mb-2">
 <p className="text-[10px] font-bold text-white uppercase tracking-[0.2em]">Track Settings</p>
 </div>

 <div className="space-y-2">
 {[
 { id: 'isUnlisted', label: 'Unlisted Track', desc: 'Only people with the link can listen', icon: formData.isUnlisted ? <Lock size={14} /> : <Unlock size={14} /> },
 { id: 'allowDownloads', label: 'Allow Downloads', desc: 'Let listeners download asset', icon: <DownloadIcon size={14} /> },
 { id: 'enableComments', label: 'Enable Comments', desc: 'Let listeners leave feedback', icon: <MessageSquare size={14} /> }
 ].map(setting => (
 <div key={setting.id} className="flex items-center justify-between p-4 bg-white/2 border border-white/5 rounded-xl hover:border-brand/20 transition-all">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40">
 {setting.icon}
 </div>
 <div>
 <p className="text-[11px] font-bold text-white uppercase tracking-wider">{setting.label}</p>
 <p className="text-[9px] text-white/30 uppercase">{setting.desc}</p>
 </div>
 </div>
 <button
 onClick={() => setFormData({ ...formData, [setting.id]: !formData[setting.id as keyof typeof formData] })}
 className={cn("w-10 h-5 rounded-full relative transition-colors border", formData[setting.id as keyof typeof formData] ? "bg-brand border-brand" : "bg-white/5 border-white/10")}
 >
 <div className={cn("absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all", formData[setting.id as keyof typeof formData] ? "left-5.5" : "left-0.5", !formData[setting.id as keyof typeof formData] && "bg-white/20")} />
 </button>
 </div>
 ))}

 <div className="pt-4 space-y-2">
 <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Copyright / Label</label>
 <div className="relative">
 <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={14} />
 <input
 value={formData.copyrightLabel}
 onChange={(e) => setFormData({ ...formData, copyrightLabel: e.target.value })}
 placeholder="Label Identifier (e.g. Zenify)"
 className="input-premium pl-10 text-sm h-[48px]"
 />
 </div>
 </div>
 </div>
 </div>
 </div>
 )}

 {step === 3 && (
 <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
 <div className="md:col-span-4 space-y-6">
 <div className="aspect-square w-full rounded-2xl overflow-hidden border border-white/10 bg-surface shadow-2xl">
 {coverPreview ? (
 <img src={getMediaUrl(coverPreview)} className="w-full h-full object-cover" />
 ) : (
 <div className="w-full h-full flex items-center justify-center bg-white/5">
 <ImageIcon className="text-white/10" size={48} />
 </div>
 )}
 </div>
 <div className="p-4 rounded-xl bg-white/5 border border-white/10">
 <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Sonic Asset</p>
 <div className="flex items-center justify-between">
 <p className="text-xs text-white uppercase tracking-tighter font-bold truncate max-w-[150px]">{audioName}</p>
 <span className="text-[10px] font-mono text-brand font-bold">{formatTime(duration)}</span>
 </div>
 </div>
 </div>

 <div className="md:col-span-8 space-y-8">
 <div className="p-8 rounded-2xl bg-white/2 border border-white/5 hover:border-brand/20 transition-all">
 <div className="grid grid-cols-2 gap-y-6 gap-x-12">
 <div>
 <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Artist</p>
 <p className="text-sm font-medium text-brand tracking-tight">{formData.artistName}</p>
 </div>
 <div>
 <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Title</p>
 <p className="text-sm font-medium text-white tracking-tight">{formData.title}</p>
 </div>
 <div>
 <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Genre / Type</p>
 <p className="text-sm font-medium text-white/80 tracking-tighter">{formData.genre} • {formData.classification}</p>
 </div>
 <div>
 <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Total Time</p>
 <p className="text-sm font-medium text-brand font-mono">{formatTime(duration)}</p>
 </div>
 <div className="col-span-2">
 <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Copyright / Label</p>
 <p className="text-sm font-medium text-brand tracking-tight"><ZenifyText text={formData.copyrightLabel || "Not Specified"} /></p>
 </div>
 <div className="col-span-2">
 <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Schedule</p>
 {formData.releaseMode === 'now' ? (
 <p className="text-sm font-medium text-white tracking-tight">Immediate Distribution</p>
 ) : formData.releaseMode === 'draft' ? (
 <p className="text-sm font-medium text-white tracking-tight">Save to Drafts</p>
 ) : (
 <div className="flex items-center gap-2">
 <p className="text-sm font-medium text-white tracking-tight">
 {formData.scheduledDate ? format(new Date(formData.scheduledDate), "MMM d, yyyy") : ""}
 </p>
 <span className="text-white/30">•</span>
 <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] font-mono text-white tracking-widest">
 {formData.scheduledTime}
 </span>
 </div>
 )}
 </div>
 </div>
 </div>

 {/* Advanced Metadata Review */}
 {(formData.featuredArtists || formData.bpm || formData.key || formData.composers) && (
 <div className="p-6 rounded-2xl bg-white/2 border border-white/5 hover:border-brand/20 transition-all">
 <p className="text-[10px] font-bold text-brand/60 uppercase tracking-widest mb-4">Advanced Metadata</p>
 <div className="grid grid-cols-2 gap-y-4 gap-x-12">
 {formData.featuredArtists && (
 <div>
 <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Featured Artists</p>
 <p className="text-sm font-medium text-white/80 tracking-tight">{formData.featuredArtists}</p>
 </div>
 )}
 {formData.bpm && (
 <div>
 <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">BPM</p>
 <p className="text-sm font-medium text-brand font-mono">{formData.bpm}</p>
 </div>
 )}
 {formData.key && (
 <div>
 <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Musical Key</p>
 <p className="text-sm font-medium text-white/80">{formData.key}</p>
 </div>
 )}
 {formData.composers && (
 <div>
 <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Composers</p>
 <p className="text-sm font-medium text-white/80 tracking-tight">{formData.composers}</p>
 </div>
 )}
 </div>
 </div>
 )}

 {formData.lyrics && (
 <div className="p-6 rounded-2xl bg-white/2 border border-white/5 hover:border-brand/20 transition-all">
 <p className="text-[10px] font-bold text-brand/60 uppercase tracking-widest mb-3">Lyrics Preview</p>
 <p className="text-xs text-white/60 whitespace-pre-line leading-relaxed max-h-[120px] overflow-y-auto">{formData.lyrics}</p>
 </div>
 )}

 {/* Error Message */}
 {error && (
 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-2xl bg-danger/10 border border-danger/20 flex items-center gap-4 text-danger">
 <AlertCircle size={20} />
 <div>
 <p className="text-[10px] font-bold uppercase tracking-widest">Protocol Error</p>
 <p className="text-xs">{error}</p>
 </div>
 </motion.div>
 )}

 <div
 onClick={() => setIsCertified(!isCertified)}
 className="py-4 transition-all cursor-pointer flex items-center gap-4 group"
 >
 <div className={cn("w-5 h-5 rounded border flex items-center justify-center transition-colors flex-shrink-0 mt-0.5", isCertified ? "bg-brand border-brand shadow-[0_0_10px_rgba(var(--accent-brand-rgb),0.3)]" : "border-white/20 bg-white/5")}>
 {isCertified && <Check size={12} className="text-white" />}
 </div>
 <div>
 <p className="text-[11px] font-bold text-white uppercase tracking-widest mb-1">Asset Ownership Certification</p>
 <p className="text-[10px] text-white/40 leading-relaxed uppercase tracking-tight">I certify that I hold the digital rights to distribute this asset.</p>
 </div>
 </div>

 <button
 onClick={handleCommit}
 disabled={!isCertified || isLoading}
 className={cn(
 "w-full py-4 rounded-xl font-bold uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 text-xs",
 isCertified && !isLoading ? "bg-white/5 text-brand hover:bg-white/10 hover:text-brand active:scale-95" : "bg-white/5 text-white/20 cursor-not-allowed"
 )}
 >
 {isLoading ? <ZenLoading size="xs" /> : null}
 {isLoading ? "Synchronizing..." : "Commit Release"}
 </button>
 </div>
 </div>
 )}
 </motion.div>
 </AnimatePresence>
 </div>

 {/* Footer Controls */}
 <div className="flex items-center justify-between pt-12 border-t border-white/5 mt-10">
 <button
 onClick={() => setStep(s => Math.max(0, s - 1))}
 disabled={step === 0}
 className={cn(
 "flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors",
 step === 0 ? "text-white/10 cursor-not-allowed" : "text-muted hover:text-white"
 )}
 >
 <ChevronLeft size={16} className="text-brand/50" /> Previous
 </button>

 <div className="text-[10px] font-bold text-muted uppercase tracking-[0.2em] hidden sm:block">
 {step < 3 && !canNext[step] && (
 step === 0 ? "Asset Required" :
 step === 1 ? "Incomplete Metadata" : ""
 )}
 </div>

 {
 step < 3 && (
 <button
 onClick={() => setStep(s => Math.min(3, s + 1))}
 disabled={!canNext[step]}
 className={cn(
 "flex items-center gap-2 px-8 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all",
 canNext[step] ? "bg-white/5 border border-white/10 text-white hover:bg-white/10 shadow-lg active:scale-95" : "bg-white/2 cursor-not-allowed text-white/10"
 )}
 >
 {step === 2 ? "Ready to Review" : "Next Step"} <ChevronRight size={16} className="text-pink-500/50" />
 </button>
 )
 }
 </div>

 {/* Inline Alert Notification */}
 <AnimatePresence>
 {alert.show && (
 <motion.div
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: 5 }}
 className="mt-8 p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex items-start gap-4"
 >
 <div className={cn(
 "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
 alert.type === 'success' ? "bg-brand/10 text-brand" :
 alert.type === 'error' ? "bg-amber-500/10 text-amber-500" : "bg-blue-500/10 text-blue-500"
 )}>
 {alert.type === 'success' ? <CheckCircle2 size={16} /> :
 alert.type === 'error' ? <AlertCircle size={16} /> : <Sparkles size={16} />}
 </div>
 <div className="flex-1 space-y-1">
 <h3 className="text-[11px] font-bold text-white uppercase tracking-wider">{alert.title}</h3>
 <p className="text-[10px] text-white/40 font-medium leading-relaxed uppercase tracking-tight">
 {alert.message}
 </p>
 </div>
 <button
 onClick={() => setAlert(prev => ({ ...prev, show: false }))}
 className="text-[9px] font-bold text-white/20 hover:text-white uppercase tracking-widest transition-colors"
 >
 Dismiss
 </button>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 </div>
 );
}
