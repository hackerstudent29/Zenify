"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Search, Library, CreditCard, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { useRef } from "react";
import { motion } from "framer-motion";

export function MobileNav() {
    const pathname = usePathname();
    const router = useRouter();
    const { user } = useAuthStore();
    const isAdmin = user?.role === "ADMIN";

    const bottomNavStyle = user?.preferences?.bottomNavStyle || "normal";
    const swipeNavigation = user?.preferences?.swipeNavigation ?? false;

    const navItems = [
        { label: "Home", icon: Home, href: "/" },
        { label: "Search", icon: Search, href: "/search" },
        ...(isAdmin ? [{ label: "Admin", icon: Sparkles, href: "/admin" }] : []),
        { label: "Library", icon: Library, href: "/library" },
        { label: "Pricing", icon: CreditCard, href: "/pricing" },
    ];

    const navRef = useRef<HTMLElement>(null);
    const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

    const onTouchStart = (e: React.TouchEvent) => {
        if (!swipeNavigation) return;
        touchStartRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            time: Date.now()
        };
    };

    const onTouchEnd = (e: React.TouchEvent) => {
        if (!swipeNavigation || !touchStartRef.current || !navRef.current) return;

        const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
        const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
        const deltaT = Date.now() - touchStartRef.current.time;

        // Focus on horizontal swipes
        if (Math.abs(deltaX) > 40 && Math.abs(deltaY) < 60 && deltaT < 450) {
            const rect = navRef.current.getBoundingClientRect();
            const clientX = e.changedTouches[0].clientX;
            
            // Check if touch ended inside the horizontal boundary of the nav bar
            if (clientX >= rect.left && clientX <= rect.right) {
                const relativeX = clientX - rect.left;
                const percentage = relativeX / rect.width;
                const itemIndex = Math.min(Math.max(Math.floor(percentage * navItems.length), 0), navItems.length - 1);
                const targetItem = navItems[itemIndex];
                if (targetItem && pathname !== targetItem.href) {
                    router.push(targetItem.href);
                }
            } else {
                // Swipe left -> Next page
                // Swipe right -> Previous page
                const currentIndex = navItems.findIndex(item => item.href === pathname);
                if (currentIndex !== -1) {
                    if (deltaX < -40) {
                        const nextIndex = Math.min(currentIndex + 1, navItems.length - 1);
                        router.push(navItems[nextIndex].href);
                    } else if (deltaX > 40) {
                        const prevIndex = Math.max(currentIndex - 1, 0);
                        router.push(navItems[prevIndex].href);
                    }
                }
            }
        }
        touchStartRef.current = null;
    };

    const isGlasso = bottomNavStyle === "glasso";

    return (
        <nav
            ref={navRef}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            className={cn(
                "h-[calc(64px+env(safe-area-inset-bottom,0px))] flex items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom,0px)] pointer-events-auto transition-all duration-300",
                isGlasso
                    ? "bg-[#0a0a0b]/40 backdrop-blur-xl border-t border-white/10 shadow-[0_-10px_35px_rgba(0,0,0,0.6)]"
                    : "bg-[#1c1c1e] border-t border-white/5"
            )}
        >
            {navItems.map((item) => {
                const isActive = pathname === item.href ||
                    (item.href !== "/" && pathname.startsWith(item.href + "/"));
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className="flex flex-col items-center justify-center flex-1 transition-all duration-300 gap-1.5"
                    >
                        <motion.div
                            whileTap={{ scale: 0.85, y: -2 }}
                            transition={{ type: "spring", stiffness: 400, damping: 15 }}
                            className={cn(
                                "flex flex-col items-center justify-center gap-1",
                                isActive ? "text-[#ff2d55]" : "text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            <item.icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
                            <span className="text-[10px] font-medium tracking-tight">
                                {item.label}
                            </span>
                        </motion.div>
                    </Link>
                );
            })}
        </nav>
    );
}
