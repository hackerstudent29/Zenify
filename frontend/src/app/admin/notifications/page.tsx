"use client";

import { SEO } from "@/components/shared/SEO";
import { useAuthStore } from "@/store/authStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  motion,
  AnimatePresence,
  LayoutGroup,
  useReducedMotion,
  type Transition,
} from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

/* ------------------------------------------------------------------ */
/* Motion tokens                                                       */
/* ------------------------------------------------------------------ */
const spring: Transition = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 };
const softSpring: Transition = { type: "spring", stiffness: 260, damping: 28 };
const bouncy: Transition = { type: "spring", stiffness: 560, damping: 22 };

/* ------------------------------------------------------------------ */
/* SF Symbols–style icons (rounded caps, 1.8 stroke)                   */
/* ------------------------------------------------------------------ */
const Sf = ({ size = 18, children, className }: { size?: number; children: ReactNode; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    {children}
  </svg>
);

const IconBell = (p: { size?: number; className?: string }) => (
  <Sf {...p}>
    <path d="M6 9.5a6 6 0 0 1 12 0c0 4.2 1.4 5.6 2 6.5H4c.6-.9 2-2.3 2-6.5Z" />
    <path d="M10 19.5a2.2 2.2 0 0 0 4 0" />
  </Sf>
);
const IconCheckCircle = (p: { size?: number; className?: string }) => (
  <Sf {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.4 2.7 2.6L16 9.5" />
  </Sf>
);
const IconXCircle = (p: { size?: number; className?: string }) => (
  <Sf {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m9 9 6 6M15 9l-6 6" />
  </Sf>
);
const IconWarning = (p: { size?: number; className?: string }) => (
  <Sf {...p}>
    <path d="M12 4.2 21 19.5H3L12 4.2Z" />
    <path d="M12 10v4.2" />
    <circle cx="12" cy="16.9" r=".6" fill="currentColor" />
  </Sf>
);
const IconInfo = (p: { size?: number; className?: string }) => (
  <Sf {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <circle cx="12" cy="7.9" r=".6" fill="currentColor" />
  </Sf>
);
const IconMusic = (p: { size?: number; className?: string }) => (
  <Sf {...p}>
    <path d="M9 17.5V6l10-2v11.5" />
    <circle cx="6.5" cy="17.5" r="2.5" />
    <circle cx="16.5" cy="15.5" r="2.5" />
  </Sf>
);
const IconChevron = (p: { size?: number; className?: string }) => (
  <Sf {...p}>
    <path d="m9 6 6 6-6 6" />
  </Sf>
);
const IconArrowUpRight = (p: { size?: number; className?: string }) => (
  <Sf {...p}>
    <path d="M7 17 17 7M9 7h8v8" />
  </Sf>
);
const IconCheckAll = (p: { size?: number; className?: string }) => (
  <Sf {...p}>
    <path d="m3.5 12.5 3.5 3.5 7-8" />
    <path d="m11.5 15.5.5.5 8-9" />
  </Sf>
);

/* ------------------------------------------------------------------ */
/* Type config (iOS Settings-style gradient tiles)                     */
/* ------------------------------------------------------------------ */
type NotifType = "upload_success" | "upload_failed" | "content_denied" | "system_info";

const TYPE_CONFIG: Record<
  NotifType | "default",
  { icon: typeof IconBell; tile: string; text: string; glow: string }
> = {
  upload_success: {
    icon: IconCheckCircle,
    tile: "from-[#34d399] to-[#059669]",
    text: "text-emerald-300",
    glow: "shadow-[0_6px_16px_-4px_rgba(16,185,129,0.55)]",
  },
  upload_failed: {
    icon: IconWarning,
    tile: "from-[#fbbf24] to-[#d97706]",
    text: "text-amber-300",
    glow: "shadow-[0_6px_16px_-4px_rgba(245,158,11,0.55)]",
  },
  content_denied: {
    icon: IconXCircle,
    tile: "from-[#fb7185] to-[#e11d48]",
    text: "text-rose-300",
    glow: "shadow-[0_6px_16px_-4px_rgba(244,63,94,0.55)]",
  },
  system_info: {
    icon: IconInfo,
    tile: "from-[#60a5fa] to-[#2563eb]",
    text: "text-sky-300",
    glow: "shadow-[0_6px_16px_-4px_rgba(59,130,246,0.55)]",
  },
  default: {
    icon: IconBell,
    tile: "from-[#a1a1aa] to-[#52525b]",
    text: "text-zinc-300",
    glow: "shadow-[0_6px_16px_-4px_rgba(113,113,122,0.5)]",
  },
};

const getConfig = (type: string) => TYPE_CONFIG[(type as NotifType)] ?? TYPE_CONFIG.default;

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */
function IconTile({ type, read }: { type: string; read: boolean }) {
  const { icon: Icon, tile, glow } = getConfig(type);
  return (
    <motion.div
      animate={{ scale: read ? 0.94 : 1, opacity: read ? 0.55 : 1 }}
      transition={spring}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-[10px] bg-gradient-to-b text-white sm:size-10 sm:rounded-xl",
        "ring-1 ring-inset ring-white/20",
        tile,
        !read && glow
      )}
    >
      <Icon size={18} />
    </motion.div>
  );
}

function UnreadDot() {
  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={bouncy}
      className="relative grid size-2.5 shrink-0 place-items-center"
    >
      <span className="absolute inset-0 animate-ping rounded-full bg-sky-400/50 [animation-duration:2.4s]" />
      <span className="relative size-2 rounded-full bg-sky-400" />
    </motion.span>
  );
}

function Segmented({
  value,
  onChange,
  unread,
}: {
  value: "all" | "unread";
  onChange: (v: "all" | "unread") => void;
  unread: number;
}) {
  const options: { id: "all" | "unread"; label: string }[] = [
    { id: "all", label: "All" },
    { id: "unread", label: "Unread" },
  ];
  return (
    <LayoutGroup id="notif-seg">
      <div
        role="tablist"
        className="relative flex rounded-[11px] bg-white/[0.06] p-[3px] ring-1 ring-inset ring-white/[0.06]"
      >
        {options.map((o) => {
          const active = value === o.id;
          return (
            <motion.button
              key={o.id}
              role="tab"
              aria-selected={active}
              whileTap={{ scale: 0.96 }}
              transition={spring}
              onClick={() => onChange(o.id)}
              className={cn(
                "relative z-10 flex min-w-[76px] items-center justify-center gap-1.5 rounded-[9px] px-4 py-1.5 text-[13px] font-medium",
                "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-400/60",
                active ? "text-white" : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              {active && (
                <motion.span
                  layoutId="seg-pill"
                  transition={spring}
                  className="absolute inset-0 -z-10 rounded-[9px] bg-white/[0.14] shadow-[0_1px_3px_rgba(0,0,0,0.4)] ring-1 ring-inset ring-white/10"
                />
              )}
              {o.label}
              <AnimatePresence initial={false}>
                {o.id === "unread" && unread > 0 && (
                  <motion.span
                    key="count"
                    initial={{ scale: 0, width: 0 }}
                    animate={{ scale: 1, width: "auto" }}
                    exit={{ scale: 0, width: 0 }}
                    transition={spring}
                    className="overflow-hidden rounded-full bg-sky-500 px-1.5 text-[11px] font-semibold leading-[18px] text-white tabular-nums"
                  >
                    {unread}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function AdminNotificationsPage() {
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const {
    notifications,
    markAsRead: storeMarkRead,
    markAllAsRead: storeMarkAllAsRead,
  } = useNotificationStore();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "ADMIN") {
      router.replace("/");
    }
  }, [isAuthenticated, user, router]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

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

  const filtered = notifications.filter((n) => filter === "all" || !n.read);

  if (!user || user.role !== "ADMIN") return null;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-[max(8rem,env(safe-area-inset-bottom))] pt-20 sm:px-6 sm:pt-24 md:pt-28 lg:max-w-4xl lg:px-8">
      <SEO title="Push Notifications – Zenify Admin" noindex={true} path="/admin/notifications" />

      {/* Header */}
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={softSpring}
        className="mb-6 flex flex-col gap-5 md:mb-8 md:flex-row md:items-end md:justify-between"
      >
        <div className="flex items-center gap-3.5">
          <motion.div
            whileHover={{ rotate: [0, -14, 12, -8, 0], transition: { duration: 0.6 } }}
            className="grid size-11 place-items-center rounded-[13px] bg-gradient-to-b from-[#fb7185] to-[#e11d48] text-white shadow-[0_8px_20px_-6px_rgba(244,63,94,0.6)] ring-1 ring-inset ring-white/25 md:size-12"
          >
            <IconBell size={22} />
          </motion.div>
          <div>
            <h1 className="text-[28px] font-bold leading-none tracking-tight text-white md:text-[34px]">
              Notifications
            </h1>
            <p className="mt-1.5 text-[13px] text-zinc-400 md:text-sm">
              {unreadCount > 0 ? (
                <>
                  <span className="font-medium tabular-nums text-zinc-200">{unreadCount}</span> unread · system events and asset status
                </>
              ) : (
                "System events and asset status"
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 md:justify-end">
          <Segmented value={filter} onChange={setFilter} unread={unreadCount} />
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.03 }}
            transition={spring}
            onClick={handleMarkAllAsRead}
            disabled={unreadCount === 0}
            className={cn(
              "flex items-center gap-1.5 rounded-[11px] px-3 py-2 text-[13px] font-medium",
              "bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-400/20 outline-none",
              "hover:bg-sky-500/25 focus-visible:ring-2 focus-visible:ring-sky-400/60",
              "disabled:pointer-events-none disabled:opacity-30"
            )}
          >
            <IconCheckAll size={16} />
            <span className="hidden sm:inline">Mark all read</span>
            <span className="sm:hidden">Read all</span>
          </motion.button>
        </div>
      </motion.header>

      {/* List */}
      <LayoutGroup>
        <motion.div
          layout
          transition={spring}
          className="overflow-hidden rounded-[22px] bg-white/[0.035] ring-1 ring-inset ring-white/[0.07] backdrop-blur-xl"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {filtered.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={softSpring}
                className="flex flex-col items-center px-6 py-16 text-center md:py-24"
              >
                <motion.div
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ ...bouncy, delay: 0.1 }}
                  className="mb-4 grid size-16 place-items-center rounded-[20px] bg-gradient-to-b from-[#34d399] to-[#059669] text-white shadow-[0_12px_28px_-8px_rgba(16,185,129,0.6)] ring-1 ring-inset ring-white/25"
                >
                  <IconCheckCircle size={30} />
                </motion.div>
                <h3 className="text-[17px] font-semibold text-white">You’re all caught up</h3>
                <p className="mt-1 text-sm text-zinc-400">
                  {filter === "unread" ? "Nothing unread right now." : "New notifications will show up here."}
                </p>
              </motion.div>
            ) : (
              filtered.map((notif, i) => {
                const isExpanded = expandedId === notif.id;
                const cfg = getConfig(notif.type);
                const hasMeta = notif.metadata && Object.keys(notif.metadata).length > 0;

                return (
                  <motion.div
                    key={notif.id}
                    layout="position"
                    initial={reduce ? false : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
                    transition={{ ...spring, delay: Math.min(i, 8) * 0.035 }}
                    className={cn(
                      "relative",
                      i !== 0 && "before:absolute before:left-[60px] before:right-0 before:top-0 before:h-px before:bg-white/[0.06] sm:before:left-[68px]"
                    )}
                  >
                    <motion.div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      whileTap={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                      transition={{ duration: 0.12 }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedId(isExpanded ? null : notif.id);
                          handleToggleRead(notif.id, notif.read);
                        }
                      }}
                      onClick={() => {
                        setExpandedId(isExpanded ? null : notif.id);
                        handleToggleRead(notif.id, notif.read);
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 px-3.5 py-3 outline-none sm:gap-4 sm:px-4 sm:py-3.5",
                        "hover:bg-white/[0.03] focus-visible:bg-white/[0.05]",
                        isExpanded && "bg-white/[0.03]"
                      )}
                    >
                      <IconTile type={notif.type} read={notif.read} />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "truncate text-[15px] leading-tight transition-colors duration-300",
                              notif.read ? "font-normal text-zinc-400" : "font-semibold text-white"
                            )}
                          >
                            {notif.title}
                          </span>
                          <AnimatePresence>{!notif.read && <UnreadDot />}</AnimatePresence>
                        </div>
                        <AnimatePresence initial={false}>
                          {!isExpanded && (
                            <motion.p
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={spring}
                              className="mt-0.5 truncate text-[13px] text-zinc-500"
                            >
                              {notif.message}
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
                        <span className="hidden text-[12px] tabular-nums text-zinc-500 sm:block">
                          {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                        </span>
                        <motion.span
                          animate={{ rotate: isExpanded ? 90 : 0 }}
                          transition={spring}
                          className="text-zinc-600"
                        >
                          <IconChevron size={16} />
                        </motion.span>
                      </div>
                    </motion.div>

                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          key="content"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ ...spring, opacity: { duration: 0.2 } }}
                          className="overflow-hidden"
                        >
                          <motion.div
                            initial={{ y: -6 }}
                            animate={{ y: 0 }}
                            transition={spring}
                            className="pb-4 pl-[58px] pr-4 sm:pl-[72px] sm:pr-6"
                          >
                            <p className={cn("text-sm leading-relaxed", cfg.text)}>{notif.message}</p>

                            <span className="mt-2 block text-[12px] tabular-nums text-zinc-500 sm:hidden">
                              {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                            </span>

                            {hasMeta && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.97, y: 6 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                transition={{ ...spring, delay: 0.06 }}
                                className="mt-3 w-full rounded-2xl bg-black/30 p-3 ring-1 ring-inset ring-white/[0.06] sm:inline-block sm:w-auto sm:min-w-[260px]"
                              >
                                {notif.metadata!.trackName && (
                                  <div className="flex items-center gap-2.5">
                                    <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-b from-[#fb7185] to-[#e11d48] text-white">
                                      <IconMusic size={15} />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="truncate text-[13px] font-medium text-zinc-100">
                                        {notif.metadata!.trackName}
                                      </p>
                                      <p className="truncate text-[12px] text-zinc-500">
                                        {notif.metadata!.artistName}
                                      </p>
                                    </div>
                                  </div>
                                )}
                                {notif.metadata!.reason && (
                                  <p className="mt-2 text-[12px] italic leading-relaxed text-zinc-400">
                                    {notif.metadata!.reason}
                                  </p>
                                )}
                                {notif.metadata!.url && (
                                  <motion.button
                                    whileTap={{ scale: 0.95 }}
                                    whileHover={{ x: 2 }}
                                    transition={spring}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(notif.metadata!.url!);
                                    }}
                                    className="mt-2.5 flex items-center gap-1 rounded-md text-[13px] font-medium text-sky-400 outline-none hover:text-sky-300 focus-visible:ring-2 focus-visible:ring-sky-400/60"
                                  >
                                    View action
                                    <IconArrowUpRight size={14} />
                                  </motion.button>
                                )}
                              </motion.div>
                            )}
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>
    </div>
  );
}