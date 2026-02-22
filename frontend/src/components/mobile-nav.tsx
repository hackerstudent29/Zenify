"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Library, Sparkles, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileNav() {
    const pathname = usePathname();

    const navItems = [
        { label: "Home", icon: Home, href: "/" },
        { label: "Search", icon: Search, href: "/search" },
        { label: "Premium", icon: Sparkles, href: "/pricing" },
        { label: "Library", icon: Library, href: "/library" },
        { label: "Account", icon: User, href: "/profile" },
    ];

    return (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0E0F13]/80 backdrop-blur-2xl border-t border-white/5 flex items-center justify-around px-2 z-[200] safe-area-bottom pointer-events-auto">
            {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex flex-col items-center gap-1 min-w-[64px] transition-all duration-300",
                            isActive ? "text-rose-500 scale-110" : "text-white/40 hover:text-white/60"
                        )}
                    >
                        <div className={cn(
                            "p-1.5 rounded-xl transition-all duration-500",
                            isActive && "bg-rose-500/10 shadow-[0_0_20px_rgba(244,63,94,0.15)]"
                        )}>
                            <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                        </div>
                        <span className={cn(
                            "text-[10px] uppercase font-bold tracking-widest transition-all",
                            isActive ? "opacity-100" : "opacity-0 translate-y-2 absolute -bottom-4"
                        )}>{item.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
