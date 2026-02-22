"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Library, Radio, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileNav() {
    const pathname = usePathname();

    const items = [
        { label: "Home", icon: Home, href: "/" },
        { label: "Search", icon: Search, href: "/search" },
        { label: "Radio", icon: Radio, href: "/radio" },
        { label: "Library", icon: Library, href: "/library" },
        { label: "Account", icon: User, href: "/profile" },
    ];

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-[60] bg-[#0E0F13]/80 backdrop-blur-xl border-t border-white/5 pb-safe">
            <div className="flex items-center justify-around h-16">
                {items.map((item) => {
                    const active = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex flex-col items-center gap-1 min-w-[64px] transition-all",
                                active ? "text-white" : "text-zinc-500"
                            )}
                        >
                            <item.icon size={20} className={cn(active && "scale-110")} />
                            <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
