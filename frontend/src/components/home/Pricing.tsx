"use client";
import React, { useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { ZenLoading } from "@/components/ui/ZenLoading";

const Pricing = ({ currentPlan = "Eclipse", currentPlanIsAnnual = false, forceShowAll = false, showTitle = true }: { currentPlan?: string, currentPlanIsAnnual?: boolean, forceShowAll?: boolean, showTitle?: boolean }) => {
    const [isAnnual, setIsAnnual] = useState(false);
    const { isAuthenticated } = useAuthStore();
    const [isCheckingOut, setIsCheckingOut] = useState<string | null>(null);

    const planHierarchy: Record<string, number> = { "Eclipse": 0, "Premium": 1, "Cosmic": 2 };
    const currentTier = planHierarchy[currentPlan] ?? 0;

    const getPlanCTA = (planName: string, isPlanAnnual: boolean) => {
        const isCurrentExactPlan = planName === currentPlan && (planName === "Eclipse" || isPlanAnnual === currentPlanIsAnnual);
        if (isCurrentExactPlan) return "Current Plan";

        const planTier = planHierarchy[planName] ?? 0;
        if (planTier > currentTier) return "Upgrade Now";
        if (planTier < currentTier) return "Downgrade";
        return "Switch Plan";
    };

    const isPlanDisabled = (planName: string, isPlanAnnual: boolean) => {
        const isCurrentExactPlan = planName === currentPlan && (planName === "Eclipse" || isPlanAnnual === currentPlanIsAnnual);
        if (isCheckingOut === planName) return true;
        if (isCurrentExactPlan) return true;
        return false;
    };

    const isCurrentExactPlanCheck = (planName: string) => {
        return planName === currentPlan && (planName === "Eclipse" || isAnnual === currentPlanIsAnnual);
    };

    const plans = [
        {
            name: "Eclipse",
            price: "₹0",
            description: "Your Entry Into the Soundscape. Perfect for everyday listeners who want uninterrupted music.",
            features: [
                "Access to millions of songs",
                "Ad-free streaming",
                "High-quality audio",
                "Multi-device playback",
                "Playlist creation & library sync"
            ],
            bestFor: "Casual listeners who want clean, unlimited streaming.",
            highlighted: false,
        },
        {
            name: "Premium",
            price: isAnnual ? "₹950" : "₹99",
            description: "Studio-Grade Listening Experience. For those who care about detail, depth, and dynamic range.",
            features: [
                "Everything in Eclipse, plus:",
                "Lossless HQ Audio Engine",
                "Enhanced bass clarity & spatial depth",
                "Early access to new features",
                "Priority streaming performance",
                "Advanced equalizer controls"
            ],
            bestFor: "Audiophiles and serious music lovers.",
            highlighted: true,
        },
        {
            name: "Cosmic",
            price: isAnnual ? "₹2,880" : "₹299",
            description: "Built for the Modern Music Creator. Not just listening — creating.",
            features: [
                "Everything in Premium, plus:",
                "Commercial usage rights",
                "Direct artist collaboration tools",
                "Professional creative suite",
                "High-resolution export support",
                "Early access to experimental tools"
            ],
            bestFor: "Remixers, producers, and creative visionaries.",
            highlighted: false,
        },
    ];

    const handleCheckout = async (plan: any) => {
        if (!isAuthenticated) {
            window.location.href = "/login";
            return;
        }
        if (plan.name === "Eclipse" || isCurrentExactPlanCheck(plan.name)) return;

        setIsCheckingOut(plan.name);
        try {
            const priceValue = parseInt(plan.price.replace(/[₹,]/g, "")) * 100;

            const res = await api.post("/billing/checkout", {
                type: "SUBSCRIPTION",
                amount: priceValue,
                metadata: { plan: plan.name, isAnnual }
            });

            const order = res.data;

            const handleSuccess = async (response: any) => {
                try {
                    // ZenWallet2 sends: { payment_id, order_id, signature }
                    const verifyRes = await api.post("/billing/verify", {
                        orderId: response.order_id || order.orderId,
                        paymentId: response.payment_id,
                        signature: response.signature
                    });

                    if (verifyRes.data.status === "SUCCESS") {
                        window.location.href = "/account?status=success";
                    } else {
                        alert("Payment verification failed. Please contact support.");
                    }
                } catch (err) {
                    console.error("Verification failed:", err);
                    alert("An error occurred during payment verification.");
                }
            };

            const handleFailure = (err: any) => {
                console.error("Payment failed:", err);
                alert("Payment failed: " + (err?.error || err?.message || "Cancelled or declined."));
                setIsCheckingOut(null);
            };

            // ZenWallet SDK initialization - Dynamic Injection Fix
            const initSDK = async () => {
                const publicKey = process.env.NEXT_PUBLIC_ZENWALLET_PUBLIC_KEY || "pk_live_1920b1c7098c2180c706e6fdcbea";

                if (!window.ZenWallet && !(window as any).ZenPay) {
                    console.log("Loading ZenWallet SDK dynamically...");
                    try {
                        await new Promise((resolve, reject) => {
                            const script = document.createElement('script');
                            script.src = 'https://zenpay-jshp.onrender.com/zenwallet-sdk.js';
                            script.async = true;
                            script.onload = resolve;
                            script.onerror = reject;
                            document.head.appendChild(script);
                        });
                    } catch (e) {
                        console.error('Failed to load ZenWallet SDK. Check your network.');
                        alert("Failed to load secure payment gateway. Please check your connection.");
                        setIsCheckingOut(null);
                        return;
                    }
                }

                const SDK = (window as any).ZenWallet || (window as any).ZenPay;
                if (!SDK) {
                    alert("ZenWallet SDK not initialized.");
                    setIsCheckingOut(null);
                    return;
                }

                // Now it is 100% guaranteed to be initialized
                const zen = new SDK({
                    key: publicKey,
                    onSuccess: (res: any) => {
                        console.log('Payment Verified:', res);
                        handleSuccess(res);
                    },
                    onFailure: (err: any) => {
                        console.error('Payment Failed:', err);
                        handleFailure(err);
                    }
                });
                zen.open({ order_id: order.orderId });
            };

            await initSDK();
        } catch (error) {
            console.error("Checkout failed:", error);
            setIsCheckingOut(null);
        }
    };

    return (
        <div className="w-full max-w-5xl mx-auto">
            {/* Segmented Billing Toggle */}
            <div className="flex justify-center mb-10">
                <div className="bg-white/[0.05] p-1 rounded-xl flex items-center border border-white/5 relative">
                    <button
                        onClick={() => setIsAnnual(false)}
                        className={cn(
                            "relative px-6 py-2 rounded-lg text-[12px] font-[family-name:var(--font-plus-jakarta)] font-semibold transition-colors duration-300 z-10",
                            !isAnnual ? "text-white" : "text-zinc-500 hover:text-zinc-300"
                        )}
                    >
                        {!isAnnual && (
                            <motion.div
                                layoutId="billing-pill"
                                className="absolute inset-0 bg-white/10 rounded-lg shadow-sm"
                                transition={{ type: "spring", bounce: 0.1, duration: 0.5 }}
                            />
                        )}
                        <span className="relative z-20">Monthly</span>
                    </button>
                    <button
                        onClick={() => setIsAnnual(true)}
                        className={cn(
                            "relative px-6 py-2 rounded-lg text-[12px] font-[family-name:var(--font-plus-jakarta)] font-semibold transition-colors duration-300 z-10",
                            isAnnual ? "text-white" : "text-zinc-500 hover:text-zinc-300"
                        )}
                    >
                        {isAnnual && (
                            <motion.div
                                layoutId="billing-pill"
                                className="absolute inset-0 bg-white/10 rounded-lg shadow-sm"
                                transition={{ type: "spring", bounce: 0.1, duration: 0.5 }}
                            />
                        )}
                        <span className="relative z-20">Yearly</span>
                    </button>
                </div>
            </div>

            <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={{
                    hidden: { opacity: 0 },
                    visible: {
                        opacity: 1,
                        transition: {
                            staggerChildren: 0.2
                        }
                    }
                }}
                className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto"
            >
                {plans.map((plan) => (
                    <motion.div
                        key={plan.name}
                        variants={{
                            hidden: { opacity: 0, scale: 0.98, y: 30 },
                            visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 1, ease: [0.16, 1, 0.3, 1] } }
                        }}
                        whileHover={{ y: -8, transition: { duration: 0.4 } }}
                        className={cn(
                            "relative flex flex-col p-6 md:p-8 rounded-[2rem] transition-all duration-1000 backdrop-blur-3xl group",
                            isCurrentExactPlanCheck(plan.name)
                                ? "bg-red-500/[0.03] border-[2px] border-red-500/50 shadow-[0_40px_100px_-20px_rgba(239,68,68,0.2)]"
                                : plan.highlighted
                                    ? "bg-white/[0.03] border border-white/[0.1] shadow-[0_40px_100px_-20px_rgba(255,255,255,0.05)]"
                                    : "bg-white/[0.01] border border-white/[0.05] opacity-80 hover:opacity-100"
                        )}
                    >
                        {/* Red Top Border Line */}
                        {isCurrentExactPlanCheck(plan.name) && (
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-[3px] bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)] z-20" />
                        )}

                        {isCurrentExactPlanCheck(plan.name) && (
                            <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-5 py-2 rounded-full bg-red-600 shadow-[0_8px_24px_rgba(239,68,68,0.4)] whitespace-nowrap z-30 animate-in fade-in zoom-in duration-500 border border-red-400/50">
                                <span className="text-[10px] font-[family-name:var(--font-outfit)] font-black uppercase tracking-[0.3em] text-white">
                                    Your Active Plan
                                </span>
                            </div>
                        )}
                        <div className="mb-auto">
                            <h3 className="text-[14px] font-brand text-zinc-500 uppercase mb-3 transition-colors font-medium">
                                {plan.name === "Eclipse" ? (
                                    <span className="inline-flex gap-[0.4em]">
                                        {"ECLIPSE".split('').map((char, i) => <span key={i}>{char}</span>)}
                                    </span>
                                ) : (
                                    <span className={cn("tracking-[0.3em]", plan.name === "Premium" && "text-brand font-extrabold")}>
                                        {plan.name}
                                    </span>
                                )}
                            </h3>
                            <div className="flex items-baseline gap-1 mb-4">
                                <span className="text-4xl font-[family-name:var(--font-outfit)] font-bold text-white tracking-tighter">{plan.price}</span>
                                {plan.price !== "₹0" && <span className="text-zinc-500 transition-colors duration-500 text-sm font-[family-name:var(--font-plus-jakarta)] font-medium">/{isAnnual ? 'year' : 'month'}</span>}
                            </div>
                            <p className="text-sm font-[family-name:var(--font-plus-jakarta)] text-zinc-500 transition-colors duration-500 font-medium leading-relaxed mb-10 text-balance">{plan.description}</p>

                            <div className="space-y-4 mb-4">
                                {plan.features.map((feature, i) => (
                                    <div key={i} className="flex items-start gap-3">
                                        <Check size={14} className={cn("mt-1 shrink-0 transition-colors duration-500", isCurrentExactPlanCheck(plan.name) ? "text-red-500" : "text-white/10")} strokeWidth={3} />
                                        <span className="text-sm font-[family-name:var(--font-plus-jakarta)] text-zinc-500 transition-colors duration-500 leading-snug">{feature}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {plan.bestFor && (
                            <div className="mt-4 pt-4 border-t border-white/5 mb-8">
                                <p className="text-[10px] font-[family-name:var(--font-plus-jakarta)] font-black text-zinc-600 uppercase tracking-[0.2em] mb-1">Best for</p>
                                <p className="text-xs font-[family-name:var(--font-plus-jakarta)] text-zinc-500 transition-colors duration-500 font-medium leading-relaxed">{plan.bestFor}</p>
                            </div>
                        )}

                        <button
                            onClick={() => handleCheckout(plan)}
                            disabled={isPlanDisabled(plan.name, isAnnual)}
                            className={cn(
                                "w-full py-4 rounded-xl text-xs font-[family-name:var(--font-outfit)] font-bold transition-all flex items-center justify-center gap-2 uppercase tracking-widest",
                                isCurrentExactPlanCheck(plan.name)
                                    ? "bg-zinc-800/50 text-zinc-500 cursor-default border border-white/5"
                                    : "bg-white/5 text-white hover:bg-white/10 border border-white/10"
                            )}
                        >
                            {isCheckingOut === plan.name ? (
                                <ZenLoading size="xs" />
                            ) : (
                                <>
                                    {getPlanCTA(plan.name, isAnnual)}
                                </>
                            )}
                        </button>
                    </motion.div>
                ))}
            </motion.div>

            <div className="mt-16 text-center">
                <p className="text-[13px] text-zinc-500 max-w-lg mx-auto leading-relaxed">
                    Subscription auto-renews until cancelled. Price includes applicable taxes.
                </p>
                <button className="mt-4 text-brand text-[13px] font-bold hover:underline flex items-center gap-1 mx-auto uppercase tracking-widest">
                    Learn more about <span className="text-brand">Zenify Premium</span> <ChevronRight size={14} />
                </button>
            </div>
        </div >
    );
};

export default Pricing;
