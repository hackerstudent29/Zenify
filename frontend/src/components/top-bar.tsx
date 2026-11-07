import { GlobalTooltip } from "@/components/shared/GlobalTooltip";
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
  Database,
  Smartphone,
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
import notify from "@/lib/notify";

export function TopBar() {
  const isMobile = useIsMobile();
  const stickyPageTitle = useUIStore((state) => state.stickyPageTitle);
  const { user, logout } = useAuthStore();
  const [avatarError, setAvatarError] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    notify(msg, type);
  };

  return (
    <div className="h-full px-4 md:px-6 flex items-center justify-between gap-6 relative pt-[env(safe-area-inset-top,0px)]">
      {/* Left side: Navigation / Logo + Universal Back Button + Spotlight Search + Sticky Title */}
      <div className="flex items-center gap-2.5 md:gap-3 shrink-0">
        {/* Mobile Logo on Home */}
        {isMobile && pathname === "/" && (
          <div
            className="flex items-center gap-2 group cursor-pointer shrink-0"
            onClick={() => router.push("/")}
          >
            <ZenifyLogo size={48} />
          </div>
        )}

        {/* Universal Back Button beside search (desktop, tablet, mobile) */}
        {pathname !== "/" && (
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            title="Go back"
            className="sp-glass-btn group"
          >
            <ChevronLeft size={18} strokeWidth={2.5} className="text-white/80 transition-transform group-hover:-translate-x-0.5" />
          </button>
        )}

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
                                  {user?.avatarUrl && !avatarError ? (
                    <img 
                      src={getMediaUrl(user.avatarUrl)} 
                      className="w-full h-full object-cover" 
                      alt=""
                      onError={() => setAvatarError(true)} 
                    />
                  ) : (
                    <span className="text-xs font-semibold text-zinc-300 uppercase">
                      {user?.name?.[0] || user?.username?.[0] || user?.email?.[0] || <UserIcon size={16} className="text-zinc-400" />}
                    </span>
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
                      onClick: () => useUIStore.getState().toggleNotifications(),
                    },
                    { id: "settings", label: "Settings", icon: <Settings size={16} />, onClick: () => useUIStore.getState().openSettings() },
                    { id: "download-app", label: "Download App (APK)", icon: <Smartphone size={16} className="text-brand" />, onClick: () => router.push("/download") },
                    { id: "about-creator", label: "About Creator", icon: <Info size={16} />, onClick: () => router.push("/about") },
                    { id: "about-zenify", label: "About Zenify", icon: <Sparkles size={16} className="text-white" />, onClick: () => router.push("/about-zenify") },
                    { id: "terms", label: "Terms of Service", icon: <FileText size={16} />, onClick: () => router.push("/terms") },
                    { id: "privacy", label: "Privacy Policy", icon: <Shield size={16} />, onClick: () => router.push("/privacy") },
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
                    { id: "download-app", label: "Download App (APK)", icon: <Smartphone size={16} className="text-brand" />, onClick: () => router.push("/download") },
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
            {/* Download Mobile App Quick Button */}
            <GlobalTooltip content="Download Mobile App (APK)" side="bottom">
              <button
                onClick={() => router.push("/download")}
                className="flex items-center gap-1.5 px-3 h-8 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-white active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                <Smartphone size={14} className="text-brand" />
                <span className="hidden xl:inline text-[11px] font-bold uppercase tracking-wider text-zinc-300">Get App</span>
              </button>
            </GlobalTooltip>

            {/* Local Device Music Quick Button */}
            <GlobalTooltip content="Local Device Music" side="bottom">
              <button
                onClick={() => router.push("/local-library")}
                className="flex items-center justify-center w-8 h-8 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-white active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                <HardDrive size={16} />
              </button>
            </GlobalTooltip>

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
                                    {user?.avatarUrl && !avatarError ? (
                    <img 
                      src={getMediaUrl(user.avatarUrl)} 
                      className="w-full h-full object-cover" 
                      alt=""
                      onError={() => setAvatarError(true)} 
                    />
                  ) : (
                    <span className="text-xs font-semibold text-zinc-300 uppercase">
                      {user?.name?.[0] || user?.username?.[0] || user?.email?.[0] || <UserIcon size={16} className="text-zinc-400" />}
                    </span>
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
                        {user?.avatarUrl && !avatarError ? (
                          <img
                            src={getMediaUrl(user.avatarUrl)}
                            className="w-full h-full object-cover"
                            alt=""
                            width={36}
                            height={36}
                            loading="lazy"
                            decoding="async"
                            onError={() => setAvatarError(true)}
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
                          {user?.role === "ADMIN" && (
                            <span className="text-[9px] font-normal bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                              Admin
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
                      ...(user?.role === "ADMIN"
                        ? [
                            {
                              id: "admin-database",
                              label: "Database Console",
                              icon: <Database size={14} className="text-brand" />,
                              className: "text-brand hover:text-brand font-semibold",
                              onClick: () => router.push("/admin"),
                            },
                            { id: "divider-admin", isSeparator: true },
                          ]
                        : []),
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
                        onClick: () => useUIStore.getState().toggleNotifications(),
                      },
                      { id: "settings", label: "Settings", icon: <Settings size={14} />, onClick: () => useUIStore.getState().openSettings() },
                      { id: "download-app", label: "Download App (APK)", icon: <Smartphone size={14} className="text-brand" />, onClick: () => router.push("/download") },
                      { id: "about-creator", label: "About Creator", icon: <Info size={14} />, onClick: () => router.push("/about") },
                      { id: "about-zenify", label: "About Zenify", icon: <Sparkles size={14} className="text-white" />, onClick: () => router.push("/about-zenify") },
                      { id: "terms", label: "Terms of Service", icon: <FileText size={14} />, onClick: () => router.push("/terms") },
                      { id: "privacy", label: "Privacy Policy", icon: <Shield size={14} />, onClick: () => router.push("/privacy") },
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
                      { id: "download-app", label: "Download App (APK)", icon: <Smartphone size={14} className="text-brand" />, onClick: () => router.push("/download") },
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
    </div>
  );
}
