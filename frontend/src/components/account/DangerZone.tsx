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
} from "@/components/ui/dialog";
import { AlertCircle, Trash2, ShieldAlert } from "lucide-react";
import { ZenLoading } from "@/components/ui/ZenLoading";
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
 <section className="space-y-6 max-w-4xl pt-6 border-t border-white/5 animate-in fade-in slide-in-from-bottom-4 duration-700">
 <div>
 <h2 className="text-2xl md:text-3xl font-semibold text-white tracking-tight mb-1">Danger Zone</h2>
 <p className="text-red-400 text-sm font-medium">Irreversible actions for your account</p>
 </div>

 <div className="bg-[#1c1c1e] p-6 md:p-8 rounded-[2rem] shadow-sm space-y-6 border border-red-500/10">
 <div className="flex items-center justify-between group">
 <div className="flex items-center gap-4">
 <div className="w-10 h-10 rounded-[12px] bg-red-500/10 flex items-center justify-center text-red-500 shadow-sm border border-red-500/20">
 <ShieldAlert size={20} />
 </div>
 <div className="space-y-0.5 max-w-sm">
 <h4 className="text-sm font-semibold text-white">Delete Account</h4>
 <p className="text-xs text-zinc-500 font-medium">Permanently remove your data</p>
 </div>
 </div>

 <Dialog>
 <DialogTrigger asChild>
 <Button variant="outline" className="h-8 bg-black border-rose-500/20 text-rose-500 hover:bg-rose-500/10 hover:text-rose-500 rounded-full font-semibold text-xs px-4 transition-colors shadow-none">
 Delete
 </Button>
 </DialogTrigger>
 <DialogContent className="bg-[#1c1c1e] border border-red-500/20 text-white max-w-sm rounded-[2rem] p-0 overflow-hidden shadow-2xl">
 <div className="p-8 space-y-6">
 <DialogHeader className="space-y-1 text-center items-center">
 <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-4">
 <AlertCircle size={24} />
 </div>
 <DialogTitle className="text-xl font-semibold text-white tracking-tight">Delete Account</DialogTitle>
 <DialogDescription className="text-xs text-zinc-400 font-medium leading-relaxed px-2">
 This action cannot be undone. All data will be permanently erased.
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-5 py-2">
 <div className="space-y-2 text-center">
 <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Type "DELETE" to confirm</label>
 <Input
 value={confirmText}
 onChange={(e) => setConfirmText(e.target.value)}
 className="bg-zinc-800/80 border-0 text-center font-bold tracking-widest text-red-500 rounded-xl focus:ring-1 focus:ring-red-500 h-12"
 placeholder="DELETE"
 />
 </div>

 <Button
 disabled={confirmText !== "DELETE" || isLoading}
 onClick={handleDeleteAccount}
 className="w-full h-11 bg-black hover:bg-rose-500/10 text-rose-500 border border-rose-500/20 font-semibold rounded-full transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-none"
 >
 {isLoading ? <ZenLoading size="xs" className="brightness-200" /> : (
 <>
 <Trash2 size={16} />
 Delete Account
 </>
 )}
 </Button>
 </div>
 </div>
 </DialogContent>
 </Dialog>
 </div>
 </div>
 </section>
 );
}
