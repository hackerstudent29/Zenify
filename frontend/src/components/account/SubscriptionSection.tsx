import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Crown, CreditCard, ArrowRight, Loader2 } from "lucide-react";
import api from "@/lib/api";

export function SubscriptionSection() {
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

    const handleManageBilling = async () => {
        setIsLoading(true);
        try {
            const res = await api.post("/billing/checkout", {
                type: 'SUBSCRIPTION',
                amount: 1500 // $15.00
            });
            if (res.data.paymentUrl) {
                window.location.href = res.data.paymentUrl;
            }
        } catch (error) {
            console.error("Failed to initiate checkout", error);
            alert("Payment system initialization failed. Please try again later.");
        } finally {
            setIsLoading(false);
        }
    };

    const isActive = subscription?.status === 'ACTIVE';

    return (
        <section className="space-y-6 pt-12 border-t border-white/5 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-4xl">
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 text-accent/5 transition-colors group-hover:text-accent/10">
                        <Crown size={64} />
                    </div>

                    <div className="space-y-1">
                        <p className="text-xs font-medium text-accent">Current Status</p>
                        <h3 className="text-2xl font-semibold text-white tracking-tight">
                            {isActive ? `Zenify ${subscription.plan}` : 'No Active Plan'}
                        </h3>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-zinc-500">Plan Type</span>
                            <span className="text-white font-medium">{subscription?.plan || 'Free Tier'}</span>
                        </div>
                        {isActive && (
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-zinc-500">Expires At</span>
                                <span className="text-white font-medium">
                                    {new Date(subscription.expiresAt).toLocaleDateString()}
                                </span>
                            </div>
                        )}
                    </div>

                    <Button
                        onClick={handleManageBilling}
                        disabled={isLoading}
                        className="w-full h-12 bg-accent hover:bg-accent/90 text-white font-medium rounded-xl flex items-center justify-center gap-2 group/btn"
                    >
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                            <>
                                {isActive ? 'Manage Subscription' : 'Upgrade to Premium'}
                                <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1" />
                            </>
                        )}
                    </Button>
                </div>

                <div className="space-y-8">
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-zinc-400">Payment Method</p>
                        {isActive ? (
                            <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
                                <div className="w-10 h-7 bg-zinc-800 rounded flex items-center justify-center">
                                    <CreditCard size={18} className="text-zinc-500" />
                                </div>
                                <div className="space-y-0.5">
                                    <p className="text-sm font-medium text-white tracking-wide">Linked via ZenWallet</p>
                                    <p className="text-[10px] text-zinc-500">Reference: {subscription.referenceId}</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-zinc-500">No payment method linked.</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <p className="text-xs font-medium text-zinc-400">Billing History</p>
                        <p className="text-xs text-zinc-500 leading-relaxed">
                            {isActive ? 'Your billing history is managed through ZenWallet securely.' : 'Clear your billing history by upgrading to a paid plan.'}
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}
