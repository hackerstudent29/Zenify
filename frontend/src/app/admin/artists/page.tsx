"use client";
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
 ChevronLeft,
 Users,
 Search,
 Loader2,
 MoreVertical,
 Edit2,
 Trash2,
 ExternalLink,
 BadgeCheck,
} from "lucide-react";
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getMediaUrl } from '@/lib/utils';
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuSeparator,
 DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArtistForm } from './ArtistForm';
import { toast } from 'sonner';

// Rose verified badge — proper tick shape, not a solid dot
const VerifiedBadge = ({ size = 13 }: { size?: number }) => (
 <BadgeCheck
 size={size}
 className="shrink-0"
 style={{ color: '#fb7185' }}
 />
);

const ArtistActionsDropdown = ({ artist, handleEdit, onDeleteRequest }: {
 artist: any,
 handleEdit: any,
 onDeleteRequest: (id: string, name: string) => void
}) => (
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10 text-zinc-400 hover:text-white rounded-lg transition-colors">
 <MoreVertical size={14} />
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent
 align="end"
 className="bg-[#111] border border-white/10 text-white min-w-[160px] rounded-xl shadow-2xl p-1"
 >
 <DropdownMenuItem
 onClick={() => handleEdit(artist)}
 className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-zinc-300 hover:text-white focus:text-white focus:bg-white/10 cursor-pointer rounded-lg font-medium transition-colors"
 >
 <Edit2 size={14} className="text-zinc-400" />
 Edit Artist
 </DropdownMenuItem>
 <DropdownMenuItem
 onClick={() => onDeleteRequest(artist.id, artist.name)}
 className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 hover:text-red-300 focus:text-red-300 focus:bg-red-500/10 cursor-pointer rounded-lg font-medium transition-colors"
 >
 <Trash2 size={14} className="text-red-400" />
 Delete Artist
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
);

export default function AdminArtistsPage() {
 const router = useRouter();
 const queryClient = useQueryClient();
 const [searchQuery, setSearchQuery] = useState('');
 const [editingArtist, setEditingArtist] = useState<any>(null);
 const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

 const { data: artists, isLoading } = useQuery({
 queryKey: ['admin-artists'],
 queryFn: async () => {
 const res = await api.get('/artists/admin');
 return res.data;
 }
 });

 const createMutation = useMutation({
 mutationFn: async (values: any) => {
 const res = await api.post('/artists', values);
 return res.data;
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['admin-artists'] });
 toast.success('Artist added to registry');
 setEditingArtist({ _reset: Date.now() });
 setTimeout(() => setEditingArtist(null), 10);
 },
 onError: (error: any) => {
 toast.error(error.response?.data?.error || 'Failed to add artist');
 }
 });

 const updateMutation = useMutation({
 mutationFn: async ({ id, values }: { id: string, values: any }) => {
 const res = await api.put(`/artists/${id}`, values);
 return res.data;
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['admin-artists'] });
 toast.success('Artist parameters updated');
 setEditingArtist(null);
 },
 onError: (error: any) => {
 toast.error(error.response?.data?.error || 'Failed to update artist');
 }
 });

 const deleteMutation = useMutation({
 mutationFn: async (id: string) => {
 await api.delete(`/artists/${id}`);
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['admin-artists'] });
 toast.success('Artist removed from registry');
 setDeleteTarget(null);
 },
 onError: (error: any) => {
 toast.error(error.response?.data?.error || 'Failed to delete artist');
 }
 });

 const filteredArtists = (artists || []).filter((a: any) =>
 a.name.toLowerCase().includes(searchQuery.toLowerCase())
 );

 const handleEdit = (artist: any) => {
 setEditingArtist(artist);
 window.scrollTo({ top: 0, behavior: 'smooth' });
 };

 return (
 <div className="min-h-screen pb-32 pt-24 md:pt-[calc(var(--header-height)+2rem)] bg-[#050505]">
 {/* Delete Confirmation Dialog */}
 <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
 <AlertDialogContent className="bg-[#111] border border-white/10 text-white rounded-2xl shadow-2xl max-w-md">
 <AlertDialogHeader>
 <AlertDialogTitle className="text-white text-lg font-semibold">
 Delete Artist
 </AlertDialogTitle>
 <AlertDialogDescription className="text-zinc-400 text-sm leading-relaxed">
 Are you sure you want to permanently delete{' '}
 <span className="text-white font-medium">"{deleteTarget?.name}"</span>
 {' '}from the registry? This action cannot be undone.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter className="gap-2 mt-2">
 <AlertDialogCancel
 className="bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white rounded-xl h-10 px-6 font-medium text-sm transition-all"
 >
 Cancel
 </AlertDialogCancel>
 <AlertDialogAction
 onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
 disabled={deleteMutation.isPending}
 className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl h-10 px-6 font-medium text-sm transition-all"
 >
 {deleteMutation.isPending ? (
 <><Loader2 size={14} className="animate-spin mr-2" />Deleting...</>
 ) : 'Delete Artist'}
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>

 <div className="max-w-7xl mx-auto px-4 md:px-6 relative z-10">

 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-12">
 <div className="flex items-center gap-4">
 <Button
 variant="ghost"
 size="icon"
 onClick={() => editingArtist ? setEditingArtist(null) : router.push('/admin')}
 className="h-10 w-10 md:h-12 md:w-12 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-white shrink-0"
 >
 <ChevronLeft size={20} />
 </Button>
 <div className="min-w-0">
 <h1 className="text-xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-2 md:gap-3">
 <Users className="w-5 h-5 md:w-8 md:h-8 text-[#fb7185] shrink-0" />
 <span className="truncate">Artist Management</span>
 </h1>
 <p className="text-[9px] md:text-xs font-medium text-zinc-500 uppercase tracking-[0.2em] mt-0.5 italic">
 {editingArtist ? 'Editing Artist Record' : 'Artist registry control'}
 </p>
 </div>
 </div>

 <div className="relative group w-full sm:w-64 md:w-72">
 <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 group-focus-within:text-[#fb7185] transition-colors" />
 <Input
 placeholder="Search Artists..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="w-full h-11 pl-11 bg-white/[0.03] border-white/5 rounded-2xl text-[11px] md:text-sm focus:ring-1 focus:ring-rose-500/30 transition-all placeholder:text-zinc-600 font-medium"
 />
 </div>
 </div>

 <div className="grid grid-cols-1 gap-12">
 {/* Registration / Edit Form */}
 <section className="space-y-6">
 <div className="flex items-center justify-between">
 <h2 className="text-[10px] md:text-sm font-black uppercase tracking-[0.3em] text-white/40">
 {editingArtist && !editingArtist._reset ? `Editing — ${editingArtist.name}` : 'New Artist'}
 </h2>
 {editingArtist && !editingArtist._reset && (
 <Button
 variant="ghost"
 size="sm"
 onClick={() => setEditingArtist(null)}
 className="text-[9px] font-black uppercase tracking-widest text-[#fb7185] hover:text-rose-300"
 >
 + New Artist
 </Button>
 )}
 </div>
 <div className="p-6 md:p-12 bg-white/[0.02] backdrop-blur-xl rounded-[1.5rem] md:rounded-[2.5rem]">
 <ArtistForm
 key={editingArtist?.id || (editingArtist?._reset ? `reset-${editingArtist._reset}` : 'new')}
 initialData={editingArtist && !editingArtist._reset ? editingArtist : null}
 onSubmit={async (values) => {
 if (editingArtist && !editingArtist._reset) {
 await updateMutation.mutateAsync({ id: editingArtist.id, values });
 } else {
 await createMutation.mutateAsync(values);
 }
 }}
 isLoading={editingArtist && !editingArtist._reset ? updateMutation.isPending : createMutation.isPending}
 onCancel={() => setEditingArtist(null)}
 />
 </div>
 </section>

 {/* Registry List */}
 <section className="space-y-6">
 <h2 className="text-xs md:text-sm font-black uppercase tracking-[0.3em] text-white/40">Artist Registry</h2>
 <div className="min-h-[400px] overflow-hidden bg-white/[0.02] backdrop-blur-xl rounded-3xl">
 {isLoading ? (
 <div className="flex flex-col items-center justify-center py-32 gap-4">
 <Loader2 className="w-8 h-8 text-[#fb7185] animate-spin" />
 <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">Loading Registry...</p>
 </div>
 ) : filteredArtists.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-32 text-center">
 <Users size={48} className="text-white/5 mb-4" />
 <p className="text-zinc-500 text-sm font-medium">No artists found in the registry.</p>
 </div>
 ) : (
 <div>
 {/* Desktop Table */}
 <div className="hidden md:block overflow-x-auto">
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="border-b border-white/5">
 <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Artist</th>
 <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Assets</th>
 <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Status</th>
 <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 text-right">Actions</th>
 </tr>
 </thead>
 <tbody>
 {filteredArtists.map((artist: any) => (
 <tr key={artist.id} className="group hover:bg-white/[0.03] transition-colors border-b border-white/[0.02]">
 <td className="px-6 py-4">
 <div className="flex items-center gap-4">
 <div className="relative w-12 h-12 rounded-full overflow-hidden border border-white/10 bg-white/5 flex-shrink-0">
 <img
 src={getMediaUrl(artist.imageUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(artist.name)}&background=random&color=fff`}
 className="w-full h-full object-cover transition-all duration-300"
 alt={artist.name}
 onError={(e) => { 
 const el = e.target as HTMLImageElement;
 const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(artist.name)}&background=random&color=fff`;
 if (el.src !== fallback) el.src = fallback;
 }}
 />
 </div>
 <div className="min-w-0">
 <div className="text-white flex items-center gap-2 text-sm font-medium truncate">
 {artist.name}
 {artist.verified && <VerifiedBadge />}
 </div>
 <div className="text-[10px] text-zinc-600 font-mono mt-0.5">
 {artist.id.slice(0, 8)}...
 </div>
 </div>
 </div>
 </td>
 <td className="px-6 py-4">
 <div className="text-xs text-white/70 font-medium">{(artist as any)._count?.tracks || 0} Tracks</div>
 <div className="text-[10px] text-zinc-500 mt-0.5">{(artist as any)._count?.albums || 0} Albums</div>
 </td>
 <td className="px-6 py-4">
 {artist.verified ? (
 <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
 <BadgeCheck size={10} fill="currentColor" />
 Verified
 </span>
 ) : (
 <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold bg-white/5 text-zinc-500 border border-white/10">
 Standard
 </span>
 )}
 </td>
 <td className="px-6 py-4 text-right">
 <div className="flex items-center justify-end gap-1">
 <Button
 variant="ghost"
 size="icon"
 onClick={() => router.push(`/artist/${artist.id}`)}
 className="h-8 w-8 hover:bg-white/10 text-zinc-400 hover:text-white rounded-lg"
 >
 <ExternalLink size={14} />
 </Button>
 <ArtistActionsDropdown
 artist={artist}
 handleEdit={handleEdit}
 onDeleteRequest={(id, name) => setDeleteTarget({ id, name })}
 />
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 {/* Mobile List */}
 <div className="md:hidden divide-y divide-white/[0.05]">
 {filteredArtists.map((artist: any) => (
 <div key={artist.id} className="px-4 py-4 flex items-center justify-between gap-3">
 <div className="flex items-center gap-3 min-w-0">
 <div className="w-12 h-12 relative rounded-full overflow-hidden border border-white/10 bg-white/5 flex-shrink-0">
 <img
 src={getMediaUrl(artist.imageUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(artist.name)}&background=random&color=fff`}
 className="w-full h-full object-cover transition-all duration-300"
 alt={artist.name}
 onError={(e) => { 
 const el = e.target as HTMLImageElement;
 const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(artist.name)}&background=random&color=fff`;
 if (el.src !== fallback) el.src = fallback;
 }}
 />
 </div>
 <div className="min-w-0 flex flex-col justify-center">
 <div className="text-white flex items-center gap-1.5 text-sm font-medium truncate">
 {artist.name}
 {artist.verified && <VerifiedBadge size={12} />}
 </div>
 <div className="text-[10px] text-zinc-600 font-mono mt-0.5 truncate">
 {artist.id.slice(0, 8)}...
 </div>
 <div className="flex items-center gap-2 mt-1">
 <span className="text-[10px] text-zinc-500">{(artist as any)._count?.tracks || 0} tracks</span>
 <span className="w-1 h-1 rounded-full bg-zinc-700" />
 <span className="text-[10px] text-zinc-500">{(artist as any)._count?.albums || 0} albums</span>
 {artist.verified && (
 <>
 <span className="w-1 h-1 rounded-full bg-zinc-700" />
 <span className="text-[10px] text-rose-400 font-semibold">Verified</span>
 </>
 )}
 </div>
 </div>
 </div>
 <div className="flex items-center gap-0.5 shrink-0">
 <Button
 variant="ghost"
 size="icon"
 onClick={() => router.push(`/artist/${artist.id}`)}
 className="h-8 w-8 text-zinc-500 hover:text-white"
 >
 <ExternalLink size={14} />
 </Button>
 <ArtistActionsDropdown
 artist={artist}
 handleEdit={handleEdit}
 onDeleteRequest={(id, name) => setDeleteTarget({ id, name })}
 />
 </div>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 </section>
 </div>
 </div>
 </div>
 );
}
