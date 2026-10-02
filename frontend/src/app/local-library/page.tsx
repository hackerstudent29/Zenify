"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  HardDrive, Folder, Music, Play, Pause, RefreshCw, Trash2, 
  Search, ChevronRight, ArrowLeft, Disc, Layers, Sparkles, 
  Clock, ShieldCheck, FolderUp, Plus, Volume2
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { parseAudioFileMetadata, LocalAudioMetadata } from "@/lib/id3Parser";
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const { currentTrack, isPlaying, setTrack, togglePlay, setQueue } = usePlayerStore();

  // Load saved library on mount
  useEffect(() => {
    async function loadSaved() {
      try {
        const savedFolders = await getSavedLocalFolders();
        setFolders(savedFolders);
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
      toast.error("No supported audio files (.mp3, .m4a, .flac, .wav) found in selected directory.");
      return;
    }

    setIsScanning(true);
    setScanProgress(`Scanning 0 / ${audioFiles.length} files...`);
    toast.info(`Found ${audioFiles.length} audio files. Extracting metadata...`);

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

    setTracks(parsedTracks);
    await saveLocalLibrary(parsedTracks);

    const updatedFolders = await getSavedLocalFolders();
    setFolders(updatedFolders);
    setIsScanning(false);
    setScanProgress("");

    toast.success(`Successfully imported ${parsedTracks.length} local songs into ${updatedFolders.length} virtual folder albums!`);
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
              // Preserve path relative to root directory
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
          // Fallback to file input
          folderInputRef.current?.click();
        }
      }
    } else {
      folderInputRef.current?.click();
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
      toast.success(`Playing folder: ${folder.name} (${folderTracks.length} songs)`);
    } else {
      toast.info("Rescan folder to load audio handles for playback.");
    }
  };

  const handleClearLibrary = async () => {
    if (confirm("Are you sure you want to clear your imported local library cache?")) {
      await clearSavedLocalLibrary();
      setTracks([]);
      setFolders([]);
      setSelectedFolder(null);
      toast.success("Cleared local device library cache.");
    }
  };

  // Filtered tracks
  const filteredTracks = tracks.filter(t => 
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.folderName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full min-h-screen bg-[#070709] text-white p-6 md:p-10 pb-36 font-sans">
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

      {/* Header Banner */}
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 p-8 rounded-3xl bg-gradient-to-r from-rose-950/20 via-zinc-900/40 to-zinc-950/60 border border-white/10 backdrop-blur-2xl shadow-2xl">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand shadow-glow-sm">
              <HardDrive size={32} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand bg-brand/10 border border-brand/20 px-2.5 py-0.5 rounded-full">
                  Device Storage
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <ShieldCheck size={10} /> 100% Private & Local
                </span>
              </div>
              <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white">
                Local Device Library
              </h1>
              <p className="text-zinc-400 text-sm mt-1">
                Import downloaded songs from your device. Zenify automatically preserves your local folder structure, extracts album artwork, and organizes virtual albums.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <button
              onClick={handleNativeFolderPicker}
              disabled={isScanning}
              className="flex-1 md:flex-none flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl bg-brand hover:bg-brand/90 text-white font-bold text-xs uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-brand/20 cursor-pointer disabled:opacity-50"
            >
              {isScanning ? <RefreshCw size={16} className="animate-spin" /> : <FolderUp size={16} />}
              {isScanning ? "Scanning Folders..." : "Select Music Folder"}
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning}
              className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
            >
              <Plus size={16} /> Add Audio Files
            </button>

            {folders.length > 0 && (
              <button
                onClick={handleClearLibrary}
                className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-400 transition-all active:scale-95 cursor-pointer"
                title="Clear Local Library Cache"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Scan Progress Bar */}
        <AnimatePresence>
          {isScanning && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="p-4 rounded-2xl bg-brand/10 border border-brand/20 space-y-2"
            >
              <div className="flex items-center justify-between text-xs font-mono text-brand">
                <span className="flex items-center gap-2 font-bold">
                  <RefreshCw size={14} className="animate-spin" /> Extracting Audio Metadata & Folder Hierarchy...
                </span>
                <span>{scanProgress}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Folder Detail View */}
        {selectedFolder ? (
          <div className="space-y-6">
            <button
              onClick={() => setSelectedFolder(null)}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft size={16} /> Back to Local Folders
            </button>

            <div className="p-8 rounded-3xl bg-gradient-to-br from-zinc-900/60 via-zinc-950/80 to-black border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-2xl bg-zinc-800 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center text-brand">
                  {selectedFolder.coverUrl ? (
                    <img src={selectedFolder.coverUrl} alt={selectedFolder.name} className="w-full h-full object-cover" />
                  ) : (
                    <Folder size={48} />
                  )}
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Folder Playlist</span>
                  <h2 className="text-3xl font-black text-white tracking-tight mt-0.5">{selectedFolder.name}</h2>
                  <p className="text-xs text-zinc-400 font-mono mt-1">{selectedFolder.path}</p>
                  <p className="text-xs text-zinc-500 mt-2 font-medium">
                    {selectedFolder.trackCount} Songs • {formatDuration(selectedFolder.totalDuration)}
                  </p>
                </div>
              </div>

              <button
                onClick={() => handlePlayFolder(selectedFolder)}
                className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-brand hover:bg-brand/90 text-white font-bold text-sm uppercase tracking-wider transition-all active:scale-95 shadow-xl shadow-brand/20 cursor-pointer"
              >
                <Play size={18} className="fill-current" /> Play Folder Songs
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
                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer group ${
                      isCurrent 
                        ? "bg-brand/15 border-brand/30 text-white" 
                        : "bg-white/[0.02] border-white/5 hover:bg-white/5 hover:border-white/10 text-zinc-300"
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="w-8 text-center text-xs font-mono font-bold text-zinc-500 group-hover:text-white">
                        {isCurrent ? <Volume2 size={16} className="text-brand animate-pulse mx-auto" /> : idx + 1}
                      </span>
                      <div className="w-11 h-11 rounded-xl bg-zinc-800 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center text-zinc-500">
                        {t.coverUrl ? (
                          <img src={t.coverUrl} alt={t.title} className="w-full h-full object-cover" />
                        ) : (
                          <Music size={18} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-bold truncate ${isCurrent ? "text-brand" : "text-white"}`}>
                          {t.title}
                        </p>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">{t.artist}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 shrink-0">
                      <span className="text-xs font-mono text-zinc-500">{formatDuration(t.duration)}</span>
                      <button className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-brand/20 transition-all">
                        {isCurrent && isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5 fill-current" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            {/* Navigation Tabs & Search */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveTab("folders")}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    activeTab === "folders"
                      ? "bg-brand text-white shadow-md shadow-brand/20"
                      : "bg-white/5 text-zinc-400 hover:text-white"
                  }`}
                >
                  <Folder size={15} /> Folder Albums ({folders.length})
                </button>

                <button
                  onClick={() => setActiveTab("tracks")}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    activeTab === "tracks"
                      ? "bg-brand text-white shadow-md shadow-brand/20"
                      : "bg-white/5 text-zinc-400 hover:text-white"
                  }`}
                >
                  <Music size={15} /> All Local Tracks ({tracks.length})
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search local songs or folders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-full pl-10 pr-4 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-brand/50 transition-all"
                />
              </div>
            </div>

            {/* Folders Tab Content */}
            {activeTab === "folders" && (
              <div>
                {folders.length === 0 ? (
                  <div className="p-16 text-center border border-dashed border-white/10 rounded-3xl space-y-4">
                    <Folder size={48} className="mx-auto text-zinc-600 animate-bounce" />
                    <h3 className="text-xl font-bold text-white">No Local Folders Imported Yet</h3>
                    <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
                      Click <strong className="text-white">"Select Music Folder"</strong> above to pick your downloaded songs directory (e.g. Downloads, Music, or iTunes folder). Zenify will automatically index and display your exact folder hierarchy!
                    </p>
                    <button
                      onClick={handleNativeFolderPicker}
                      className="px-6 py-3 rounded-full bg-brand text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-brand/20 cursor-pointer"
                    >
                      Choose Music Folder
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())).map((f) => (
                      <div
                        key={f.path}
                        onClick={() => setSelectedFolder(f)}
                        className="group p-5 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-brand/40 hover:bg-white/[0.04] transition-all duration-300 cursor-pointer flex flex-col justify-between space-y-4 shadow-xl hover:-translate-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-white/10 overflow-hidden flex items-center justify-center text-brand">
                            {f.coverUrl ? (
                              <img src={f.coverUrl} alt={f.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                            ) : (
                              <Folder size={24} />
                            )}
                          </div>
                          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                            {f.trackCount} Songs
                          </span>
                        </div>

                        <div>
                          <h3 className="text-base font-bold text-white group-hover:text-brand transition-colors truncate">
                            {f.name}
                          </h3>
                          <p className="text-xs text-zinc-500 font-mono truncate mt-0.5">{f.path}</p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs text-zinc-400">
                          <span className="font-mono">{formatDuration(f.totalDuration)}</span>
                          <span className="flex items-center gap-1 text-brand font-bold group-hover:translate-x-1 transition-transform">
                            Open Folder <ChevronRight size={14} />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tracks Tab Content */}
            {activeTab === "tracks" && (
              <div>
                {filteredTracks.length === 0 ? (
                  <div className="p-16 text-center border border-dashed border-white/10 rounded-3xl space-y-4">
                    <Music size={48} className="mx-auto text-zinc-600" />
                    <h3 className="text-xl font-bold text-white">No Tracks Found</h3>
                    <p className="text-xs text-zinc-500">Import a folder or search with a different keyword.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredTracks.map((t, idx) => {
                      const isCurrent = currentTrack?.id === t.id;
                      return (
                        <div
                          key={t.id}
                          onClick={() => handlePlayLocalTrack(t, filteredTracks)}
                          className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer group ${
                            isCurrent 
                              ? "bg-brand/15 border-brand/30 text-white" 
                              : "bg-white/[0.02] border-white/5 hover:bg-white/5 hover:border-white/10 text-zinc-300"
                          }`}
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <span className="w-8 text-center text-xs font-mono font-bold text-zinc-500 group-hover:text-white">
                              {idx + 1}
                            </span>
                            <div className="w-11 h-11 rounded-xl bg-zinc-800 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center text-zinc-500">
                              {t.coverUrl ? (
                                <img src={t.coverUrl} alt={t.title} className="w-full h-full object-cover" />
                              ) : (
                                <Music size={18} />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className={`text-sm font-bold truncate ${isCurrent ? "text-brand" : "text-white"}`}>
                                {t.title}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-zinc-400 truncate">{t.artist}</span>
                                <span className="text-[10px] font-mono text-zinc-500 bg-white/5 px-2 py-0.5 rounded border border-white/5 truncate">
                                  📁 {t.folderName}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-6 shrink-0">
                            <span className="text-xs font-mono text-zinc-500">{formatDuration(t.duration)}</span>
                            <button className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-brand/20 transition-all">
                              {isCurrent && isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5 fill-current" />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
