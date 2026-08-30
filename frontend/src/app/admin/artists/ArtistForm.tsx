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
import api from '@/lib/api';
import { CoverCropModal } from '@/components/admin/CoverCropModal';

const artistSchema = z.object({
 name: z.string().min(1, 'Name is required'),
 bio: z.string().optional().nullable(),
 role: z.string().optional().nullable(),
 birthDate: z.date().optional().nullable(),
 imageUrl: z.string().optional().nullable(),
 coverUrl: z.string().optional().nullable(),
 verified: z.boolean(),
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
 }
 });

 const birthDate = watch('birthDate');
 const verified = watch('verified');
 const imageUrl = watch('imageUrl');
 const coverUrl = watch('coverUrl');

 const [isCalendarOpen, setIsCalendarOpen] = useState(false);
 const [profileBlob, setProfileBlob] = useState<string | null>(null);
 const [bannerBlob, setBannerBlob] = useState<string | null>(null);

 const [cropSrc, setCropSrc] = useState<string | null>(null);
 const [cropType, setCropType] = useState<'imageUrl' | 'coverUrl' | null>(null);
 const [isUploadingCrop, setIsUploadingCrop] = useState(false);

 const handleCropDone = async (croppedFile: File, previewUrl: string) => {
     if (!cropType) return;
     setIsUploadingCrop(true);
     try {
         const formData = new FormData();
         formData.append("image", croppedFile);
         const res = await api.post("/utils/upload-image", formData, {
             headers: { "Content-Type": "multipart/form-data" }
         });
         setValue(cropType, res.data.url, { shouldDirty: true });
         
         if (cropType === 'imageUrl') {
             if (profileBlob) URL.revokeObjectURL(profileBlob);
             setProfileBlob(previewUrl);
         } else {
             if (bannerBlob) URL.revokeObjectURL(bannerBlob);
             setBannerBlob(previewUrl);
         }
     } catch (err: any) {
         console.error("Failed to upload cropped image.", err);
     } finally {
         setIsUploadingCrop(false);
         setCropSrc(null);
         setCropType(null);
     }
 };

 const handleFetchPreview = async (field: 'imageUrl' | 'coverUrl') => {
 const url = watch(field);
 if (!url || !url.startsWith('http')) return;

 try {
 const apiFull = (import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL) || 'https://zenify-production-7f21.up.railway.app/api';
 const apiBase = apiFull.endsWith('/api') ? apiFull : `${apiFull.replace(/\/$/, '')}/api`;
 
 // Step 1: Resolve the URL to a direct image link if it's a wrapper (Bing, etc.)
 const resolveRes = await fetch(`${apiBase}/utils/resolve-image?url=${encodeURIComponent(url)}`);
 if (resolveRes.ok) {
 const data = await resolveRes.json();
 if (data.url && data.url !== url) {
 setValue(field, data.url, { shouldDirty: true });
 }
 }

 // Step 2: Blob preview (Force visual update)
 const finalUrl = watch(field);
 if (!finalUrl) throw new Error('No URL to preview');
 const proxyUrl = `${apiBase}/utils/proxy-image?url=${encodeURIComponent(finalUrl)}`;
 
 const res = await fetch(proxyUrl);
 if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

 const blob = await res.blob();
 const blobUrl = URL.createObjectURL(blob);

 if (field === 'imageUrl') {
 if (profileBlob) URL.revokeObjectURL(profileBlob);
 setProfileBlob(blobUrl);
 } else {
 if (bannerBlob) URL.revokeObjectURL(bannerBlob);
 setBannerBlob(blobUrl);
 }
 } catch (err: any) {
 console.error('Image sync failed:', err.message || err);
 }
 };

 // Clean up blobs on unmount
 React.useEffect(() => {
 return () => {
 if (profileBlob) URL.revokeObjectURL(profileBlob);
 if (bannerBlob) URL.revokeObjectURL(bannerBlob);
 };
 }, [profileBlob, bannerBlob]);

 const internalOnSubmit = async (data: ArtistFormValues) => {
 // Transform before sending — backend expects string dates, not Date objects
 const payload: any = {
 name: data.name,
 bio: data.bio || null,
 role: data.role || null,
 imageUrl: data.imageUrl || null,
 coverUrl: data.coverUrl || null,
 verified: data.verified ?? false,
 birthDate: data.birthDate instanceof Date ? data.birthDate.toISOString() : (data.birthDate || null),
 };
 await onSubmit(payload);
 };

 return (
 <form onSubmit={handleSubmit(internalOnSubmit)} className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
 <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-10">
 {/* Left Column: Visuals */}
 <div className="lg:col-span-4 space-y-6 md:space-y-8">
 <div className="space-y-4">
 <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Artist Visuals</Label>

 {/* Profile Image */}
 <div className="space-y-2">
 <div className="flex items-center justify-between px-1">
 <p className="text-[9px] text-zinc-500 uppercase font-black">Profile Image</p>
 {watch('imageUrl')?.startsWith('http') && (
 <button
 type="button"
 onClick={() => handleFetchPreview('imageUrl')}
 className="text-[8px] font-black text-brand uppercase tracking-widest hover:opacity-80 transition-opacity"
 >
 Sync Preview
 </button>
 )}
 </div>
 <div className="group relative aspect-square max-w-[240px] mx-auto lg:max-w-none rounded-3xl overflow-hidden bg-white/5 border border-dashed border-white/10 transition-colors">
 {profileBlob || imageUrl ? (
 <img
 src={getMediaUrl(profileBlob || imageUrl)}
 className="w-full h-full object-cover transition-transform group- duration-700"
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
 placeholder="Profile Image URL..."
 className="bg-white/5 border-white/10 rounded-xl h-9 text-[10px] focus:ring-brand font-mono"
 onBlur={(e) => {
 if (e.target.value.startsWith('http')) handleFetchPreview('imageUrl');
 }}
 />
 </div>

 {/* Banner Image */}
 <div className="space-y-2 pt-2">
 <div className="flex items-center justify-between px-1">
 <p className="text-[9px] text-zinc-500 uppercase font-black">Cover Banner</p>
 {watch('coverUrl')?.startsWith('http') && (
 <button
 type="button"
 onClick={() => handleFetchPreview('coverUrl')}
 className="text-[8px] font-black text-brand uppercase tracking-widest hover:opacity-80 transition-opacity"
 >
 Sync Preview
 </button>
 )}
 </div>
 <div className="group relative aspect-[21/9] rounded-2xl overflow-hidden bg-white/5 border border-dashed border-white/10 transition-colors">
 {bannerBlob || coverUrl ? (
 <img
 src={getMediaUrl(bannerBlob || coverUrl)}
 className="w-full h-full object-cover transition-transform group- duration-700"
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
 onBlur={(e) => {
 if (e.target.value.startsWith('http')) handleFetchPreview('coverUrl');
 }}
 />
 </div>
 </div>

 {/* Status Section */}
 <div className="p-5 md:p-6 bg-white/[0.03] rounded-3xl space-y-4">
 <div className="flex items-center justify-between">
 <div className="space-y-1">
 <div className="flex items-center gap-2">
 <Verified size={14} className={verified ? "text-brand" : "text-zinc-500"} />
 <Label className="text-[11px] font-bold text-white uppercase tracking-tight">Verified Artist</Label>
 </div>
 <p className="text-[9px] text-zinc-500">Official artist badge.</p>
 </div>
 <Switch
 checked={verified}
 onCheckedChange={(checked) => setValue('verified', checked)}
 className="data-[state=checked]:bg-brand"
 />
 </div>
 </div>
 </div>

 {/* Right Column: Metadata */}
 <div className="lg:col-span-8 space-y-6 md:space-y-8">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
 <div className="space-y-2.5">
 <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Artist Name</Label>
 <Input
 {...register('name')}
 placeholder="Enter name..."
 className="bg-white/5 border-white/10 rounded-xl h-12 text-base md:text-lg focus:ring-brand font-medium"
 />
 {errors.name && <p className="text-red-500 text-[10px] uppercase font-bold">{errors.name.message}</p>}
 </div>

 <div className="space-y-2.5">
 <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Artist Role</Label>
 <Input
 {...register('role')}
 placeholder="e.g. Music Director, Composer"
 className="bg-white/5 border-white/10 rounded-xl h-12 text-xs md:text-sm font-medium focus:ring-brand"
 />
 </div>

 <div className="space-y-2.5 sm:col-span-2">
 <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Birth Date / Debut</Label>
 <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
 <PopoverTrigger asChild>
 <Button
 variant="outline"
 className={cn(
 "w-full h-12 justify-start text-left font-bold bg-white/5 border-white/10 rounded-xl hover:bg-white/10",
 !birthDate && "text-muted-foreground"
 )}
 >
 <CalendarIcon className="mr-2 h-4 w-4 text-brand" />
 {birthDate ? format(birthDate, "PPP") : <span className="text-zinc-500 text-xs">Origin point...</span>}
 </Button>
 </PopoverTrigger>
 <PopoverContent className="w-auto p-0 bg-[#0A0A0A] border-white/10 overflow-hidden" align="start">
 <Calendar
 mode="single"
 selected={birthDate || undefined}
 onSelect={(date) => {
 setValue('birthDate', date || null);
 setIsCalendarOpen(false);
 }}
 initialFocus
 captionLayout="dropdown"
 fromYear={1900}
 toYear={new Date().getFullYear()}
 className="bg-[#0A0A0A] text-white"
 />
 </PopoverContent>
 </Popover>
 </div>
 </div>

 <div className="space-y-2.5">
 <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Artist Biography</Label>
 <Textarea
 {...register('bio')}
 placeholder="Enter artist history..."
 className="min-h-[180px] md:min-h-[220px] bg-white/5 border-white/10 rounded-2xl p-4 md:p-6 text-sm leading-relaxed focus:ring-brand"
 />
 </div>

 <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 md:pt-6 border-t border-white/5 mt-4 md:mt-8">
 <Button
 type="button"
 variant="ghost"
 onClick={onCancel}
 disabled={isLoading}
 className="w-full sm:w-auto h-12 px-8 bg-transparent hover:bg-white/5 text-zinc-400 font-medium text-[11px] md:text-xs rounded-xl transition-all order-2 sm:order-1"
 >
 Cancel
 </Button>
 <Button
 type="submit"
 disabled={isLoading}
 className="w-full sm:w-auto h-12 px-10 bg-white/5 border border-white/10 hover:bg-white/10 text-brand font-bold text-[11px] md:text-xs tracking-wide rounded-xl active:scale-95 transition-all order-1 sm:order-2"
 >
 {isLoading ? (
 <>
 <Loader2 className="mr-2 h-4 w-4 animate-spin" />
 Saving...
 </>
 ) : (
 <>
 <Save size={16} className="mr-2" />
 Save Artist
 </>
 )}
 </Button>
 </div>
 </div>
 </div>
 {cropSrc && (
     <CoverCropModal
         rawSrc={cropSrc}
         aspectRatio={cropType === 'coverUrl' ? 3 / 1 : 1}
         onDone={handleCropDone}
         onCancel={() => {
             setCropSrc(null);
             setCropType(null);
         }}
     />
 )}
 {isUploadingCrop && (
     <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
         <div className="flex flex-col items-center gap-4">
             <Loader2 className="w-8 h-8 text-brand animate-spin" />
             <p className="text-white text-sm font-bold">Uploading Cropped Image...</p>
         </div>
     </div>
 )}
 </form>
 );
}
