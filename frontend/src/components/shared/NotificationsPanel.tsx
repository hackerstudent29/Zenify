"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { X, Bell, Check, ChevronRight } from "lucide-react";
import { useNotificationStore } from "@/store/notificationStore";
import { useUIStore } from "@/store/ui";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

const spring = { type: "spring" as const, stiffness: 420, damping: 34 } as const;

const LABELS: Record<string, { text: string; alert?: boolean }> = {
  upload_success: { text: "Upload" },
  upload_failed: { text: "Upload failed", alert: true },
  content_denied: { text: "Content denied", alert: true },
  system_info: { text: "System" },
};

export function NotificationsPanel() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { isNotificationsOpen, setIsNotificationsOpen } = useUIStore();
  const {
    notifications,
    markAsRead: storeMarkRead,
    markAllAsRead: storeMarkAllAsRead,
  } = useNotificationStore();

  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isNotificationsOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsNotificationsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isNotificationsOpen, setIsNotificationsOpen]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );
  const filtered = useMemo(
    () => notifications.filter((n) => filter === "all" || !n.read),
    [notifications, filter]
  );

  const handleMarkAllAsRead = async () => {
    storeMarkAllAsRead();
    try {
      await api.patch("/notifications/read-all");
    } catch (e) {
      console.error("Failed to mark all as read:", e);
    }
  };

  const handleToggleRead = async (id: string, currentRead: boolean) => {
    if (!currentRead) {
      storeMarkRead(id);
      try {
        await api.patch(`/notifications/${id}/read`);
      } catch (e) {
        console.error("Failed to mark notification read:", e);
      }
    }
  };

  return (
    <AnimatePresence>
      {isNotificationsOpen && (
        <div className="fixed inset-0 z-[150] pointer-events-none select-none">
          {/* Mobile Backing Scrim */}
          {isMobile && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsNotificationsOpen(false)}
              className="absolute inset-0 pointer-events-auto bg-black/60 backdrop-blur-sm"
            />
          )}

          {/* Desktop Overlay backdrop (click outside to dismiss) */}
          {!isMobile && (
            <div
              onClick={() => setIsNotificationsOpen(false)}
              className="absolute inset-0 pointer-events-auto bg-transparent"
            />
          )}

          {/* Notification Drawer Tab (Apple Music Style) */}
          <motion.div
            initial={isMobile ? { y: "100%" } : { x: 380 }}
            animate={isMobile ? { y: 0 } : { x: 0 }}
            exit={isMobile ? { y: "100%" } : { x: 380 }}
            transition={{ type: "spring", damping: 32, stiffness: 340, mass: 0.85 }}
            style={{ width: isMobile ? undefined : 380, backgroundColor: "var(--side)" }}
            className={cn(
              "absolute pointer-events-auto flex flex-col overflow-hidden z-[160] am-glass select-text",
              isMobile
                ? "bottom-0 left-0 right-0 h-[85vh] rounded-t-[28px] shadow-[0_-20px_60px_rgba(0,0,0,0.5)]"
                : "top-0 right-0 bottom-0 am-glass-right shadow-[-20px_0_60px_rgba(0,0,0,0.4)]"
            )}
          >
            {/* Header */}
            <div className="flex flex-col gap-3 px-5 pt-5 pb-3 border-b border-white/[0.08] shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-full bg-white/10 text-brand">
                    <Bell size={14} />
                  </div>
                  <h2 className="text-[18px] font-bold tracking-tight text-white">Notifications</h2>
                </div>

                <button
                  type="button"
                  onClick={() => setIsNotificationsOpen(false)}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white transition-colors"
                  aria-label="Close notifications"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Sub-toolbar: Tabs & Mark read */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <LayoutGroup id="notif-tab-filter">
                  <div role="tablist" className="flex rounded-lg bg-white/[0.07] p-0.5">
                    {(["all", "unread"] as const).map((f) => (
                      <button
                        key={f}
                        role="tab"
                        aria-selected={filter === f}
                        onClick={() => setFilter(f)}
                        className={cn(
                          "relative rounded-md px-3 py-1 text-[12px] font-semibold capitalize outline-none transition-colors cursor-pointer",
                          filter === f ? "text-white" : "text-white/45 hover:text-white/80"
                        )}
                      >
                        {filter === f && (
                          <motion.span
                            layoutId="notif-filter-pill"
                            transition={spring}
                            className="absolute inset-0 rounded-md bg-white/[0.14]"
                          />
                        )}
                        <span className="relative">
                          {f === "unread" && unreadCount > 0 ? `Unread (${unreadCount})` : f}
                        </span>
                      </button>
                    ))}
                  </div>
                </LayoutGroup>

                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  disabled={unreadCount === 0}
                  className="text-[12px] font-semibold text-brand hover:underline outline-none transition-opacity disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
                >
                  Mark all read
                </button>
              </div>
            </div>

            {/* Notification Items List */}
            <div className="flex-1 overflow-y-auto px-4 py-2 divide-y divide-white/[0.06] custom-scrollbar">
              <AnimatePresence mode="popLayout" initial={false}>
                {filtered.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="py-24 text-center text-white/40"
                  >
                    <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-white/[0.05]">
                      <Check size={20} className="text-white/40" />
                    </div>
                    <p className="text-[14px] font-medium text-white/70">
                      {filter === "unread" ? "No unread notifications" : "No notifications"}
                    </p>
                    <p className="mt-0.5 text-xs text-white/35">Activity and system events will appear here.</p>
                  </motion.div>
                ) : (
                  filtered.map((notif, i) => {
                    const isExpanded = expandedId === notif.id;
                    const label = LABELS[notif.type] ?? { text: "Notification" };
                    const meta = notif.metadata;
                    const hasMeta = meta && Object.keys(meta).length > 0;

                    return (
                      <motion.div
                        key={notif.id}
                        layout="position"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, transition: { duration: 0.12 } }}
                        transition={{ ...spring, delay: Math.min(i, 6) * 0.02 }}
                        className="py-3"
                      >
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => {
                            setExpandedId(isExpanded ? null : notif.id);
                            handleToggleRead(notif.id, notif.read);
                          }}
                          className="flex w-full items-start gap-2.5 text-left outline-none rounded-xl p-1.5 transition-colors hover:bg-white/[0.04] cursor-pointer"
                        >
                          {/* Unread blue/white dot indicator */}
                          <span className="mt-1 flex w-2 shrink-0 justify-center">
                            {!notif.read && (
                              <span className="size-2 rounded-full bg-brand" />
                            )}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span
                                className={cn(
                                  "truncate text-[13px] transition-colors leading-tight",
                                  notif.read ? "text-white/60 font-medium" : "text-white font-bold"
                                )}
                              >
                                {notif.title}
                              </span>
                              <time className="shrink-0 text-[11px] tabular-nums text-white/35">
                                {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                              </time>
                            </span>

                            <span
                              className={cn(
                                "mt-0.5 inline-block text-[10px] font-semibold uppercase tracking-wider",
                                label.alert ? "text-rose-400" : "text-white/40"
                              )}
                            >
                              {label.text}
                            </span>

                            {!isExpanded && (
                              <span className="mt-1 line-clamp-1 block text-[12px] text-white/50 leading-relaxed">
                                {notif.message}
                              </span>
                            )}
                          </span>

                          <motion.span
                            animate={{ rotate: isExpanded ? 90 : 0 }}
                            transition={spring}
                            className="mt-0.5 shrink-0 text-white/30"
                          >
                            <ChevronRight size={14} />
                          </motion.span>
                        </button>

                        {/* Expanded details */}
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ ...spring, opacity: { duration: 0.15 } }}
                              className="overflow-hidden"
                            >
                              <div className="space-y-2.5 pl-6 pr-2 pt-2 pb-1">
                                <p className="text-[13px] leading-relaxed text-white/75">{notif.message}</p>

                                {hasMeta && (
                                  <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-2.5 text-[12px]">
                                    {meta!.trackName && (
                                      <div className="text-white/90 font-medium">
                                        {meta!.trackName}
                                        {meta!.artistName && (
                                          <span className="text-white/50 font-normal">
                                            {" "}
                                            · {meta!.artistName}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    {meta!.reason && (
                                      <div className="mt-1 text-white/50">{meta!.reason}</div>
                                    )}
                                    {meta!.url && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setIsNotificationsOpen(false);
                                          router.push(meta!.url!);
                                        }}
                                        className="mt-2 text-xs font-semibold text-brand hover:underline cursor-pointer flex items-center gap-1"
                                      >
                                        View details →
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

