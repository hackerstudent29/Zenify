import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Loader2, Music, Check, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateAlbumModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

export function CreateAlbumModal({ open, onOpenChange, onSuccess }: CreateAlbumModalProps) {
    const queryClient = useQueryClient();
    const [title, setTitle] = useState("");
    const [artistName, setArtistName] = useState("");
    const [coverUrl, setCoverUrl] = useState("");
    const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState("");

    const { data: tracksData, isLoading: tracksLoading } = useQuery({
        queryKey: ['admin-tracks'],
        queryFn: async () => {
            const res = await api.get('/tracks?limit=1000');
            return res.data.items;
        },
        enabled: open
    });

    const createMutation = useMutation({
        mutationFn: async () => {
            await api.post('/albums', {
                title,
                artistName,
                coverUrl,
                trackIds: Array.from(selectedTracks)
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-tracks'] });
            queryClient.invalidateQueries({ queryKey: ['albums'] });
            setTitle("");
            setArtistName("");
            setCoverUrl("");
            setSelectedTracks(new Set());
            if (onSuccess) onSuccess();
            onOpenChange(false);
        }
    });

    // Only show tracks that don't already have an album, or show all? 
    // Usually it's better to show all tracks so they can re-assign if needed.
    const availableTracks = (tracksData || []).filter((t: any) => 
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.artist?.name || t.artistName || "").toLowerCase().includes(searchQuery.toLowerCase())
    );

    const toggleTrack = (id: string) => {
        const next = new Set(selectedTracks);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedTracks(next);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#0a0a0a] border-white/5 text-white max-w-2xl rounded-2xl p-6 md:p-8 shadow-2xl">
                <DialogHeader className="mb-4">
                    <DialogTitle className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                        <Music className="w-5 h-5 text-brand" />
                        Create New Album
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Album Title <span className="text-red-500">*</span></Label>
                            <Input 
                                placeholder="e.g. Midnight Memories" 
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                className="bg-white/5 border-white/10 text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Artist Name <span className="text-red-500">*</span></Label>
                            <Input 
                                placeholder="e.g. Taylor Swift" 
                                value={artistName}
                                onChange={e => setArtistName(e.target.value)}
                                className="bg-white/5 border-white/10 text-white"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Cover Art URL</Label>
                        <div className="relative">
                            <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <Input 
                                placeholder="https://..." 
                                value={coverUrl}
                                onChange={e => setCoverUrl(e.target.value)}
                                className="bg-white/5 border-white/10 text-white pl-9"
                            />
                        </div>
                        {coverUrl && (
                            <div className="mt-2 w-24 h-24 rounded-lg overflow-hidden border border-white/10 bg-black">
                                <img src={coverUrl} alt="Cover Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                            </div>
                        )}
                    </div>

                    <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                            <Label>Select Tracks</Label>
                            <span className="text-xs text-brand font-medium">{selectedTracks.size} selected</span>
                        </div>
                        <Input 
                            placeholder="Search tracks to add..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="bg-white/5 border-white/10 text-white h-9"
                        />
                        
                        <div className="h-48 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                            {tracksLoading ? (
                                <div className="flex items-center justify-center h-full">
                                    <Loader2 className="w-5 h-5 text-brand animate-spin" />
                                </div>
                            ) : availableTracks.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                                    No tracks found.
                                </div>
                            ) : (
                                availableTracks.map((track: any) => {
                                    const isSelected = selectedTracks.has(track.id);
                                    return (
                                        <div 
                                            key={track.id}
                                            onClick={() => toggleTrack(track.id)}
                                            className={cn(
                                                "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors border",
                                                isSelected 
                                                    ? "bg-brand/10 border-brand/30" 
                                                    : "bg-white/5 border-transparent hover:bg-white/10"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-5 h-5 rounded-md flex items-center justify-center shrink-0 border",
                                                isSelected ? "bg-brand border-brand text-white" : "border-white/20"
                                            )}>
                                                {isSelected && <Check className="w-3 h-3" />}
                                            </div>
                                            <div className="w-8 h-8 rounded shrink-0 bg-black overflow-hidden relative">
                                                {track.coverUrl ? (
                                                    <img src={track.coverUrl} className="w-full h-full object-cover" alt="" />
                                                ) : (
                                                    <Music className="w-4 h-4 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/20" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-white truncate">{track.title}</p>
                                                <p className="text-xs text-white/40 truncate">{track.artist?.name || track.artistName}</p>
                                            </div>
                                            {track.albumId && !isSelected && (
                                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/10 text-white/50 shrink-0">
                                                    In Album
                                                </span>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="mt-8 border-t border-white/5 pt-4">
                    <Button 
                        variant="ghost" 
                        onClick={() => onOpenChange(false)}
                        className="text-white/60 hover:text-white"
                        disabled={createMutation.isPending}
                    >
                        Cancel
                    </Button>
                    <Button 
                        onClick={() => createMutation.mutate()}
                        disabled={!title || !artistName || createMutation.isPending}
                        className="bg-brand hover:bg-brand/90 text-white min-w-[120px]"
                    >
                        {createMutation.isPending ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</>
                        ) : (
                            "Create Album"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
