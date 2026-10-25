"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { SEO } from "@/components/shared/SEO";
import { ZenifyLogo } from "@/components/shared/ZenifyLogo";

export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login?mode=signup");
  }, [router]);

  return (
    <>
      <SEO title="Sign Up – Zenify" noindex={true} path="/register" />
      <main
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Inter, system-ui, sans-serif',
        }}
        className="flex min-h-screen w-full flex-col items-center justify-center gap-5 bg-black antialiased"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="relative"
        >
          <div className="absolute inset-0 scale-150 rounded-full bg-[#fa243c]/25 blur-2xl" />
          <div className="relative rounded-[20px] bg-white/[0.06] p-3 ring-1 ring-white/15 backdrop-blur-xl">
            <ZenifyLogo size={56} animated={true} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 24, delay: 0.1 }}
          className="flex items-center gap-1.5"
          aria-live="polite"
        >
          <span className="text-[13px] font-medium text-white/55">Preparing sign up</span>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1 w-1 rounded-full bg-[#fa243c]"
              animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
            />
          ))}
        </motion.div>
      </main>
    </>
  );
}