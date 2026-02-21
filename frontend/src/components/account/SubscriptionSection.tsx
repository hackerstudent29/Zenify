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
                <div className="bg-[#1c1c1e] p-5 md:p-6 rounded-[1.5rem] shadow-sm flex flex-col relative overflow-hidden group">
                    <div className="absolute -top-4 -right-2 text-rose-500/5 group-hover:text-rose-500/10 transition-colors pointer-events-none">
                        <Crown size={100} />
                    </div>

                    <div className="space-y-1.5 relative z-10 w-full mb-6">
                        <div className="flex items-center gap-1.5">
                            <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">Current Status</p>
                            <span className="bg-rose-500 text-white text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full shadow-lg">
                                Your Plan
                            </span>
                        </div>
                        <h3 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">
                            {isActive ? `Zenify ${subscription.plan} ${subscription.isAnnual ? '(Yearly)' : '(Monthly)'}` : 'Eclipse (Free Tier)'}
                        </h3>
                    </div>

                    <div className="space-y-3 relative z-10 hidden md:block mb-auto">
                        <div className="flex items-center justify-between text-sm pb-2 border-b border-white/5">
                            <span className="text-zinc-500 font-medium">Plan Type</span>
                            <span className="text-white font-semibold">{subscription?.plan || 'Standard'}</span>
                        </div>
                        {isActive && (
                            <div className="flex items-center justify-between text-sm pb-2 border-b border-white/5">
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
                        className="w-full mt-6 h-11 bg-rose-500 hover:bg-rose-600 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-colors relative z-10"
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
                <div className="bg-[#1c1c1e] p-5 md:p-6 rounded-[1.5rem] shadow-sm flex flex-col gap-6">
                    <div className="space-y-2.5">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-white/5 pb-2">Payment Method</p>
                        {isActive && subscription?.referenceId ? (
                            <div className="flex items-center gap-3 bg-zinc-800/50 p-3 rounded-[1rem] border border-white/5">
                                <div className="w-10 h-7 bg-zinc-900 rounded-[4px] flex items-center justify-center shadow-inner">
                                    <CreditCard size={14} className="text-zinc-400" />
                                </div>
                                <div className="space-y-0">
                                    <p className="text-sm font-semibold text-white tracking-wide">ZenWallet Linked</p>
                                    <p className="text-[10px] text-zinc-500 font-medium truncate max-w-[150px]">Ref: {subscription.referenceId}</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-zinc-500 font-medium pt-1">No active payment method linked.</p>
                        )}
                    </div>

                    <div className="space-y-2.5">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-white/5 pb-2">Billing History</p>
                        <p className="text-xs text-zinc-400 leading-relaxed font-medium pt-1">
                            {isActive ? 'Your billing history and invoices are managed securely through ZenWallet. Please check your wallet dashboard for details.' : 'Upgrade your account to view your billing history and manage invoices.'}
                        </p>
                    </div>
                </div>

            </div>
        </section>
    );
}
