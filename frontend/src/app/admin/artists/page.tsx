"use client";
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
    ChevronLeft,
    Users,
    Search,
    Plus,
    Loader2,
    MoreVertical,
    Edit2,
    Trash2,
    ExternalLink,
    CheckCircle2
} from "lucide-react";
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getMediaUrl } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from 'sonner';

export default function AdminArtistsPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState('');

    const { data: artists, isLoading } = useQuery({
        queryKey: ['admin-artists'],
        queryFn: async () => {
            const res = await api.get('/artists/admin');
            return res.data;
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/artists/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-artists'] });
            toast.success('Artist deleted successfully');
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.error || 'Failed to delete artist');
        }
    });

    const filteredArtists = artists?.filter((a: any) =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleDelete = (id: string, name: string) => {
        if (confirm(`Are you sure you want to delete ${name}?`)) {
            deleteMutation.mutate(id);
        }
    };

    return (
        <div className="min-h-screen pb-32 pt-6 md:pt-8 bg-[#050505]">
            <div className="max-w-6xl mx-auto px-4 md:px-6 relative z-10">

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
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
                            <h1 className="text-2xl md:text-4xl font-brand text-brand leading-none">Artist Forge</h1>
                            <p className="text-white/30 text-[9px] tracking-[0.2em] font-medium hidden sm:block">Zenify Canonical Identity Management</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative group flex-1 sm:flex-none">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-brand transition-colors" />
                            <Input
                                placeholder="Search titans..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full sm:w-56 md:w-64 h-10 pl-11 bg-white/5 border-white/10 rounded-xl text-sm focus:ring-brand focus:border-brand transition-all"
                            />
                        </div>
                        <Button
                            onClick={() => router.push('/admin/artists/new')}
                            className="h-10 bg-brand text-black font-black uppercase text-[10px] tracking-wider rounded-xl gap-2 hover:scale-105 transition-transform"
                        >
                            <Plus size={16} strokeWidth={3} /> Add Artist
                        </Button>
                    </div>
                </div>

                <div className="premium-card min-h-[400px] border-white/5 overflow-hidden bg-white/[0.02] backdrop-blur-xl rounded-3xl">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-32 gap-4">
                            <Loader2 className="w-8 h-8 text-brand animate-spin" />
                            <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">Materializing Legacies...</p>
                        </div>
                    ) : filteredArtists?.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-32 text-center">
                            <Users size={48} className="text-white/5 mb-4" />
                            <p className="text-zinc-500 text-sm font-medium">No artists found in the registry.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-white/5">
                                        <th className="px-4 md:px-6 py-4 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Artist</th>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 hidden md:table-cell">Assets</th>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 hidden sm:table-cell">Status</th>
                                        <th className="px-4 md:px-6 py-4 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredArtists.map((artist: any) => (
                                        <tr key={artist.id} className="group hover:bg-white/[0.03] transition-colors border-b border-white/[0.02]">
                                            <td className="px-4 md:px-6 py-4">
                                                <div className="flex items-center gap-3 md:gap-4">
                                                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden border border-white/10 bg-white/5 flex-shrink-0">
                                                        <img
                                                            src={getMediaUrl(artist.imageUrl) || `https://ui-avatars.com/api/?name=${artist.name}`}
                                                            className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                                                            alt={artist.name}
                                                        />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-white flex items-center gap-1.5 md:gap-2 uppercase tracking-tight text-xs md:text-sm truncate">
                                                            {artist.name}
                                                            {artist.verified && <CheckCircle2 size={12} className="text-brand shrink-0" fill="currentColor" />}
                                                        </div>
                                                        <div className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate max-w-[80px] md:max-w-none">
                                                            {artist.id.slice(0, 8)}...
                                                        </div>
                                                        <div className="md:hidden mt-1 flex gap-2">
                                                            <span className="text-[8px] text-zinc-500 font-black uppercase tracking-widest">{artist._count.tracks} T</span>
                                                            <span className="text-[8px] text-zinc-500 font-black uppercase tracking-widest">{artist._count.albums} A</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 hidden md:table-cell">
                                                <div className="flex flex-col gap-1">
                                                    <div className="text-xs font-bold text-white/70 tracking-tight">
                                                        {artist._count.tracks} Tracks
                                                    </div>
                                                    <div className="text-[10px] text-zinc-500 font-medium">
                                                        {artist._count.albums} Albums
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 hidden sm:table-cell">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${artist.verified ? 'bg-brand/10 text-brand border border-brand/20' : 'bg-white/5 text-zinc-500 border border-white/10'}`}>
                                                    {artist.verified ? 'Verified' : 'Standard'}
                                                </span>
                                            </td>
                                            <td className="px-4 md:px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-1 md:gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => router.push(`/artist/${artist.id}`)}
                                                        className="h-8 w-8 hover:bg-white/10 text-zinc-400 hover:text-white rounded-lg hidden xs:flex"
                                                    >
                                                        <ExternalLink size={14} />
                                                    </Button>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10 text-zinc-400 rounded-lg">
                                                                <MoreVertical size={14} />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="bg-[#0A0A0A] border-white/10 text-white min-w-[140px] rounded-xl shadow-2xl">
                                                            <DropdownMenuItem
                                                                onClick={() => router.push(`/admin/artists/${artist.id}`)}
                                                                className="gap-2 focus:bg-white/10 focus:text-white cursor-pointer py-3 md:py-2 rounded-lg m-1"
                                                            >
                                                                <Edit2 size={14} /> Update Titan
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={() => handleDelete(artist.id, artist.name)}
                                                                className="gap-2 focus:bg-red-500/20 text-red-400 focus:text-red-400 cursor-pointer py-3 md:py-2 rounded-lg m-1"
                                                            >
                                                                <Trash2 size={14} /> Purge Registry
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
