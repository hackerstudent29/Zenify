import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Crown, CreditCard, ArrowRight, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export function SubscriptionSection() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [subscription, setSubscription] = useState<any>(null);

    useEffect(() => {
        fetchSubscription();
    }, []);

    const fetchSubscription = async () => {
        try {
            const res = await api.get("/auth/subscription");
            setSubscription(res.data);
        } catch (error) {
            console.error("Failed to fetch subscription", error);
        }
    };

    const isActive = subscription?.status === 'ACTIVE';

    const handleManageBilling = () => {
        router.push('/pricing');
    };

    return (
        <section className="space-y-6 max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div>
                <h2 className="text-2xl md:text-3xl font-semibold text-white tracking-tight mb-1">Subscription</h2>
                <p className="text-zinc-500 text-sm font-medium">Manage your plan and billing</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Plan Card */}
                <div className="bg-[#1c1c1e] p-6 md:p-8 rounded-[2rem] shadow-sm space-y-8 relative overflow-hidden group">
                    <div className="absolute -top-4 -right-4 text-pink-500/5 group-hover:text-pink-500/10 transition-colors pointer-events-none">
                        <Crown size={120} />
                    </div>

                    <div className="space-y-2 relative z-10 w-full mb-8">
                        <div className="flex items-center gap-2">
                            <p className="text-[10px] font-bold text-pink-500 uppercase tracking-widest">Current Status</p>
                            <span className="bg-pink-500 text-white text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full shadow-lg">
                                Your Plan
                            </span>
                        </div>
                        <h3 className="text-3xl md:text-4xl font-semibold text-white tracking-tight mt-1">
                            {isActive ? `Zenify ${subscription.plan}` : 'Eclipse (Free Tier)'}
                        </h3>
                    </div>

                    <div className="space-y-4 relative z-10 hidden md:block pb-4">
                        <div className="flex items-center justify-between text-sm pb-3 border-b border-white/5">
                            <span className="text-zinc-500 font-medium">Plan Type</span>
                            <span className="text-white font-semibold">{subscription?.plan || 'Standard'}</span>
                        </div>
                        {isActive && (
                            <div className="flex items-center justify-between text-sm pb-3 border-b border-white/5">
                                <span className="text-zinc-500 font-medium">Expires At</span>
                                <span className="text-white font-semibold flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                    {new Date(subscription.expiresAt).toLocaleDateString()}
                                </span>
                            </div>
                        )}
                    </div>

                    <Button
                        onClick={handleManageBilling}
                        disabled={isLoading}
                        className="w-full h-12 bg-pink-500 hover:bg-pink-600 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-colors relative z-10"
                    >
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                            <>
                                {isActive ? 'Manage Subscription' : 'Upgrade to Premium'}
                                <ArrowRight size={16} />
                            </>
                        )}
                    </Button>
                </div>

                {/* Billing Details */}
                <div className="bg-[#1c1c1e] p-6 md:p-8 rounded-[2rem] shadow-sm space-y-8">
                    <div className="space-y-3">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-white/5 pb-2">Payment Method</p>
                        {isActive && subscription?.referenceId ? (
                            <div className="flex items-center gap-4 bg-zinc-800/50 p-4 rounded-[1.25rem] border border-white/5">
                                <div className="w-12 h-8 bg-zinc-900 rounded-[6px] flex items-center justify-center shadow-inner">
                                    <CreditCard size={16} className="text-zinc-400" />
                                </div>
                                <div className="space-y-0.5">
                                    <p className="text-sm font-semibold text-white tracking-wide">ZenWallet Linked</p>
                                    <p className="text-[10px] text-zinc-500 font-medium truncate max-w-[120px]">Ref: {subscription.referenceId}</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-zinc-500 font-medium pt-2">No active payment method linked.</p>
                        )}
                    </div>

                    <div className="space-y-3">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-white/5 pb-2">Billing History</p>
                        <p className="text-xs text-zinc-400 leading-relaxed font-medium pt-2">
                            {isActive ? 'Your billing history and invoices are managed securely through ZenWallet. Please check your wallet dashboard for details.' : 'Upgrade your account to view your billing history and manage invoices.'}
                        </p>
                    </div>
                </div>

            </div>
        </section>
    );
}
