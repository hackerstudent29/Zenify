"use client";

import { SEO } from "@/components/shared/SEO";
import { useAuthStore } from "@/store/authStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, LayoutGroup, MotionConfig, type Transition } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

const spring: Transition = { type: "spring", stiffness: 420, damping: 34 };

const LABELS: Record<string, { text: string; alert?: boolean }> = {
  upload_success: { text: "Upload" },
  upload_failed: { text: "Upload failed", alert: true },
  content_denied: { text: "Content denied", alert: true },
  system_info: { text: "System" },
};

export default function AdminNotificationsPage() {
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const { notifications, markAsRead: storeMarkRead, markAllAsRead: storeMarkAllAsRead } = useNotificationStore();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "ADMIN") router.replace("/");
  }, [isAuthenticated, user, router]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const filtered = notifications.filter((n) => filter === "all" || !n.read);

  const handleMarkAllAsRead = async () => {
    storeMarkAllAsRead();
    await api.patch("/notifications/read-all");
  };

  const handleToggleRead = async (id: string, currentRead: boolean) => {
    if (!currentRead) {
      storeMarkRead(id);
      await api.patch(`/notifications/${id}/read`);
    }
  };

  if (!user || user.role !== "ADMIN") return null;

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto w-full max-w-3xl flex-1 px-5 pb-[max(8rem,env(safe-area-inset-bottom))] pt-8 sm:px-8 md:pt-12">
        <SEO title="Push Notifications – Zenify Admin" noindex={true} path="/admin/notifications" />

        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">Notifications</h1>
            <p className="mt-1 text-sm text-white/45">
              {unreadCount > 0 ? `${unreadCount} unread` : "Upload and system events"}
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <LayoutGroup id="notif-filter">
              <div role="tablist" className="flex rounded-lg bg-white/[0.07] p-0.5">
                {(["all", "unread"] as const).map((f) => (
                  <button
                    key={f}
                    role="tab"
                    aria-selected={filter === f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "relative rounded-md px-4 py-1.5 text-[13px] font-medium capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/40",
                      filter === f ? "text-white" : "text-white/50 hover:text-white/80"
                    )}
                  >
                    {filter === f && (
                      <motion.span layoutId="filter-pill" transition={spring} className="absolute inset-0 rounded-md bg-white/[0.14]" />
                    )}
                    <span className="relative">{f}</span>
                  </button>
                ))}
              </div>
            </LayoutGroup>

            <button
              onClick={handleMarkAllAsRead}
              disabled={unreadCount === 0}
              className="text-[13px] font-medium text-white/70 outline-none transition-opacity hover:text-white focus-visible:underline disabled:pointer-events-none disabled:opacity-30"
            >
              Mark all as read
            </button>
          </div>
        </motion.header>

        <ul className="mt-6 divide-y divide-white/[0.08] border-y border-white/[0.08]">
          <AnimatePresence mode="popLayout" initial={false}>
            {filtered.length === 0 ? (
              <motion.li
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-20 text-center"
              >
                <p className="text-[15px] font-medium text-white">
                  {filter === "unread" ? "No unread notifications" : "No notifications"}
                </p>
                <p className="mt-1 text-sm text-white/40">New events will appear here.</p>
              </motion.li>
            ) : (
              filtered.map((notif, i) => {
                const isExpanded = expandedId === notif.id;
                const label = LABELS[notif.type] ?? { text: "Notification" };
                const meta = notif.metadata;
                const hasMeta = meta && Object.keys(meta).length > 0;

                return (
                  <motion.li
                    key={notif.id}
                    layout="position"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    transition={{ ...spring, delay: Math.min(i, 8) * 0.03 }}
                  >
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => {
                        setExpandedId(isExpanded ? null : notif.id);
                        handleToggleRead(notif.id, notif.read);
                      }}
                      className="flex w-full items-start gap-3 py-3.5 text-left outline-none transition-colors hover:bg-white/[0.025] focus-visible:bg-white/[0.04] active:bg-white/[0.05]"
                    >
                      <span className="mt-[7px] flex w-2 shrink-0 justify-center">
                        <AnimatePresence>
                          {!notif.read && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              exit={{ scale: 0 }}
                              transition={spring}
                              className="size-2 rounded-full bg-white"
                            />
                          )}
                        </AnimatePresence>
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className={cn("truncate text-[15px] transition-colors", notif.read ? "text-white/55" : "font-semibold text-white")}>
                            {notif.title}
                          </span>
                          <time className="shrink-0 text-xs tabular-nums text-white/35">
                            {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                          </time>
                        </span>
                        <span className={cn("mt-0.5 block text-xs", label.alert ? "text-rose-300/80" : "text-white/35")}>
                          {label.text}
                        </span>
                        <AnimatePresence initial={false}>
                          {!isExpanded && (
                            <motion.span
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={spring}
                              className="block overflow-hidden"
                            >
                              <span className="mt-1 line-clamp-1 block text-[13px] text-white/45">{notif.message}</span>
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </span>

                      <motion.svg
                        animate={{ rotate: isExpanded ? 90 : 0 }}
                        transition={spring}
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mt-1.5 shrink-0 text-white/30"
                        aria-hidden
                      >
                        <path d="m9 5 7 7-7 7" />
                      </motion.svg>
                    </button>

                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ ...spring, opacity: { duration: 0.2 } }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-3 pb-4 pl-5 pr-6">
                            <p className="text-[14px] leading-relaxed text-white/70">{notif.message}</p>
                            {hasMeta && (
                              <dl className="space-y-1 border-l border-white/10 pl-3 text-[13px]">
                                {meta!.trackName && (
                                  <div className="text-white/80">
                                    {meta!.trackName}
                                    {meta!.artistName && <span className="text-white/40"> by {meta!.artistName}</span>}
                                  </div>
                                )}
                                {meta!.reason && <div className="text-white/45">{meta!.reason}</div>}
                                {meta!.url && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(meta!.url!);
                                    }}
                                    className="pt-1 font-medium text-white underline-offset-4 outline-none hover:underline focus-visible:underline"
                                  >
                                    Open
                                  </button>
                                )}
                              </dl>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                );
              })
            )}
          </AnimatePresence>
        </ul>
      </div>
    </MotionConfig>
  );
}
