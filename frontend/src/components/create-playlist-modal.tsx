"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

interface CreatePlaylistModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function CreatePlaylistModal({ isOpen, onClose }: CreatePlaylistModalProps) {
    const [name, setName] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const queryClient = useQueryClient();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsLoading(true);
        try {
            const res = await api.post("/playlists", { name, isPublic: true });
            queryClient.invalidateQueries({ queryKey: ['my-playlists'] });
            router.push(`/playlist/${res.data.id}`);
            onClose();
            setName("");
        } catch (error) {
            console.error("Failed to create playlist", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px] bg-surface border-none text-foreground shadow-glow rounded-2xl p-8">
                <DialogHeader className="mb-4">
                    <DialogTitle className="text-xl font-bold tracking-tight">Create New Playlist</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-8">
                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-[10px] font-bold uppercase tracking-widest text-muted ml-1">Playlist Name</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="bg-surface-hover/50 border-none h-12 px-4 rounded-xl focus-visible:shadow-glow focus-visible:bg-surface-hover transition-all"
                            placeholder="My Awesome Mix"
                            autoFocus
                            autoComplete="off"
                        />
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading} className="text-muted hover:text-foreground font-bold text-xs uppercase tracking-widest">
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading || !name.trim()} className="bg-foreground text-background items-center font-bold px-8 h-12 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all">
                            {isLoading ? 'Creating...' : 'Create Playlist'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
