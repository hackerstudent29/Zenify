"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, CheckCircle, AtSign, UserIcon } from "lucide-react";
import { motion } from "framer-motion";
import { getMediaUrl } from "@/lib/utils";
import { ZenLoading } from "@/components/ui/ZenLoading";

const profileSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    username: z.string().min(3, "Username must be at least 3 characters").regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers and underscores allowed"),
});

export function ProfileSection() {
    const { user, updateUser } = useAuthStore();
    const [isLoading, setIsLoading] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            name: user?.name || "",
            username: user?.username || user?.email?.split('@')[0] || "",
        }
    });

    const onSubmit = async (data: any) => {
        setIsLoading(true);
        try {
            await api.patch("auth/profile", data);
            updateUser(data);
            reset(data);
            setIsSaved(true);
            setTimeout(() => setIsSaved(false), 3000);
        } catch (error) {
            console.error("Failed to update profile", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append("avatar", file);

        try {
            const res = await api.post("auth/avatar", formData);
            updateUser({ avatarUrl: res.data.avatarUrl });
        } catch (error) {
            console.error("Avatar upload failed", error);
        }
    };

    const handleRemoveAvatar = async () => {
        try {
            await api.patch("auth/profile", { avatarUrl: null });
            updateUser({ avatarUrl: undefined }); // Clear avatar in Zustand store
        } catch (error) {
            console.error("Failed to remove avatar", error);
        }
    };

    return (
        <section className="space-y-6 max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div>
                <h2 className="text-2xl md:text-3xl font-semibold text-white tracking-tight mb-1">Profile Details</h2>
                <p className="text-zinc-500 text-sm font-medium">Update your public information</p>
            </div>

            <div className="bg-[#1c1c1e] p-6 md:p-8 rounded-[2rem] shadow-sm space-y-8">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 border-b border-white/5 pb-8">
                    <div className="relative group shrink-0">
                        <Avatar className="w-24 h-24 border border-white/10 rounded-2xl overflow-hidden shadow-lg bg-zinc-800">
                            <AvatarImage src={getMediaUrl(user?.avatarUrl)} className="object-cover" />
                            <AvatarFallback className="bg-zinc-800 text-3xl font-semibold text-white/50 uppercase">
                                {user?.username?.[0] || user?.name?.[0] || user?.email[0]}
                            </AvatarFallback>
                        </Avatar>
                    </div>
                    <div className="space-y-4 text-center sm:text-left pt-2">
                        <div>
                            <h3 className="text-[10px] font-bold text-zinc-500 mb-1 uppercase tracking-widest">Profile Photo</h3>
                            <p className="text-xs text-zinc-400 font-medium">
                                JPG, GIF or PNG. Max size 5MB.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 justify-center sm:justify-start">
                            <Button variant="secondary" className="h-8 text-xs font-semibold px-4 cursor-pointer relative overflow-hidden bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors border-0">
                                Choose Image
                                <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleAvatarUpload} accept="image/*" />
                            </Button>
                            {user?.avatarUrl && (
                                <Button
                                    variant="ghost"
                                    onClick={handleRemoveAvatar}
                                    className="h-8 text-xs font-semibold px-4 text-red-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer rounded-full"
                                >
                                    Remove
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                                <UserIcon size={12} className="text-pink-500" />
                                Display Name
                            </Label>
                            <Input
                                {...register("name")}
                                className="bg-zinc-800/50 border-0 rounded-xl text-white h-11 focus-visible:ring-1 focus-visible:ring-pink-500 font-medium px-4"
                                placeholder="Enter your name"
                            />
                            {errors.name && <p className="text-[10px] text-red-500 pl-1 font-bold">{errors.name.message as string}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                                <AtSign size={12} className="text-pink-500" />
                                Username
                            </Label>
                            <Input
                                {...register("username")}
                                className="bg-zinc-800/50 border-0 rounded-xl text-white h-11 focus-visible:ring-1 focus-visible:ring-pink-500 font-medium px-4"
                                placeholder="username"
                            />
                            {errors.username && <p className="text-[10px] text-red-500 pl-1 font-bold">{errors.username.message as string}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Email Address</Label>
                            <div className="relative">
                                <Input
                                    value={user?.email || ""}
                                    readOnly
                                    className="bg-zinc-800/30 border-0 text-zinc-500 cursor-not-allowed rounded-xl h-11 pr-10 font-medium px-4"
                                />
                                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                    <CheckCircle size={14} className="text-emerald-500" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4">
                        <Button
                            type="submit"
                            disabled={isLoading || !isDirty}
                            className="bg-pink-500 hover:bg-pink-600 text-white font-semibold rounded-full h-10 px-8 transition-colors disabled:opacity-50 flex items-center justify-center min-w-[140px]"
                        >
                            {isLoading ? <ZenLoading size="xs" className="brightness-200" /> : isDirty ? "Save Changes" : "Saved"}
                        </Button>
                    </div>
                </form>
            </div>
        </section>
    );
}
