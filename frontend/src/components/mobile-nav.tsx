"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Library, CreditCard, User, Shield, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/authStore";

export function MobileNav() {
    const pathname = usePathname();
    const { user } = useAuthStore();
    const isAdmin = user?.role === "ADMIN";

    // Compact: Home | Search | Library | [Admin/Pricing] | Account
    const navItems = [
        { label: "Home", icon: Home, href: "/" },
        { label: "Search", icon: Search, href: "/search" },
        { label: "Library", icon: Library, href: "/library" },
        ...(isAdmin
            ? [{ label: "Admin", icon: Shield, href: "/admin" }]
            : [{ label: "Upgrade", icon: CreditCard, href: "/pricing" }]),
        { label: "Account", icon: User, href: "/profile" },
    ];

    return (
        <nav className="h-16 bg-[#0E0F13]/90 backdrop-blur-3xl border-t border-white/5 flex items-center justify-around px-2 safe-area-bottom pointer-events-auto shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
            {navItems.map((item) => {
                const isActive = pathname === item.href ||
                    (item.href !== "/" && pathname.startsWith(item.href + "/"));
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className="relative flex flex-col items-center justify-center flex-1 h-12 outline-none"
                    >
                        <motion.div
                            animate={{
                                y: isActive ? -12 : 0,
                                scale: isActive ? 1.15 : 1,
                                color: isActive ? "var(--accent-brand)" : "rgba(255,255,255,0.4)",
                            }}
                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                            className="relative z-10 p-1.5"
                        >
                            <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                            <AnimatePresence>
                                {isActive && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.5 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.5 }}
                                        className="absolute inset-0 bg-brand/10 rounded-xl shadow-[0_0_20px_rgba(var(--accent-brand-rgb),0.3)] -z-10"
                                    />
                                )}
                            </AnimatePresence>
                        </motion.div>

                        <AnimatePresence>
                            {isActive && (
                                <motion.span
                                    initial={{ opacity: 0, y: 10, scale: 0.8 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.8 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 25, delay: 0.05 }}
                                    className="absolute bottom-1 text-[9px] font-black uppercase tracking-widest text-brand"
                                >
                                    {item.label}
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </Link>
                );
            })}
        </nav>
    );
}
