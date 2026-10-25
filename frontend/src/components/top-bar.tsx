"use client";

import React, { useState } from "react";
import {
  Bell,
  User as UserIcon,
  ChevronLeft,
  Settings,
  Info,
  LogOut,
  HardDrive,
  LogIn,
  FileText,
  Shield,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { useNotificationStore } from "@/store/notificationStore";
import { AnimatedDropdown } from "@/components/ui/animated-dropdown";
import { HeaderSearchButton } from "@/components/shared/SpotlightSearch";
import { useRouter, usePathname } from "next/navigation";
import { getMediaUrl } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ZenifyLogo } from "./shared/ZenifyLogo";

export function TopBar() {
  const isMobile = useIsMobile();
  const stickyPageTitle = useUIStore((state) => state.stickyPageTitle);
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="h-full px-4 md:px-6 flex items-center justify-between gap-6 relative pt-[env(safe-area-inset-top,0px)]">
      {/* Left side: Navigation / Logo + Spotlight Search + Sticky Title */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Mobile Left Section */}
        {isMobile &&
          (pathname === "/" ? (
            <div
              className="flex items-center gap-2 group cursor-pointer shrink-0"
              onClick={() => router.push("/")}
            >
              <ZenifyLogo size={48} />
            </div>
          ) : (
            <button
              onClick={() => router.back()}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-white/10 bg-white/5 text-muted hover:text-foreground active:scale-95 transition-all"
            >
              <ChevronLeft size={20} />
            </button>
          ))}

        {/* Section K: Single Spotlight Search button on the left of header */}
        <HeaderSearchButton />

        {/* Sticky Title swap on scroll */}
        <AnimatePresence mode="wait">
          {stickyPageTitle ? (
            <motion.div
              key="sticky-title"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center shrink-0"
            >
              <span className="text-[14px] md:text-base font-bold font-sans text-white tracking-tight truncate max-w-[240px] drop-shadow-md glass-panel px-4 py-1.5 rounded-full">
                {stickyPageTitle}
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Right side: User Controls with About & Pricing integrated */}
      <div className="flex flex-1 justify-end items-center gap-2 md:gap-4 shrink-0">
        {isMobile ? (
          <AnimatedDropdown
            align="end"
            contentClassName="w-56 mt-2 z-[9999] bg-black/40 backdrop-blur-xl border-white/10 shadow-2xl"
            trigger={
              <button className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center overflow-hidden hover:bg-white/10 active:scale-95 transition-all shadow-xl backdrop-blur-md relative outline-none">
                {user?.avatarUrl ? (
                  <img
                    src={getMediaUrl(user.avatarUrl)}
                    className="w-full h-full object-cover"
                    alt={user.name ? `${user.name} profile` : "User profile"}
                    width={40}
                    height={40}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <UserIcon size={16} className="text-zinc-400" />
                )}
                {useNotificationStore.getState().unreadCount > 0 && (
                  <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-brand rounded-full border border-black" />
                )}
              </button>
            }
            items={
              user
                ? [
                    { id: "profile", label: "Profile", icon: <UserIcon size={16} />, onClick: () => router.push("/profile") },
                    {
                      id: "notifications",
                      label: "Notifications",
                      icon: (
                        <div className="relative">
                          <Bell size={16} />
                          {useNotificationStore.getState().unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-brand rounded-full border border-black" />
                          )}
                        </div>
                      ),
                      onClick: () => router.push("/notifications"),
                    },
                    { id: "settings", label: "Settings", icon: <Settings size={16} />, onClick: () => useUIStore.getState().openSettings() },
                    { id: "about-creator", label: "About Creator", icon: <Info size={16} />, onClick: () => router.push("/about") },
                    { id: "about-zenify", label: "About Zenify", icon: <Sparkles size={16} className="text-white" />, onClick: () => router.push("/about-zenify") },
                    { id: "terms", label: "Terms of Service", icon: <FileText size={16} />, onClick: () => router.push("/terms") },
                    { id: "privacy", label: "Privacy Policy", icon: <Shield size={16} />, onClick: () => router.push("/privacy") },
                    { id: "upgrade-pro", label: "Upgrade Pro", icon: <Sparkles size={16} className="text-brand" />, onClick: () => router.push("/pricing") },
                    { id: "divider-logout", isSeparator: true },
                    {
                      id: "logout",
                      label: "Log Out",
                      icon: <LogOut size={16} className="text-red-400" />,
                      className: "text-red-400 hover:text-red-400 hover:bg-red-500/10",
                      onClick: () => {
                        logout();
                        router.push("/login");
                      },
                    },
                  ]
                : [
                    { id: "about-creator", label: "About Creator", icon: <Info size={16} />, onClick: () => router.push("/about") },
                    { id: "about-zenify", label: "About Zenify", icon: <Sparkles size={16} className="text-white" />, onClick: () => router.push("/about-zenify") },
                    { id: "terms", label: "Terms of Service", icon: <FileText size={16} />, onClick: () => router.push("/terms") },
                    { id: "privacy", label: "Privacy Policy", icon: <Shield size={16} />, onClick: () => router.push("/privacy") },
                    { id: "divider-login", isSeparator: true },
                    { id: "login", label: "Log In", icon: <LogIn size={16} className="text-brand" />, className: "text-brand font-bold", onClick: () => router.push("/login") },
                  ]
            }
          />
        ) : (
          <>
            {/* Local Device Music Quick Button */}
            <button
              onClick={() => router.push("/local-library")}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-white active:scale-95 transition-all shadow-sm cursor-pointer"
              title="Local Device Music"
            >
              <HardDrive size={16} />
            </button>

            {!user && (
              <button
                onClick={() => router.push("/login")}
                className="h-10 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <LogIn size={13} className="text-brand" />
                <span>Log In</span>
              </button>
            )}

            <AnimatedDropdown
              align="end"
              glass={true}
              contentClassName="w-64 mt-2 z-[9999]"
              trigger={
                <button
                  id="tour-profile"
                  data-tour="profile"
                  className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center overflow-hidden hover:bg-white/10 active:scale-95 transition-all shadow-xl backdrop-blur-md relative outline-none cursor-pointer"
                >
                  {user?.avatarUrl ? (
                    <img src={getMediaUrl(user.avatarUrl)} className="w-full h-full object-cover" alt="Profile" />
                  ) : (
                    <UserIcon size={16} className="text-zinc-400" />
                  )}
                  {useNotificationStore.getState().unreadCount > 0 && (
                    <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-brand rounded-full border border-black" />
                  )}
                </button>
              }
              header={
                user && (
                  <div className="p-1 pointer-events-none select-none">
                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-white/5 border border-white/10 pointer-events-none w-full">
                      <div className="w-9 h-9 rounded-full overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center shrink-0">
                        {user?.avatarUrl ? (
                          <img
                            src={getMediaUrl(user.avatarUrl)}
                            className="w-full h-full object-cover"
                            alt={user.name ? `${user.name} avatar` : "User avatar"}
                            width={36}
                            height={36}
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span className="text-xs font-normal text-zinc-300 uppercase">
                            {user?.name?.[0] || user?.username?.[0] || user?.email?.[0] || "?"}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-normal text-white truncate max-w-[110px]">
                            {user?.name || user?.username || "User"}
                          </span>
                          {user?.role === "ADMIN" ? (
                            <span className="text-[9px] font-normal bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                              Admin
                            </span>
                          ) : user?.role === "PRO" || user?.role === "PREMIUM" ? (
                            <span className="text-[9px] font-normal bg-brand/10 text-brand border border-brand/20 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                              PRO
                            </span>
                          ) : (
                            <span className="text-[9px] font-normal bg-white/5 text-zinc-400 border border-white/10 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                              Free
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-400 font-normal truncate max-w-[130px]">
                          {user?.email}
                        </span>
                      </div>
                    </div>
                    <div className="h-[1px] bg-white/[0.08] mt-2.5 mx-1" />
                  </div>
                )
              }
              items={
                user
                  ? [
                      { id: "profile", label: "Profile", icon: <UserIcon size={14} />, onClick: () => router.push("/profile") },
                      {
                        id: "notifications",
                        label: "Notifications",
                        icon: (
                          <div className="relative font-sans">
                            <Bell size={14} />
                            {useNotificationStore.getState().unreadCount > 0 && (
                              <span className="absolute -top-1 -right-1 w-2 h-2 bg-brand rounded-full border border-black" />
                            )}
                          </div>
                        ),
                        onClick: () => router.push("/notifications"),
                      },
                      { id: "settings", label: "Settings", icon: <Settings size={14} />, onClick: () => useUIStore.getState().openSettings() },
                      { id: "about-creator", label: "About Creator", icon: <Info size={14} />, onClick: () => router.push("/about") },
                      { id: "about-zenify", label: "About Zenify", icon: <Sparkles size={14} className="text-white" />, onClick: () => router.push("/about-zenify") },
                      { id: "terms", label: "Terms of Service", icon: <FileText size={14} />, onClick: () => router.push("/terms") },
                      { id: "privacy", label: "Privacy Policy", icon: <Shield size={14} />, onClick: () => router.push("/privacy") },
                      {
                        id: "upgrade-pro",
                        label: "Upgrade Pro",
                        icon: <Sparkles size={14} className="text-brand" />,
                        className: "text-brand hover:text-brand bg-brand/5 hover:bg-brand/10",
                        onClick: () => router.push("/pricing"),
                      },
                      { id: "divider-logout", isSeparator: true },
                      {
                        id: "logout",
                        label: "Log Out",
                        icon: <LogOut size={14} className="text-red-400" />,
                        className: "text-red-400 hover:text-red-400 hover:bg-red-500/10",
                        onClick: () => {
                          logout();
                          router.push("/login");
                        },
                      },
                    ]
                  : [
                      { id: "about-creator", label: "About Creator", icon: <Info size={14} />, onClick: () => router.push("/about") },
                      { id: "about-zenify", label: "About Zenify", icon: <Sparkles size={14} className="text-white" />, onClick: () => router.push("/about-zenify") },
                      { id: "terms", label: "Terms of Service", icon: <FileText size={14} />, onClick: () => router.push("/terms") },
                      { id: "privacy", label: "Privacy Policy", icon: <Shield size={14} />, onClick: () => router.push("/privacy") },
                      { id: "divider-login", isSeparator: true },
                      {
                        id: "login",
                        label: "Log In",
                        icon: <LogIn size={14} className="text-brand" />,
                        className: "text-brand hover:text-brand font-bold",
                        onClick: () => router.push("/login"),
                      },
                    ]
              }
            />
          </>
        )}
      </div>

      {/* Toast System */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, x: 50, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            className={`fixed bottom-8 right-8 flex items-center gap-3 px-6 py-4 rounded-2xl border backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[9999] min-w-[280px] ${
              toast.type === "error"
                ? "bg-zinc-950/95 border-brand/50 text-rose-200 shadow-[0_0_35px_rgba(225,29,72,0.3)]"
                : "bg-zinc-950/95 border-emerald-500/30 text-emerald-300 shadow-[0_0_35px_rgba(16,185,129,0.2)]"
            }`}
          >
            <div
              className={`p-2 rounded-full ${
                toast.type === "error" ? "bg-brand/20 text-brand" : "bg-emerald-500/20 text-emerald-400"
              }`}
            >
              {toast.type === "success" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-bold tracking-tight text-white">
                {toast.type === "success" ? "Success" : "Error"}
              </span>
              <span className="text-[12px] opacity-80 font-medium">{toast.msg}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
