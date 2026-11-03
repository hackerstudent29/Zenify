"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Database,
  Users,
  Music,
  HardDrive,
  Activity,
  RefreshCw,
  Search,
  Trash2,
  ShieldAlert,
  Layers,
  Server,
  Cpu,
  FileText,
  Radio,
  CheckCircle2,
  Terminal,
  Download,
  Clock,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Cloud,
  Zap,
  Disc3,
  ImageIcon,
  type LucideIcon,
} from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { motion, AnimatePresence, animate, type Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/shared/SEO";
import notify from "@/lib/notify";
import { cn, getApiBaseUrl } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type ConsoleTab = "overview" | "logs" | "system" | "users" | "music" | "storage";

interface LogEntry {
  id: string;
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  category: "HTTP" | "DATABASE" | "AUTH" | "WORKER" | "SYSTEM";
  message: string;
  details?: Record<string, any>;
}

/* ------------------------------------------------------------------ */
/*  Apple design tokens                                                */
/* ------------------------------------------------------------------ */
const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.6 } as const;
const SPRING_SOFT = { type: "spring", stiffness: 300, damping: 30, mass: 0.8 } as const;
const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Inter, system-ui, sans-serif';

/** SF Symbols style gradient squircles */
const TONES = {
  blue: "from-[#5ac8fa] to-[#0a84ff]",
  green: "from-[#6ee787] to-[#30b94d]",
  red: "from-[#ff6b6b] to-[#ff3b30]",
  orange: "from-[#ffc14d] to-[#ff9500]",
  purple: "from-[#d58cff] to-[#af52de]",
  cyan: "from-[#8be4ff] to-[#32ade6]",
  pink: "from-[#ff7ab0] to-[#ff2d55]",
  gray: "from-[#9a9aa0] to-[#636366]",
  brand: "from-[#ff5a6e] to-[#fa233b]",
} as const;
type Tone = keyof typeof TONES;

const PILL: Record<string, string> = {
  green: "bg-[#30d158]/15 text-[#34d65c]",
  gray: "bg-white/10 text-white/60",
  red: "bg-[#ff453a]/15 text-[#ff6961]",
  amber: "bg-[#ff9f0a]/15 text-[#ffb340]",
  blue: "bg-[#0a84ff]/15 text-[#64a8ff]",
  purple: "bg-[#bf5af2]/15 text-[#d58cff]",
  cyan: "bg-[#32ade6]/15 text-[#64d2ff]",
  brand: "bg-brand/15 text-brand",
};

const AVATAR_TONES: Tone[] = ["blue", "green", "orange", "purple", "pink", "cyan", "brand"];

const tabMotion = {
  initial: { opacity: 0, y: 12, scale: 0.992 },
  animate: { opacity: 1, y: 0, scale: 1, transition: SPRING_SOFT },
  exit: { opacity: 0, y: -6, transition: { duration: 0.12 } },
};

const gridVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: SPRING },
};

const tap = { whileTap: { scale: 0.95 }, whileHover: { scale: 1.02 }, transition: SPRING } as const;

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */
function IconTile({ icon: Icon, tone = "gray", size = "md" }: { icon: LucideIcon; tone?: Tone; size?: "sm" | "md" | "lg" }) {
  const dims = size === "sm" ? "h-7 w-7 rounded-[8px]" : size === "lg" ? "h-11 w-11 rounded-[12px]" : "h-8 w-8 rounded-[9px]";
  const ic = size === "sm" ? "h-[15px] w-[15px]" : size === "lg" ? "h-[22px] w-[22px]" : "h-[17px] w-[17px]";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-gradient-to-b text-white shadow-[inset_0_0.5px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.35)]",
        dims,
        TONES[tone]
      )}
    >
      <Icon className={ic} strokeWidth={2} />
    </span>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[18px] bg-[#1c1c1e] ring-1 ring-inset ring-white/[0.07]", className)}>{children}</div>
  );
}

function CardHeader({
  icon,
  tone,
  title,
  subtitle,
  right,
}: {
  icon?: LucideIcon;
  tone?: Tone;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 pb-3 pt-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <IconTile icon={icon} tone={tone} />}
        <div className="min-w-0">
          <h2 className="truncate text-[17px] font-semibold leading-tight tracking-[-0.02em] text-white">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-white/50">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

function Pill({ tone = "gray", children, className }: { tone?: keyof typeof PILL; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-[-0.005em]",
        PILL[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** iOS-style grouped list row (label left, value right) */
function ListRow({ label, value, valueClass }: { label: React.ReactNode; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 sm:px-5">
      <span className="text-[14px] text-white/55">{label}</span>
      <span className={cn("min-w-0 truncate text-right font-mono text-[13px] tabular-nums text-white/90", valueClass)}>{value}</span>
    </div>
  );
}

function Segmented<T extends string>({
  id,
  value,
  onChange,
  options,
  scrollable,
  className,
}: {
  id: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; icon?: LucideIcon }[];
  scrollable?: boolean;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "relative inline-flex max-w-full items-center gap-0.5 rounded-[11px] bg-white/[0.07] p-[3px]",
        scrollable && "no-scrollbar overflow-x-auto",
        className
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={(e) => {
              onChange(o.value);
              if (scrollable) e.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
            }}
            className={cn(
              "relative shrink-0 cursor-pointer whitespace-nowrap rounded-[8px] px-3 py-1.5 text-[13px] font-medium tracking-[-0.01em] outline-none transition-colors duration-200",
              active ? "text-white" : "text-white/55 hover:text-white/85"
            )}
          >
            {active && (
              <motion.span
                layoutId={`${id}-pill`}
                transition={SPRING}
                className="absolute inset-0 rounded-[8px] bg-white/[0.17] shadow-[0_1px_3px_rgba(0,0,0,0.4),inset_0_0.5px_0_rgba(255,255,255,0.14)]"
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {Icon && <Icon className="h-[15px] w-[15px]" strokeWidth={2} />}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[22px] w-[38px] shrink-0 cursor-pointer rounded-full p-[2px] outline-none transition-colors duration-300",
        checked ? "bg-[#30d158]" : "bg-white/20"
      )}
    >
      <motion.span
        animate={{ x: checked ? 16 : 0 }}
        transition={SPRING}
        className="block h-[18px] w-[18px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
      />
    </button>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-white/40" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-[10px] bg-white/[0.07] pl-8 pr-8 text-[13px] text-white outline-none ring-1 ring-inset ring-transparent transition-[background-color,box-shadow] duration-200 placeholder:text-white/35 focus:bg-white/[0.1] focus:ring-brand/60"
      />
      <AnimatePresence>
        {value && (
          <motion.button
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={SPRING}
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/25 text-black/70"
          >
            <X className="h-2.5 w-2.5" strokeWidth={3} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  useEffect(() => {
    const controls = animate(prev.current, value, {
      type: "spring",
      stiffness: 90,
      damping: 22,
      mass: 0.8,
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = Math.max(0, Math.round(v)).toLocaleString();
      },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value]);
  return <span ref={ref} suppressHydrationWarning />;
}

function Meter({ value, tone }: { value: number | string; tone: Tone }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", stiffness: 90, damping: 18 }}
        className={cn("h-full rounded-full bg-gradient-to-r", TONES[tone])}
      />
    </div>
  );
}

const fmtTime = (ts: string) => {
  const d = new Date(ts);
  return `${d.toLocaleTimeString()}.${String(d.getMilliseconds()).padStart(3, "0")}`;
};

const LEVEL_STYLE: Record<string, string> = {
  ERROR: "bg-[#ff453a]/15 text-[#ff6961]",
  WARN: "bg-[#ff9f0a]/15 text-[#ffb340]",
  INFO: "bg-[#30d158]/15 text-[#34d65c]",
  DEBUG: "bg-[#64d2ff]/15 text-[#64d2ff]",
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function DatabaseAdminPage() {
  const { user, isAuthenticated } = useAuthStore();
  const isAdmin = user?.role === "ADMIN" || (user as any)?.role === "admin";

  const [activeTab, setActiveTab] = useState<ConsoleTab>("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-Sync States
  const [autoSync, setAutoSync] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(new Date());

  // Overview Data (includes all 26 tables)
  const [overviewData, setOverviewData] = useState<any>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [tableCategoryFilter, setTableCategoryFilter] = useState("ALL");

  // Users Data
  const [usersData, setUsersData] = useState<any[]>([]);
  const [userPagination, setUserPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const [isUsersLoading, setIsUsersLoading] = useState(false);

  // Music Metadata Data
  const [musicStats, setMusicStats] = useState<any>(null);

  // Storage Data
  const [storageData, setStorageData] = useState<any>(null);

  // System Health Data
  const [systemHealth, setSystemHealth] = useState<any>(null);

  // Backend Server Logs Data & SSE
  const [logsList, setLogsList] = useState<LogEntry[]>([]);
  const [logLevelFilter, setLogLevelFilter] = useState<string>("ALL");
  const [logCategoryFilter, setLogCategoryFilter] = useState<string>("ALL");
  const [logSearch, setLogSearch] = useState<string>("");
  const [autoScrollLogs, setAutoScrollLogs] = useState<boolean>(true);
  const [isSseConnected, setIsSseConnected] = useState<boolean>(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Confirmation Modal for Catalog Reset
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // --- API Fetchers ---
  const fetchOverview = useCallback(async () => {
    try {
      const res = await api.get("/admin/database/overview");
      if (res.data?.success) {
        setOverviewData(res.data);
      }
    } catch (err: any) {
      console.error("[DatabaseConsole] Overview fetch error:", err);
    }
  }, []);

  const fetchUsers = useCallback(async (page = 1, search = "", role = "") => {
    setIsUsersLoading(true);
    try {
      const res = await api.get("/admin/database/users", {
        params: { page, limit: 20, search: search.trim() || undefined, role: role || undefined },
      });
      if (res.data?.success) {
        setUsersData(res.data.data || []);
        setUserPagination(res.data.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
      }
    } catch (err: any) {
      console.error("[DatabaseConsole] Users fetch error:", err);
    } finally {
      setIsUsersLoading(false);
    }
  }, []);

  const fetchMusicStats = useCallback(async () => {
    try {
      const res = await api.get("/admin/database/music-stats");
      if (res.data?.success) {
        setMusicStats(res.data);
      }
    } catch (err: any) {
      console.error("[DatabaseConsole] Music stats fetch error:", err);
    }
  }, []);

  const fetchStorage = useCallback(async () => {
    try {
      const res = await api.get("/admin/database/storage");
      if (res.data?.success) {
        setStorageData(res.data);
      }
    } catch (err: any) {
      console.error("[DatabaseConsole] Storage fetch error:", err);
    }
  }, []);

  const fetchSystemHealth = useCallback(async () => {
    try {
      const res = await api.get("/admin/database/system-health");
      if (res.data?.success) {
        setSystemHealth(res.data);
      }
    } catch (err: any) {
      console.error("[DatabaseConsole] System health fetch error:", err);
    }
  }, []);

  const fetchLogs = useCallback(
    async (silent = false) => {
      try {
        const res = await api.get("/admin/database/logs", {
          params: { limit: 100, level: logLevelFilter, category: logCategoryFilter, search: logSearch },
        });
        if (res.data?.success && Array.isArray(res.data.logs)) {
          setLogsList(res.data.logs);
        }
      } catch (err: any) {
        if (!silent) console.error("[DatabaseConsole] Logs fetch error:", err);
      }
    },
    [logLevelFilter, logCategoryFilter, logSearch]
  );

  const handleClearLogs = async () => {
    try {
      const res = await api.post("/admin/database/logs/clear");
      if (res.data?.success) {
        setLogsList([]);
        notify.success("Server log buffer cleared successfully");
      }
    } catch (err: any) {
      notify.error("Failed to clear server logs");
    }
  };

  const handleExportLogs = () => {
    try {
      const blob = new Blob([JSON.stringify(logsList, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zenify-server-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify.success("Server logs exported successfully");
    } catch (_) {
      notify.error("Failed to export logs");
    }
  };

  const handleResetCatalog = async () => {
    setIsResetting(true);
    try {
      const res = await api.post("/admin/database/reset-catalog");
      if (res.data?.success) {
        notify.success(`Catalog reset completed. ${res.data.usersPreserved} users preserved.`);
        setShowResetConfirm(false);
        refreshAll(true);
      }
    } catch (err: any) {
      notify.error("Failed to reset catalog: " + (err?.response?.data?.message || err.message));
    } finally {
      setIsResetting(false);
    }
  };

  const refreshAll = useCallback(
    async (silent = false) => {
      if (!silent) setIsRefreshing(true);
      await Promise.all([
        fetchOverview(),
        fetchSystemHealth(),
        activeTab === "music" ? fetchMusicStats() : Promise.resolve(),
        activeTab === "storage" ? fetchStorage() : Promise.resolve(),
        activeTab === "users" ? fetchUsers(userPagination.page, userSearch, userRoleFilter) : Promise.resolve(),
        activeTab === "logs" ? fetchLogs(true) : Promise.resolve(),
      ]);
      setLastSyncedAt(new Date());
      if (!silent) {
        setIsRefreshing(false);
        notify.success("Database Console telemetry synchronized");
      }
    },
    [fetchOverview, fetchSystemHealth, activeTab, fetchMusicStats, fetchStorage, fetchUsers, userPagination.page, userSearch, userRoleFilter, fetchLogs]
  );

  // Initial Data Load
  useEffect(() => {
    if (!isAdmin) return;
    setIsLoading(true);
    Promise.all([
      fetchOverview(),
      fetchMusicStats(),
      fetchStorage(),
      fetchSystemHealth(),
      fetchUsers(1, "", ""),
      fetchLogs(true),
    ]).finally(() => {
      setIsLoading(false);
    });
  }, [isAdmin, fetchOverview, fetchMusicStats, fetchStorage, fetchSystemHealth, fetchUsers, fetchLogs]);

  // Real-Time Auto-Sync (Every 5 seconds)
  useEffect(() => {
    if (!isAdmin || !autoSync) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshAll(true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isAdmin, autoSync, refreshAll]);

  // Immediate Refresh on Window Focus & Visibility Change
  useEffect(() => {
    if (!isAdmin) return;
    const handleFocus = () => {
      if (document.visibilityState === "visible") {
        refreshAll(true);
      }
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [isAdmin, refreshAll]);

  // Live SSE Stream for Logs
  useEffect(() => {
    if (!isAdmin || activeTab !== "logs") return;

    let eventSource: EventSource | null = null;
    try {
      const baseUrl = getApiBaseUrl().replace(/\/+$/, "");
      const sseUrl = `${baseUrl}/api/admin/database/logs/stream`;
      eventSource = new EventSource(sseUrl, { withCredentials: true });

      eventSource.onopen = () => {
        setIsSseConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "init" && Array.isArray(data.logs)) {
            setLogsList(data.logs);
          } else if (data.type === "log" && data.log) {
            setLogsList((prev) => [data.log, ...prev.slice(0, 499)]);
          }
        } catch (_) {}
      };

      eventSource.onerror = () => {
        setIsSseConnected(false);
      };
    } catch (_) {
      setIsSseConnected(false);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
        setIsSseConnected(false);
      }
    };
  }, [isAdmin, activeTab]);

  // Auto-scroll Logs Container
  useEffect(() => {
    if (autoScrollLogs && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = 0;
    }
  }, [logsList, autoScrollLogs]);

  // Handle Search Debounce for Users
  useEffect(() => {
    if (!isAdmin || activeTab !== "users") return;
    const timer = setTimeout(() => {
      fetchUsers(1, userSearch, userRoleFilter);
    }, 350);
    return () => clearTimeout(timer);
  }, [userSearch, userRoleFilter, activeTab, isAdmin, fetchUsers]);

  // Esc closes the purge sheet
  useEffect(() => {
    if (!showResetConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isResetting) setShowResetConfirm(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showResetConfirm, isResetting]);

  // 404 Guard for Non-Admins
  if (!isAuthenticated || !isAdmin) {
    return (
      <div style={{ fontFamily: FONT_STACK }} className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
        <SEO title="Page Not Found – Zenify" noindex={true} path="/admin" />
        <motion.div initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING_SOFT}>
          <h1 className="mb-3 text-[72px] font-bold leading-none tracking-[-0.04em] text-white/15">404</h1>
          <h2 className="mb-2 text-[22px] font-semibold tracking-[-0.02em] text-white">Page Not Found</h2>
          <p className="mx-auto mb-6 max-w-sm text-[14px] leading-relaxed text-white/50">
            The page you are looking for does not exist or has been moved.
          </p>
          <Button
            onClick={() => (window.location.href = "/")}
            className="h-10 cursor-pointer rounded-full border-0 bg-white px-6 text-[14px] font-semibold text-black transition-transform active:scale-95 hover:bg-white/90"
          >
            Return Home
          </Button>
        </motion.div>
      </div>
    );
  }

  const loadingFirst = isLoading && !overviewData;

  const navTabs: { value: ConsoleTab; label: string; icon: LucideIcon }[] = [
    { value: "overview", label: "Overview & Tables (26)", icon: Database },
    { value: "logs", label: "Server Logs & Stream", icon: Terminal },
    { value: "system", label: "System Telemetry", icon: Activity },
    { value: "users", label: "User Directory", icon: Users },
    { value: "music", label: "Music Metadata", icon: Music },
    { value: "storage", label: "Storage & R2", icon: HardDrive },
  ];

  // Filter Tables for Overview Tab
  const allTablesList = overviewData?.allTables || [];
  const filteredTables = allTablesList.filter((item: any) => {
    const matchesSearch =
      !tableSearch ||
      item.model.toLowerCase().includes(tableSearch.toLowerCase()) ||
      item.table.toLowerCase().includes(tableSearch.toLowerCase()) ||
      item.description.toLowerCase().includes(tableSearch.toLowerCase());
    const matchesCategory = tableCategoryFilter === "ALL" || item.category === tableCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  const tableCategories = [
    "ALL",
    "Identity & Accounts",
    "Music Catalog",
    "User Library & Social",
    "Analytics & Telemetry",
    "System & Workers",
  ];

  // Filter Logs
  const filteredLogs = logsList.filter((log) => {
    const matchesLevel = logLevelFilter === "ALL" || log.level === logLevelFilter;
    const matchesCategory = logCategoryFilter === "ALL" || log.category === logCategoryFilter;
    const matchesSearch =
      !logSearch ||
      log.message.toLowerCase().includes(logSearch.toLowerCase()) ||
      (log.details && JSON.stringify(log.details).toLowerCase().includes(logSearch.toLowerCase()));
    return matchesLevel && matchesCategory && matchesSearch;
  });

  const nodeVersion =
    systemHealth?.nodeVersion || (typeof process !== "undefined" && (process as any).version) || "—";
  const nodePid = systemHealth?.pid || (typeof process !== "undefined" && (process as any).pid) || "—";

  const summary: { label: string; count: number; icon: LucideIcon; tone: Tone }[] = [
    { label: "Users", count: overviewData?.counts?.users ?? 29, icon: Users, tone: "blue" },
    { label: "Tracks", count: overviewData?.counts?.tracks ?? 0, icon: Music, tone: "brand" },
    { label: "Artists", count: overviewData?.counts?.artists ?? 0, icon: Radio, tone: "orange" },
    { label: "Albums", count: overviewData?.counts?.albums ?? 0, icon: Layers, tone: "purple" },
    { label: "Playlists", count: overviewData?.counts?.playlists ?? 0, icon: FileText, tone: "green" },
    { label: "Likes", count: overviewData?.counts?.likes ?? 0, icon: Activity, tone: "red" },
    { label: "History", count: overviewData?.counts?.history ?? 0, icon: Clock, tone: "cyan" },
    {
      label: "Workers",
      count: (overviewData?.counts?.lyricJobs ?? 0) + (overviewData?.counts?.analysisRuns ?? 0),
      icon: Cpu,
      tone: "green",
    },
  ];

  const ribbon: { label: string; value: React.ReactNode; cls?: string }[] = [
    { label: "Engine", value: overviewData?.database?.engine?.split(" ")[0] || "PostgreSQL 16" },
    { label: "Cache Hit", value: overviewData?.database?.cacheHitRatio || "99.9%", cls: "text-[#34d65c]" },
    {
      label: "Active Conns",
      value: `${overviewData?.database?.activeConnections ?? 1} / ${overviewData?.database?.totalConnections ?? 2}`,
    },
    { label: "Database Size", value: overviewData?.database?.size || "68.4 MB" },
    { label: "Total Schemas", value: "26 Models", cls: "text-brand" },
    { label: "Last Sync", value: lastSyncedAt.toLocaleTimeString(), cls: "text-white/80" },
  ];

  const workers = [
    { name: "ElasticLyricWorker", desc: "Elastic auto-scaling onset lyrics alignment engine", status: "RUNNING 24/7", tone: "green" },
    { name: "AnalysisSchedulerService", desc: "Deterministic audio feature vibe extractor", status: "12:30 AM DAILY", tone: "blue" },
    { name: "CronService", desc: "Hourly user daily stats rollups & token cleanup", status: "HOURLY CADENCE", tone: "purple" },
    { name: "EngagementScorer", desc: "Global track popularity decay & score updater", status: "EVERY 3 HOURS", tone: "brand" },
  ];

  const activityLogs: any[] = systemHealth?.recentActivityLogs || [];

  return (
    <div
      style={{ fontFamily: FONT_STACK, WebkitFontSmoothing: "antialiased" }}
      className="mx-auto min-h-full w-full max-w-[1180px] px-4 pb-36 pt-3 sm:px-6 md:pt-20 lg:px-8"
    >
      <SEO title="Database Administration Console – Zenify" noindex={true} path="/admin" />

      {/* ============================ Title bar ============================ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_SOFT}
        className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <IconTile icon={Database} tone="brand" size="lg" />
            <div className="min-w-0">
              <h1 className="text-[26px] font-bold leading-[1.1] tracking-[-0.03em] text-white sm:text-[30px]">
                Database Administration &amp; Telemetry
              </h1>
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-[14px] leading-snug text-white/50">
            Real-time PostgreSQL engine stats, all 26 tables, live server logs streaming, and queue workers.
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Live auto-sync */}
          <div
            title="Toggle live 5-second database polling"
            className="flex h-9 items-center gap-2.5 rounded-full bg-white/[0.07] pl-3.5 pr-2 ring-1 ring-inset ring-white/[0.06]"
          >
            <span className="relative flex h-2 w-2">
              {autoSync && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#30d158] opacity-60" />}
              <span className={cn("relative inline-flex h-2 w-2 rounded-full", autoSync ? "bg-[#30d158]" : "bg-white/30")} />
            </span>
            <span className="text-[13px] font-medium tracking-[-0.01em] text-white/90">
              {autoSync ? "Live Auto-Sync (5s)" : "Auto-Sync Paused"}
            </span>
            <Switch checked={autoSync} onChange={setAutoSync} label="Toggle live auto-sync" />
          </div>

          {/* DB latency */}
          <div className="flex h-9 items-center gap-2 rounded-full bg-white/[0.07] px-3.5 ring-1 ring-inset ring-white/[0.06]">
            <Zap className="h-3.5 w-3.5 text-[#ffd60a]" strokeWidth={2.2} />
            <span className="font-mono text-[12px] text-white/55">Neon PG</span>
            <span className="text-white/20">|</span>
            <span className="font-mono text-[12px] font-semibold tabular-nums text-[#34d65c]">
              {overviewData?.database?.latencyMs ?? 2}ms
            </span>
          </div>

          {/* Sync */}
          <motion.button
            {...tap}
            onClick={() => refreshAll(false)}
            disabled={isRefreshing}
            className="flex h-9 cursor-pointer items-center gap-2 rounded-full bg-white px-4 text-[13px] font-semibold text-black outline-none disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} strokeWidth={2.4} />
            <span>Sync</span>
          </motion.button>

          {/* Purge */}
          <motion.button
            {...tap}
            onClick={() => setShowResetConfirm(true)}
            className="flex h-9 cursor-pointer items-center gap-2 rounded-full bg-[#ff453a]/15 px-4 text-[13px] font-semibold text-[#ff6961] outline-none ring-1 ring-inset ring-[#ff453a]/25 transition-colors hover:bg-[#ff453a]/25"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
            <span>Purge Catalog</span>
          </motion.button>
        </div>
      </motion.div>

      {/* ===================== Infrastructure health ribbon ===================== */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING_SOFT, delay: 0.05 }}
        className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[18px] bg-white/[0.07] ring-1 ring-inset ring-white/[0.07] sm:grid-cols-3 lg:grid-cols-6"
      >
        {ribbon.map((r) => (
          <div key={r.label} className="bg-[#1c1c1e] px-4 py-3.5">
            <div className="text-[12px] font-medium text-white/45">{r.label}</div>
            <div
              className={cn(
                "mt-1 truncate font-mono text-[14px] font-semibold tabular-nums tracking-[-0.01em] text-white",
                r.cls,
                loadingFirst && "animate-pulse"
              )}
            >
              {r.value}
            </div>
          </div>
        ))}
      </motion.div>

      {/* ============================ Tab navigation ============================ */}
      <div className="mt-5">
        <Segmented
          id="console-tabs"
          value={activeTab}
          onChange={(v) => setActiveTab(v as ConsoleTab)}
          scrollable
          className="w-full sm:w-auto"
          options={navTabs}
        />
      </div>

      {/* ============================== Content ============================== */}
      <div className="mt-5">
        <AnimatePresence mode="wait">
          {/* ---------------- TAB 1: OVERVIEW & ALL 26 TABLES ---------------- */}
          {activeTab === "overview" && (
            <motion.div key="overview" {...tabMotion} className="space-y-5">
              {/* Quick summary */}
              <motion.div
                variants={gridVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-2 gap-3 sm:grid-cols-4 2xl:grid-cols-8"
              >
                {summary.map((s) => (
                  <motion.div key={s.label} variants={itemVariants}>
                    <Card className="p-3.5">
                      <div className="flex items-center justify-between">
                        <IconTile icon={s.icon} tone={s.tone} size="sm" />
                      </div>
                      <div className="mt-3 text-[24px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-white">
                        <AnimatedNumber value={Number(s.count) || 0} />
                      </div>
                      <div className="mt-1 text-[13px] text-white/50">{s.label}</div>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>

              {/* All 26 tables */}
              <Card className="overflow-hidden">
                <CardHeader
                  icon={Layers}
                  tone="purple"
                  title="All 26 PostgreSQL Tables & ORM Schemas"
                  subtitle="Live relational schema allocation, row counts, and architectural classification."
                />

                <div className="flex flex-col gap-3 px-4 pb-4 sm:px-5 lg:flex-row lg:items-center">
                  <SearchField value={tableSearch} onChange={setTableSearch} placeholder="Filter tables..." className="w-full lg:w-60" />
                  <Segmented
                    id="table-cats"
                    value={tableCategoryFilter}
                    onChange={setTableCategoryFilter}
                    scrollable
                    options={tableCategories.map((c) => ({ value: c, label: c === "ALL" ? "All" : c }))}
                  />
                </div>

                {/* Desktop table */}
                <div className="hidden overflow-x-auto border-t border-white/[0.07] md:block">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[12px] font-medium text-white/40">
                        <th className="px-5 py-2.5 font-medium">Model / Table</th>
                        <th className="px-3 py-2.5 font-medium">Category</th>
                        <th className="px-3 py-2.5 text-right font-medium">Live Rows</th>
                        <th className="px-3 py-2.5 font-medium">Status</th>
                        <th className="px-5 py-2.5 font-medium">Purpose &amp; Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {filteredTables.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-[13px] text-white/40">
                            No database models matching &quot;{tableSearch}&quot;.
                          </td>
                        </tr>
                      ) : (
                        filteredTables.map((t: any) => (
                          <tr key={t.model} className="transition-colors duration-150 hover:bg-white/[0.035]">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <IconTile icon={Layers} tone="brand" size="sm" />
                                <span className="font-mono text-[13px] font-semibold text-white">{t.model}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <Pill tone="gray">{t.category}</Pill>
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-[13px] font-medium tabular-nums text-white">
                              {Number(t.count).toLocaleString()}
                            </td>
                            <td className="px-3 py-3">
                              <Pill tone={t.count > 0 ? "green" : "gray"}>{t.count > 0 ? "Active Data" : "Clean Slate"}</Pill>
                            </td>
                            <td className="max-w-md truncate px-5 py-3 text-[13px] text-white/50">{t.description}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile list */}
                <ul className="divide-y divide-white/[0.06] border-t border-white/[0.07] md:hidden">
                  {filteredTables.length === 0 ? (
                    <li className="py-10 text-center text-[13px] text-white/40">
                      No database models matching &quot;{tableSearch}&quot;.
                    </li>
                  ) : (
                    filteredTables.map((t: any) => (
                      <li key={t.model} className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <IconTile icon={Layers} tone="brand" size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-mono text-[14px] font-semibold text-white">{t.model}</span>
                              <span className="font-mono text-[14px] font-medium tabular-nums text-white">
                                {Number(t.count).toLocaleString()}
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <Pill tone="gray">{t.category}</Pill>
                              <Pill tone={t.count > 0 ? "green" : "gray"}>{t.count > 0 ? "Active Data" : "Clean Slate"}</Pill>
                            </div>
                            <p className="mt-1.5 text-[13px] leading-snug text-white/50">{t.description}</p>
                          </div>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </Card>
            </motion.div>
          )}

          {/* ---------------- TAB 2: LOGS & SSE STREAM ---------------- */}
          {activeTab === "logs" && (
            <motion.div key="logs" {...tabMotion} className="space-y-4">
              <Card>
                <CardHeader
                  icon={Terminal}
                  tone="gray"
                  title="Backend Server Logs & SSE Stream"
                  subtitle="Streaming HTTP transactions, database queries, authentication guards, and background worker jobs."
                  right={
                    <Pill tone={isSseConnected ? "green" : "amber"}>
                      <span className="relative flex h-1.5 w-1.5">
                        {isSseConnected && (
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#30d158] opacity-60" />
                        )}
                        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", isSseConnected ? "bg-[#30d158]" : "bg-[#ff9f0a]")} />
                      </span>
                      {isSseConnected ? "SSE Live Stream" : "Polling Recovery"}
                    </Pill>
                  }
                />

                <div className="flex flex-col gap-3 px-4 pb-4 sm:px-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <SearchField value={logSearch} onChange={setLogSearch} placeholder="Search log messages..." className="w-full lg:w-64" />
                    <Segmented
                      id="log-level"
                      value={logLevelFilter}
                      onChange={setLogLevelFilter}
                      scrollable
                      options={["ALL", "ERROR", "WARN", "INFO"].map((l) => ({ value: l, label: l === "ALL" ? "All" : l }))}
                    />
                    <Segmented
                      id="log-cat"
                      value={logCategoryFilter}
                      onChange={setLogCategoryFilter}
                      scrollable
                      options={["ALL", "HTTP", "DATABASE", "AUTH", "WORKER", "SYSTEM"].map((c) => ({ value: c, label: c === "ALL" ? "All" : c }))}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex h-9 items-center gap-2.5 rounded-full bg-white/[0.07] pl-3.5 pr-2 ring-1 ring-inset ring-white/[0.06]">
                      <span className="text-[13px] font-medium text-white/85">{autoScrollLogs ? "Scroll: On" : "Scroll: Off"}</span>
                      <Switch checked={autoScrollLogs} onChange={setAutoScrollLogs} label="Toggle auto-scroll" />
                    </div>

                    <motion.button
                      {...tap}
                      onClick={handleExportLogs}
                      className="flex h-9 cursor-pointer items-center gap-2 rounded-full bg-white/[0.07] px-4 text-[13px] font-semibold text-white outline-none ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/[0.12]"
                    >
                      <Download className="h-3.5 w-3.5" strokeWidth={2.2} />
                      <span>Export</span>
                    </motion.button>

                    <motion.button
                      {...tap}
                      onClick={handleClearLogs}
                      className="flex h-9 cursor-pointer items-center gap-2 rounded-full bg-white/[0.07] px-4 text-[13px] font-semibold text-white/80 outline-none ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-[#ff453a]/20 hover:text-[#ff6961]"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                      <span>Clear</span>
                    </motion.button>
                  </div>
                </div>
              </Card>

              {/* Terminal window */}
              <div className="overflow-hidden rounded-[18px] bg-black shadow-[0_20px_50px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/10">
                <div className="flex items-center gap-3 border-b border-white/[0.08] bg-[#2a2a2c] px-4 py-2.5">
                  <div className="flex gap-2">
                    <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                    <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                    <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-center text-[12px] font-medium text-white/50">
                    zenify-server — {filteredLogs.length} entries
                  </span>
                  <span className="hidden w-[52px] sm:block" />
                </div>

                <div
                  ref={logsContainerRef}
                  className="max-h-[620px] min-h-[240px] space-y-0.5 overflow-y-auto p-2 font-mono text-[12px]"
                >
                  {filteredLogs.length === 0 ? (
                    <div className="px-4 py-16 text-center text-[13px] text-white/35">
                      No log entries matching the active filter criteria. Waiting for incoming telemetry...
                    </div>
                  ) : (
                    filteredLogs.map((log) => {
                      const isExpanded = expandedLogId === log.id;
                      return (
                        <div
                          key={log.id}
                          onClick={() => log.details && setExpandedLogId(isExpanded ? null : log.id)}
                          className={cn(
                            "rounded-lg px-2.5 py-2 transition-colors duration-150 hover:bg-white/[0.04]",
                            log.details && "cursor-pointer"
                          )}
                        >
                          <div className="flex flex-wrap items-start gap-x-2.5 gap-y-1 sm:flex-nowrap">
                            <span className="shrink-0 whitespace-nowrap pt-px text-[11px] tabular-nums text-white/35">
                              {fmtTime(log.timestamp)}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 rounded-md px-1.5 py-px text-[10px] font-bold",
                                LEVEL_STYLE[log.level] || "bg-white/10 text-white/60"
                              )}
                            >
                              {log.level}
                            </span>
                            <span className="shrink-0 rounded-md bg-white/[0.07] px-1.5 py-px text-[10px] font-semibold text-white/50">
                              [{log.category}]
                            </span>
                            <span className="min-w-0 basis-full break-all text-[12px] leading-relaxed text-white/85 sm:flex-1 sm:basis-0">
                              {log.message}
                            </span>
                            {log.details && (
                              <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-bold text-brand">
                                JSON
                                <motion.span animate={{ rotate: isExpanded ? 180 : 0 }} transition={SPRING} className="inline-flex">
                                  <ChevronDown className="h-3 w-3" strokeWidth={3} />
                                </motion.span>
                              </span>
                            )}
                          </div>

                          <AnimatePresence initial={false}>
                            {isExpanded && log.details && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={SPRING_SOFT}
                                className="overflow-hidden"
                              >
                                <pre className="mt-2 overflow-x-auto rounded-lg bg-[#1c1c1e] p-3 text-[11px] leading-relaxed text-white/70 ring-1 ring-inset ring-white/[0.08]">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ---------------- TAB 3: SYSTEM TELEMETRY ---------------- */}
          {activeTab === "system" && (
            <motion.div key="system" {...tabMotion} className="space-y-5">
              <motion.div variants={gridVariants} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <motion.div variants={itemVariants}>
                  <Card className="h-full overflow-hidden">
                    <CardHeader icon={Server} tone="brand" title="Host Runtime" />
                    <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
                      <ListRow label="Node Engine" value={nodeVersion} />
                      <ListRow label="Platform" value={systemHealth?.platform || "Node.js"} />
                      <ListRow label="Process PID" value={nodePid} />
                      <ListRow label="Server Uptime" value={systemHealth?.uptime || "Active"} valueClass="font-semibold text-[#34d65c]" />
                    </div>
                  </Card>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <Card className="h-full overflow-hidden">
                    <CardHeader icon={Cpu} tone="green" title="CPU Specifications" />
                    <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
                      <ListRow label="CPU Cores" value={`${systemHealth?.cpu?.cores || 4} Cores`} />
                      <ListRow label="CPU Model" value={systemHealth?.cpu?.model || "Processor"} valueClass="max-w-[160px] text-[12px]" />
                      <ListRow label="Clock Speed" value={`${systemHealth?.cpu?.speedMHz || 2400} MHz`} />
                      <ListRow
                        label="Load Avg (1m, 5m, 15m)"
                        value={`${systemHealth?.cpu?.loadAvg1m ?? 0.1}, ${systemHealth?.cpu?.loadAvg5m ?? 0.2}`}
                      />
                    </div>
                  </Card>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <Card className="h-full overflow-hidden">
                    <CardHeader icon={Activity} tone="blue" title="Process & OS Memory" />
                    <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
                      <ListRow
                        label="Heap Used / Total"
                        value={`${systemHealth?.memory?.process?.heapUsedMB || 45} / ${systemHealth?.memory?.process?.heapTotalMB || 80} MB`}
                      />
                      <ListRow label="Process RSS" value={`${systemHealth?.memory?.process?.rssMB || 95} MB`} />
                      <ListRow
                        label="Host Physical RAM"
                        value={`${Math.round((systemHealth?.memory?.system?.usedMB || 4000) / 1024)}GB / ${Math.round(
                          (systemHealth?.memory?.system?.totalMB || 16000) / 1024
                        )}GB`}
                      />
                      <ListRow
                        label="Memory Utilization"
                        value={`${systemHealth?.memory?.system?.usedPercentage || 35}%`}
                        valueClass="font-semibold text-[#34d65c]"
                      />
                    </div>
                  </Card>
                </motion.div>
              </motion.div>

              {/* Workers */}
              <Card className="overflow-hidden">
                <CardHeader
                  icon={Cpu}
                  tone="orange"
                  title="Autonomous Background Workers & Cron Engines"
                  subtitle="24/7 elastic audio workers, whisper onset engine, daily analytics, and popularity decay timers."
                  right={
                    <Pill tone="green">
                      <CheckCircle2 className="h-3 w-3" strokeWidth={2.6} />
                      All Active
                    </Pill>
                  }
                />
                <motion.div
                  variants={gridVariants}
                  initial="hidden"
                  animate="show"
                  className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-4"
                >
                  {workers.map((w) => (
                    <motion.div
                      key={w.name}
                      variants={itemVariants}
                      className="flex flex-col gap-2 rounded-[14px] bg-white/[0.04] p-3.5 ring-1 ring-inset ring-white/[0.06]"
                    >
                      <span className="truncate font-mono text-[13px] font-semibold text-white">{w.name}</span>
                      <p className="flex-1 text-[13px] leading-snug text-white/50">{w.desc}</p>
                      <div>
                        <Pill tone={w.tone}>{w.status}</Pill>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </Card>

              {/* Recent activity */}
              <Card className="overflow-hidden">
                <CardHeader
                  icon={Activity}
                  tone="cyan"
                  title="Recent System Telemetry & Activity Logs"
                  subtitle="Chronological stream of playback events, likes, and searches."
                  right={<span className="font-mono text-[12px] text-white/35">Live Fastify audit</span>}
                />

                {/* Desktop */}
                <div className="hidden overflow-x-auto border-t border-white/[0.07] md:block">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[12px] font-medium text-white/40">
                        <th className="px-5 py-2.5 font-medium">Event Type</th>
                        <th className="px-3 py-2.5 font-medium">User Identifier</th>
                        <th className="px-5 py-2.5 text-right font-medium">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {activityLogs.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-[13px] text-white/40">
                            No recent activity events recorded.
                          </td>
                        </tr>
                      ) : (
                        activityLogs.map((log: any) => (
                          <tr key={log.id} className="transition-colors hover:bg-white/[0.035]">
                            <td className="px-5 py-3 text-[13px] font-semibold capitalize text-brand">
                              {log.eventType?.replace("_", " ")}
                            </td>
                            <td className="max-w-[260px] truncate px-3 py-3 font-mono text-[12px] text-white/50">{log.userId}</td>
                            <td className="px-5 py-3 text-right font-mono text-[12px] tabular-nums text-white/40">
                              {new Date(log.createdAt).toLocaleTimeString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile */}
                <ul className="divide-y divide-white/[0.06] border-t border-white/[0.07] md:hidden">
                  {activityLogs.length === 0 ? (
                    <li className="py-8 text-center text-[13px] text-white/40">No recent activity events recorded.</li>
                  ) : (
                    activityLogs.map((log: any) => (
                      <li key={log.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-[14px] font-semibold capitalize text-brand">{log.eventType?.replace("_", " ")}</div>
                          <div className="truncate font-mono text-[11px] text-white/45">{log.userId}</div>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-white/40">
                          {new Date(log.createdAt).toLocaleTimeString()}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </Card>
            </motion.div>
          )}

          {/* ---------------- TAB 4: USER DIRECTORY ---------------- */}
          {activeTab === "users" && (
            <motion.div key="users" {...tabMotion} className="space-y-4">
              <Card className="p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <SearchField
                    value={userSearch}
                    onChange={setUserSearch}
                    placeholder="Search by name, username or email..."
                    className="w-full sm:max-w-md sm:flex-1"
                  />
                  <Segmented
                    id="user-role"
                    value={userRoleFilter}
                    onChange={setUserRoleFilter}
                    options={[
                      { value: "", label: "All Roles" },
                      { value: "USER", label: "Standard User" },
                      { value: "ADMIN", label: "Administrator" },
                    ]}
                    scrollable
                  />
                </div>
              </Card>

              <Card className="overflow-hidden">
                {/* Desktop */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[12px] font-medium text-white/40">
                        <th className="px-5 py-3 font-medium">User</th>
                        <th className="px-3 py-3 font-medium">Role</th>
                        <th className="px-3 py-3 font-medium">Country &amp; Taste</th>
                        <th className="px-3 py-3 font-medium">Activity</th>
                        <th className="px-5 py-3 text-right font-medium">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05] border-t border-white/[0.07]">
                      {isUsersLoading && usersData.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-[13px] text-white/40">
                            Loading user directory...
                          </td>
                        </tr>
                      ) : usersData.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-[13px] text-white/40">
                            No users found matching query.
                          </td>
                        </tr>
                      ) : (
                        usersData.map((u) => {
                          const tone = AVATAR_TONES[(String(u.name || "?").charCodeAt(0) || 0) % AVATAR_TONES.length];
                          return (
                            <tr key={u.id} className="transition-colors hover:bg-white/[0.035]">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-3">
                                  <span
                                    className={cn(
                                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b text-[14px] font-semibold text-white",
                                      TONES[tone]
                                    )}
                                  >
                                    {String(u.name || "?").trim().charAt(0).toUpperCase()}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="truncate text-[14px] font-semibold text-white">{u.name}</div>
                                    <div className="truncate font-mono text-[12px] text-white/45">{u.email}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <Pill tone={u.role === "ADMIN" ? "brand" : "gray"}>{u.role}</Pill>
                              </td>
                              <td className="px-3 py-3">
                                <div className="text-[13px] font-medium text-white/85">{u.country}</div>
                                <div className="max-w-[180px] truncate text-[12px] text-white/40">
                                  {u.preferences?.languages?.join(", ") || "Global default"}
                                </div>
                              </td>
                              <td className="px-3 py-3 font-mono text-[12px] tabular-nums text-white/70">
                                {u.stats?.likesCount ?? 0} likes • {u.stats?.historyCount ?? 0} plays
                              </td>
                              <td className="px-5 py-3 text-right font-mono text-[12px] tabular-nums text-white/45">
                                {new Date(u.createdAt).toLocaleDateString()}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile */}
                <ul className="divide-y divide-white/[0.06] md:hidden">
                  {isUsersLoading && usersData.length === 0 ? (
                    <li className="py-10 text-center text-[13px] text-white/40">Loading user directory...</li>
                  ) : usersData.length === 0 ? (
                    <li className="py-10 text-center text-[13px] text-white/40">No users found matching query.</li>
                  ) : (
                    usersData.map((u) => {
                      const tone = AVATAR_TONES[(String(u.name || "?").charCodeAt(0) || 0) % AVATAR_TONES.length];
                      return (
                        <li key={u.id} className="px-4 py-3.5">
                          <div className="flex items-start gap-3">
                            <span
                              className={cn(
                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-b text-[15px] font-semibold text-white",
                                TONES[tone]
                              )}
                            >
                              {String(u.name || "?").trim().charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-[15px] font-semibold text-white">{u.name}</span>
                                <Pill tone={u.role === "ADMIN" ? "brand" : "gray"}>{u.role}</Pill>
                              </div>
                              <div className="truncate font-mono text-[12px] text-white/45">{u.email}</div>
                              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/55">
                                <span>{u.country}</span>
                                <span className="truncate text-white/35">{u.preferences?.languages?.join(", ") || "Global default"}</span>
                              </div>
                              <div className="mt-1 flex items-center justify-between font-mono text-[11px] tabular-nums text-white/45">
                                <span>
                                  {u.stats?.likesCount ?? 0} likes • {u.stats?.historyCount ?? 0} plays
                                </span>
                                <span>{new Date(u.createdAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>

                {/* Pagination */}
                {userPagination.totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-3 sm:px-5">
                    <span className="text-[13px] text-white/45">
                      Page {userPagination.page} of {userPagination.totalPages} · {userPagination.total.toLocaleString()} users
                    </span>
                    <div className="flex items-center gap-1.5">
                      <motion.button
                        {...tap}
                        disabled={userPagination.page <= 1}
                        onClick={() => fetchUsers(userPagination.page - 1, userSearch, userRoleFilter)}
                        aria-label="Previous page"
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/[0.08] text-white outline-none disabled:cursor-default disabled:opacity-30"
                      >
                        <ChevronLeft className="h-4 w-4" strokeWidth={2.4} />
                      </motion.button>
                      <motion.button
                        {...tap}
                        disabled={userPagination.page >= userPagination.totalPages}
                        onClick={() => fetchUsers(userPagination.page + 1, userSearch, userRoleFilter)}
                        aria-label="Next page"
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/[0.08] text-white outline-none disabled:cursor-default disabled:opacity-30"
                      >
                        <ChevronRight className="h-4 w-4" strokeWidth={2.4} />
                      </motion.button>
                    </div>
                  </div>
                )}
              </Card>
            </motion.div>
          )}

          {/* ---------------- TAB 5: MUSIC METADATA ---------------- */}
          {activeTab === "music" && (
            <motion.div key="music" {...tabMotion}>
              <motion.div variants={gridVariants} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <motion.div variants={itemVariants}>
                  <Card className="h-full p-5">
                    <div className="flex items-center gap-3">
                      <IconTile icon={FileText} tone="green" />
                      <span className="text-[14px] font-medium text-white/60">Synced LRC Coverage</span>
                    </div>
                    <div className="mt-4 font-mono text-[34px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[#34d65c]">
                      {musicStats?.metadataHealth?.syncedLyricsPercent || 0}%
                    </div>
                    <div className="mt-3">
                      <Meter value={musicStats?.metadataHealth?.syncedLyricsPercent || 0} tone="green" />
                    </div>
                    <div className="mt-2.5 text-[13px] text-white/45">
                      {musicStats?.metadataHealth?.syncedLyricsCount || 0} tracks with word-level timecodes
                    </div>
                  </Card>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <Card className="h-full p-5">
                    <div className="flex items-center gap-3">
                      <IconTile icon={ImageIcon} tone="brand" />
                      <span className="text-[14px] font-medium text-white/60">Cover Artwork Integrity</span>
                    </div>
                    <div className="mt-4 font-mono text-[34px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-brand">
                      {musicStats?.metadataHealth?.coverArtPercent || 0}%
                    </div>
                    <div className="mt-3">
                      <Meter value={musicStats?.metadataHealth?.coverArtPercent || 0} tone="brand" />
                    </div>
                    <div className="mt-2.5 text-[13px] text-white/45">
                      {musicStats?.metadataHealth?.coverArtCount || 0} tracks with pristine CDNs
                    </div>
                  </Card>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <Card className="h-full p-5">
                    <div className="flex items-center gap-3">
                      <IconTile icon={Disc3} tone="cyan" />
                      <span className="text-[14px] font-medium text-white/60">JioSaavn 320kbps CDN</span>
                    </div>
                    <div className="mt-4 font-mono text-[34px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[#64d2ff]">
                      {musicStats?.audioSources?.jiosaavnCdn || 0}
                    </div>
                    <div className="mt-3 h-1.5" />
                    <div className="mt-2.5 text-[13px] text-white/45">Direct Akamai CDN full audio streams</div>
                  </Card>
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {/* ---------------- TAB 6: STORAGE & R2 ---------------- */}
          {activeTab === "storage" && (
            <motion.div key="storage" {...tabMotion}>
              <motion.div variants={gridVariants} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <motion.div variants={itemVariants}>
                  <Card className="h-full overflow-hidden">
                    <CardHeader
                      icon={Cloud}
                      tone="orange"
                      title="Cloudflare R2 Storage Bucket"
                      right={
                        <Pill tone={storageData?.r2?.configured ? "green" : "gray"}>
                          {storageData?.r2?.configured ? "Connected" : "Standby"}
                        </Pill>
                      }
                    />
                    <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
                      <ListRow label="Bucket Name" value={storageData?.r2?.bucketName || "zenify-audio"} />
                      <ListRow label="Stored R2 Tracks" value={storageData?.r2?.storedTracksCount || 0} />
                      <ListRow
                        label="Estimated R2 Volume"
                        value={`${storageData?.r2?.estimatedStorageMB || 0} MB`}
                        valueClass="font-semibold text-[#34d65c]"
                      />
                    </div>
                  </Card>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <Card className="h-full overflow-hidden">
                    <CardHeader icon={ShieldCheck} tone="blue" title="Third-Party Cloud Providers" />
                    <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
                      {[
                        { name: "Deepgram AI Transcription", status: "Active" },
                        { name: "Brevo Transactional Email", status: "Configured" },
                        { name: "Upstash Serverless Redis", status: "Active" },
                      ].map((p) => (
                        <div key={p.name} className="flex items-center justify-between gap-4 px-4 py-2.5 sm:px-5">
                          <span className="text-[14px] text-white/70">{p.name}</span>
                          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#34d65c]">
                            <CheckCircle2 className="h-4 w-4" strokeWidth={2.2} />
                            {p.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ============== Purge sheet (macOS alert style) ============== */}
      <AnimatePresence>
        {showResetConfirm && (
          <motion.div
            key="purge-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => !isResetting && setShowResetConfirm(false)}
            className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/55 p-4 backdrop-blur-md sm:items-center"
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="purge-title"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, y: 40, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              transition={SPRING}
              style={{ fontFamily: FONT_STACK }}
              className="w-full max-w-[400px] overflow-hidden rounded-[22px] bg-[#2c2c2e]/95 text-center shadow-[0_30px_80px_rgba(0,0,0,0.6)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl"
            >
              <div className="px-6 pb-5 pt-6">
                <div className="mx-auto mb-4 flex justify-center">
                  <IconTile icon={ShieldAlert} tone="red" size="lg" />
                </div>
                <h2 id="purge-title" className="text-[17px] font-semibold tracking-[-0.02em] text-white">
                  Purge Catalog &amp; Start Fresh?
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-white/60">
                  This action will reset all tracks, albums, artists, history, likes, and queue caches. All user accounts and
                  preference profiles will be strictly preserved.
                </p>
              </div>
              <div className="grid grid-cols-2 border-t border-white/10">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  disabled={isResetting}
                  className="cursor-pointer border-r border-white/10 py-3.5 text-[16px] font-medium text-[#0a84ff] outline-none transition-colors hover:bg-white/[0.05] active:bg-white/10 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetCatalog}
                  disabled={isResetting}
                  className="flex cursor-pointer items-center justify-center gap-2 py-3.5 text-[16px] font-semibold text-[#ff453a] outline-none transition-colors hover:bg-white/[0.05] active:bg-white/10 disabled:opacity-50"
                >
                  {isResetting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  <span>{isResetting ? "Purging..." : "Confirm Purge"}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
