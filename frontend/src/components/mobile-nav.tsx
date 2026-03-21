"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Library, CreditCard, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";

export function MobileNav() {
    const pathname = usePathname();
    const { user } = useAuthStore();
    const isAdmin = user?.role === "ADMIN";

    const navItems = [
        { label: "Home", icon: Home, href: "/" },
        { label: "Search", icon: Search, href: "/search" },
        ...(isAdmin ? [{ label: "Admin", icon: Sparkles, href: "/admin" }] : []),
        { label: "Library", icon: Library, href: "/library" },
        { label: "Pricing", icon: CreditCard, href: "/pricing" },
    ];

    return (
        <nav className="h-[calc(64px+env(safe-area-inset-bottom,0px))] bg-[#252529]/95 backdrop-blur-xl border-t border-white/5 flex items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom,0px)] pointer-events-auto">
            {navItems.map((item) => {
                const isActive = pathname === item.href ||
                    (item.href !== "/" && pathname.startsWith(item.href + "/"));
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex flex-col items-center justify-center flex-1 transition-all duration-300 gap-1.5",
                            isActive ? "text-[#ff2d55]" : "text-zinc-500"
                        )}
                    >
                        <item.icon size={24} strokeWidth={isActive ? 2.5 : 1.5} />
                        <span className="text-[10px] font-medium tracking-tight">
                            {item.label}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}
