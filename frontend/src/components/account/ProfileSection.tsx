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
import { Camera, Loader2, CheckCircle, AtSign, UserIcon } from "lucide-react";

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
            await api.patch("/auth/profile", data);
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
            const res = await api.post("/auth/avatar", formData);
            updateUser({ avatarUrl: res.data.avatarUrl });
        } catch (error) {
            console.error("Avatar upload failed", error);
        }
    };

    const handleRemoveAvatar = async () => {
        try {
            await api.patch("/auth/profile", { avatarUrl: null });
            updateUser({ avatarUrl: undefined }); // Clear avatar in Zustand store
        } catch (error) {
            console.error("Failed to remove avatar", error);
        }
    };

    return (
        <section className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col sm:flex-row items-center gap-10">
                <div className="relative group shrink-0">
                    <Avatar className="w-24 h-24 border border-white/10 rounded-xl overflow-hidden">
                        <AvatarImage src={user?.avatarUrl} className="object-cover" />
                        <AvatarFallback className="bg-zinc-800 text-2xl font-medium text-white/80 uppercase">
                            {user?.username?.[0] || user?.name?.[0] || user?.email[0]}
                        </AvatarFallback>
                    </Avatar>
                </div>
                <div className="space-y-3 text-center sm:text-left">
                    <div>
                        <h3 className="text-lg font-medium text-white">Profile Photo</h3>
                        <p className="text-xs text-zinc-500 leading-relaxed">
                            Supported: PNG, JPG or GIF.<br />
                            File size limit: 5 MB
                        </p>
                    </div>
                    <div className="flex items-center gap-3 justify-center sm:justify-start">
                        <Button variant="secondary" className="h-8 text-xs font-semibold px-4 cursor-pointer relative overflow-hidden bg-white/5 hover:bg-white/10 text-white border border-white/10">
                            Update
                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleAvatarUpload} accept="image/*" />
                        </Button>
                        {user?.avatarUrl && (
                            <Button
                                variant="ghost"
                                onClick={handleRemoveAvatar}
                                className="h-8 text-xs font-semibold px-4 text-red-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                            >
                                Remove
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 max-w-2xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-zinc-400 flex items-center gap-2">
                            <UserIcon size={14} className="text-accent/60" />
                            Display Name
                        </Label>
                        <Input
                            {...register("name")}
                            className="bg-surface-hover/50 border-white/5 rounded-lg text-white focus-visible:ring-accent/50 focus-visible:border-accent/50"
                            placeholder="Enter your name"
                        />
                        {errors.name && <p className="text-xs text-red-500 pl-1">{errors.name.message as string}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-zinc-400 flex items-center gap-2">
                            <AtSign size={14} className="text-accent/60" />
                            Username
                        </Label>
                        <Input
                            {...register("username")}
                            className="bg-surface-hover/50 border-white/5 rounded-lg text-white focus-visible:ring-accent/50 focus-visible:border-accent/50"
                            placeholder="username"
                        />
                        {errors.username && <p className="text-xs text-red-500 pl-1">{errors.username.message as string}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-zinc-400">Email Address</Label>
                        <div className="relative">
                            <Input
                                value={user?.email || ""}
                                readOnly
                                className="bg-white/[0.02] border-white/10 text-white cursor-not-allowed rounded-lg pr-10"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <CheckCircle size={14} className="text-emerald-500/50" />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-end">
                        <Button
                            type="submit"
                            disabled={isLoading || !isDirty}
                            className="bg-accent hover:bg-accent/90 text-white font-medium rounded-lg h-10 w-full md:w-auto px-8"
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : isDirty ? "Update" : "Saved"}
                        </Button>
                    </div>
                </div>
            </form>
        </section>
    );
}
