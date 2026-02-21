"use client";

import Pricing from "@/components/home/Pricing";
import { useAuthStore } from "@/store/authStore";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { motion } from "framer-motion";

export default function PricingPage() {
    const { isAuthenticated } = useAuthStore();
    const [currentPlan, setCurrentPlan] = useState("Eclipse");
    const [currentPlanIsAnnual, setCurrentPlanIsAnnual] = useState(false);

    useEffect(() => {
        if (isAuthenticated) {
            api.get("/auth/subscription")
                .then(res => {
                    setCurrentPlan(res.data?.status === 'ACTIVE' ? res.data.plan : "Eclipse");
                    setCurrentPlanIsAnnual(res.data?.status === 'ACTIVE' ? (res.data.isAnnual || false) : false);
                })
                .catch(() => setCurrentPlan("Eclipse"));
        }
    }, [isAuthenticated]);

    return (
        <div className="min-h-full bg-background selection:bg-[#A855F7]/30">
            <div className="max-w-[1200px] mx-auto px-6 py-16 md:py-24">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="text-center mb-16 space-y-4"
                >
                    <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
                        Zenify Premium
                    </h1>
                    <p className="text-xl text-zinc-400 font-medium max-w-2xl mx-auto">
                        Millions of songs. Thousands of artists. <br className="hidden md:block" />
                        All ad-free and on all your devices.
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="max-w-4xl mx-auto mb-32"
                >
                    <div className="space-y-12">
                        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                        <div className="space-y-8 text-center px-4">
                            <h2 className="text-2xl font-bold text-white tracking-tight">Understanding Your Tiers</h2>
                            <p className="text-lg text-zinc-500 leading-relaxed font-medium">
                                At the heart of Zenify lies a journey through sound, meticulously crafted into three distinct experiences.
                                <span className="text-white"> Eclipse</span> serves as your gateway, offering the essential freedom to roam our vast library of millions of tracks.
                                For those who demand sonic perfection, <span className="text-white"> Premium</span> introduces our signature Lossless HQ engine, delivering every nuance of the recording with studio-grade precision, backed by priority access to our latest innovations.
                                Finally, <span className="text-white"> Cosmic</span> redefined the boundary between listener and creator, providing a professional-grade suite that includes commercial licensing and direct artist collaborations—engineered specifically for the modern creative visionary.
                            </p>
                        </div>
                        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                    </div>
                </motion.div>

                <div className="pt-12 border-t border-white/5">
                    <Pricing
                        currentPlan={currentPlan}
                        currentPlanIsAnnual={currentPlanIsAnnual}
                        forceShowAll={true}
                    />
                </div>
            </div>
        </div>
    );
}
