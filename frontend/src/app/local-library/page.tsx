"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  HardDrive, Folder, Music, Play, Pause, RefreshCw, Trash2, 
  Search, ChevronRight, ArrowLeft, Disc, Layers, Sparkles, 
  Clock, ShieldCheck, FolderUp, Plus, Volume2, UploadCloud, CheckCircle2
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { parseAudioFileMetadata, LocalAudioMetadata, cleanWebTags } from "@/lib/id3Parser";
import { 
  saveLocalLibrary, getSavedLocalFolders, getSavedLocalTracks, 
  clearSavedLocalLibrary, convertLocalToZenifyTrack, LocalFolderGroup 
} from "@/services/localLibraryStore";
import { usePlayerStore } from "@/store/player";
import { formatDuration } from "@/lib/utils";

export default function LocalLibraryPage() {
  const router = useRouter();
  const [tracks, setTracks] = useState<LocalAudioMetadata[]>([]);
  const [folders, setFolders] = useState<LocalFolderGroup[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [activeTab, setActiveTab] = useState<"folders" | "tracks">("folders");
  const [selectedFolder, setSelectedFolder] = useState<LocalFolderGroup | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();

  // Load saved library on mount
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

  // Handle directory folder picker scan
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
    toast.info(`Found ${audioFiles.length} audio files. Extracting metadata & album art...`);

    const parsedTracks: LocalAudioMetadata[] = [];
    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      setScanProgress(`Processing ${i + 1} / ${audioFiles.length}: ${file.name}`);
      try {
        const metadata = await parseAudioFileMetadata(file);
        parsedTracks.push(metadata);
      } catch (e) {
        console.warn("Failed to parse metadata for file:", file.name, e);
      }
    }

    // Merge with existing tracks deduplicated by ID
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

    toast.success(`Successfully imported ${parsedTracks.length} local songs into ${updatedFolders.length} folder albums!`);
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

  // Drag & Drop Handlers
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

  // Play a local track
  const handlePlayLocalTrack = (t: LocalAudioMetadata, contextList: LocalAudioMetadata[]) => {
    const zenTrack = convertLocalToZenifyTrack(t);
    const zenQueue = contextList.map(convertLocalToZenifyTrack);
    setTrack(zenTrack, zenQueue);
  };

  // Play an entire folder
  const handlePlayFolder = (folder: LocalFolderGroup) => {
    const folderTracks = tracks.filter(t => t.folderPath === folder.path);
    if (folderTracks.length > 0) {
      handlePlayLocalTrack(folderTracks[0], folderTracks);
      toast.success(`Playing folder album: ${folder.name} (${folderTracks.length} songs)`);
    } else {
      toast.info("Rescan local folder to load audio binary handles.");
    }
  };

  const handleClearLibrary = async () => {
    if (confirm("Are you sure you want to clear your imported local library cache?")) {
      await clearSavedLocalLibrary();
      setTracks([]);
      setFolders([]);
      setSelectedFolder(null);
      toast.success("Cleared local device library.");
    }
  };

  // Filtered tracks
  const filteredTracks = tracks.filter(t => 
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.folderName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div 
      className="w-full min-h-screen bg-[#070709] text-white p-4 sm:p-6 md:p-10 pb-36 font-sans select-none"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden File & Folder Inputs */}
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

      {/* Main Container */}
      <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
        {/* Header Hero Banner */}
        <div className="relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6 p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-rose-950/40 via-zinc-900/60 to-zinc-950 border border-white/10 backdrop-blur-2xl shadow-2xl">
          <div className="flex items-start sm:items-center gap-4 sm:gap-5 min-w-0">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-brand/15 border border-brand/30 flex items-center justify-center text-brand shrink-0 shadow-lg shadow-brand/10">
              <HardDrive size={32} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-brand bg-brand/10 border border-brand/20 px-2.5 py-0.5 rounded-full">
                  Device Storage
                </span>
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <ShieldCheck size={12} /> 100% Private & Local
                </span>
              </div>
              <h1 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-white truncate">
                Device Music
              </h1>
              <p className="text-zinc-400 text-xs sm:text-sm mt-1 max-w-2xl line-clamp-2 sm:line-clamp-none">
                Scan downloaded songs from your local folders. Zenify preserves your folder directory structure, extracts album artwork, and creates virtual folder albums.
              </p>
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full md:w-auto shrink-0">
            <button
              onClick={handleNativeFolderPicker}
              disabled={isScanning}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2.5 px-5 py-3 rounded-2xl bg-brand hover:bg-brand/90 text-white font-bold text-xs sm:text-sm shadow-xl shadow-brand/25 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <FolderUp size={18} />
              <span>Import Local Folder</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-white font-semibold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              title="Select Individual Audio Files"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Add Files</span>
            </button>
            {folders.length > 0 && (
              <button
                onClick={handleClearLibrary}
                className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-red-500/10 hover:border-red-500/20 text-zinc-400 hover:text-red-400 transition-all cursor-pointer"
                title="Clear Imported Local Cache"
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Drag & Drop Overlay / Banner */}
        {isDragging && (
          <div className="p-8 rounded-3xl border-2 border-dashed border-brand bg-brand/10 backdrop-blur-xl flex flex-col items-center justify-center text-center space-y-3 animate-pulse">
            <UploadCloud size={48} className="text-brand" />
            <h3 className="text-xl font-bold text-white">Drop your local music folder here!</h3>
            <p className="text-xs text-zinc-400">Zenify will automatically scan and structure all songs in playlist style.</p>
          </div>
        )}

        {/* Scanning Progress Bar */}
        {isScanning && (
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
              <span className="flex items-center gap-2 text-brand">
                <RefreshCw size={14} className="animate-spin" />
                Scanning Local Media Tags...
              </span>
              <span className="font-mono text-zinc-400">{scanProgress}</span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full bg-brand animate-pulse w-full" />
            </div>
          </div>
        )}

        {/* Selected Folder View Header */}
        {selectedFolder ? (
          <div className="space-y-6">
            <button
              onClick={() => setSelectedFolder(null)}
              className="flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft size={16} /> Back to Folder Albums
            </button>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-2xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-white/10 flex items-center justify-center text-brand shrink-0">
                  <Folder size={28} />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                    {selectedFolder.path}
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-white truncate">
                    {selectedFolder.name}
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {selectedFolder.trackCount} Songs • Local Directory Album
                  </p>
                </div>
              </div>

              <button
                onClick={() => handlePlayFolder(selectedFolder)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-brand hover:bg-brand/90 text-white font-bold text-sm shadow-lg shadow-brand/20 transition-all active:scale-95 cursor-pointer"
              >
                <Play size={18} fill="currentColor" /> Play Folder
              </button>
            </div>

            {/* Song List in Selected Folder */}
            <div className="space-y-2">
              {tracks.filter(t => t.folderPath === selectedFolder.path).map((t, idx) => {
                const isCurrent = currentTrack?.id === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => handlePlayLocalTrack(t, tracks.filter(tr => tr.folderPath === selectedFolder.path))}
                    className={`flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer group ${
                      isCurrent 
                        ? "bg-brand/15 border-brand/30 text-white" 
                        : "bg-white/[0.02] border-white/5 hover:bg-white/5 hover:border-white/10 text-zinc-300"
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <span className="w-6 text-center text-xs font-mono font-bold text-zinc-500 group-hover:text-white shrink-0">
                        {isCurrent ? <Volume2 size={16} className="text-brand animate-pulse mx-auto" /> : idx + 1}
                      </span>
                      <div className="w-11 h-11 rounded-xl bg-zinc-800 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center text-zinc-500">
                        {t.coverUrl ? (
                          <img src={t.coverUrl} alt={t.title} className="w-full h-full object-cover" />
                        ) : (
                          <Music size={18} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-bold truncate ${isCurrent ? "text-brand" : "text-white"}`}>
                          {t.title}
                        </p>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">
                          {t.artist}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 pl-2">
                      <span className="text-xs font-mono text-zinc-500">
                        {formatDuration(t.duration)}
                      </span>
                      <button className="w-9 h-9 rounded-full bg-white/5 group-hover:bg-brand group-hover:text-white flex items-center justify-center text-zinc-400 transition-all">
                        {isCurrent && isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Main Library Tabs & Lists */
          <div className="space-y-6">
            {/* Search & Tab Switcher Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-white/[0.03] border border-white/5 w-full sm:w-auto">
                <button
                  onClick={() => setActiveTab("folders")}
                  className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "folders"
                      ? "bg-brand text-white shadow-lg shadow-brand/20"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Folder size={14} /> Folders ({folders.length})
                </button>
                <button
                  onClick={() => setActiveTab("tracks")}
                  className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "tracks"
                      ? "bg-brand text-white shadow-lg shadow-brand/20"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Music size={14} /> All Songs ({tracks.length})
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search local songs or folders..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white/[0.03] border border-white/5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-brand/40 transition-all"
                />
              </div>
            </div>

            {/* Zero State / Empty Library */}
            {folders.length === 0 && tracks.length === 0 && !isScanning && (
              <div className="p-12 rounded-3xl border border-white/5 bg-white/[0.01] text-center flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-500">
                  <FolderUp size={32} />
                </div>
                <div className="max-w-md space-y-1">
                  <h3 className="text-xl font-bold text-white">No Local Songs Imported Yet</h3>
                  <p className="text-xs text-zinc-400">
                    Click "Import Local Folder" above or drag and drop your music folder here. Zenify will organize your local device songs into virtual playlist albums.
                  </p>
                </div>
                <button
                  onClick={handleNativeFolderPicker}
                  className="px-6 py-3 rounded-2xl bg-brand hover:bg-brand/90 text-white font-bold text-xs shadow-xl shadow-brand/20 transition-all cursor-pointer flex items-center gap-2"
                >
                  <FolderUp size={16} /> Choose Music Folder
                </button>
              </div>
            )}

            {/* Folder Grid View */}
            {activeTab === "folders" && folders.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {folders
                  .filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()) || f.path.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(folder => (
                    <div
                      key={folder.path}
                      onClick={() => setSelectedFolder(folder)}
                      className="group p-5 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all cursor-pointer flex flex-col justify-between space-y-4 relative overflow-hidden"
                    >
                      <div className="flex items-start justify-between">
                        <div className="w-12 h-12 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand group-hover:scale-110 transition-transform">
                          <Folder size={24} />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-zinc-500 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                          {folder.trackCount} songs
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base font-bold text-white group-hover:text-brand transition-colors truncate">
                          {folder.name}
                        </h3>
                        <p className="text-[11px] font-mono text-zinc-500 truncate mt-0.5">
                          {folder.path}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs text-zinc-400 font-semibold">
                        <span>Open Playlist</span>
                        <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform text-brand" />
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* Tracks View */}
            {activeTab === "tracks" && tracks.length > 0 && (
              <div className="space-y-2">
                {filteredTracks.map((t, idx) => {
                  const isCurrent = currentTrack?.id === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => handlePlayLocalTrack(t, filteredTracks)}
                      className={`flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer group ${
                        isCurrent 
                          ? "bg-brand/15 border-brand/30 text-white" 
                          : "bg-white/[0.02] border-white/5 hover:bg-white/5 hover:border-white/10 text-zinc-300"
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <span className="w-6 text-center text-xs font-mono font-bold text-zinc-500 group-hover:text-white shrink-0">
                          {isCurrent ? <Volume2 size={16} className="text-brand animate-pulse mx-auto" /> : idx + 1}
                        </span>
                        <div className="w-11 h-11 rounded-xl bg-zinc-800 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center text-zinc-500">
                          {t.coverUrl ? (
                            <img src={t.coverUrl} alt={t.title} className="w-full h-full object-cover" />
                          ) : (
                            <Music size={18} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-bold truncate ${isCurrent ? "text-brand" : "text-white"}`}>
                            {t.title}
                          </p>
                          <p className="text-xs text-zinc-400 truncate mt-0.5">
                            {t.artist} • <span className="font-mono text-[10px] text-zinc-500">{t.folderName}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0 pl-2">
                        <span className="text-xs font-mono text-zinc-500 hidden sm:inline">
                          {formatDuration(t.duration)}
                        </span>
                        <button className="w-9 h-9 rounded-full bg-white/5 group-hover:bg-brand group-hover:text-white flex items-center justify-center text-zinc-400 transition-all">
                          {isCurrent && isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
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
