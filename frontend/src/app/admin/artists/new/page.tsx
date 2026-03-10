"use client";
import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { ArtistForm } from '../ArtistForm';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function NewArtistPage() {
    const router = useRouter();
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async (values: any) => {
            const res = await api.post('/artists', values);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-artists'] });
            toast.success('Identity Materialized Successfully');
            router.push('/admin/artists');
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.error || 'Materialization Failure');
        }
    });

    return (
        <div className="min-h-screen pb-32 pt-6 md:pt-8 bg-[#050505]">
            <div className="max-w-6xl mx-auto px-4 md:px-6 relative z-10">
                <div className="flex items-center gap-4 mb-12">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push('/admin/artists')}
                        className="bg-white/5 border border-white/10 text-white hover:bg-white/10 rounded-xl shrink-0"
                    >
                        <ChevronLeft size={20} />
                    </Button>
                    <div className="space-y-0.5">
                        <h1 className="text-2xl md:text-4xl font-brand text-brand leading-none">Identity Genesis</h1>
                        <p className="text-white/30 text-[9px] tracking-[0.2em] font-medium uppercase">Forging a New Titan in the Registry</p>
                    </div>
                </div>

                <div className="premium-card p-10 bg-white/[0.02] border-white/5 backdrop-blur-3xl rounded-[2.5rem] shadow-2xl">
                    <ArtistForm
                        onSubmit={(values) => mutation.mutateAsync(values)}
                        isLoading={mutation.isPending}
                        onCancel={() => router.push('/admin/artists')}
                    />
                </div>
            </div>
        </div>
    );
}
