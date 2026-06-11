"use client";

import React, { useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, Search, Library, CreditCard, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { motion } from "framer-motion";

export function MobileNav() {
    const pathname = usePathname();
    const router = useRouter();
    const { user } = useAuthStore();
    const isAdmin = user?.role === "ADMIN";

    const swipeNavigation = user?.preferences?.swipeNavigation ?? false;

    const navItems = [
        { label: "Home", icon: Home, href: "/" },
        { label: "Search", icon: Search, href: "/search" },
        ...(isAdmin ? [{ label: "Admin", icon: Sparkles, href: "/admin" }] : []),
        { label: "Library", icon: Library, href: "/library" },
        { label: "Pricing", icon: CreditCard, href: "/pricing" },
    ];

    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [isPointerActive, setIsPointerActive] = useState(false);

    const getIndexFromPoint = (clientX: number, clientY: number) => {
        const el = document.elementFromPoint(clientX, clientY);
        const button = el?.closest("[data-nav-index]");
        if (button) {
            return parseInt(button.getAttribute("data-nav-index") || "", 10);
        }
        return null;
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!swipeNavigation) return;
        setIsPointerActive(true);
        const idx = getIndexFromPoint(e.clientX, e.clientY);
        if (idx !== null) {
            setHoveredIndex(idx);
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!swipeNavigation || !isPointerActive) return;
        const idx = getIndexFromPoint(e.clientX, e.clientY);
        if (idx !== null) {
            setHoveredIndex(idx);
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!swipeNavigation) return;
        setIsPointerActive(false);
        const idx = getIndexFromPoint(e.clientX, e.clientY);
        if (idx !== null && idx >= 0 && idx < navItems.length) {
            const target = navItems[idx];
            if (pathname !== target.href) {
                router.push(target.href);
            }
        }
        setHoveredIndex(null);
    };

    const handlePointerCancel = () => {
        if (!swipeNavigation) return;
        setIsPointerActive(false);
        setHoveredIndex(null);
    };

    return (
        <nav
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            style={{
                background: "rgba(10, 10, 10, 0.45)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                borderTop: "0.5px solid rgba(255, 255, 255, 0.08)",
                touchAction: swipeNavigation ? "none" : "auto"
            }}
            className="h-[calc(64px+env(safe-area-inset-bottom,0px))] flex items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom,0px)] pointer-events-auto transition-all duration-300 fixed bottom-0 left-0 right-0 z-[9999]"
        >
            {navItems.map((item, i) => {
                const isRouteActive = pathname === item.href ||
                    (item.href !== "/" && pathname.startsWith(item.href + "/"));

                // Active if route is currently selected, OR if the pointer is sliding over this item
                const isVisualActive = isPointerActive ? hoveredIndex === i : isRouteActive;
                const isHovered = isPointerActive && hoveredIndex === i;

                return (
                    <div
                        key={item.href}
                        data-nav-index={i}
                        onClick={() => {
                            if (!swipeNavigation && pathname !== item.href) {
                                router.push(item.href);
                            }
                        }}
                        className="flex flex-col items-center justify-center flex-1 cursor-pointer select-none"
                    >
                        <motion.div
                            style={{ pointerEvents: "none" }}
                            className={cn(
                                "flex flex-col items-center justify-center gap-1.5 transition-colors duration-200",
                                isVisualActive ? "text-[#ff2d55]" : "text-zinc-500 hover:text-zinc-300"
                            )}
                            animate={{
                                scale: isHovered ? 1.1 : 1,
                            }}
                            transition={{ type: "spring", stiffness: 350, damping: 25 }}
                        >
                            <item.icon size={22} strokeWidth={isVisualActive ? 2.5 : 1.5} />
                            <span className="text-[10px] font-medium tracking-tight">
                                {item.label}
                            </span>
                        </motion.div>
                    </div>
                );
            })}
        </nav>
    );
}
