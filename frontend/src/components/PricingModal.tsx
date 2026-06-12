"use client";
import React from "react";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogTrigger
} from "@/components/ui/dialog";
import Pricing from "./home/Pricing";
import { cn } from "@/lib/utils";
import { ZenifyLogo } from "./shared/ZenifyLogo";

interface PricingModalProps {
 trigger?: React.ReactNode;
 isOpen?: boolean;
 onOpenChange?: (open: boolean) => void;
 currentPlan?: string;
}

export function PricingModal({ trigger, isOpen, onOpenChange, currentPlan }: PricingModalProps) {
 const isPremium = currentPlan && currentPlan !== "Eclipse";

 return (
 <Dialog open={isOpen} onOpenChange={onOpenChange}>
 {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
 <DialogContent className={cn(
 "w-full bg-zinc-950/95 backdrop-blur-3xl border-white/5 outline-none overflow-y-auto max-h-[90vh]",
 isPremium
 ? "max-w-[320px] p-8 rounded-[2rem] shadow-[0_0_50px_rgba(16,185,129,0.3)]"
 : "max-w-[70vw] p-12 rounded-[3.5rem] shadow-[0_0_100px_rgba(0,0,0,0.8)]"
 )}>
 <DialogHeader className={cn("items-center text-center", isPremium ? "mb-6" : "mb-12")}>
 <div className={cn(isPremium ? "mb-4" : "mb-6")}>
 <ZenifyLogo size={isPremium ? 32 : 48} />
 </div>
 <DialogTitle className={cn("font-bold tracking-tight text-white uppercase", isPremium ? "text-2xl" : "text-4xl")}>
 <span className="font-zenify">zenify</span> <span className="text-emerald-500">Premium</span>
 </DialogTitle>
 <p className={cn("text-zinc-500 font-bold uppercase tracking-[0.4em]", isPremium ? "text-[9px] mt-2" : "text-xs mt-4")}>Elevate your sonic world</p>
 </DialogHeader>

 <Pricing showTitle={false} currentPlan={currentPlan} />

 {!isPremium && (
 <div className="mt-16 text-center">
 <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest leading-loose max-w-lg mx-auto">
 Secure payments processed via ZenWallet. Subscription terms and privacy policy apply.
 Cancel anytime from your account settings.
 </p>
 </div>
 )}
 </DialogContent>
 </Dialog>
 );
}
