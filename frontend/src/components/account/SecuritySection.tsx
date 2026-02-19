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
import { ShieldCheck, Monitor, Smartphone, Globe, LogOut, Loader2, CheckCircle, Keyboard } from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

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
    const [sessions, setSessions] = useState<any[]>([]);
    const [is2FAEnabled, setIs2FAEnabled] = useState(false);
    const [showOTP, setShowOTP] = useState(false);
    const [otpCode, setOtpCode] = useState("");
    const [otpSent, setOtpSent] = useState(false);
    const [sendingOtp, setSendingOtp] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const { register, handleSubmit, reset, formState: { errors } } = useForm({
        resolver: zodResolver(passwordSchema)
    });

    useEffect(() => {
        fetchSessions();
    }, []);

    const fetchSessions = async () => {
        try {
            const res = await api.get("/auth/sessions");
            setSessions(res.data);
        } catch (error) {
            console.error("Failed to fetch sessions", error);
        }
    };

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

    const handleToggle2FA = async (checked: boolean) => {
        if (checked) {
            try {
                await api.post("/auth/request-otp", { email: user?.email });
                setShowOTP(true);
            } catch (error) {
                console.error("Failed to send OTP", error);
            }
        } else {
            setIs2FAEnabled(false);
        }
    };

    const verifyOTP = async () => {
        setIsLoading(true);
        try {
            await api.post("/auth/verify-otp", { email: user?.email, otp: otpCode });
            setIs2FAEnabled(true);
            setShowOTP(false);
            setOtpCode("");
        } catch (error) {
            alert("Invalid OTP code");
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogoutAll = async () => {
        if (!confirm("Are you sure you want to log out from all other devices?")) return;
        try {
            await api.post("/auth/logout"); // This should be updated to a proper logout-all if implemented
            alert("Logged out from other sessions");
            fetchSessions();
        } catch (error) {
            console.error("Logout from all failed", error);
        }
    };

    return (
        <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-16">
                {/* Account Actions */}
                <div className="space-y-8">
                    <div className="space-y-1">
                        <h3 className="text-xl font-semibold text-white tracking-tight">Security Actions</h3>
                        <p className="text-sm text-zinc-500 leading-relaxed max-w-md">
                            Manage your login credentials and account access method.
                        </p>
                    </div>

                    <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center text-accent">
                                    <Keyboard size={24} />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-sm font-bold text-white">Update Password</h4>
                                    <p className="text-[11px] text-zinc-500">Securely change your account password.</p>
                                </div>
                            </div>

                            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button className="bg-accent hover:bg-accent/90 text-white text-xs font-bold uppercase tracking-widest px-6 h-10 rounded-xl">
                                        Update
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-zinc-950 border-white/5 text-white max-w-md rounded-[2rem] p-0 overflow-hidden shadow-2xl">
                                    <div className="p-8 space-y-6">
                                        <DialogHeader className="space-y-2 text-left">
                                            <DialogTitle className="text-2xl font-black text-white tracking-tighter">Reset Password</DialogTitle>
                                            <p className="text-xs text-zinc-500 font-medium">To change your password, we need to verify it's really you.</p>
                                        </DialogHeader>

                                        {!otpSent ? (
                                            <div className="space-y-6 py-4">
                                                <div className="p-4 rounded-2xl bg-accent/5 border border-accent/10 flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                                                        <Globe size={18} />
                                                    </div>
                                                    <div className="space-y-0.5">
                                                        <p className="text-[10px] uppercase font-black tracking-widest text-accent/80">Verification Email</p>
                                                        <p className="text-sm font-bold text-white">{user?.email}</p>
                                                    </div>
                                                </div>
                                                <Button
                                                    onClick={handleRequestPasswordOTP}
                                                    disabled={sendingOtp}
                                                    className="w-full h-12 bg-accent text-white font-bold rounded-2xl shadow-lg shadow-accent/20"
                                                >
                                                    {sendingOtp ? <Loader2 className="animate-spin" /> : "Verify with OTP"}
                                                </Button>
                                            </div>
                                        ) : (
                                            <form onSubmit={handleSubmit(onPasswordSubmit)} className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500">
                                                <div className="space-y-4">
                                                    <div className="space-y-2">
                                                        <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">New Password</Label>
                                                        <Input
                                                            type="password"
                                                            {...register("newPassword")}
                                                            className="h-12 bg-white/5 border-white/10 rounded-xl focus:border-accent/40"
                                                            placeholder="••••••••"
                                                        />
                                                        {errors.newPassword && <p className="text-[10px] text-red-500 ml-1 font-bold">{errors.newPassword.message as string}</p>}
                                                    </div>

                                                    <div className="space-y-2">
                                                        <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Confirm New Password</Label>
                                                        <Input
                                                            type="password"
                                                            {...register("confirmPassword")}
                                                            className="h-12 bg-white/5 border-white/10 rounded-xl focus:border-accent/40"
                                                            placeholder="••••••••"
                                                        />
                                                        {errors.confirmPassword && <p className="text-[10px] text-red-500 ml-1 font-bold">{errors.confirmPassword.message as string}</p>}
                                                    </div>

                                                    <div className="space-y-2">
                                                        <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Security Code</Label>
                                                        <Input
                                                            type="text"
                                                            maxLength={6}
                                                            {...register("otp")}
                                                            className="h-12 bg-white/5 border-white/10 rounded-xl text-center text-xl font-black tracking-[0.5em]"
                                                            placeholder="000000"
                                                        />
                                                        {errors.otp && <p className="text-[10px] text-red-500 ml-1 font-bold">{errors.otp.message as string}</p>}
                                                    </div>
                                                </div>

                                                <Button
                                                    type="submit"
                                                    disabled={isLoading}
                                                    className="w-full h-12 bg-accent text-white font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-accent/20 mt-4"
                                                >
                                                    {isLoading ? <Loader2 className="animate-spin" /> : "Update Password"}
                                                </Button>

                                                <button
                                                    type="button"
                                                    onClick={() => setOtpSent(false)}
                                                    className="w-full text-[10px] uppercase font-black tracking-widest text-zinc-600 hover:text-white transition-colors py-2 cursor-pointer"
                                                >
                                                    Resend Code
                                                </button>
                                            </form>
                                        )}
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </div>

                {/* MFA & Sessions */}
                <div className="space-y-12">
                    <div className="p-6 rounded-3xl bg-accent/5 border border-accent/10 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <ShieldCheck className="text-accent" size={24} />
                                <h4 className="text-sm font-semibold text-white tracking-wide">Multi-factor Auth</h4>
                            </div>
                            <Switch checked={is2FAEnabled} onCheckedChange={handleToggle2FA} />
                        </div>
                        <p className="text-xs text-zinc-400 font-medium leading-relaxed">
                            Verified via: <span className="text-white font-semibold">{user?.email}</span>
                        </p>

                        {showOTP && (
                            <div className="space-y-4 p-4 bg-black/20 rounded-2xl animate-in fade-in zoom-in-95 duration-300">
                                <div className="space-y-2">
                                    <Label className="text-xs font-medium text-zinc-400">One-Time Password</Label>
                                    <Input
                                        value={otpCode}
                                        onChange={(e) => setOtpCode(e.target.value)}
                                        placeholder="000000"
                                        className="bg-black/40 border-accent/20 text-center text-xl font-bold tracking-widest h-12"
                                    />
                                </div>
                                <Button onClick={verifyOTP} disabled={isLoading} className="w-full bg-accent text-white h-10 rounded-xl">
                                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & Enable"}
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-white tracking-wide">Digital Footprint</h3>
                            <button
                                onClick={handleLogoutAll}
                                className="text-[10px] font-bold text-red-500 uppercase tracking-widest hover:text-red-400 transition-colors cursor-pointer"
                            >
                                Kill All Sessions
                            </button>
                        </div>

                        <div className="space-y-4">
                            {sessions.length > 0 ? sessions.map((session: any, i: number) => (
                                <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.01] border border-white/5 group hover:bg-white/[0.02] transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-zinc-400">
                                            {session.device.includes("iPhone") ? <Smartphone size={18} /> : <Monitor size={18} />}
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-bold text-white">{session.device}</p>
                                                {session.active && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 font-bold uppercase">Current</span>}
                                            </div>
                                            <p className="text-[10px] font-medium text-zinc-500">{session.location} • {session.browser}</p>
                                        </div>
                                    </div>
                                    {!session.active && (
                                        <button className="p-2 text-zinc-600 hover:text-red-500 transition-colors cursor-pointer">
                                            <LogOut size={16} />
                                        </button>
                                    )}
                                </div>
                            )) : (
                                <div className="text-center py-8 text-zinc-600 text-sm">
                                    No other active sessions found.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
