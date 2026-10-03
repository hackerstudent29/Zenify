"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  HardDrive, Folder, Music, Play, Pause, RefreshCw, Trash2, 
  Search, ChevronRight, ArrowLeft, Disc, Layers, Sparkles, 
  Clock, ShieldCheck, FolderUp, Plus, Volume2, UploadCloud, CheckCircle2,
  FolderPlus, User, Check, Zap, ExternalLink, MoreVertical, MoreHorizontal
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { parseAudioFileMetadata, LocalAudioMetadata, cleanWebTags, cleanSongTitle, splitArtists, isStemAudioFile } from "@/lib/id3Parser";
import { 
  saveLocalLibrary, getSavedLocalFolders, getSavedLocalTracks, 
  clearSavedLocalLibrary, convertLocalToZenifyTrack, LocalFolderGroup,
  enrichLocalTrackWithCatalog, isDuplicateTrack, saveTrackToCloudDB,
  runParallelWorkerPool
} from "@/services/localLibraryStore";
import { usePlayerStore } from "@/store/player";
import { useAuthStore } from "@/store/authStore";
import { useCloudSyncStore } from "@/store/cloudSyncStore";
import { formatDuration, cn, formatDisplayTitle, getMediaUrl } from "@/lib/utils";

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
  const [hoveredCover, setHoveredCover] = useState<string | null>(null);
  const [activeMenuTrackId, setActiveMenuTrackId] = useState<string | null>(null);
  const [activeMenuFolderPath, setActiveMenuFolderPath] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();

  // Load saved local library on mount
  useEffect(() => {
    async function loadSaved() {
      try {
        const savedFolders = await getSavedLocalFolders();
        const savedTracks: LocalAudioMetadata[] = await getSavedLocalTracks();
        setFolders(savedFolders);
        if (savedTracks.length > 0) {
          const cleanedSaved = savedTracks.map(t => ({
            ...t,
            title: cleanSongTitle(t.title),
            artist: cleanWebTags(t.artist)
          }));
          setTracks(cleanedSaved);
        }
      } catch (e) {
        console.error("Failed to load saved local library:", e);
      }
    }
    loadSaved();
  }, []);

  // Fast Parallel Directory & Multi-file scan handler with Stem Filtering & Duplicate Prevention
  const handleDirectoryScan = async (filesList: FileList | File[]) => {
    const allAudioFiles = Array.from(filesList).filter(f => 
      /\.(mp3|m4a|flac|wav|ogg|aac)$/i.test(f.name)
    );

    const nonStemFiles = allAudioFiles.filter(f => !isStemAudioFile(f.name));
    const skippedStemCount = allAudioFiles.length - nonStemFiles.length;

    if (nonStemFiles.length === 0) {
      if (skippedStemCount > 0) {
        toast.warning(`Skipped ${skippedStemCount} isolated audio stems (drums/vocals/instruments). Only full songs are imported.`);
      } else {
        toast.error("No supported audio files (.mp3, .m4a, .flac, .wav) found.");
      }
      return;
    }

    setIsScanning(true);
    setScanProgress(`Parallel parsing 0 / ${nonStemFiles.length} files (16 workers active)...`);
    toast.info(`Processing metadata & checking duplicates for ${nonStemFiles.length} files with 16 parallel workers...`);

    let skippedShortCount = 0;
    const user = useAuthStore.getState().user;
    const currentUserName = user?.name || user?.username || user?.email || "Zenify User";

    const parsedResults = await runParallelWorkerPool<File, LocalAudioMetadata | null>(
      nonStemFiles,
      async (file) => {
        try {
          const res = await parseAudioFileMetadata(file);
          if (res) {
            if (res.duration && res.duration < 10) {
              skippedShortCount++;
              return null;
            }
            return {
              ...res,
              importedBy: currentUserName,
              importedAt: new Date().toISOString(),
              importedTimings: {
                timestamp: Date.now(),
                isoDate: new Date().toISOString(),
                durationSeconds: res.duration || 0,
              },
              importedUserDetails: {
                userId: user?.id || "local-user",
                userName: currentUserName,
                userEmail: user?.email || "",
              }
            };
          }
        } catch (err) {
          console.warn("Failed tag parse:", file.name, err);
        }
        return null;
      },
      16,
      (completed, total, active) => {
        setScanProgress(`Parallel importing ${completed}/${total} files (${active} workers active)...`);
      }
    );

    const parsedTracks: LocalAudioMetadata[] = parsedResults.filter((t): t is LocalAudioMetadata => t !== null && t !== undefined);

    // Smart Duplicate Prevention: Compare parsed tracks against current Zenify library
    const currentLibrary = [...tracks];
    const newUniqueTracks: LocalAudioMetadata[] = [];
    let skippedDuplicateCount = 0;

    parsedTracks.forEach(newTrack => {
      const { isDuplicate, matchedTrack } = isDuplicateTrack(currentLibrary, newTrack);
      if (isDuplicate) {
        skippedDuplicateCount++;
        // If existing matched track was missing live file handle, attach it now
        if (matchedTrack && !matchedTrack.file && newTrack.file) {
          matchedTrack.file = newTrack.file;
          matchedTrack.audioUrl = newTrack.audioUrl;
        }
      } else {
        newUniqueTracks.push(newTrack);
        currentLibrary.push(newTrack);
      }
    });

    const mergedTracks = currentLibrary;

    setTracks(mergedTracks);
    await saveLocalLibrary(mergedTracks);

    const updatedFolders = await getSavedLocalFolders();
    setFolders(updatedFolders);
    setIsScanning(false);
    setScanProgress("");

    let msg = `Imported ${newUniqueTracks.length} local songs into ${updatedFolders.length} playlists!`;
    if (skippedDuplicateCount > 0 || skippedStemCount > 0 || skippedShortCount > 0) {
      const details: string[] = [];
      if (skippedDuplicateCount > 0) details.push(`${skippedDuplicateCount} duplicates skipped`);
      if (skippedStemCount > 0) details.push(`${skippedStemCount} stem tracks excluded`);
      if (skippedShortCount > 0) details.push(`${skippedShortCount} short files (<10s) excluded`);
      msg += ` (${details.join(", ")})`;
    }
    toast.success(msg);
  };

  // Delete single track from Device Music
  const handleDeleteTrack = async (trackId: string, title: string) => {
    const updated = tracks.filter(t => t.id !== trackId);
    setTracks(updated);
    await saveLocalLibrary(updated);
    const updatedFolders = await getSavedLocalFolders();
    setFolders(updatedFolders);
    toast.success(`Deleted "${title}" from Device Music.`);
  };

  // Delete entire folder from Device Music
  const handleDeleteFolder = async (folderPath: string, folderName: string) => {
    const updated = tracks.filter(t => t.folderPath !== folderPath);
    setTracks(updated);
    await saveLocalLibrary(updated);
    const updatedFolders = await getSavedLocalFolders();
    setFolders(updatedFolders);
    if (selectedFolder?.path === folderPath) {
      setSelectedFolder(null);
    }
    toast.success(`Deleted folder "${folderName}" from Device Music.`);
  };

  // Match single track with Zenify online catalog & save to Cloud DB
  const handleMatchSingleTrack = async (track: LocalAudioMetadata) => {
    useCloudSyncStore.getState().startCloudSync([track]);
    const updatedFolders = await getSavedLocalFolders();
    setFolders(updatedFolders);
  };

  // Match all tracks in a folder with Zenify online catalog & save to Cloud DB using parallel workers
  const handleMatchFolder = async (folder: LocalFolderGroup) => {
    const folderTracks = tracks.filter(t => t.folderPath === folder.path);
    if (folderTracks.length === 0) return;
    
    useCloudSyncStore.getState().startCloudSync(folderTracks);
    const updatedFolders = await getSavedLocalFolders();
    setFolders(updatedFolders);
  };

  // Dual Desktop & Mobile Folder / Multi-File Picker
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
        if (files.length > 0) {
          await handleDirectoryScan(files);
          return;
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
      }
    }

    // Fallback to webkitdirectory folder input
    if (folderInputRef.current) {
      folderInputRef.current.click();
    } else if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Fast Parallel Auto-Match Online Catalog Metadata for all unmatched & Cloud DB save
  const handleAutoEnrich = async (targetTracks = tracks) => {
    if (targetTracks.length === 0) return;

    // Filter tracks that are not yet saved to Cloud DB or not matched
    const unsynced = targetTracks.filter(t => !t.isSavedToCloud || !t.isMatched);
    const tracksToProcess = unsynced.length > 0 ? unsynced : targetTracks;

    if (tracksToProcess.length === 0) {
      toast.info("All tracks are already saved & synced to Zenify Cloud DB!");
      return;
    }

    useCloudSyncStore.getState().startCloudSync(tracksToProcess);
    const updatedFolders = await getSavedLocalFolders();
    setFolders(updatedFolders);
  };

  // Drag & Drop Recursive Folder Scanner
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
    if (!e.dataTransfer) return;

    const files: File[] = [];
    const items = Array.from(e.dataTransfer.items || []);

    async function readEntry(entry: any, path: string) {
      if (!entry) return;
      if (entry.isFile) {
        return new Promise<void>((resolve) => {
          entry.file((file: File) => {
            Object.defineProperty(file, "webkitRelativePath", {
              value: `${path}/${file.name}`,
              writable: false
            });
            files.push(file);
            resolve();
          });
        });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const entries = await new Promise<any[]>((resolve) => {
          reader.readEntries((results: any[]) => resolve(results || []));
        });
        for (const childEntry of entries) {
          await readEntry(childEntry, `${path}/${entry.name}`);
        }
      }
    }

    for (const item of items) {
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) {
        await readEntry(entry, entry.name);
      } else if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }

    if (files.length > 0) {
      await handleDirectoryScan(files);
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
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

  // Play individual artist songs
  const handlePlayArtist = (artistName: string) => {
    const artistTracks = tracks.filter(t => 
      splitArtists(t.matchedArtistName || t.artist).some(a => a.toLowerCase() === artistName.toLowerCase())
    );
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

  // Active Cover for Reactive Liquid Ambient BG
  const activeBackdropCover = hoveredCover || currentTrack?.coverUrl || tracks.find(t => t.coverUrl || t.matchedCoverUrl)?.coverUrl || tracks.find(t => t.matchedCoverUrl)?.matchedCoverUrl;

  // Individual Artist Splitting & Aggregation
  const individualArtistMap = new Map<string, LocalAudioMetadata[]>();
  tracks.forEach(t => {
    const rawArtistName = t.matchedArtistName || t.artist;
    const individualArtists = splitArtists(rawArtistName);

    individualArtists.forEach(artistName => {
      const existing = individualArtistMap.get(artistName) || [];
      if (!existing.some(tr => tr.id === t.id)) {
        existing.push(t);
      }
      individualArtistMap.set(artistName, existing);
    });
  });

  const individualArtistList = Array.from(individualArtistMap.entries()).map(([name, songList]) => ({
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

  // Render Track Row helper
  const renderTrackRow = (t: LocalAudioMetadata, idx: number, contextList: LocalAudioMetadata[]) => {
    const isCurrent = currentTrack?.id === t.id;
    const individualArtists = splitArtists(t.matchedArtistName || t.artist);
    const cover = t.coverUrl || t.matchedCoverUrl;
    const isMenuOpen = activeMenuTrackId === t.id;

    return (
      <div
        key={t.id}
        onMouseEnter={() => setHoveredCover(cover || null)}
        onMouseLeave={() => setHoveredCover(null)}
        onClick={() => handlePlayLocalTrack(t, contextList)}
        className={cn(
          "h-14 flex items-center justify-between px-3 rounded-xl transition-colors group cursor-pointer border border-transparent relative",
          isCurrent ? "bg-brand/15 border-brand/30 text-white" : "hover:bg-white/5 text-zinc-300"
        )}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="w-5 text-center text-xs font-mono font-bold text-zinc-500 group-hover:text-white shrink-0">
            {isCurrent ? <Volume2 size={14} className="text-brand animate-pulse mx-auto" /> : idx + 1}
          </span>
          <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-white/5 overflow-hidden shrink-0 flex items-center justify-center text-zinc-500 relative">
            {cover ? (
              <img src={getMediaUrl(cover)} alt={t.title} className="w-full h-full object-cover" />
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
              {individualArtists.map(formatDisplayTitle).join(", ")} • <span className="font-mono text-zinc-500">{t.folderName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 pl-2">
          <span className="text-xs font-mono text-zinc-500 hidden sm:inline mr-1">
            {formatDuration(t.duration)}
          </span>

          <button 
            onClick={(e) => {
              e.stopPropagation();
              handlePlayLocalTrack(t, contextList);
            }}
            className="w-8 h-8 rounded-full bg-white/5 group-hover:bg-brand group-hover:text-white flex items-center justify-center text-zinc-400 transition-all cursor-pointer"
          >
            {isCurrent && isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
          </button>

          {/* 3-Dot Options Dropdown */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setActiveMenuTrackId(isMenuOpen ? null : t.id)}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer"
              title="Track Options"
            >
              <MoreVertical size={15} />
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 top-10 z-50 w-56 rounded-xl bg-zinc-900/95 border border-white/10 shadow-2xl p-1.5 backdrop-blur-2xl text-left animate-in fade-in zoom-in-95">
                <button
                  onClick={() => {
                    setActiveMenuTrackId(null);
                    handlePlayLocalTrack(t, contextList);
                  }}
                  className="w-full h-8 px-3 rounded-lg hover:bg-white/10 text-xs font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Play size={13} fill="currentColor" className="text-brand" />
                  <span>Play Track</span>
                </button>

                {!t.isMatched && (
                  <button
                    onClick={() => {
                      setActiveMenuTrackId(null);
                      handleMatchSingleTrack(t);
                    }}
                    className="w-full h-8 px-3 rounded-lg hover:bg-emerald-500/10 text-xs font-semibold text-emerald-400 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Sparkles size={13} />
                    <span>Match with Zenify Catalog</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setActiveMenuTrackId(null);
                    handleDeleteTrack(t.id, t.title);
                  }}
                  className="w-full h-8 px-3 rounded-lg hover:bg-red-500/10 text-xs font-semibold text-red-400 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>Delete from Device Music</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div 
      className="min-h-screen bg-background pb-36 text-foreground font-sans select-none relative overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => {
        setActiveMenuTrackId(null);
        setActiveMenuFolderPath(null);
      }}
    >
      {/* Reactive Liquid Ambient Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {activeBackdropCover && (
          <div 
            className="absolute -top-[20%] -left-[10%] w-[120%] h-[120%] bg-cover bg-center blur-[120px] opacity-25 transition-all duration-1000 scale-125 saturate-150"
            style={{ backgroundImage: `url(${getMediaUrl(activeBackdropCover)})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background" />
      </div>

      {/* Hidden File & Folder Inputs */}
      <input
        type="file"
        ref={(node) => {
          if (node) {
            folderInputRef.current = node;
            node.setAttribute("webkitdirectory", "");
            node.setAttribute("directory", "");
            node.setAttribute("multiple", "");
            (node as any).webkitdirectory = true;
            (node as any).directory = true;
          }
        }}
        className="hidden"
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
      <div className="sticky top-0 z-40 bg-background/90 backdrop-blur-2xl border-b border-white/5 px-4 pb-4 md:px-8 pt-16 sm:pt-20 md:pt-[calc(var(--header-height)+1rem)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center shadow-xl shadow-black/30 shrink-0">
              <HardDrive size={20} className="text-brand" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-none font-brand" style={{ fontFamily: "'Orange Avenue', serif" }}>
                  Device Music Hub
                </h1>
                <span className="text-[10px] font-bold tracking-wider uppercase bg-brand/10 text-brand border border-brand/20 px-2 py-0.5 rounded-full">
                  Hybrid Storage
                </span>
                <span className="text-[10px] font-bold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Zap size={10} /> Storage Optimized (-99.8% Payload)
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1 font-medium">
                <ShieldCheck size={12} className="text-emerald-400" />
                100% Private local audio • Stems filtered • Manual Zenify Catalog matching
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
              <span className="hidden sm:inline">Add Songs</span>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 p-2.5 rounded-2xl bg-zinc-900/40 border border-white/5 text-xs backdrop-blur-md">
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
              <User size={14} className="text-purple-400" />
              <div>
                <p className="text-[10px] text-zinc-500 font-medium">Distinct Artists</p>
                <p className="font-bold text-purple-400 leading-none">{individualArtistList.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 border-l border-white/5">
              <Sparkles size={14} className="text-emerald-400" />
              <div>
                <p className="text-[10px] text-zinc-500 font-medium">Catalog Matched</p>
                <p className="font-bold text-emerald-400 leading-none">{matchedTracksCount} / {tracks.length}</p>
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
                activeTab === "artists" && !selectedArtist
                  ? "bg-brand text-white border-brand shadow-md shadow-brand/20"
                  : "bg-white/5 text-zinc-400 border-transparent hover:text-white hover:bg-white/10"
              )}
            >
              <User size={13} />
              <span>Artists ({individualArtistList.length})</span>
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
      <div className="px-4 md:px-8 py-6 relative z-10">
        {/* Drag & Drop Alert */}
        {isDragging && (
          <div className="mb-6 p-6 rounded-2xl border-2 border-dashed border-brand bg-brand/10 backdrop-blur-xl flex flex-col items-center justify-center text-center space-y-2 animate-pulse">
            <UploadCloud size={36} className="text-brand" />
            <p className="text-sm font-bold text-white">Drop your local music folder here</p>
            <p className="text-xs text-zinc-400">Zenify will parse songs and exclude isolated audio stems automatically.</p>
          </div>
        )}

        {/* Progress Spinner */}
        {(isScanning || isEnriching) && (
          <div className="mb-6 p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2 backdrop-blur-md">
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

        {/* Selected Artist Detail View */}
        {selectedArtist ? (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors cursor-pointer" onClick={() => setSelectedArtist(null)}>
              <ArrowLeft size={14} /> Back to Artists
            </div>

            <div className="flex items-center justify-between p-5 rounded-2xl bg-zinc-900/60 border border-white/5 backdrop-blur-md">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center text-brand shrink-0">
                  <User size={28} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Individual Artist Profile</p>
                  <h2 className="text-lg sm:text-xl font-bold text-white truncate">{selectedArtist}</h2>
                  <p className="text-xs text-zinc-400">
                    {individualArtistMap.get(selectedArtist)?.length || 0} Local Songs
                  </p>
                </div>
              </div>

              <button
                onClick={() => handlePlayArtist(selectedArtist)}
                className="h-9 px-5 rounded-full bg-brand hover:bg-brand/90 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-brand/20 transition-all active:scale-95 cursor-pointer shrink-0"
              >
                <Play size={14} fill="currentColor" /> Play Artist Songs
              </button>
            </div>

            {/* Individual Artist Song List */}
            <div className="flex flex-col gap-1">
              {(individualArtistMap.get(selectedArtist) || []).map((t, idx) => 
                renderTrackRow(t, idx, individualArtistMap.get(selectedArtist) || [])
              )}
            </div>
          </div>
        ) : selectedFolder ? (
          /* Selected Folder View */
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors cursor-pointer" onClick={() => setSelectedFolder(null)}>
              <ArrowLeft size={14} /> Back to Folders
            </div>

            <div className="flex items-center justify-between p-5 rounded-2xl bg-zinc-900/60 border border-white/5 backdrop-blur-md">
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

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePlayFolder(selectedFolder)}
                  className="h-9 px-5 rounded-full bg-brand hover:bg-brand/90 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-brand/20 transition-all active:scale-95 cursor-pointer shrink-0"
                >
                  <Play size={14} fill="currentColor" /> Play Folder
                </button>

                <button
                  onClick={() => handleMatchFolder(selectedFolder)}
                  className="h-9 px-3.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                  title="Match Folder with Catalog"
                >
                  <Sparkles size={14} /> Match Catalog
                </button>

                <button
                  onClick={() => handleDeleteFolder(selectedFolder.path, selectedFolder.name)}
                  className="h-9 w-9 rounded-full bg-white/5 border border-white/10 hover:bg-red-500/10 hover:border-red-500/20 text-zinc-400 hover:text-red-400 flex items-center justify-center transition-all cursor-pointer shrink-0"
                  title="Delete Folder"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Folder Tracks List */}
            <div className="flex flex-col gap-1">
              {tracks.filter(t => t.folderPath === selectedFolder.path).map((t, idx) => 
                renderTrackRow(t, idx, tracks.filter(tr => tr.folderPath === selectedFolder.path))
              )}
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
                  Select a local music folder or drag and drop your downloaded MP3s/M4As. Zenify will organize your songs into playlists while automatically filtering isolated stems.
                </p>
                <button
                  onClick={handleNativeFolderPicker}
                  className="h-9 px-5 rounded-full bg-brand hover:bg-brand/90 text-white font-bold text-xs shadow-lg shadow-brand/20 transition-all cursor-pointer flex items-center gap-2"
                >
                  <FolderUp size={14} /> Select Songs or Folder
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
                    const isFolderMenuOpen = activeMenuFolderPath === folder.path;

                    return (
                      <div
                        key={folder.path}
                        onMouseEnter={() => setHoveredCover(cover || null)}
                        onMouseLeave={() => setHoveredCover(null)}
                        onClick={() => setSelectedFolder(folder)}
                        className="group block rounded-xl transition-all hover:bg-white/10 cursor-pointer space-y-2 pb-2 p-1.5 relative"
                      >
                        <div className="aspect-square bg-zinc-900 rounded-lg overflow-hidden shadow-xl ring-1 ring-white/5 group-hover:ring-brand/50 group-hover:scale-[1.02] transition-all relative flex items-center justify-center">
                          {cover ? (
                            <img src={getMediaUrl(cover)} alt={folder.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-950 flex flex-col items-center justify-center gap-2 text-zinc-500">
                              <Folder size={32} className="text-brand/60" />
                              <span className="text-[10px] font-mono text-zinc-400 font-bold">{folder.trackCount} songs</span>
                            </div>
                          )}

                          {/* Hover Play Button */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center shadow-lg shadow-black/50">
                              <Play size={16} fill="currentColor" className="ml-0.5" />
                            </div>
                          </div>

                          {/* Folder 3-Dot Options Button */}
                          <div className="absolute top-2 right-2 z-20" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setActiveMenuFolderPath(isFolderMenuOpen ? null : folder.path)}
                              className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md text-white/80 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-lg"
                              title="Folder Options"
                            >
                              <MoreVertical size={14} />
                            </button>

                            {isFolderMenuOpen && (
                              <div className="absolute right-0 top-8 z-50 w-52 rounded-xl bg-zinc-900/95 border border-white/10 shadow-2xl p-1.5 backdrop-blur-2xl text-left animate-in fade-in zoom-in-95">
                                <button
                                  onClick={() => {
                                    setActiveMenuFolderPath(null);
                                    handlePlayFolder(folder);
                                  }}
                                  className="w-full h-8 px-3 rounded-lg hover:bg-white/10 text-xs font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                  <Play size={13} fill="currentColor" className="text-brand" />
                                  <span>Play Folder</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setActiveMenuFolderPath(null);
                                    handleMatchFolder(folder);
                                  }}
                                  className="w-full h-8 px-3 rounded-lg hover:bg-emerald-500/10 text-xs font-semibold text-emerald-400 flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                  <Sparkles size={13} />
                                  <span>Match Folder with Catalog</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setActiveMenuFolderPath(null);
                                    handleDeleteFolder(folder.path, folder.name);
                                  }}
                                  className="w-full h-8 px-3 rounded-lg hover:bg-red-500/10 text-xs font-semibold text-red-400 flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                  <Trash2 size={13} />
                                  <span>Delete Folder</span>
                                </button>
                              </div>
                            )}
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

            {/* Individual Artists View */}
            {activeTab === "artists" && individualArtistList.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                {individualArtistList
                  .filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(artist => (
                    <div
                      key={artist.name}
                      onMouseEnter={() => setHoveredCover(artist.coverUrl || null)}
                      onMouseLeave={() => setHoveredCover(null)}
                      onClick={() => setSelectedArtist(artist.name)}
                      className="group flex flex-col items-center text-center space-y-3 cursor-pointer p-2 rounded-xl hover:bg-white/5 transition-all"
                    >
                      <div className="w-full aspect-square rounded-full overflow-hidden bg-zinc-900 border border-white/10 group-hover:ring-2 ring-brand/50 transition-all shadow-xl shadow-black/40 relative">
                        {artist.coverUrl ? (
                          <img src={getMediaUrl(artist.coverUrl)} alt={artist.name} className="w-full h-full object-cover" />
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
                          {artist.songCount} {artist.songCount === 1 ? "song" : "songs"}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* All Tracks View */}
            {activeTab === "tracks" && tracks.length > 0 && (
              <div className="flex flex-col gap-1">
                {filteredTracks.map((t, idx) => 
                  renderTrackRow(t, idx, filteredTracks)
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
