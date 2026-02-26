"use client";
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
    ChevronLeft,
    Music,
    Search,
    Filter,
    Loader2,
    X,
    Save
} from "lucide-react";
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TrackManagementList } from '@/components/admin/track-management-list';
import { TrackUploadStudio } from '@/components/admin/track-upload-studio';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
// import { Textarea } from '@/components/ui/textarea'; // No longer needed as TrackUploadStudio handles it

export default function AdminTracksPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState('');
    const [editingTrack, setEditingTrack] = useState<any>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const { data: tracksData, isLoading } = useQuery({
        queryKey: ['admin-tracks'],
        queryFn: async () => {
            const res = await api.get('/tracks?limit=1000');
            return res.data.items;
        }
    });

    const filteredTracks = tracksData?.filter((t: any) =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.artist?.name || t.artistName)?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleEdit = (track: any) => {
        setEditingTrack({
            ...track,
            artistName: track.artist?.name || track.artistName || ''
        });
        setIsEditModalOpen(true);
    };

    return (
        <div className="min-h-screen pb-32 pt-8">
            <div className="max-w-6xl mx-auto px-6 relative z-10">

                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-6">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push('/admin')}
                            className="bg-white/5 border border-white/10 text-white hover:bg-white/10 rounded-xl"
                        >
                            <ChevronLeft size={20} />
                        </Button>
                        <div className="space-y-1">
                            <h1 className="text-4xl font-brand text-rose-500 leading-none">Management Center</h1>
                            <p className="text-white/30 text-[9px] uppercase tracking-[0.3em] font-medium">Zenify Asset Registry Pipeline</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative group">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-rose-500 transition-colors" />
                            <Input
                                placeholder="Search frequencies..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-64 h-11 pl-11 bg-white/5 border-white/10 rounded-xl text-sm focus:ring-rose-500 focus:border-rose-500 transition-all"
                            />
                        </div>
                        <Button variant="outline" className="h-11 border-white/10 bg-white/5 rounded-xl text-zinc-400 gap-2">
                            <Filter size={16} /> Filters
                        </Button>
                    </div>
                </div>

                <div className="premium-card min-h-[500px] border-white/5 overflow-hidden">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-32 gap-4">
                            <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
                            <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">Synchronizing Registry...</p>
                        </div>
                    ) : (
                        <TrackManagementList
                            tracks={filteredTracks || []}
                            onEdit={handleEdit}
                        />
                    )}
                </div>
            </div>

            {/* Edit Terminal Modal */}
            <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                <DialogContent className="bg-[#050505] border-white/5 text-white max-w-5xl rounded-3xl p-12 overflow-y-auto max-h-[90vh] shadow-2xl custom-scrollbar">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Asset Modification Terminal</DialogTitle>
                        <p>Adjust track metadata and release parameters.</p>
                    </DialogHeader>
                    <TrackUploadStudio
                        editMode={true}
                        initialTrack={editingTrack}
                        onSuccess={() => {
                            queryClient.invalidateQueries({ queryKey: ['admin-tracks'] });
                            // Keep open for 2 seconds to show the authorize screen before auto-closing
                            setTimeout(() => {
                                setIsEditModalOpen(false);
                                setEditingTrack(null);
                            }, 2000);
                        }}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}
