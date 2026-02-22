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
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0E0F13]/80 backdrop-blur-2xl border-t border-white/5 flex items-center justify-around px-2 z-[100] safe-area-bottom">
            {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex flex-col items-center gap-1 min-w-[64px] transition-all duration-300",
                            isActive ? "text-white scale-110" : "text-zinc-500"
                        )}
                    >
                        <div className={cn(
                            "p-1.5 rounded-xl transition-all duration-500",
                            isActive && "bg-white/10 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                        )}>
                            <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest">{item.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
