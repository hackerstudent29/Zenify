"use client";
import React, { useState } from 'react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useParams, useRouter } from 'next/navigation';
import { ArtistForm } from '../ArtistForm';
import {
 ChevronLeft,
 Loader2,
 Music,
 Disc,
 Info,
 Plus,
 Settings,
 LayoutDashboard
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrackManagementList } from '@/components/admin/track-management-list';
import { TrackUploadStudio } from '@/components/admin/track-upload-studio';
import { getMediaUrl, cn } from '@/lib/utils';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogFooter,
 DialogDescription
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';

export default function EditArtistPage() {
 const { id } = useParams();
 const router = useRouter();
 const queryClient = useQueryClient();
 const [activeTab, setActiveTab] = useState('info');
 const [isAddTrackOpen, setIsAddTrackOpen] = useState(false);
 const [isAddAlbumOpen, setIsAddAlbumOpen] = useState(false);
 const [newAlbumTitle, setNewAlbumTitle] = useState('');
 const [newAlbumCover, setNewAlbumCover] = useState('');

 const { data: artist, isLoading: isLoadingArtist } = useQuery({
 queryKey: ['admin-artist', id],
 queryFn: async () => {
 const res = await api.get(`/artists/${id}`);
 return res.data;
 }
 });

 const updateMutation = useMutation({
 mutationFn: async (values: any) => {
 const res = await api.put(`/artists/${id}`, values);
 return res.data;
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['admin-artist', id] });
 queryClient.invalidateQueries({ queryKey: ['admin-artists'] });
 toast.success('Titan Parameters Updated');
 },
 onError: (error: any) => {
 toast.error(error.response?.data?.error || 'Update Failed');
 }
 });

 const createAlbumMutation = useMutation({
 mutationFn: async (values: any) => {
 const res = await api.post('/albums', values);
 return res.data;
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['admin-artist', id] });
 setIsAddAlbumOpen(false);
 setNewAlbumTitle('');
 setNewAlbumCover('');
 toast.success('New Collection Manifested');
 },
 onError: (error: any) => {
 toast.error(error.response?.data?.message || 'Manifestation Failed');
 }
 });

 if (isLoadingArtist) {
 return (
 <div className="min-h-screen flex items-center justify-center bg-[#050505]">
 <div className="flex flex-col items-center gap-4">
 <Loader2 className="w-10 h-10 text-brand animate-spin" strokeWidth={1} />
 <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.3em]">Accessing Core Identity...</p>
 </div>
 </div>
 );
 }

 if (!artist) {
 return (
 <div className="min-h-screen flex flex-col items-center justify-center bg-[#050505] gap-6">
 <Settings size={48} className="text-red-500/20" />
 <h1 className="text-2xl md:font-brand text-white">Registry Error: Titan Not Found</h1>
 <Button onClick={() => router.push('/admin/artists')} variant="outline">Back to Center</Button>
 </div>
 );
 }

 return (
 <div className="min-h-screen pb-32 pt-[52px] md:pt-8 bg-[#050505]">
 <div className="max-w-6xl mx-auto px-4 md:px-6 relative z-10">
 <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
 <div className="flex items-center gap-4">
 <Button
 variant="ghost"
 size="icon"
 onClick={() => router.push('/admin/artists')}
 className="bg-white/5 border border-white/10 text-white hover:bg-white/10 rounded-xl shrink-0"
 >
 <ChevronLeft size={20} />
 </Button>
 <div className="flex items-center gap-6">
 <div className="w-20 h-20 rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
 <img
 src={getMediaUrl(artist.imageUrl) || `https://ui-avatars.com/api/?name=${artist.name}`}
 className="w-full h-full object-cover"
 alt={artist.name}
 />
 </div>
 <div className="space-y-1">
 <h1 className="text-3xl md:text-5xl md:font-brand text-brand leading-none">{artist.name}</h1>
 <p className="text-white/30 text-[10px] tracking-[0.2em] font-medium uppercase">Titan Identity Modification Terminal</p>
 </div>
 </div>
 </div>
 </div>

 <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-10">
 <TabsList className="bg-white/5 border border-white/10 p-1.5 rounded-2xl h-auto gap-1">
 <TabsTrigger value="info" className="gap-2 px-6 py-3 rounded-xl data-[state=active]:bg-brand data-[state=active]:text-black font-black uppercase text-[10px] tracking-widest transition-all">
 <Info size={14} strokeWidth={2.5} /> Basic Info
 </TabsTrigger>
 <TabsTrigger value="tracks" className="gap-2 px-6 py-3 rounded-xl data-[state=active]:bg-brand data-[state=active]:text-black font-black uppercase text-[10px] tracking-widest transition-all">
 <Music size={14} strokeWidth={2.5} /> Resonance tracks
 </TabsTrigger>
 <TabsTrigger value="albums" className="gap-2 px-6 py-3 rounded-xl data-[state=active]:bg-brand data-[state=active]:text-black font-black uppercase text-[10px] tracking-widest transition-all">
 <Disc size={14} strokeWidth={2.5} /> Discography
 </TabsTrigger>
 </TabsList>

 <TabsContent value="info" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
 <div className="premium-card p-10 bg-white/[0.02] border-white/5 backdrop-blur-3xl rounded-[2.5rem] shadow-2xl">
 <ArtistForm
 initialData={artist}
 onSubmit={(values) => updateMutation.mutateAsync(values)}
 isLoading={updateMutation.isPending}
 onCancel={() => router.push('/admin/artists')}
 />
 </div>
 </TabsContent>

 <TabsContent value="tracks" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
 <div className="premium-card p-0 border-white/5 bg-white/[0.02] backdrop-blur-3xl rounded-[2.5rem] overflow-hidden">
 <div className="p-8 border-b border-white/5 flex items-center justify-between">
 <div>
 <h2 className="text-xl font-bold text-white tracking-tight">Canonical Track Registry</h2>
 <p className="text-zinc-500 text-xs">Manage individual sound artifacts associated with this titan.</p>
 </div>
 <Button
 onClick={() => setIsAddTrackOpen(true)}
 className="bg-white/5 border border-white/10 hover:bg-white/10 text-brand gap-2 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest"
 >
 <Plus size={14} strokeWidth={3} /> Add Track
 </Button>
 </div>
 <TrackManagementList
 tracks={(artist.tracks || []).map((t: any) => ({ ...t, artistName: artist.name }))}
 onEdit={(track) => router.push(`/admin/tracks?edit=${track.id}`)} // Placeholder for now
 />
 </div>
 </TabsContent>

 <TabsContent value="albums" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
 {(artist.albums || []).map((album: any) => (
 <div key={album.id} className="premium-card group p-4 border-white/5 bg-white/5 hover:bg-white/10 transition-all rounded-3xl">
 <div className="aspect-square rounded-2xl overflow-hidden mb-4 border border-white/5">
 <img src={getMediaUrl(album.coverUrl)} className="w-full h-full object-cover group- transition-transform duration-500" alt={album.title} />
 </div>
 <h3 className="font-bold text-white text-base truncate">{album.title}</h3>
 <p className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase mt-1">
 {album.releaseDate ? format(new Date(album.releaseDate), "yyyy") : "Unknown Year"}
 </p>
 </div>
 ))}
 <button
 onClick={() => setIsAddAlbumOpen(true)}
 className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-white/10 rounded-[2.5rem] hover:border-brand/50 hover:bg-brand/5 transition-all group min-h-[300px]"
 >
 <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-brand/20 transition-colors mb-4">
 <Plus size={24} className="text-zinc-500 group-hover:text-brand" />
 </div>
 <span className="text-xs font-black uppercase tracking-widest text-zinc-500 group-hover:text-brand">New Collection</span>
 </button>
 </div>
 </TabsContent>
 </Tabs>
 </div>

 {/* Track Upload Dialog */}
 <Dialog open={isAddTrackOpen} onOpenChange={setIsAddTrackOpen}>
 <DialogContent className="bg-[#050505] border-white/5 text-white max-w-5xl rounded-[2.5rem] p-8 md:p-12 overflow-y-auto max-h-[90vh] shadow-[0_0_100px_rgba(0,0,0,0.8)] custom-scrollbar">
 <DialogHeader className="sr-only">
 <DialogTitle>Asset Registry Terminal</DialogTitle>
 </DialogHeader>
 <TrackUploadStudio
 onSuccess={() => {
 queryClient.invalidateQueries({ queryKey: ['admin-artist', id] });
 setTimeout(() => setIsAddTrackOpen(false), 2000);
 }}
 initialTrack={{ artistName: artist.name }}
 />
 </DialogContent>
 </Dialog>

 {/* Album Creation Dialog */}
 <Dialog open={isAddAlbumOpen} onOpenChange={setIsAddAlbumOpen}>
 <DialogContent className="bg-[#0A0A0A] border-white/10 text-white max-w-md rounded-[2rem] p-8 shadow-2xl">
 <DialogHeader>
 <DialogTitle className="text-2xl md:font-brand text-brand italic">Manifest Collection</DialogTitle>
 <DialogDescription className="text-zinc-500 text-xs">Establish a new canonical album artifact for this titan.</DialogDescription>
 </DialogHeader>

 <div className="space-y-6 py-8">
 <div className="space-y-2">
 <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Collection Title</Label>
 <Input
 value={newAlbumTitle}
 onChange={(e) => setNewAlbumTitle(e.target.value)}
 placeholder="Artifact Designation..."
 className="h-12 bg-white/5 border-white/10 rounded-xl focus:ring-brand font-bold"
 />
 </div>

 <div className="space-y-2">
 <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Visual Identifier (Cover URL)</Label>
 <Input
 value={newAlbumCover}
 onChange={(e) => setNewAlbumCover(e.target.value)}
 placeholder="https://atlas.zenify/artifact-v1.jpg"
 className="h-12 bg-white/5 border-white/10 rounded-xl focus:ring-brand font-mono text-xs"
 />
 </div>
 </div>

 <DialogFooter className="gap-3">
 <Button
 variant="ghost"
 onClick={() => setIsAddAlbumOpen(false)}
 className="text-zinc-500 hover:text-white font-bold uppercase text-[10px] tracking-widest"
 >
 Abort
 </Button>
 <Button
 disabled={!newAlbumTitle || createAlbumMutation.isPending}
 onClick={() => createAlbumMutation.mutate({
 title: newAlbumTitle,
 coverUrl: newAlbumCover,
 artistId: id
 })}
 className="bg-brand text-black font-black uppercase text-[10px] tracking-widest px-8 rounded-xl"
 >
 {createAlbumMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Initiate Manifest"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}
