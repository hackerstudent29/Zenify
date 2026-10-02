"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  HardDrive, Folder, Music, Play, Pause, RefreshCw, Trash2, 
  Search, ChevronRight, ArrowLeft, Disc, Layers, Sparkles, 
  Clock, ShieldCheck, FolderUp, Plus, Volume2, UploadCloud, CheckCircle2,
  FolderPlus, User, Check, Zap, ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { parseAudioFileMetadata, LocalAudioMetadata, cleanWebTags } from "@/lib/id3Parser";
import { 
  saveLocalLibrary, getSavedLocalFolders, getSavedLocalTracks, 
  clearSavedLocalLibrary, convertLocalToZenifyTrack, LocalFolderGroup,
  enrichLocalTrackWithCatalog
} from "@/services/localLibraryStore";
import { usePlayerStore } from "@/store/player";
import { formatDuration, cn, formatDisplayTitle } from "@/lib/utils";

export default function LocalLibraryPage() {
  const router = useRouter();
  const [tracks, setTracks] = useState<LocalAudioMetadata[]>([]);
  const [folders, setFolders] = useState<LocalFolderGroup[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [activeTab, setActiveTab] = useState<"folders" | "artists" | "tracks">("folders");
  const [selectedFolder, setSelectedFolder] = useState<LocalFolderGroup | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();

  // Load saved local library on mount
  useEffect(() => {
    async function loadSaved() {
      try {
        const savedFolders = await getSavedLocalFolders();
        const savedTracks = await getSavedLocalTracks();
        setFolders(savedFolders);
        if (savedTracks.length > 0) {
          setTracks(savedTracks);
        }
      } catch (e) {
        console.error("Failed to load saved local library:", e);
      }
    }
    loadSaved();
  }, []);

  // Directory scan handler
  const handleDirectoryScan = async (filesList: FileList | File[]) => {
    const audioFiles = Array.from(filesList).filter(f => 
      /\.(mp3|m4a|flac|wav|ogg|aac)$/i.test(f.name)
    );

    if (audioFiles.length === 0) {
      toast.error("No supported audio files (.mp3, .m4a, .flac, .wav) found in selection.");
      return;
    }

    setIsScanning(true);
    setScanProgress(`Scanning 0 / ${audioFiles.length} files...`);
    toast.info(`Extracting metadata for ${audioFiles.length} local audio files...`);

    const parsedTracks: LocalAudioMetadata[] = [];
    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      setScanProgress(`Processing ${i + 1}/${audioFiles.length}: ${file.name}`);
      try {
        const metadata = await parseAudioFileMetadata(file);
        parsedTracks.push(metadata);
      } catch (e) {
        console.warn("Failed to parse metadata for file:", file.name, e);
      }
    }

    // Merge tracks deduplicated by ID
    const trackMap = new Map<string, LocalAudioMetadata>();
    tracks.forEach(t => trackMap.set(t.id, t));
    parsedTracks.forEach(t => trackMap.set(t.id, t));
    const mergedTracks = Array.from(trackMap.values());

    setTracks(mergedTracks);
    await saveLocalLibrary(mergedTracks);

    const updatedFolders = await getSavedLocalFolders();
    setFolders(updatedFolders);
    setIsScanning(false);
    setScanProgress("");

    toast.success(`Imported ${parsedTracks.length} local songs into ${updatedFolders.length} virtual folder albums!`);
    
    // Auto-enrich in background
    handleAutoEnrich(mergedTracks);
  };

  // Modern Web File System Access API
  const handleNativeFolderPicker = async () => {
    if ("showDirectoryPicker" in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker();
        const files: File[] = [];

        async function scanDir(handle: any, path: string) {
          for await (const entry of handle.values()) {
            if (entry.kind === "file") {
              const file = await entry.getFile();
              Object.defineProperty(file, "webkitRelativePath", {
                value: `${path}/${file.name}`,
                writable: false
              });
              files.push(file);
            } else if (entry.kind === "directory") {
              await scanDir(entry, `${path}/${entry.name}`);
            }
          }
        }

        await scanDir(dirHandle, dirHandle.name);
        await handleDirectoryScan(files);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("Directory picker error:", err);
          folderInputRef.current?.click();
        }
      }
    } else {
      folderInputRef.current?.click();
    }
  };

  // Auto-Match Online Catalog Metadata
  const handleAutoEnrich = async (targetTracks = tracks) => {
    if (targetTracks.length === 0) return;
    setIsEnriching(true);
    toast.info("Connecting local tracks with Zenify catalog for HD artwork & lyrics...");

    const enriched: LocalAudioMetadata[] = [];
    for (let i = 0; i < targetTracks.length; i++) {
      const track = targetTracks[i];
      setScanProgress(`Matching ${i + 1}/${targetTracks.length}: ${track.title}`);
      const updated = await enrichLocalTrackWithCatalog(track);
      enriched.push(updated);
    }

    setTracks(enriched);
    await saveLocalLibrary(enriched);
    const updatedFolders = await getSavedLocalFolders();
    setFolders(updatedFolders);
    setIsEnriching(false);
    setScanProgress("");

    const matchedCount = enriched.filter(t => t.isMatched).length;
    toast.success(`Catalog Match Complete! Connected ${matchedCount} / ${enriched.length} songs with HD Artwork & Synced Lyrics!`);
  };

  // Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleDirectoryScan(e.dataTransfer.files);
    }
  };

  // Play single local track
  const handlePlayLocalTrack = (t: LocalAudioMetadata, contextList: LocalAudioMetadata[]) => {
    const zenTrack = convertLocalToZenifyTrack(t);
    const zenQueue = contextList.map(convertLocalToZenifyTrack);
    setTrack(zenTrack, zenQueue);
  };

  // Play folder playlist
  const handlePlayFolder = (folder: LocalFolderGroup) => {
    const folderTracks = tracks.filter(t => t.folderPath === folder.path);
    if (folderTracks.length > 0) {
      handlePlayLocalTrack(folderTracks[0], folderTracks);
      toast.success(`Playing ${folder.name} (${folderTracks.length} songs)`);
    }
  };

  // Play artist local songs
  const handlePlayArtist = (artistName: string) => {
    const artistTracks = tracks.filter(t => (t.matchedArtistName || t.artist).toLowerCase() === artistName.toLowerCase());
    if (artistTracks.length > 0) {
      handlePlayLocalTrack(artistTracks[0], artistTracks);
      toast.success(`Playing songs by ${artistName}`);
    }
  };

  const handleClearLibrary = async () => {
    if (confirm("Clear saved local library cache?")) {
      await clearSavedLocalLibrary();
      setTracks([]);
      setFolders([]);
      setSelectedFolder(null);
      setSelectedArtist(null);
      toast.success("Cleared local device library.");
    }
  };

  // Computations
  const totalSizeBytes = tracks.reduce((acc, t) => acc + (t.sizeBytes || 0), 0);
  const totalSizeMb = (totalSizeBytes / (1024 * 1024)).toFixed(1);
  const matchedTracksCount = tracks.filter(t => t.isMatched).length;

  // Group by Artist
  const artistMap = new Map<string, LocalAudioMetadata[]>();
  tracks.forEach(t => {
    const name = t.matchedArtistName || t.artist || "Local Artist";
    const existing = artistMap.get(name) || [];
    existing.push(t);
    artistMap.set(name, existing);
  });
  const artistList = Array.from(artistMap.entries()).map(([name, songList]) => ({
    name,
    songCount: songList.length,
    coverUrl: songList.find(s => s.coverUrl || s.matchedCoverUrl)?.coverUrl || songList.find(s => s.matchedCoverUrl)?.matchedCoverUrl,
    isMatched: songList.some(s => s.isMatched)
  }));

  // Filtered tracks
  const filteredTracks = tracks.filter(t => 
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.folderName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div 
      className="min-h-screen bg-background pb-36 text-foreground font-sans select-none"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={folderInputRef}
        className="hidden"
        {...({ webkitdirectory: "", directory: "", multiple: true } as any)}
        onChange={(e) => e.target.files && handleDirectoryScan(e.target.files)}
      />
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        accept="audio/*"
        onChange={(e) => e.target.files && handleDirectoryScan(e.target.files)}
      />

      {/* Header Sticky Bar */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-white/5 px-4 pb-4 md:px-8 pt-4 md:pt-[calc(var(--header-height)+1rem)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center shadow-xl shadow-black/30 shrink-0">
              <HardDrive size={20} className="text-brand" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-none font-brand" style={{ fontFamily: "'Orange Avenue', serif" }}>
                  Device Music Hub
                </h1>
                <span className="text-[10px] font-bold tracking-wider uppercase bg-brand/10 text-brand border border-brand/20 px-2 py-0.5 rounded-full">
                  Hybrid Storage
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1 font-medium">
                <ShieldCheck size={12} className="text-emerald-400" />
                100% Private local audio playback • Zenify catalog lyrics & HD artwork matched
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleNativeFolderPicker}
              disabled={isScanning || isEnriching}
              className="h-9 px-4 rounded-full bg-brand hover:bg-brand/90 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-brand/20 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <FolderUp size={14} />
              <span>Import Folder</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning || isEnriching}
              className="h-9 px-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-white font-semibold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              title="Add Audio Files"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Add Files</span>
            </button>
            {tracks.length > 0 && (
              <button
                onClick={() => handleAutoEnrich()}
                disabled={isEnriching || isScanning}
                className="h-9 px-3.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                title="Match HD Album Artwork & Lyrics with Zenify Catalog"
              >
                <Sparkles size={14} />
                <span className="hidden sm:inline">Auto-Match Catalog</span>
              </button>
            )}
            {folders.length > 0 && (
              <button
                onClick={handleClearLibrary}
                className="h-9 w-9 rounded-full bg-white/5 border border-white/10 hover:bg-red-500/10 hover:border-red-500/20 text-zinc-400 hover:text-red-400 flex items-center justify-center transition-all cursor-pointer"
                title="Clear Local Library"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Dashboard Real-Time Stats Bar */}
        {tracks.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 p-2.5 rounded-2xl bg-zinc-900/40 border border-white/5 text-xs">
            <div className="flex items-center gap-2 px-3 py-1">
              <Music size={14} className="text-brand" />
              <div>
                <p className="text-[10px] text-zinc-500 font-medium">Total Songs</p>
                <p className="font-bold text-white leading-none">{tracks.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 border-l border-white/5">
              <Folder size={14} className="text-rose-400" />
              <div>
                <p className="text-[10px] text-zinc-500 font-medium">Folder Albums</p>
                <p className="font-bold text-white leading-none">{folders.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 border-l border-white/5">
              <Sparkles size={14} className="text-emerald-400" />
              <div>
                <p className="text-[10px] text-zinc-500 font-medium">Catalog Matched</p>
                <p className="font-bold text-emerald-400 leading-none">{matchedTracksCount} / {tracks.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 border-l border-white/5">
              <HardDrive size={14} className="text-zinc-400" />
              <div>
                <p className="text-[10px] text-zinc-500 font-medium">Device Storage</p>
                <p className="font-bold text-white leading-none">{totalSizeMb} MB</p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            <button
              onClick={() => { setActiveTab("folders"); setSelectedFolder(null); setSelectedArtist(null); }}
              className={cn(
                "h-8 px-4 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
                activeTab === "folders" && !selectedFolder && !selectedArtist
                  ? "bg-brand text-white border-brand shadow-md shadow-brand/20"
                  : "bg-white/5 text-zinc-400 border-transparent hover:text-white hover:bg-white/10"
              )}
            >
              <Folder size={13} />
              <span>Folders ({folders.length})</span>
            </button>
            <button
              onClick={() => { setActiveTab("artists"); setSelectedFolder(null); setSelectedArtist(null); }}
              className={cn(
                "h-8 px-4 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
                activeTab === "artists"
                  ? "bg-brand text-white border-brand shadow-md shadow-brand/20"
                  : "bg-white/5 text-zinc-400 border-transparent hover:text-white hover:bg-white/10"
              )}
            >
              <User size={13} />
              <span>Artists ({artistList.length})</span>
            </button>
            <button
              onClick={() => { setActiveTab("tracks"); setSelectedFolder(null); setSelectedArtist(null); }}
              className={cn(
                "h-8 px-4 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
                activeTab === "tracks"
                  ? "bg-brand text-white border-brand shadow-md shadow-brand/20"
                  : "bg-white/5 text-zinc-400 border-transparent hover:text-white hover:bg-white/10"
              )}
            >
              <Music size={13} />
              <span>All Songs ({tracks.length})</span>
            </button>
          </div>

          {/* Search Field */}
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search local music..."
              className="w-full h-8 pl-8 pr-3 rounded-full bg-white/5 border border-white/10 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-brand/40 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="px-4 md:px-8 py-6">
        {/* Drag & Drop Alert */}
        {isDragging && (
          <div className="mb-6 p-6 rounded-2xl border-2 border-dashed border-brand bg-brand/10 backdrop-blur-xl flex flex-col items-center justify-center text-center space-y-2 animate-pulse">
            <UploadCloud size={36} className="text-brand" />
            <p className="text-sm font-bold text-white">Drop your local music folder here</p>
            <p className="text-xs text-zinc-400">Zenify will parse and match songs automatically.</p>
          </div>
        )}

        {/* Progress Spinner */}
        {(isScanning || isEnriching) && (
          <div className="mb-6 p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
              <span className="flex items-center gap-2 text-brand">
                <RefreshCw size={14} className="animate-spin" />
                {isEnriching ? "Connecting with Zenify Catalog..." : "Scanning Local Folder..."}
              </span>
              <span className="font-mono text-zinc-400 text-[11px]">{scanProgress}</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full bg-brand animate-pulse w-full" />
            </div>
          </div>
        )}

        {/* Selected Folder View */}
        {selectedFolder ? (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors cursor-pointer" onClick={() => setSelectedFolder(null)}>
              <ArrowLeft size={14} /> Back to Folders
            </div>

            <div className="flex items-center justify-between p-5 rounded-2xl bg-zinc-900/60 border border-white/5">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand shrink-0">
                  <Folder size={24} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{selectedFolder.path}</p>
                  <h2 className="text-lg sm:text-xl font-bold text-white truncate">{selectedFolder.name}</h2>
                  <p className="text-xs text-zinc-400">{selectedFolder.trackCount} Songs • Virtual Playlist</p>
                </div>
              </div>

              <button
                onClick={() => handlePlayFolder(selectedFolder)}
                className="h-9 px-5 rounded-full bg-brand hover:bg-brand/90 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-brand/20 transition-all active:scale-95 cursor-pointer shrink-0"
              >
                <Play size={14} fill="currentColor" /> Play Folder
              </button>
            </div>

            {/* Folder Tracks List */}
            <div className="flex flex-col gap-1">
              {tracks.filter(t => t.folderPath === selectedFolder.path).map((t, idx) => {
                const isCurrent = currentTrack?.id === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => handlePlayLocalTrack(t, tracks.filter(tr => tr.folderPath === selectedFolder.path))}
                    className={cn(
                      "h-14 flex items-center justify-between px-3 rounded-xl transition-colors group cursor-pointer border border-transparent",
                      isCurrent ? "bg-brand/15 border-brand/30 text-white" : "hover:bg-white/5 text-zinc-300"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="w-5 text-center text-xs font-mono font-bold text-zinc-500 group-hover:text-white shrink-0">
                        {isCurrent ? <Volume2 size={14} className="text-brand animate-pulse mx-auto" /> : idx + 1}
                      </span>
                      <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-white/5 overflow-hidden shrink-0 flex items-center justify-center text-zinc-500">
                        {t.coverUrl || t.matchedCoverUrl ? (
                          <img src={t.coverUrl || t.matchedCoverUrl} alt={t.title} className="w-full h-full object-cover" />
                        ) : (
                          <Music size={16} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className={cn("text-xs sm:text-sm font-bold truncate", isCurrent ? "text-brand" : "text-white")}>
                            {formatDisplayTitle(t.title)}
                          </p>
                          {t.isMatched && (
                            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                              <Sparkles size={8} /> Matched
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 font-medium truncate mt-0.5">
                          {formatDisplayTitle(t.matchedArtistName || t.artist)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 pl-2">
                      <span className="text-xs font-mono text-zinc-500">
                        {formatDuration(t.duration)}
                      </span>
                      <button className="w-8 h-8 rounded-full bg-white/5 group-hover:bg-brand group-hover:text-white flex items-center justify-center text-zinc-400 transition-all">
                        {isCurrent && isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Main Views */
          <div>
            {/* Zero State */}
            {folders.length === 0 && tracks.length === 0 && !isScanning && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-16 h-16 rounded-full border border-white/5 bg-zinc-900/80 mb-4 flex items-center justify-center text-zinc-500 shadow-xl">
                  <FolderPlus size={28} strokeWidth={1.5} />
                </div>
                <h3 className="text-base font-bold text-white mb-1">No Local Songs Imported</h3>
                <p className="text-xs text-zinc-400 max-w-sm mb-6">
                  Select a local music directory or drag and drop your music folder. Zenify will organize your local tracks into playlists and match HD artwork & lyrics automatically.
                </p>
                <button
                  onClick={handleNativeFolderPicker}
                  className="h-9 px-5 rounded-full bg-brand hover:bg-brand/90 text-white font-bold text-xs shadow-lg shadow-brand/20 transition-all cursor-pointer flex items-center gap-2"
                >
                  <FolderUp size={14} /> Choose Music Folder
                </button>
              </div>
            )}

            {/* Folders View */}
            {activeTab === "folders" && folders.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {folders
                  .filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()) || f.path.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(folder => {
                    const firstFolderTrack = tracks.find(t => t.folderPath === folder.path);
                    const cover = firstFolderTrack?.coverUrl || firstFolderTrack?.matchedCoverUrl;
                    return (
                      <div
                        key={folder.path}
                        onClick={() => setSelectedFolder(folder)}
                        className="group block rounded-xl transition-all hover:bg-white/10 cursor-pointer space-y-2 pb-2 p-1.5"
                      >
                        <div className="aspect-square bg-zinc-900 rounded-lg overflow-hidden shadow-xl ring-1 ring-white/5 group-hover:ring-brand/50 group-hover:scale-[1.02] transition-all relative flex items-center justify-center">
                          {cover ? (
                            <img src={cover} alt={folder.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-950 flex flex-col items-center justify-center gap-2 text-zinc-500">
                              <Folder size={32} className="text-brand/60" />
                              <span className="text-[10px] font-mono text-zinc-400 font-bold">{folder.trackCount} songs</span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center shadow-lg shadow-black/50">
                              <Play size={16} fill="currentColor" className="ml-0.5" />
                            </div>
                          </div>
                        </div>
                        <div className="px-1">
                          <h3 className="font-sans font-bold text-xs sm:text-sm truncate group-hover:text-brand transition-colors text-white">
                            {formatDisplayTitle(folder.name)}
                          </h3>
                          <p className="text-[11px] text-zinc-400 font-medium truncate mt-0.5">
                            {folder.trackCount} songs • Playlist
                          </p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Artists View */}
            {activeTab === "artists" && artistList.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                {artistList
                  .filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(artist => (
                    <div
                      key={artist.name}
                      onClick={() => handlePlayArtist(artist.name)}
                      className="group flex flex-col items-center text-center space-y-3 cursor-pointer p-2 rounded-xl hover:bg-white/5 transition-all"
                    >
                      <div className="w-full aspect-square rounded-full overflow-hidden bg-zinc-900 border border-white/10 group-hover:ring-2 ring-brand/50 transition-all shadow-xl shadow-black/40 relative">
                        {artist.coverUrl ? (
                          <img src={artist.coverUrl} alt={artist.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-400">
                            <User size={32} />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Play size={20} fill="currentColor" className="text-white" />
                        </div>
                      </div>
                      <div>
                        <h3 className="font-bold text-xs sm:text-sm text-white group-hover:text-brand transition-colors truncate max-w-[120px]">
                          {formatDisplayTitle(artist.name)}
                        </h3>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">
                          {artist.songCount} local tracks
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* All Tracks View */}
            {activeTab === "tracks" && tracks.length > 0 && (
              <div className="flex flex-col gap-1">
                {filteredTracks.map((t, idx) => {
                  const isCurrent = currentTrack?.id === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => handlePlayLocalTrack(t, filteredTracks)}
                      className={cn(
                        "h-14 flex items-center justify-between px-3 rounded-xl transition-colors group cursor-pointer border border-transparent",
                        isCurrent ? "bg-brand/15 border-brand/30 text-white" : "hover:bg-white/5 text-zinc-300"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="w-5 text-center text-xs font-mono font-bold text-zinc-500 group-hover:text-white shrink-0">
                          {isCurrent ? <Volume2 size={14} className="text-brand animate-pulse mx-auto" /> : idx + 1}
                        </span>
                        <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-white/5 overflow-hidden shrink-0 flex items-center justify-center text-zinc-500 relative">
                          {t.coverUrl || t.matchedCoverUrl ? (
                            <img src={t.coverUrl || t.matchedCoverUrl} alt={t.title} className="w-full h-full object-cover" />
                          ) : (
                            <Music size={16} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className={cn("text-xs sm:text-sm font-bold truncate", isCurrent ? "text-brand" : "text-white")}>
                              {formatDisplayTitle(t.title)}
                            </p>
                            {t.isMatched ? (
                              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                                <Sparkles size={8} /> Catalog Matched
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold text-zinc-500 bg-white/5 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                                <Zap size={8} /> Local Audio
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-400 font-medium truncate mt-0.5">
                            {formatDisplayTitle(t.matchedArtistName || t.artist)} • <span className="font-mono text-zinc-500">{t.folderName}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 pl-2">
                        <span className="text-xs font-mono text-zinc-500 hidden sm:inline">
                          {formatDuration(t.duration)}
                        </span>
                        <button className="w-8 h-8 rounded-full bg-white/5 group-hover:bg-brand group-hover:text-white flex items-center justify-center text-zinc-400 transition-all">
                          {isCurrent && isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
