import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Globe, Loader2, Keyboard, ShieldCheck } from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { motion } from "framer-motion";

const passwordSchema = z.object({
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
    otp: z.string().length(6, "OTP must be 6 digits")
}).refine(data => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"]
});

export function SecuritySection() {
    const { user } = useAuthStore();
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [otpSent, setOtpSent] = useState(false);
    const [sendingOtp, setSendingOtp] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const { register, handleSubmit, reset, formState: { errors } } = useForm({
        resolver: zodResolver(passwordSchema)
    });

    const handleRequestPasswordOTP = async () => {
        setSendingOtp(true);
        try {
            await api.post("/auth/request-otp", { email: user?.email });
            setOtpSent(true);
        } catch (error) {
            console.error("Failed to send OTP", error);
            alert("Failed to send security code.");
        } finally {
            setSendingOtp(false);
        }
    };

    const onPasswordSubmit = async (data: any) => {
        setIsLoading(true);
        try {
            await api.put("/auth/password", data);
            setIsSuccess(true);
            reset();
            setOtpSent(false);
            setIsDialogOpen(false);
            setTimeout(() => setIsSuccess(false), 3000);
        } catch (error: any) {
            console.error("Password change failed", error);
            alert(error.response?.data?.message || "Verification failed. Check your security code.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <section className="space-y-6 max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div>
                <h2 className="text-2xl md:text-3xl font-semibold text-white tracking-tight mb-1">Security</h2>
                <p className="text-zinc-500 text-sm font-medium">Manage your credentials</p>
            </div>

            <div className="bg-[#1c1c1e] p-6 md:p-8 rounded-[2rem] shadow-sm space-y-6">
                <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-[12px] bg-zinc-800 flex items-center justify-center text-pink-500 shadow-sm border border-white/5">
                            <ShieldCheck size={20} />
                        </div>
                        <div className="space-y-0.5">
                            <h4 className="text-sm font-semibold text-white">Account Password</h4>
                            <p className="text-xs text-zinc-500 font-medium">Update to keep your account safe</p>
                        </div>
                    </div>

                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant="secondary" className="bg-white/10 hover:bg-white/20 text-white rounded-full font-semibold text-xs h-8 px-4 border-0 transition-colors">
                                Update
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-[#1c1c1e] border border-white/10 text-white max-w-sm rounded-[2rem] p-0 overflow-hidden shadow-2xl">
                            <div className="p-8 space-y-6">
                                <DialogHeader className="space-y-1 text-center items-center">
                                    <div className="w-12 h-12 bg-pink-500/20 text-pink-500 rounded-full flex items-center justify-center mb-4">
                                        <ShieldCheck size={24} />
                                    </div>
                                    <DialogTitle className="text-xl font-semibold text-white tracking-tight">Protect Account</DialogTitle>
                                    <p className="text-xs text-zinc-400 font-medium">Verify your identity to proceed.</p>
                                </DialogHeader>

                                {!otpSent ? (
                                    <div className="space-y-5 py-2">
                                        <div className="p-4 rounded-[1rem] bg-zinc-800/50 flex flex-col items-center gap-2 text-center">
                                            <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Target Email</p>
                                            <p className="text-sm font-bold text-white">{user?.email}</p>
                                        </div>
                                        <Button
                                            onClick={handleRequestPasswordOTP}
                                            disabled={sendingOtp}
                                            className="w-full h-12 bg-pink-500 hover:bg-pink-600 text-white font-semibold rounded-full transition-colors"
                                        >
                                            {sendingOtp ? <Loader2 className="animate-spin h-5 w-5" /> : "Send Code"}
                                        </Button>
                                    </div>
                                ) : (
                                    <form onSubmit={handleSubmit(onPasswordSubmit)} className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500">
                                        <div className="space-y-4">
                                            <div className="space-y-1.5">
                                                <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">New Password</Label>
                                                <Input
                                                    type="password"
                                                    {...register("newPassword")}
                                                    className="h-11 bg-zinc-800/50 border-0 rounded-xl focus:ring-1 focus:ring-pink-500 text-sm font-medium px-4"
                                                    placeholder="••••••••"
                                                />
                                                {errors.newPassword && <p className="text-[10px] text-red-500 ml-1 font-bold">{errors.newPassword.message as string}</p>}
                                            </div>

                                            <div className="space-y-1.5">
                                                <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Confirm Password</Label>
                                                <Input
                                                    type="password"
                                                    {...register("confirmPassword")}
                                                    className="h-11 bg-zinc-800/50 border-0 rounded-xl focus:ring-1 focus:ring-pink-500 text-sm font-medium px-4"
                                                    placeholder="••••••••"
                                                />
                                                {errors.confirmPassword && <p className="text-[10px] text-red-500 ml-1 font-bold">{errors.confirmPassword.message as string}</p>}
                                            </div>

                                            <div className="space-y-1.5">
                                                <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1 text-center block">Security Code</Label>
                                                <Input
                                                    type="text"
                                                    maxLength={6}
                                                    {...register("otp")}
                                                    className="h-12 bg-zinc-800/80 border-0 rounded-xl text-center text-lg font-bold tracking-[0.5em] focus:ring-1 focus:ring-pink-500"
                                                    placeholder="000000"
                                                />
                                                {errors.otp && <p className="text-[10px] text-red-500 ml-1 font-bold text-center pl-0">{errors.otp.message as string}</p>}
                                            </div>
                                        </div>

                                        <div className="pt-2">
                                            <Button
                                                type="submit"
                                                disabled={isLoading}
                                                className="w-full h-11 bg-pink-500 hover:bg-pink-600 text-white font-semibold rounded-full transition-colors mb-2"
                                            >
                                                {isLoading ? <Loader2 className="animate-spin h-5 w-5" /> : "Save Password"}
                                            </Button>

                                            <button
                                                type="button"
                                                onClick={() => setOtpSent(false)}
                                                className="w-full text-[10px] uppercase font-bold tracking-widest text-zinc-500 hover:text-white transition-colors py-2 cursor-pointer text-center"
                                            >
                                                Resend Code
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>
        </section>
    );
}
