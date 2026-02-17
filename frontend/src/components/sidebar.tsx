"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, Search, Library, PlusSquare, Heart, Settings } from "lucide-react";

const routes = [
    { label: "Home", icon: Home, href: "/" },
    { label: "Search", icon: Search, href: "/search" },
    { label: "Library", icon: Library, href: "/library" },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <div className="flex flex-col h-full bg-secondary text-white w-64 p-4 space-y-4">
            <div className="px-3 py-2">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent">
                    Zenify
                </h1>
            </div>

            <div className="space-y-1">
                {routes.map((route) => (
                    <Link
                        key={route.href}
                        href={route.href}
                        className={cn(
                            "text-sm group flex p-3 w-full justify-start font-medium cursor-pointer hover:text-white hover:bg-white/10 rounded-lg transition",
                            pathname === route.href ? "text-white bg-white/10" : "text-zinc-400"
                        )}
                    >
                        <div className="flex items-center flex-1">
                            <route.icon className={cn("h-5 w-5 mr-3", pathname === route.href ? "text-accent" : "text-zinc-400")} />
                            {route.label}
                        </div>
                    </Link>
                ))}
            </div>

            <div className="mt-8 px-3">
                <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight text-zinc-400">
                    Playlists
                </h2>
                <div className="space-y-1">
                    <Button variant="ghost" className="w-full justify-start text-zinc-400 hover:text-white">
                        <PlusSquare className="mr-2 h-4 w-4" />
                        Create Playlist
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-zinc-400 hover:text-white">
                        <Heart className="mr-2 h-4 w-4" />
                        Liked Songs
                    </Button>
                </div>
            </div>
        </div>
    );
}

import { Button } from "@/components/ui/button";
