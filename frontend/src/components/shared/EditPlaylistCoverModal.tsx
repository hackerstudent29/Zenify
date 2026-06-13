"use client";

import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Upload, Image as ImageIcon, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ZenLoading } from "@/components/ui/ZenLoading";
import api from "@/lib/api";

interface EditPlaylistCoverModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentCoverUrl?: string;
    onSave: (url: string) => Promise<void>;
}

export const GRADIENTS = [
    { id: "mist", name: "Mist", css: "linear-gradient(to bottom right, #e2e8f0, #94a3b8)" },
    { id: "rose", name: "Rose", css: "linear-gradient(to bottom right, #fecdd3, #fda4af)" },
    { id: "ocean", name: "Ocean", css: "linear-gradient(to bottom right, #bae6fd, #7dd3fc)" },
    { id: "dusk", name: "Dusk", css: "linear-gradient(to bottom right, #c7d2fe, #a5b4fc)" },
    { id: "sunset", name: "Sunset", css: "linear-gradient(to bottom right, #fed7aa, #fdba74)" },
    { id: "midnight", name: "Midnight", css: "linear-gradient(to bottom right, #1e293b, #0f172a)" },
];

export function EditPlaylistCoverModal({ isOpen, onClose, currentCoverUrl, onSave }: EditPlaylistCoverModalProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedGradient, setSelectedGradient] = useState<string | null>(
        currentCoverUrl?.startsWith("gradient:") ? currentCoverUrl.replace("gradient:", "") : null
    );
    const [imageUrl, setImageUrl] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append("image", file);

            const res = await api.post("/utils/upload-image", formData, {
                headers: {
                    "Content-Type": "multipart/form-data"
                }
            });

            const data = res.data;
            
            setIsSaving(true);
            await onSave(data.url);
            onClose();
        } catch (err) {
            console.error("Failed to upload image", err);
            alert("Failed to upload image. Please try again.");
        } finally {
            setIsUploading(false);
            setIsSaving(false);
        }
    };

    const handleSaveGradient = async (gradientId: string) => {
        setSelectedGradient(gradientId);
        setIsSaving(true);
        try {
            await onSave(`gradient:${gradientId}`);
            onClose();
        } catch (err) {
            console.error("Failed to save gradient", err);
            alert("Failed to save cover. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleUrlSubmit = async () => {
        if (!imageUrl) return;
        setIsSaving(true);
        try {
            await onSave(imageUrl);
            onClose();
        } catch (err) {
            console.error("Failed to save image URL", err);
            alert("Failed to save image URL. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 z-50 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-x-4 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[500px] z-50 bg-[#111] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
                    >
                        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
                            <div>
                                <h2 className="text-white font-bold text-lg">Edit Cover Art</h2>
                                <p className="text-[12px] text-white/40 mt-0.5">Upload a custom image or choose a theme</p>
                            </div>
                            <button
                                onClick={onClose}
                                disabled={isUploading || isSaving}
                                className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            {/* Fetch URL Section */}
                            <div className="mb-6">
                                <h3 className="text-sm font-bold text-white mb-3">Paste Image URL</h3>
                                <div className="flex gap-2">
                                    <input 
                                        type="url" 
                                        value={imageUrl} 
                                        onChange={(e) => setImageUrl(e.target.value)} 
                                        placeholder="https://..." 
                                        className="flex-1 h-10 bg-white/5 border border-white/10 rounded-lg px-3 text-sm focus:outline-none focus:border-brand text-white"
                                    />
                                    <Button 
                                        onClick={handleUrlSubmit} 
                                        disabled={!imageUrl || isUploading || isSaving}
                                        className="h-10 bg-brand text-black hover:bg-brand/90 font-bold"
                                    >
                                        Submit
                                    </Button>
                                </div>
                            </div>

                            {/* Upload Section */}
                            <div className="mb-8">
                                <h3 className="text-sm font-bold text-white mb-3">Upload Custom Image</h3>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading || isSaving}
                                    className="w-full h-32 rounded-xl border-2 border-dashed border-white/10 hover:border-brand/50 hover:bg-white/[0.02] transition-all flex flex-col items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group"
                                >
                                    {isUploading ? (
                                        <div className="flex flex-col items-center gap-3">
                                            <ZenLoading size="sm" />
                                            <span className="text-xs font-bold text-white/50">Uploading...</span>
                                        </div>
                                    ) : isSaving ? (
                                        <div className="flex flex-col items-center gap-3">
                                            <ZenLoading size="sm" />
                                            <span className="text-xs font-bold text-white/50">Saving...</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                <Upload size={18} className="text-brand" />
                                            </div>
                                            <span className="text-sm font-medium text-white/60 group-hover:text-white/80">Click to browse files</span>
                                        </>
                                    )}
                                </button>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    onChange={handleFileChange} 
                                    accept="image/*" 
                                    className="hidden" 
                                />
                            </div>

                            {/* Preset Gradients */}
                            <div>
                                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                    <ImageIcon size={14} className="text-white/40" /> Or Choose a Preset
                                </h3>
                                <div className="grid grid-cols-3 gap-3">
                                    {GRADIENTS.map(gradient => (
                                        <button
                                            key={gradient.id}
                                            disabled={isUploading || isSaving}
                                            onClick={() => handleSaveGradient(gradient.id)}
                                            className="relative aspect-video rounded-xl overflow-hidden group border border-white/10 hover:border-white/30 transition-all disabled:opacity-50"
                                            style={{ background: gradient.css }}
                                        >
                                            {selectedGradient === gradient.id && (
                                                <div className="absolute inset-0 bg-black/20 flex items-center justify-center backdrop-blur-[2px]">
                                                    <CheckCircle2 size={24} className="text-white" />
                                                </div>
                                            )}
                                            <div className="absolute bottom-2 left-2 text-[10px] font-bold text-black/50 uppercase tracking-widest mix-blend-overlay">
                                                {gradient.name}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
