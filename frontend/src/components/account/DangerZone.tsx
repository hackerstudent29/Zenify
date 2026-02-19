"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { AlertCircle, Trash2, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";

export function DangerZone() {
    const [confirmText, setConfirmText] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const { logout } = useAuthStore();
    const router = useRouter();

    const handleDeleteAccount = async () => {
        if (confirmText !== "DELETE") return;

        setIsLoading(true);
        try {
            await api.delete("/auth/account");
            logout();
            router.push("/");
        } catch (error) {
            console.error("Account deletion failed", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <section className="space-y-6 pt-12 border-t border-white/5 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="space-y-1">
                <h3 className="text-xl font-semibold text-white">Delete Account</h3>
                <p className="text-sm text-zinc-500 leading-relaxed max-w-xl">
                    Once you delete your account, there is no going back. All your data, tracks, and subscription information will be permanently erased.
                </p>
            </div>

            <Dialog>
                <DialogTrigger asChild>
                    <Button variant="outline" className="h-10 border-red-500/20 text-red-500 hover:bg-red-500/10 hover:border-red-500/40 font-medium px-8 rounded-lg transition-all">
                        Delete Account
                    </Button>
                </DialogTrigger>
                <DialogContent className="bg-zinc-900 border-white/5 text-white max-w-md rounded-[24px]">
                    <DialogHeader className="p-4 space-y-4">
                        <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500">
                            <AlertCircle size={28} />
                        </div>
                        <DialogTitle className="text-xl font-semibold text-white">Delete Account</DialogTitle>
                        <DialogDescription className="text-zinc-400 font-medium leading-relaxed">
                            To protect your account from accidental deletion, searching for "delete" and typing it below is required.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-4 space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-zinc-400">Type "DELETE" to confirm</label>
                            <Input
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                className="bg-black/40 border-white/10 focus:border-red-500/50 text-center font-medium tracking-wide text-red-500 rounded-lg"
                                placeholder="..."
                            />
                        </div>

                        <Button
                            disabled={confirmText !== "DELETE" || isLoading}
                            onClick={handleDeleteAccount}
                            className="w-full h-11 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                                <>
                                    <Trash2 size={16} />
                                    Delete Account
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </section>
    );
}
