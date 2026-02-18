"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import { User, Lock, Mail, Shield } from "lucide-react";
import { motion } from "framer-motion";

export default function ProfilePage() {
    const { user, logout, isAuthenticated } = useAuthStore();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [passwordData, setPasswordData] = useState({
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    const handleLogout = async () => {
        try {
            await api.post("/auth/logout");
        } catch (error) {
            console.error("Logout failed", error);
        }
        logout();
        router.push('/login');
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setMessage({ type: 'error', text: "New passwords do not match" });
            return;
        }

        setLoading(true);
        try {
            await api.put('/auth/password', {
                oldPassword: passwordData.oldPassword,
                newPassword: passwordData.newPassword
            });
            setMessage({ type: 'success', text: "Password updated successfully!" });
            setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
        } catch (err: any) {
            setMessage({ type: 'error', text: err.response?.data?.message || "Failed to update password" });
        } finally {
            setLoading(false);
        }
    };

    if (!isAuthenticated || !user) {
        return <div className="p-8 text-center text-zinc-500 animate-pulse uppercase tracking-widest text-xs font-bold mt-20">Verifying Identity...</div>;
    }

    return (
        <div className="max-w-2xl mx-auto space-y-8 pt-8">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-6"
            >
                <div className="w-24 h-24 bg-gradient-to-br from-primary to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-4xl font-bold text-white">{user.email[0].toUpperCase()}</span>
                </div>
                <div>
                    <h1 className="text-3xl font-bold">{user.email.split('@')[0]}</h1>
                    <p className="text-zinc-400">{user.email}</p>
                    <div className="flex items-center gap-2 mt-2">
                        <span className="px-2.5 py-1 rounded-full bg-accent-dim text-accent text-[10px] font-bold uppercase tracking-widest">
                            {user.role}
                        </span>
                    </div>
                </div>
                <Button variant="destructive" className="ml-auto" onClick={handleLogout}>
                    Sign Out
                </Button>
            </motion.div>

            <div className="grid gap-6">
                <Card className="p-6 space-y-4 section-glow animate-slide-up">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <Shield className="w-5 h-5 text-primary" />
                        Account Details
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1">
                            <label className="text-sm text-zinc-400">Email</label>
                            <div className="flex items-center gap-2 p-3 bg-surface-hover/50 rounded-xl shadow-sm">
                                <Mail className="w-4 h-4 text-muted" />
                                <span className="text-sm">{user.email}</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm text-zinc-400">User ID</label>
                            <div className="flex items-center gap-2 p-3 bg-surface-hover/50 rounded-xl font-mono text-xs shadow-sm">
                                <User className="w-4 h-4 text-muted" />
                                <span className="truncate">{user.id}</span>
                            </div>
                        </div>
                    </div>
                </Card>

                <Card className="p-6 space-y-4 section-glow animate-slide-up [animation-delay:100ms]">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <Lock className="w-5 h-5 text-primary" />
                        Change Password
                    </h2>

                    {message && (
                        <div className={`p-3 rounded-md text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                            {message.text}
                        </div>
                    )}

                    <form onSubmit={handlePasswordChange} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Current Password</label>
                            <Input
                                type="password"
                                required
                                value={passwordData.oldPassword}
                                onChange={e => setPasswordData({ ...passwordData, oldPassword: e.target.value })}
                            />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">New Password</label>
                                <Input
                                    type="password"
                                    required
                                    minLength={8}
                                    value={passwordData.newPassword}
                                    onChange={e => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Confirm Password</label>
                                <Input
                                    type="password"
                                    required
                                    minLength={8}
                                    value={passwordData.confirmPassword}
                                    onChange={e => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                                />
                            </div>
                        </div>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Updating...' : 'Update Password'}
                        </Button>
                    </form>
                </Card>
            </div>
        </div>
    );
}
