"use client";
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
    Save,
    X,
    Image as ImageIcon,
    Calendar as CalendarIcon,
    Loader2,
    Verified
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn, getMediaUrl } from "@/lib/utils";

const artistSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    bio: z.string().optional().nullable(),
    role: z.string().optional().nullable(),
    birthDate: z.date().optional().nullable(),
    imageUrl: z.string().optional().nullable(),
    coverUrl: z.string().optional().nullable(),
    verified: z.boolean(),
    monthlyListeners: z.number(),
    totalStreams: z.number(),
});

type ArtistFormValues = z.infer<typeof artistSchema>;

interface ArtistFormProps {
    initialData?: any;
    onSubmit: (values: ArtistFormValues) => Promise<void>;
    isLoading?: boolean;
    onCancel: () => void;
}

export function ArtistForm({ initialData, onSubmit, isLoading, onCancel }: ArtistFormProps) {
    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors }
    } = useForm<ArtistFormValues>({
        resolver: zodResolver(artistSchema),
        defaultValues: {
            name: initialData?.name || '',
            bio: initialData?.bio || '',
            role: initialData?.role || '',
            birthDate: initialData?.birthDate ? new Date(initialData.birthDate) : null,
            imageUrl: initialData?.imageUrl || '',
            coverUrl: initialData?.coverUrl || '',
            verified: initialData?.verified ?? false,
            monthlyListeners: initialData?.monthlyListeners ?? 0,
            totalStreams: Number(initialData?.totalStreams || 0),
        }
    });

    const birthDate = watch('birthDate');
    const verified = watch('verified');
    const imageUrl = watch('imageUrl');
    const coverUrl = watch('coverUrl');

    const internalOnSubmit = async (data: ArtistFormValues) => {
        // Ensure numbers are numbers (just in case)
        const submissionData = {
            ...data,
            monthlyListeners: Number(data.monthlyListeners),
            totalStreams: Number(data.totalStreams),
        };
        await onSubmit(submissionData as ArtistFormValues);
    };

    return (
        <form onSubmit={handleSubmit(internalOnSubmit)} className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-10">
                {/* Left Column: Visuals & Stats */}
                <div className="lg:col-span-4 space-y-6 md:space-y-8">
                    <div className="space-y-4">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Identity Visuals</Label>

                        {/* Profile Image */}
                        <div className="space-y-2">
                            <p className="text-[9px] text-zinc-500 uppercase font-black px-1">Profile Avatar</p>
                            <div className="group relative aspect-square max-w-[240px] mx-auto lg:max-w-none rounded-3xl overflow-hidden bg-white/5 border border-dashed border-white/10 hover:border-brand/40 transition-colors">
                                {imageUrl ? (
                                    <img
                                        src={getMediaUrl(imageUrl)}
                                        className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-700"
                                        alt="Preview"
                                    />
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 gap-3">
                                        <ImageIcon size={32} strokeWidth={1} />
                                        <span className="text-[9px] uppercase font-bold tracking-widest text-center px-4">Avatar Required</span>
                                    </div>
                                )}
                            </div>
                            <Input
                                {...register('imageUrl')}
                                placeholder="Avatar URL..."
                                className="bg-white/5 border-white/10 rounded-xl h-9 text-[10px] focus:ring-brand font-mono"
                            />
                        </div>

                        {/* Banner Image */}
                        <div className="space-y-2 pt-2">
                            <p className="text-[9px] text-zinc-500 uppercase font-black px-1">Hero Banner</p>
                            <div className="group relative aspect-[21/9] rounded-2xl overflow-hidden bg-white/5 border border-dashed border-white/10 hover:border-brand/40 transition-colors">
                                {coverUrl ? (
                                    <img
                                        src={getMediaUrl(coverUrl)}
                                        className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-700"
                                        alt="Banner Preview"
                                    />
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 gap-2">
                                        <ImageIcon size={24} strokeWidth={1} />
                                        <span className="text-[9px] uppercase font-bold tracking-widest text-center px-4">Banner Placeholder</span>
                                    </div>
                                )}
                            </div>
                            <Input
                                {...register('coverUrl')}
                                placeholder="Banner URL..."
                                className="bg-white/5 border-white/10 rounded-xl h-9 text-[10px] focus:ring-brand font-mono"
                            />
                        </div>
                    </div>

                    {/* Stats Section */}
                    <div className="premium-card p-5 md:p-6 border-white/5 bg-white/[0.02] space-y-4">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 block mb-2">Metrics Console</Label>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 lg:gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-bold text-zinc-400 uppercase">Monthly Listeners</Label>
                                <Input
                                    type="number"
                                    {...register('monthlyListeners')}
                                    className="bg-white/5 border-white/10 rounded-xl h-10 text-xs focus:ring-brand"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-bold text-zinc-400 uppercase">Total Frequency</Label>
                                <Input
                                    type="number"
                                    {...register('totalStreams')}
                                    className="bg-white/5 border-white/10 rounded-xl h-10 text-xs focus:ring-brand"
                                />
                            </div>
                        </div>

                        <div className="pt-4 border-t border-white/5">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Verified size={14} className={verified ? "text-brand" : "text-zinc-500"} />
                                        <Label className="text-[11px] font-bold text-white uppercase tracking-tight">Verified Status</Label>
                                    </div>
                                    <p className="text-[9px] text-zinc-500">Grant canonical status.</p>
                                </div>
                                <Switch
                                    checked={verified}
                                    onCheckedChange={(checked) => setValue('verified', checked)}
                                    className="data-[state=checked]:bg-brand"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Metadata */}
                <div className="lg:col-span-8 space-y-6 md:space-y-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-2.5">
                            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Canonical Handle (Name)</Label>
                            <Input
                                {...register('name')}
                                placeholder="Titan Name..."
                                className="bg-white/5 border-white/10 rounded-xl h-12 text-base md:text-lg font-bold focus:ring-brand"
                            />
                            {errors.name && <p className="text-red-500 text-[10px] uppercase font-bold">{errors.name.message}</p>}
                        </div>

                        <div className="space-y-2.5">
                            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Designation (Role)</Label>
                            <Input
                                {...register('role')}
                                placeholder="e.g. Music Director • Composer"
                                className="bg-white/5 border-white/10 rounded-xl h-12 text-xs md:text-sm font-medium focus:ring-brand"
                            />
                        </div>

                        <div className="space-y-2.5 sm:col-span-2">
                            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Materialization Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className={cn(
                                            "w-full h-12 justify-start text-left font-bold bg-white/5 border-white/10 rounded-xl hover:bg-white/10",
                                            !birthDate && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4 text-brand" />
                                        {birthDate ? format(birthDate, "PPP") : <span className="text-zinc-500 text-xs text-wrap">Origin point unknown...</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-[#0A0A0A] border-white/10 overflow-hidden" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={birthDate || undefined}
                                        onSelect={(date) => setValue('birthDate', date || null)}
                                        initialFocus
                                        className="bg-[#0A0A0A] text-white"
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    <div className="space-y-2.5">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Legacy Chronology (Bio)</Label>
                        <Textarea
                            {...register('bio')}
                            placeholder="The origins and contributions of this titan..."
                            className="min-h-[180px] md:min-h-[220px] bg-white/5 border-white/10 rounded-2xl p-4 md:p-6 text-sm leading-relaxed focus:ring-brand"
                        />
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 md:pt-6">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onCancel}
                            className="w-full sm:w-auto h-12 px-8 text-zinc-400 font-bold uppercase text-[10px] tracking-widest hover:text-white rounded-xl order-2 sm:order-1"
                        >
                            <X size={16} className="mr-2" /> Discard
                        </Button>
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full sm:w-auto h-12 px-10 bg-brand text-black font-black uppercase text-[10px] tracking-widest rounded-xl hover:scale-105 transition-transform order-1 sm:order-2"
                        >
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save size={16} className="mr-2" />}
                            Commit Identity
                        </Button>
                    </div>
                </div>
            </div>
        </form>
    );
}
