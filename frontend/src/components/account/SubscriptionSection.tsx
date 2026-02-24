"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Crown, CreditCard, ArrowRight, CheckCircle2, Zap } from "lucide-react";
import { ZenLoading } from "@/components/ui/ZenLoading";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function SubscriptionSection() {
    const router = useRouter();

    const { data: subscription, isLoading } = useQuery({
        queryKey: ['user-subscription'],
        queryFn: async () => {
            const res = await api.get("/auth/subscription");
            return res.data;
        },
        staleTime: 1000 * 60 * 10, // 10 minutes cache
    });

    const isActive = subscription?.status === 'ACTIVE';

    const handleManageBilling = () => {
        router.push('/pricing');
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-6">
                <ZenLoading size="md" />
                <p className="text-zinc-500 font-bold uppercase tracking-[0.2em] text-[10px] animate-pulse">Accessing your profile...</p>
            </div>
        );
    }

    return (
        <section className="space-y-6 max-w-4xl mx-auto pb-12">
            <div className="flex flex-col gap-1">
                <h2 className="text-xl font-bold text-white tracking-tight">Subscription</h2>
                <p className="text-zinc-500 text-xs font-medium">Manage your membership plan and billing details.</p>
            </div>

            <div className="flex flex-col gap-4">
                {/* Simplified Status Card */}
                <div className="relative overflow-hidden rounded-2xl bg-[#1c1c1e] border border-white/5 p-6 hover:border-rose-500/20 transition-all">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <span className={cn(
                                    "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest",
                                    isActive ? "bg-rose-500/10 text-rose-500" : "bg-zinc-800 text-zinc-500"
                                )}>
                                    {isActive ? 'Premium' : 'Standard'}
                                </span>
                                {isActive && <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">• Billed {subscription.isAnnual ? 'Yearly' : 'Monthly'}</span>}
                            </div>

                            <h3 className="text-2xl font-bold text-white tracking-tight">
                                {isActive ? `Zenify ${subscription.plan}` : 'Free Tier'}
                            </h3>

                            <p className="text-zinc-500 text-xs">
                                {isActive
                                    ? `Active since ${new Date(subscription.createdAt).toLocaleDateString()}`
                                    : 'Your current account has basic features enabled.'}
                            </p>
                        </div>

                        <div className="flex flex-col items-center md:items-end gap-2">
                            <button
                                onClick={handleManageBilling}
                                className="px-6 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-[11px] uppercase tracking-wider transition-all shadow-lg shadow-rose-500/10"
                            >
                                {isActive ? 'Modify Plan' : 'Upgrade Now'}
                            </button>
                            {isActive && (
                                <p className="text-[10px] text-zinc-500 font-medium">
                                    Next bill: {new Date(subscription.expiresAt).toLocaleDateString()}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Grid for Billing & Perks */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#1c1c1e]/50 border border-white/5 rounded-2xl p-5">
                        <h4 className="text-[10px] font-black text-rose-500/60 uppercase tracking-widest mb-4">Payment</h4>
                        {isActive && subscription?.referenceId ? (
                            <div className="space-y-1">
                                <p className="text-sm font-bold text-white">ZenWallet Linked</p>
                                <p className="text-xs text-zinc-500 font-mono">ID: {subscription.referenceId.slice(0, 8)}...</p>
                            </div>
                        ) : (
                            <p className="text-xs text-zinc-500">No payment method connected.</p>
                        )}
                    </div>

                    <div className="bg-[#1c1c1e]/50 border border-white/5 rounded-2xl p-5">
                        <h4 className="text-[10px] font-black text-rose-500/60 uppercase tracking-widest mb-4">Features</h4>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {["Ad-free", "High Fidelity", "Offline", "Unlimited Skips"].map((p) => (
                                <span key={p} className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                                    <div className={cn("w-1 h-1 rounded-full", isActive ? "bg-rose-500" : "bg-zinc-800")} />
                                    {p}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

