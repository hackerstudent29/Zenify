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
import { CreateAlbumModal } from '@/components/admin/CreateAlbumModal';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogFooter
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';

export default function AdminTracksPage() {
 const router = useRouter();
 const queryClient = useQueryClient();
 const [searchQuery, setSearchQuery] = useState('');
 const [editingTrack, setEditingTrack] = useState<any>(null);
 const [isEditModalOpen, setIsEditModalOpen] = useState(false);
 const [isAlbumModalOpen, setIsAlbumModalOpen] = useState(false);

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
 <div className="min-h-screen pb-32 pt-[52px] md:pt-[calc(var(--header-height)+2rem)]">
 <div className="max-w-6xl mx-auto px-4 md:px-6 relative z-10">

 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
 <div className="flex items-center gap-4">
 <Button
 variant="ghost"
 size="icon"
 onClick={() => router.push('/admin')}
 className="bg-white/5 border border-white/10 text-white hover:bg-white/10 rounded-xl shrink-0"
 >
 <ChevronLeft size={20} />
 </Button>
 <div className="space-y-0.5">
 <h1 className="text-2xl md:text-4xl md:font-brand text-brand leading-none">Management Center</h1>
 <p className="text-white/30 text-[9px] tracking-[0.2em] font-medium hidden sm:block"><span className="font-zenify not-italic capitalize">zenify</span> Asset Registry Pipeline</p>
 </div>
 </div>

 <div className="flex items-center gap-2 w-full sm:w-auto">
 <div className="relative group flex-1 sm:flex-none">
 <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-brand transition-colors" />
 <Input
 placeholder="Search frequencies..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="w-full sm:w-56 md:w-64 h-10 pl-11 bg-white/5 border-white/10 rounded-xl text-sm focus:ring-brand focus:border-brand transition-all"
 />
 </div>
 <Button variant="outline" className="h-10 border-white/10 bg-white/5 rounded-xl text-zinc-400 gap-2 hidden sm:flex">
 <Filter size={16} /> Filters
 </Button>
 <Button 
    onClick={() => setIsAlbumModalOpen(true)}
    className="h-10 bg-brand hover:bg-brand/90 text-white rounded-xl gap-2 font-medium"
  >
    <Music size={16} />
    Create Album
  </Button>
 </div>
 </div>

 <div className="premium-card min-h-[400px] border-white/5 overflow-hidden">
 {isLoading ? (
 <div className="flex flex-col items-center justify-center py-32 gap-4">
 <Loader2 className="w-8 h-8 text-brand animate-spin" />
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

 <CreateAlbumModal 
    open={isAlbumModalOpen} 
    onOpenChange={setIsAlbumModalOpen} 
  />

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
