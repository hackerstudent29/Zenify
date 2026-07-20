"use client";

import Pricing from "@/components/home/Pricing";
import { useAuthStore } from "@/store/authStore";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { motion } from "framer-motion";
import { cn, getMediaUrl, getTrackCover, formatDisplayTitle } from "@/lib/utils";

export default function PricingPage() {
 const { isAuthenticated } = useAuthStore();
 const [currentPlan, setCurrentPlan] = useState("Eclipse");
 const [currentPlanIsAnnual, setCurrentPlanIsAnnual] = useState(false);

 useEffect(() => {
 if (isAuthenticated) {
 api.get("auth/subscription")
 .then(res => {
 setCurrentPlan(res.data?.status === 'ACTIVE' ? res.data.plan : "Eclipse");
 setCurrentPlanIsAnnual(res.data?.status === 'ACTIVE' ? (res.data.isAnnual || false) : false);
 })
 .catch(() => setCurrentPlan("Eclipse"));
 }
 }, [isAuthenticated]);

 return (
 <div className="min-h-full bg-background selection:bg-accent/30 relative">
 {/* Ambient Background Elements */}
 <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-accent/5 blur-[120px] rounded-full pointer-events-none" />
 <div className="absolute top-[10%] right-[10%] w-[400px] h-[400px] bg-brand/5 blur-[100px] rounded-full pointer-events-none opacity-[0.05]" />

 {/* Grain/Noise Overlay */}
 {/* Noise Overlay Removed */}

 <div className="max-w-[1400px] mx-auto px-6 pt-28 pb-32 md:pt-32 md:pb-48 relative z-10">
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
 className="text-center mb-28 space-y-6"
 >
 <motion.h1
 initial={{ opacity: 0, filter: "blur(10px)" }}
 animate={{ opacity: 1, filter: "blur(0px)" }}
 transition={{ duration: 0.8, delay: 0.2 }}
 className="text-4xl md:text-6xl font-brand bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent tracking-tighter pt-6 pb-4 leading-tight inline-block"
 >
 <span className="font-zenify">zenify</span> Premium Plans
 </motion.h1>
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 transition={{ duration: 1.2, delay: 0.6 }}
 className="space-y-3"
 >
 <p className="text-xl md:text-2xl font-brand text-accent/80 tracking-[0.2em]">
 Stream. Feel. Create.
 </p>
 <p className="text-base font-sans text-zinc-500 font-medium max-w-xl mx-auto leading-relaxed text-balance">
 Deep soundscapes. Zero interruptions. Your presence, amplified through every note.
 </p>
 </motion.div>
 </motion.div>

 <motion.div
 initial="hidden"
 whileInView="visible"
 viewport={{ once: true, margin: "-100px" }}
 variants={{
 hidden: { opacity: 0 },
 visible: {
 opacity: 1,
 transition: {
 staggerChildren: 0.2
 }
 }
 }}
 className="max-w-6xl mx-auto mb-24"
 >
 <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-4 items-end">
 {[
 {
 title: "Uninterrupted Sessions",
 desc: "No breaks. Just rhythm.",
 delay: 0,
 h: "h-auto"
 },
 {
 title: "Harmonized Access",
 desc: "Your sound, synced everywhere.",
 delay: 0.8,
 h: "md:h-[120%] md:mb-8"
 },
 {
 title: "Engineered for Clarity",
 desc: "Every detail. Every layer.",
 delay: 1.6,
 h: "h-auto"
 },
 {
 title: "Sonic Immersion",
 desc: "Designed for depth and warmth.",
 delay: 2.4,
 h: "md:h-[135%] md:mb-4"
 }
 ].map((item, i) => (
 <motion.div
 key={i}
 variants={{
 hidden: { opacity: 0, y: 40 },
 visible: { opacity: 1, y: 0, transition: { duration: 1.2, ease: [0.16, 1, 0.3, 1] } }
 }}
 className={cn("relative group cursor-default", item.h)}
 >
 <motion.div
 whileHover={{ y: -5 }}
 transition={{ duration: 0.3, ease: "easeOut" }}
 className="relative py-4 text-center space-y-3 group transition-all duration-700"
 >
 <h4 className="text-[22px] font-[family-name:var(--font-cormorant)] font-medium bg-gradient-to-r from-zinc-100 via-white to-zinc-400 bg-clip-text text-transparent tracking-tight group-hover:from-white group-hover:to-zinc-200 transition-all duration-700 drop-shadow-[0_2px_15px_rgba(255,255,255,0.05)]">
 {item.title}
 </h4>
 <p className="text-[13px] font-sans text-zinc-500 font-medium leading-relaxed max-w-[200px] mx-auto transition-colors duration-500">
 {item.desc}
 </p>

 {/* Elevated Typographic Underline */}
 <div className="w-16 h-[2px] bg-gradient-to-r from-transparent via-zinc-800 to-transparent mx-auto group-hover:via-white transition-all duration-700" />
 </motion.div>
 </motion.div>
 ))}
 </div>
 </motion.div>

 <div className="pt-12 border-t border-white/[0.03] relative">
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
