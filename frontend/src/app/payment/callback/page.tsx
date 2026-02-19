"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function PaymentCallbackPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading');
    const [message, setMessage] = useState("Verifying your transaction...");

    useEffect(() => {
        const verify = async () => {
            const referenceId = searchParams.get("referenceId");
            if (!referenceId) {
                setStatus('failed');
                setMessage("Missing transaction reference.");
                return;
            }

            try {
                const res = await api.get(`/billing/verify?referenceId=${referenceId}`);
                if (res.data.status === 'SUCCESS') {
                    setStatus('success');
                    setMessage("Transaction completed successfully! Your account has been updated.");
                    // In a real app, you might want to re-fetch user data here
                    setTimeout(() => router.push("/profile"), 3000);
                } else {
                    setStatus('failed');
                    setMessage("Transaction failed or was cancelled.");
                }
            } catch (error) {
                setStatus('failed');
                setMessage("An error occurred while verifying your payment.");
            }
        };

        verify();
    }, [searchParams, router]);

    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="max-w-md w-full p-12 rounded-[3rem] bg-zinc-900/50 border border-white/5 backdrop-blur-3xl space-y-8"
            >
                <div className="flex justify-center">
                    {status === 'loading' && <Loader2 className="w-16 h-16 text-accent animate-spin" />}
                    {status === 'success' && <CheckCircle className="w-16 h-16 text-emerald-500" />}
                    {status === 'failed' && <XCircle className="w-16 h-16 text-red-500" />}
                </div>

                <div className="space-y-2">
                    <h1 className="text-3xl font-black italic tracking-tighter uppercase text-white">
                        {status === 'loading' ? 'Processing' : status === 'success' ? 'Confirmed' : 'System Error'}
                    </h1>
                    <p className="text-zinc-500 font-bold uppercase tracking-[0.2em] text-[10px]">{message}</p>
                </div>

                {status !== 'loading' && (
                    <button
                        onClick={() => router.push("/profile")}
                        className="w-full h-14 bg-white/5 hover:bg-white/10 border border-white/5 text-white font-black uppercase tracking-widest text-xs rounded-2xl transition-all"
                    >
                        Return to Profile
                    </button>
                )}
            </motion.div>
        </div>
    );
}
