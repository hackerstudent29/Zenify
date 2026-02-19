"use client";
import React, { useState } from "react";
import { Check, Sparkles, Zap, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

const Pricing = ({ showTitle = true }) => {
    const [isAnnual, setIsAnnual] = useState(false);

    const plans = [
        {
            name: "Eclipse",
            price: "₹0",
            description: "Standard listener experience",
            icon: <Zap className="text-zinc-600" size={18} />,
            features: [
                "Unlimited streaming access",
                "Standard audio quality",
                "Community support",
            ],
            cta: "Current Plan",
            isFree: true,
        },
        {
            name: "Stellar",
            price: isAnnual ? "₹950" : "₹99",
            description: "For the dedicated audiophile",
            icon: <Sparkles className="text-emerald-500" size={18} />,
            features: [
                "Everything in Eclipse",
                "Lossless HQ Audio",
                "Early access to drafts",
                "Priority support",
            ],
            cta: "Upgrade to Stellar",
            highlighted: true,
        },
        {
            name: "Cosmic",
            price: isAnnual ? "₹2,880" : "₹299",
            description: "For creators & professionals",
            icon: <Crown className="text-purple-500" size={18} />,
            features: [
                "Everything in Stellar",
                "Commercial use license",
                "Custom remix requests",
                "Direct artist access",
            ],
            cta: "Go Cosmic",
            highlighted: false,
        },
    ];

    const { isAuthenticated } = useAuthStore();
    const [isCheckingOut, setIsCheckingOut] = useState<string | null>(null);

    const handleCheckout = async (plan: any) => {
        if (!isAuthenticated) {
            window.location.href = "/login";
            return;
        }

        if (plan.isFree) return;

        setIsCheckingOut(plan.name);
        try {
            const amount = parseInt(plan.price.replace(/[₹,]/g, ""));
            const res = await api.post("/billing/checkout", {
                type: "SUBSCRIPTION",
                amount: amount,
                metadata: { plan: plan.name, isAnnual }
            });

            if (res.data.paymentUrl) {
                window.location.href = res.data.paymentUrl;
            } else {
                alert("Failed to get payment link. Please try again.");
            }
        } catch (error) {
            console.error("Checkout failed:", error);
            alert("Checkout connection failed. Please check your internet or try later.");
        } finally {
            setIsCheckingOut(null);
        }
    };

    return (
        <div className="w-full font-sans text-zinc-100">
            {showTitle && (
                <div className="text-center mb-12">
                    <h2 className="text-4xl font-bold tracking-tight text-white mb-3">
                        Upgrade Your Experience
                    </h2>
                    <p className="text-zinc-500 text-sm">Choose the plan that fits your listening style</p>
                </div>
            )}

            {/* Clean Toggle */}
            <div className="flex items-center justify-center gap-4 mb-16">
                <span className={cn("text-xs font-medium transition-colors", !isAnnual ? "text-white" : "text-zinc-500")}>Monthly</span>
                <button
                    onClick={() => setIsAnnual(!isAnnual)}
                    className="w-11 h-6 rounded-full bg-zinc-800 p-1 transition-all flex items-center border border-white/5"
                >
                    <div className={cn("w-4 h-4 rounded-full transition-all shadow-sm", isAnnual ? "translate-x-5 bg-emerald-500" : "translate-x-0 bg-zinc-400")} />
                </button>
                <div className="flex items-center gap-2">
                    <span className={cn("text-xs font-medium transition-colors", isAnnual ? "text-emerald-500" : "text-zinc-500")}>Annual</span>
                    <span className="bg-emerald-500/10 text-emerald-500 text-[10px] px-2 py-0.5 rounded-full font-bold">SAVE 20%</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                {plans.map((plan) => (
                    <div
                        key={plan.name}
                        className={cn(
                            "relative p-8 rounded-3xl border transition-all duration-300 flex flex-col h-full bg-zinc-900/50 backdrop-blur-sm",
                            plan.highlighted
                                ? "border-emerald-500/30 ring-1 ring-emerald-500/20"
                                : "border-white/5"
                        )}
                    >
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-6">
                                <span className={cn(
                                    "text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md bg-zinc-800",
                                    plan.highlighted ? "text-emerald-400" : "text-zinc-400"
                                )}>
                                    {plan.name}
                                </span>
                                {plan.icon}
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className="text-5xl font-bold text-white tracking-tight">{plan.price}</span>
                                {plan.price !== "₹0" && <span className="text-zinc-500 text-xs font-medium">/{isAnnual ? 'year' : 'month'}</span>}
                            </div>
                            <p className="text-zinc-400 text-xs mt-3 leading-relaxed">{plan.description}</p>
                        </div>

                        <div className="space-y-4 mb-10 flex-grow">
                            {plan.features.map((feature, i) => (
                                <div key={i} className="flex items-center gap-3 text-zinc-300">
                                    <Check className={cn("w-3.5 h-3.5", plan.highlighted ? "text-emerald-500" : "text-zinc-600")} strokeWidth={3} />
                                    <span className="text-sm">{feature}</span>
                                </div>
                            ))}
                        </div>

                        <Button
                            onClick={() => handleCheckout(plan)}
                            disabled={isCheckingOut === plan.name}
                            variant={plan.highlighted ? "default" : "secondary"}
                            className={cn(
                                "w-full h-12 rounded-xl font-bold text-xs uppercase tracking-wide transition-all",
                                plan.highlighted ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-white"
                            )}
                        >
                            {isCheckingOut === plan.name ? "Connecting..." : plan.cta}
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Pricing;
