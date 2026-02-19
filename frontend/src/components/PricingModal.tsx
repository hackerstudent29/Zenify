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
import { ZenifyLogo } from "./shared/ZenifyLogo";

interface PricingModalProps {
    trigger?: React.ReactNode;
    isOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function PricingModal({ trigger, isOpen, onOpenChange }: PricingModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent className="max-w-[70vw] w-full bg-zinc-950/95 backdrop-blur-3xl border-white/5 p-12 rounded-[3.5rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] outline-none overflow-y-auto max-h-[90vh]">
                <DialogHeader className="mb-12 items-center text-center">
                    <div className="mb-6">
                        <ZenifyLogo size={48} />
                    </div>
                    <DialogTitle className="text-4xl font-bold tracking-tight text-white uppercase">
                        Zenify <span className="text-emerald-500">Premium</span>
                    </DialogTitle>
                    <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.4em] mt-4">Elevate your sonic world</p>
                </DialogHeader>

                <Pricing showTitle={false} />

                <div className="mt-16 text-center">
                    <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest leading-loose max-w-lg mx-auto">
                        Secure payments processed via ZenWallet. Subscription terms and privacy policy apply.
                        Cancel anytime from your account settings.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
