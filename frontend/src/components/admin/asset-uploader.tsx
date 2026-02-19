"use client";
import { UploadCloud, Music, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

interface AssetUploaderProps {
    audioFile: File | null;
    coverFile: File | null;
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>, type: 'audio' | 'cover') => void;
    isLoading: boolean;
}

export function AssetUploader({ audioFile, coverFile, handleFileChange, isLoading }: AssetUploaderProps) {
    return (
        <div className="space-y-8 h-full py-4">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-accent" />
                Assets
            </h2>

            <div className="space-y-6">
                {/* Audio Upload */}
                <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-zinc-300 mb-2 block">Audio File <span className="text-red-500">*</span></Label>
                    <div className={cn(
                        "relative group border-2 border-dashed rounded-xl p-8 transition-all hover:bg-white/5",
                        audioFile ? "border-emerald-500/50 bg-emerald-500/10" : "border-white/10 hover:border-white/30"
                    )}>
                        <input
                            type="file"
                            accept="audio/*"
                            onChange={(e) => handleFileChange(e, 'audio')}
                            className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full"
                            required
                        />
                        <div className="flex flex-col items-center justify-center text-center space-y-3">
                            <div className={cn(
                                "w-12 h-12 rounded-full flex items-center justify-center transition-transform group-hover:scale-110",
                                audioFile ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-zinc-300"
                            )}>
                                <Music className="w-6 h-6" />
                            </div>
                            <div>
                                <p className={cn("text-base font-semibold", audioFile ? "text-emerald-400" : "text-zinc-100")}>
                                    {audioFile ? audioFile.name : "Choose Track"}
                                </p>
                                <p className="text-xs text-zinc-400 mt-1 font-mono uppercase tracking-wider">MP3, WAV, FLAC • Max 50MB</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Cover Upload */}
                <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-zinc-300 mb-2 block">Cover Art</Label>
                    <div className={cn(
                        "relative group border-2 border-dashed rounded-xl p-8 transition-all hover:bg-white/5",
                        coverFile ? "border-purple-500/50 bg-purple-500/10" : "border-white/10 hover:border-white/30"
                    )}>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileChange(e, 'cover')}
                            className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full"
                        />
                        <div className="flex flex-col items-center justify-center text-center space-y-3">
                            <div className={cn(
                                "w-12 h-12 rounded-full flex items-center justify-center transition-transform group-hover:scale-110",
                                coverFile ? "bg-purple-500/20 text-purple-400" : "bg-white/10 text-zinc-300"
                            )}>
                                <ImageIcon className="w-6 h-6" />
                            </div>
                            <div>
                                <p className={cn("text-base font-semibold", coverFile ? "text-purple-400" : "text-zinc-100")}>
                                    {coverFile ? coverFile.name : "Choose Image"}
                                </p>
                                <p className="text-xs text-zinc-400 mt-1 font-mono uppercase tracking-wider">JPG, PNG • 500x500px</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-8 pt-4 border-t border-white/5">
                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg h-12 text-sm font-bold uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-white/10 flex items-center justify-center gap-2"
                >
                    {isLoading ? (
                        <>
                            <div className="w-4 h-4 rounded-full border-2 border-zinc-500 border-t-zinc-900 animate-spin" />
                            Processing...
                        </>
                    ) : (
                        <>
                            <UploadCloud className="w-5 h-5" />
                            Publish Track
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
