"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  SwiftUIHome,
  SwiftUICompass,
  SwiftUIHeart,
  SwiftUIDevice,
  SwiftUIAdmin,
} from "@/components/ui/SwiftUIIcons";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { motion } from "framer-motion";

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";

  const navItems = [
    { label: "Home", icon: SwiftUIHome, href: "/" },
    { label: "Discover", icon: SwiftUICompass, href: "/discover" },
    { label: "Liked", icon: SwiftUIHeart, href: "/liked" },
    { label: "Library", icon: SwiftUIDevice, href: "/local-library" },
  ];

  return (
    <nav
      style={{
        background: "rgba(18, 18, 20, 0.88)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderTop: "0.5px solid rgba(255, 255, 255, 0.08)",
      }}
      className="h-[calc(60px+env(safe-area-inset-bottom,0px))] flex items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom,0px)] pointer-events-auto transition-all duration-300 fixed bottom-0 left-0 right-0 z-[9999]"
    >
      {navItems.map((item) => {
        const isRouteActive =
          pathname === item.href ||
          (item.href !== "/" && pathname.startsWith(item.href));

        const IconComponent = item.icon;

        return (
          <div
            key={item.href}
            onClick={() => {
              if (pathname !== item.href) {
                router.push(item.href);
              }
            }}
            className="flex flex-col items-center justify-center flex-1 cursor-pointer select-none py-1"
          >
            <motion.div
              style={{ pointerEvents: "none" }}
              className={cn(
                "flex flex-col items-center justify-center gap-1 transition-colors duration-200",
                isRouteActive ? "text-brand" : "text-white/40 hover:text-white/70"
              )}
            >
              {item.href === "/liked" ? (
                <SwiftUIHeart
                  size={22}
                  filled={isRouteActive}
                  className={cn(
                    "transition-all duration-200",
                    isRouteActive ? "text-brand" : "text-white/40"
                  )}
                />
              ) : (
                <IconComponent
                  size={22}
                  fill={isRouteActive ? "currentColor" : "none"}
                  fillOpacity={isRouteActive ? 0.25 : 0}
                  stroke="currentColor"
                  className={cn(
                    "transition-all duration-200",
                    isRouteActive ? "text-brand" : "text-white/40"
                  )}
                />
              )}
              <span
                className={cn(
                  "text-[10px] tracking-tight transition-colors",
                  isRouteActive ? "text-brand font-bold" : "text-white/40 font-medium"
                )}
              >
                {item.label}
              </span>
            </motion.div>
          </div>
        );
      })}
    </nav>
  );
}
