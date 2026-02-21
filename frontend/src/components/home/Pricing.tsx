"use client";
import React, { useState } from "react";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

const Pricing = ({ currentPlan = "Eclipse", forceShowAll = false, showTitle = true }: { currentPlan?: string, forceShowAll?: boolean, showTitle?: boolean }) => {
    const [isAnnual, setIsAnnual] = useState(false);
    const { isAuthenticated } = useAuthStore();
    const [isCheckingOut, setIsCheckingOut] = useState<string | null>(null);

    const planHierarchy: Record<string, number> = { "Eclipse": 0, "Premium": 1 };
    const currentTier = planHierarchy[currentPlan] ?? 0;

    const plans = [
        {
            name: "Eclipse",
            price: "₹0",
            description: "Standard listening with ads.",
            features: [
                "Unlimited streaming",
                "Standard audio quality",
                "Community support"
            ],
            cta: currentPlan === "Eclipse" ? "Current Plan" : "Downgrade",
        },
        {
            name: "Premium",
            price: isAnnual ? "₹950" : "₹99",
            description: "Ad-free. High-quality audio.",
            features: [
                "Everything in Eclipse",
                "Lossless HQ Audio",
                "Early access",
                "Priority support",
                "Direct artist access"
            ],
            cta: currentPlan === "Premium" ? "Current Plan" : "Upgrade Now",
            highlighted: true,
        },
    ];

    const handleCheckout = async (plan: any) => {
        if (!isAuthenticated) {
            window.location.href = "/login";
            return;
        }
        if (plan.name === "Eclipse" || currentPlan === plan.name) return;

        setIsCheckingOut(plan.name);
        try {
            const priceValue = parseInt(plan.price.replace(/[₹,]/g, ""));

            const res = await api.post("/billing/checkout", {
                type: "SUBSCRIPTION",
                amount: priceValue,
                metadata: { plan: plan.name, isAnnual }
            });
            if (res.data.paymentUrl) window.location.href = res.data.paymentUrl;
        } catch (error) {
            console.error("Checkout failed:", error);
        } finally {
            setIsCheckingOut(null);
        }
    };

    return (
        <div className="w-full max-w-4xl mx-auto">
            {/* Apple Style Segmented Picker */}
            <div className="flex justify-center mb-12">
                <div className="bg-white/[0.05] p-1 rounded-lg flex items-center border border-white/5">
                    <button
                        onClick={() => setIsAnnual(false)}
                        className={cn(
                            "px-6 py-1.5 rounded-md text-[13px] font-semibold transition-all",
                            !isAnnual ? "bg-white/10 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                        )}
                    >
                        Monthly
                    </button>
                    <button
                        onClick={() => setIsAnnual(true)}
                        className={cn(
                            "px-6 py-1.5 rounded-md text-[13px] font-semibold transition-all",
                            isAnnual ? "bg-white/10 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                        )}
                    >
                        Yearly
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
                {plans.map((plan) => (
                    <div
                        key={plan.name}
                        className={cn(
                            "relative flex flex-col p-8 rounded-2xl transition-all duration-300",
                            "bg-[#1c1c1e] border",
                            plan.name === currentPlan
                                ? "border-red-500 shadow-2xl shadow-red-500/10"
                                : plan.highlighted
                                    ? "border-white/10 shadow-lg ring-1 ring-white/5"
                                    : "border-white/5 opacity-90"
                        )}
                    >
                        {plan.name === currentPlan && (
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-lg whitespace-nowrap z-10">
                                Your Current Plan
                            </div>
                        )}
                        <div className="mb-auto">
                            <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1">{plan.name}</h3>
                            <div className="flex items-baseline gap-1 mb-4">
                                <span className="text-3xl font-bold text-white tracking-tight">{plan.price}</span>
                                {plan.price !== "₹0" && <span className="text-zinc-500 text-sm font-medium">/{isAnnual ? 'year' : 'month'}</span>}
                            </div>
                            <p className="text-sm text-zinc-400 font-medium leading-normal mb-8">{plan.description}</p>

                            <div className="space-y-4 mb-8">
                                {plan.features.map((feature, i) => (
                                    <div key={i} className="flex items-start gap-3">
                                        <Check size={16} className={cn("mt-0.5 shrink-0", plan.name === currentPlan ? "text-red-500" : "text-red-500")} />
                                        <span className="text-sm text-zinc-300 leading-snug">{feature}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={() => handleCheckout(plan)}
                            disabled={isCheckingOut === plan.name || plan.name === currentPlan}
                            className={cn(
                                "w-full py-3 rounded-full text-sm font-bold transition-all flex items-center justify-center gap-2",
                                plan.name === currentPlan
                                    ? "bg-zinc-800 text-zinc-400 cursor-default"
                                    : "bg-white text-black hover:bg-zinc-200 shadow-lg"
                            )}
                        >
                            {isCheckingOut === plan.name ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <>
                                    {plan.cta}
                                </>
                            )}
                        </button>
                    </div>
                ))}
            </div>

            <div className="mt-16 text-center">
                <p className="text-[13px] text-zinc-500 max-w-lg mx-auto leading-relaxed">
                    Subscription auto-renews until cancelled. Price includes applicable taxes.
                </p>
                <button className="mt-4 text-red-500 text-[13px] font-semibold hover:underline flex items-center gap-1 mx-auto">
                    Learn more about Zenify Premium <ChevronRight size={14} />
                </button>
            </div>
        </div>
    );
};

export default Pricing;
