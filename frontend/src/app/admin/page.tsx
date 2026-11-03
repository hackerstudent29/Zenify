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
  ChevronsUpDown,
  ArrowUp,
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
  fill,
  className,
}: {
  id: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; icon?: LucideIcon }[];
  scrollable?: boolean;
  fill?: boolean;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "relative inline-flex max-w-full items-center gap-0.5 rounded-[11px] bg-white/[0.07] p-[3px]",
        scrollable && "no-scrollbar overflow-x-auto",
        fill && "flex w-full",
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
              active ? "text-white" : "text-white/55 hover:text-white/85",
              fill && "flex-1"
            )}
          >
            {active && (
              <motion.span
                layoutId={`${id}-pill`}
                transition={SPRING}
                className="absolute inset-0 rounded-[8px] bg-white/[0.17] shadow-[0_1px_3px_rgba(0,0,0,0.4),inset_0_0.5px_0_rgba(255,255,255,0.14)]"
              />
            )}
            <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
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

function FilterSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <label className="relative inline-flex h-9 items-center" title={label}>
      <select
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 max-w-[200px] cursor-pointer appearance-none rounded-[10px] bg-white/[0.07] pl-3 pr-8 text-[13px] font-medium text-white outline-none ring-1 ring-inset ring-transparent transition-[background-color,box-shadow] duration-200 hover:bg-white/[0.1] focus:ring-brand/60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#2c2c2e] text-white">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-white/40" />
    </label>
  );
}

function ResetButton({ show, onClick }: { show: boolean; onClick: () => void }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.button
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={SPRING}
          onClick={onClick}
          className="h-9 cursor-pointer rounded-[10px] px-3 text-[13px] font-medium text-brand outline-none hover:bg-white/[0.06]"
        >
          Reset
        </motion.button>
      )}
    </AnimatePresence>
  );
}

function Ring({ pct, color, size = 46, stroke = 5 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const p = Math.max(0, Math.min(100, pct || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - p / 100) }}
        transition={{ type: "spring", stiffness: 70, damping: 18 }}
      />
    </svg>
  );
}

type Dir = "asc" | "desc";

const cmp = (a: any, b: any) =>
  typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });

function sortBy<T>(arr: T[], get: (x: T) => any, dir: Dir): T[] {
  const m = dir === "asc" ? 1 : -1;
  return arr.slice().sort((x, y) => m * cmp(get(x), get(y)));
}

/** same column twice flips direction; a new column starts asc (or desc for the keys in descFirst) */
function toggleSort(key: string, curKey: string, setKey: (k: string) => void, dir: Dir, setDir: (d: Dir) => void, descFirst: string[] = []) {
  if (curKey === key) setDir(dir === "asc" ? "desc" : "asc");
  else {
    setKey(key);
    setDir(descFirst.includes(key) ? "desc" : "asc");
  }
}

function DirButton({ dir, onChange, disabled }: { dir: Dir; onChange: (d: Dir) => void; disabled?: boolean }) {
  return (
    <motion.button
      {...tap}
      disabled={disabled}
      onClick={() => onChange(dir === "asc" ? "desc" : "asc")}
      title={dir === "asc" ? "Ascending (A→Z, low→high, old→new)" : "Descending (Z→A, high→low, new→old)"}
      aria-label={dir === "asc" ? "Ascending" : "Descending"}
      className="flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] bg-white/[0.07] px-2.5 text-[13px] font-medium text-white/85 outline-none transition-colors hover:bg-white/[0.12] disabled:cursor-default disabled:opacity-40"
    >
      <motion.span animate={{ rotate: dir === "desc" ? 180 : 0 }} transition={SPRING} className="inline-flex">
        <ArrowUp className="h-4 w-4" strokeWidth={2.4} />
      </motion.span>
      <span>{dir === "asc" ? "Asc" : "Desc"}</span>
    </motion.button>
  );
}

function SortControl({
  value,
  dir,
  onValue,
  onDir,
  options,
  disabled,
}: {
  value: string;
  dir: Dir;
  onValue: (v: string) => void;
  onDir: (d: Dir) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <FilterSelect
        label="Sort by"
        value={value}
        onChange={onValue}
        options={options.map((o) => ({ value: o.value, label: o.value === "default" ? o.label : `Sort: ${o.label}` }))}
      />
      <DirButton dir={dir} onChange={onDir} disabled={disabled} />
    </div>
  );
}

function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: Dir; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group inline-flex cursor-pointer items-center gap-1 rounded-md outline-none transition-colors hover:text-white/85",
        active ? "text-white" : "text-white/40"
      )}
    >
      <span>{label}</span>
      <motion.span
        animate={{ rotate: dir === "desc" ? 180 : 0, opacity: active ? 1 : 0 }}
        transition={SPRING}
        className={cn("inline-flex", !active && "group-hover:!opacity-50")}
      >
        <ArrowUp className="h-3 w-3" strokeWidth={2.8} />
      </motion.span>
    </button>
  );
}

function IconBtn({ icon: Icon, label, onClick, danger }: { icon: LucideIcon; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <motion.button
      {...tap}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none ring-1 ring-inset transition-colors",
        danger
          ? "bg-[#ff453a]/15 text-[#ff6961] ring-[#ff453a]/25 hover:bg-[#ff453a]/25"
          : "bg-white/[0.07] text-white/85 ring-white/[0.06] hover:bg-white/[0.12]"
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={2.2} />
    </motion.button>
  );
}

function StatusDot({ on }: { on: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-white/60">
      <span className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-[#30d158]" : "bg-white/25")} />
      {on ? "Active" : "Empty"}
    </span>
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
  const [tableStatusFilter, setTableStatusFilter] = useState("ALL");
  const [tableSortKey, setTableSortKey] = useState("default");
  const [tableSortDir, setTableSortDir] = useState<"asc" | "desc">("asc");

  // Users Data
  const [usersData, setUsersData] = useState<any[]>([]);
  const [userPagination, setUserPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [userSortKey, setUserSortKey] = useState("createdAt");
  const [userSortDir, setUserSortDir] = useState<"asc" | "desc">("desc");
  const [userCountry, setUserCountry] = useState("ALL");

  // Music Metadata Data
  const [musicStats, setMusicStats] = useState<any>(null);

  // Storage Data
  const [storageData, setStorageData] = useState<any>(null);

  // System Health Data
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [activitySearch, setActivitySearch] = useState("");
  const [activityType, setActivityType] = useState("ALL");
  const [activitySortKey, setActivitySortKey] = useState("createdAt");
  const [activitySortDir, setActivitySortDir] = useState<"asc" | "desc">("desc");

  // Backend Server Logs Data & SSE
  const [logsList, setLogsList] = useState<LogEntry[]>([]);
  const [logLevelFilter, setLogLevelFilter] = useState<string>("ALL");
  const [logCategoryFilter, setLogCategoryFilter] = useState<string>("ALL");
  const [logSearch, setLogSearch] = useState<string>("");
  const [logSortKey, setLogSortKey] = useState("time");
  const [logSortDir, setLogSortDir] = useState<"asc" | "desc">("desc");
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
    const el = logsContainerRef.current;
    if (autoScrollLogs && el) {
      el.scrollTop = logSortKey === "time" && logSortDir === "asc" ? el.scrollHeight : 0;
    }
  }, [logsList, autoScrollLogs, logSortKey, logSortDir]);

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
    { value: "overview", label: "Overview", icon: Database },
    { value: "logs", label: "Logs", icon: Terminal },
    { value: "system", label: "System", icon: Activity },
    { value: "users", label: "Users", icon: Users },
    { value: "music", label: "Music", icon: Music },
    { value: "storage", label: "Storage", icon: HardDrive },
  ];

  // Filter Tables for Overview Tab
  const allTablesList = overviewData?.allTables || [];
  const tableGetters: Record<string, (t: any) => any> = {
    model: (t) => String(t.model).toLowerCase(),
    category: (t) => t.category,
    count: (t) => Number(t.count),
    status: (t) => (t.count > 0 ? 1 : 0),
  };
  const tablesBase = allTablesList.filter((item: any) => {
    const q = tableSearch.toLowerCase();
    const matchesSearch =
      !q ||
      item.model.toLowerCase().includes(q) ||
      item.table.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q);
    const matchesCategory = tableCategoryFilter === "ALL" || item.category === tableCategoryFilter;
    const matchesStatus =
      tableStatusFilter === "ALL" || (tableStatusFilter === "ACTIVE" ? item.count > 0 : item.count === 0);
    return matchesSearch && matchesCategory && matchesStatus;
  });
  const filteredTables: any[] =
    tableSortKey === "default" ? tablesBase : sortBy(tablesBase, tableGetters[tableSortKey] || tableGetters.model, tableSortDir);
  const tablesFiltered = tableSearch !== "" || tableCategoryFilter !== "ALL" || tableStatusFilter !== "ALL" || tableSortKey !== "default";
  const onTableSort = (k: string) => toggleSort(k, tableSortKey, setTableSortKey, tableSortDir, setTableSortDir, ["count"]);

  const tableCategories = [
    { value: "ALL", label: "All" },
    { value: "Identity & Accounts", label: "Identity" },
    { value: "Music Catalog", label: "Catalog" },
    { value: "User Library & Social", label: "Library" },
    { value: "Analytics & Telemetry", label: "Analytics" },
    { value: "System & Workers", label: "System" },
  ];

  // Filter Logs
  const filteredLogsRaw = logsList.filter((log) => {
    const matchesLevel = logLevelFilter === "ALL" || log.level === logLevelFilter;
    const matchesCategory = logCategoryFilter === "ALL" || log.category === logCategoryFilter;
    const matchesSearch =
      !logSearch ||
      log.message.toLowerCase().includes(logSearch.toLowerCase()) ||
      (log.details && JSON.stringify(log.details).toLowerCase().includes(logSearch.toLowerCase()));
    return matchesLevel && matchesCategory && matchesSearch;
  });
  const LEVEL_RANK: Record<string, number> = { ERROR: 4, WARN: 3, INFO: 2, DEBUG: 1 };
  const logGetters: Record<string, (l: LogEntry) => any> = {
    time: (l) => +new Date(l.timestamp),
    level: (l) => LEVEL_RANK[l.level] ?? 0,
    category: (l) => l.category,
  };
  const filteredLogs = sortBy(filteredLogsRaw, logGetters[logSortKey] || logGetters.time, logSortDir);

  const th = "px-4 py-2.5 text-[12px] font-medium text-white/40 sm:px-5";

  // sortable <th>
  const H = (label: string, k: string, curKey: string, dir: Dir, onSort: (k: string) => void, right = false) => (
    <th
      className={cn(th, right && "text-right")}
      aria-sort={curKey === k ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <SortHeader label={label} active={curKey === k} dir={dir} onClick={() => onSort(k)} />
    </th>
  );

  // Users: role + search are server-side; region + sort apply to the loaded page
  const userCountries = Array.from(new Set(usersData.map((u) => u.country).filter(Boolean))) as string[];
  const userGetters: Record<string, (u: any) => any> = {
    createdAt: (u) => +new Date(u.createdAt),
    name: (u) => String(u.name || "").toLowerCase(),
    role: (u) => u.role,
    country: (u) => u.country,
    activity: (u) => (u.stats?.likesCount ?? 0) + (u.stats?.historyCount ?? 0),
  };
  const visibleUsers = sortBy(
    usersData.filter((u) => userCountry === "ALL" || u.country === userCountry),
    userGetters[userSortKey] || userGetters.createdAt,
    userSortDir
  );
  const usersFiltered =
    userSearch !== "" || userRoleFilter !== "" || userCountry !== "ALL" || userSortKey !== "createdAt" || userSortDir !== "desc";
  const onUserSort = (k: string) => toggleSort(k, userSortKey, setUserSortKey, userSortDir, setUserSortDir, ["createdAt", "activity"]);

  // Recent activity
  const activityAll: any[] = systemHealth?.recentActivityLogs || [];
  const activityTypes = Array.from(new Set(activityAll.map((l) => l.eventType).filter(Boolean))) as string[];
  const activityGetters: Record<string, (l: any) => any> = {
    createdAt: (l) => +new Date(l.createdAt),
    eventType: (l) => String(l.eventType || ""),
    userId: (l) => String(l.userId || ""),
  };
  const activityLogs = sortBy(
    activityAll.filter(
      (l) =>
        (activityType === "ALL" || l.eventType === activityType) &&
        (!activitySearch || `${l.eventType} ${l.userId}`.toLowerCase().includes(activitySearch.toLowerCase()))
    ),
    activityGetters[activitySortKey] || activityGetters.createdAt,
    activitySortDir
  );
  const activityFiltered = activitySearch !== "" || activityType !== "ALL" || activitySortKey !== "createdAt" || activitySortDir !== "desc";
  const onActivitySort = (k: string) =>
    toggleSort(k, activitySortKey, setActivitySortKey, activitySortDir, setActivitySortDir, ["createdAt"]);

  // Hero metrics
  const dbActive = Number(overviewData?.database?.activeConnections ?? 1);
  const dbTotal = Number(overviewData?.database?.totalConnections ?? 2);
  const latency = Number(overviewData?.database?.latencyMs ?? 2);
  const latencyTone: Tone = latency < 250 ? "green" : latency < 600 ? "orange" : "red";
  const cacheLabel = String(overviewData?.database?.cacheHitRatio || "99.9%");
  const cachePct = parseFloat(cacheLabel) || 0;
  const connPct = dbTotal ? Math.max(dbActive > 0 ? 3 : 0, (dbActive / dbTotal) * 100) : 0;

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

  const workers = [
    { name: "ElasticLyricWorker", desc: "Auto-scaling lyrics alignment engine", status: "Running 24/7", tone: "green" },
    { name: "AnalysisSchedulerService", desc: "Audio feature & vibe extractor", status: "12:30 AM daily", tone: "blue" },
    { name: "CronService", desc: "Hourly stats rollups & token cleanup", status: "Hourly", tone: "purple" },
    { name: "EngagementScorer", desc: "Track popularity decay & score updates", status: "Every 3 hours", tone: "brand" },
  ];

  const rowHover = "transition-colors duration-150 hover:bg-white/[0.035]";

  return (
    <div
      style={{ fontFamily: FONT_STACK, WebkitFontSmoothing: "antialiased" }}
      className="mx-auto min-h-full w-full max-w-[1180px] px-4 pb-36 pt-3 sm:px-6 md:pt-20 lg:px-8"
    >
      <SEO title="Database Administration Console – Zenify" noindex={true} path="/admin" />

      {/* ============================ Hero ============================ */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_SOFT}
        className="relative overflow-hidden rounded-[24px] bg-[#1c1c1e] ring-1 ring-inset ring-white/[0.08]"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-32 h-80 w-80 rounded-full bg-[#fa233b]/25 blur-[90px]" />
          <div className="absolute -bottom-36 right-0 h-72 w-72 rounded-full bg-[#0a84ff]/15 blur-[90px]" />
        </div>

        <div className="relative p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <IconTile icon={Database} tone="brand" size="lg" />
              <div className="min-w-0">
                <h1 className="truncate text-[30px] font-bold leading-none tracking-[-0.03em] text-white">Database</h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-white/55">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      {autoSync && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#30d158] opacity-60" />}
                      <span className={cn("relative inline-flex h-2 w-2 rounded-full", autoSync ? "bg-[#30d158]" : "bg-white/30")} />
                    </span>
                    {autoSync ? "Live" : "Paused"}
                  </span>
                  <span className="text-white/20">•</span>
                  <span>{overviewData?.database?.engine?.split(" ")[0] || "PostgreSQL"}</span>
                  <span className="text-white/20">•</span>
                  <span className="font-mono tabular-nums">Synced {lastSyncedAt.toLocaleTimeString()}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div
                title="Live auto-sync every 5 seconds"
                className="flex h-9 items-center gap-2 rounded-full bg-white/[0.08] pl-3 pr-2 ring-1 ring-inset ring-white/[0.08] backdrop-blur-xl"
              >
                <span className="text-[13px] font-medium text-white/90">Auto-sync</span>
                <Switch checked={autoSync} onChange={setAutoSync} label="Toggle live auto-sync" />
              </div>
              <motion.button
                {...tap}
                onClick={() => refreshAll(false)}
                disabled={isRefreshing}
                className="flex h-9 cursor-pointer items-center gap-2 rounded-full bg-white px-4 text-[13px] font-semibold text-black outline-none disabled:opacity-60"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} strokeWidth={2.4} />
                <span>Sync</span>
              </motion.button>
              <IconBtn icon={Trash2} label="Purge catalog" danger onClick={() => setShowResetConfirm(true)} />
            </div>
          </div>

          <motion.div
            variants={gridVariants}
            initial="hidden"
            animate="show"
            className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4"
          >
            {[
              { label: "Cache hit", value: cacheLabel, cls: "text-[#34d65c]", visual: <Ring pct={cachePct} color="#30d158" /> },
              { label: "Connections", value: `${dbActive} / ${dbTotal}`, visual: <Ring pct={connPct} color="#0a84ff" /> },
              { label: "Size", value: overviewData?.database?.size || "68.4 MB", visual: <IconTile icon={HardDrive} tone="purple" /> },
              {
                label: "Latency",
                value: `${latency}ms`,
                visual: <IconTile icon={Zap} tone={latencyTone} />,
              },
            ].map((m) => (
              <motion.div
                key={m.label}
                variants={itemVariants}
                className="flex items-center justify-between gap-3 rounded-[18px] bg-white/[0.06] p-4 ring-1 ring-inset ring-white/[0.08] backdrop-blur-xl"
              >
                <div className="min-w-0">
                  <div className="text-[12px] text-white/50">{m.label}</div>
                  <div
                    className={cn(
                      "mt-1 truncate font-mono text-[20px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-white",
                      m.cls,
                      loadingFirst && "animate-pulse"
                    )}
                  >
                    {m.value}
                  </div>
                </div>
                {m.visual}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </motion.section>

      {/* ============================ Tabs ============================ */}
      <div className="mt-4">
        <Segmented id="console-tabs" value={activeTab} onChange={(v) => setActiveTab(v as ConsoleTab)} scrollable fill options={navTabs} />
      </div>

      {/* ============================ Content ============================ */}
      <div className="mt-4">
        <AnimatePresence mode="wait">
          {/* ---------------- OVERVIEW ---------------- */}
          {activeTab === "overview" && (
            <motion.div key="overview" {...tabMotion} className="space-y-4">
              <Card className="overflow-hidden">
                <motion.div
                  variants={gridVariants}
                  initial="hidden"
                  animate="show"
                  className="grid grid-cols-2 gap-px bg-white/[0.07] sm:grid-cols-4 lg:grid-cols-8"
                >
                  {summary.map((s) => (
                    <motion.div key={s.label} variants={itemVariants} className="bg-[#1c1c1e] p-4">
                      <IconTile icon={s.icon} tone={s.tone} size="sm" />
                      <div className="mt-3 text-[24px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-white">
                        <AnimatedNumber value={Number(s.count) || 0} />
                      </div>
                      <div className="mt-1 text-[12px] text-white/45">{s.label}</div>
                    </motion.div>
                  ))}
                </motion.div>
              </Card>

              <Card className="overflow-hidden">
                <div className="space-y-3 p-4 sm:p-5">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-white">Tables</h2>
                    <Pill tone="gray">{filteredTables.length}</Pill>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <SearchField value={tableSearch} onChange={setTableSearch} placeholder="Search tables" className="min-w-[200px] flex-1" />
                    <FilterSelect
                      label="Status"
                      value={tableStatusFilter}
                      onChange={setTableStatusFilter}
                      options={[
                        { value: "ALL", label: "All status" },
                        { value: "ACTIVE", label: "Active" },
                        { value: "EMPTY", label: "Empty" },
                      ]}
                    />
                    <SortControl
                      value={tableSortKey}
                      dir={tableSortDir}
                      onValue={(k) => {
                        setTableSortKey(k);
                        if (k === "count") setTableSortDir("desc");
                        else if (k !== "default") setTableSortDir("asc");
                      }}
                      onDir={setTableSortDir}
                      disabled={tableSortKey === "default"}
                      options={[
                        { value: "default", label: "Default order" },
                        { value: "model", label: "Name" },
                        { value: "category", label: "Category" },
                        { value: "count", label: "Rows" },
                        { value: "status", label: "Status" },
                      ]}
                    />
                    <ResetButton
                      show={tablesFiltered}
                      onClick={() => {
                        setTableSearch("");
                        setTableCategoryFilter("ALL");
                        setTableStatusFilter("ALL");
                        setTableSortKey("default");
                        setTableSortDir("asc");
                      }}
                    />
                  </div>
                  <Segmented
                    id="table-cats"
                    value={tableCategoryFilter}
                    onChange={setTableCategoryFilter}
                    scrollable
                    fill
                    options={tableCategories}
                  />
                </div>

                {/* Desktop */}
                <div className="hidden border-t border-white/[0.07] md:block">
                  <table className="w-full table-fixed text-left">
                    <colgroup>
                      <col className="w-[22%]" />
                      <col className="w-[20%]" />
                      <col className="w-[10%]" />
                      <col className="w-[12%]" />
                      <col />
                    </colgroup>
                    <thead>
                      <tr>
                        {H("Table", "model", tableSortKey, tableSortDir, onTableSort)}
                        {H("Category", "category", tableSortKey, tableSortDir, onTableSort)}
                        {H("Rows", "count", tableSortKey, tableSortDir, onTableSort, true)}
                        {H("Status", "status", tableSortKey, tableSortDir, onTableSort)}
                        <th className={th}>Purpose</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {filteredTables.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-[13px] text-white/40">
                            No tables match
                          </td>
                        </tr>
                      ) : (
                        filteredTables.map((t: any) => (
                          <tr key={t.model} className={rowHover}>
                            <td className="truncate px-4 py-3 font-mono text-[13px] font-semibold text-white sm:px-5">{t.model}</td>
                            <td className="truncate px-4 py-3 text-[13px] text-white/50 sm:px-5">{t.category}</td>
                            <td className="px-4 py-3 text-right font-mono text-[13px] tabular-nums text-white sm:px-5">
                              {Number(t.count).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 sm:px-5">
                              <StatusDot on={t.count > 0} />
                            </td>
                            <td className="truncate px-4 py-3 text-[13px] text-white/45 sm:px-5" title={t.description}>
                              {t.description}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile */}
                <ul className="divide-y divide-white/[0.06] border-t border-white/[0.07] md:hidden">
                  {filteredTables.length === 0 ? (
                    <li className="py-10 text-center text-[13px] text-white/40">No tables match</li>
                  ) : (
                    filteredTables.map((t: any) => (
                      <li key={t.model} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate font-mono text-[14px] font-semibold text-white">{t.model}</span>
                          <span className="font-mono text-[14px] tabular-nums text-white">{Number(t.count).toLocaleString()}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3 text-[12px] text-white/45">
                          <span className="truncate">{t.category}</span>
                          <StatusDot on={t.count > 0} />
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </Card>
            </motion.div>
          )}

          {/* ---------------- LOGS ---------------- */}
          {activeTab === "logs" && (
            <motion.div key="logs" {...tabMotion}>
              <Card className="overflow-hidden">
                <div className="space-y-3 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-white">Logs</h2>
                      <Pill tone="gray">{filteredLogs.length}</Pill>
                      <Pill tone={isSseConnected ? "green" : "amber"}>
                        <span className="relative flex h-1.5 w-1.5">
                          {isSseConnected && (
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#30d158] opacity-60" />
                          )}
                          <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", isSseConnected ? "bg-[#30d158]" : "bg-[#ff9f0a]")} />
                        </span>
                        {isSseConnected ? "Live" : "Polling"}
                      </Pill>
                    </div>

                    <div className="flex items-center gap-2">
                      <div
                        title="Keep newest entries in view"
                        className="flex h-9 items-center gap-2 rounded-full bg-white/[0.07] pl-3 pr-2 ring-1 ring-inset ring-white/[0.06]"
                      >
                        <span className="hidden text-[13px] font-medium text-white/85 sm:inline">Auto-scroll</span>
                        <Switch checked={autoScrollLogs} onChange={setAutoScrollLogs} label="Toggle auto-scroll" />
                      </div>
                      <IconBtn icon={Download} label="Export logs" onClick={handleExportLogs} />
                      <IconBtn icon={Trash2} label="Clear logs" onClick={handleClearLogs} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <SearchField value={logSearch} onChange={setLogSearch} placeholder="Search logs" className="min-w-[200px] flex-1" />
                    <FilterSelect
                      label="Level"
                      value={logLevelFilter}
                      onChange={setLogLevelFilter}
                      options={[
                        { value: "ALL", label: "All levels" },
                        { value: "ERROR", label: "Error" },
                        { value: "WARN", label: "Warn" },
                        { value: "INFO", label: "Info" },
                        { value: "DEBUG", label: "Debug" },
                      ]}
                    />
                    <SortControl
                      value={logSortKey}
                      dir={logSortDir}
                      onValue={(k) => {
                        setLogSortKey(k);
                        setLogSortDir("desc");
                      }}
                      onDir={setLogSortDir}
                      options={[
                        { value: "time", label: "Time" },
                        { value: "level", label: "Level" },
                        { value: "category", label: "Category" },
                      ]}
                    />
                    <ResetButton
                      show={logSearch !== "" || logLevelFilter !== "ALL" || logCategoryFilter !== "ALL" || logSortKey !== "time" || logSortDir !== "desc"}
                      onClick={() => {
                        setLogSearch("");
                        setLogLevelFilter("ALL");
                        setLogCategoryFilter("ALL");
                        setLogSortKey("time");
                        setLogSortDir("desc");
                      }}
                    />
                  </div>

                  <Segmented
                    id="log-cat"
                    value={logCategoryFilter}
                    onChange={setLogCategoryFilter}
                    scrollable
                    fill
                    options={[
                      { value: "ALL", label: "All" },
                      { value: "HTTP", label: "HTTP" },
                      { value: "DATABASE", label: "Database" },
                      { value: "AUTH", label: "Auth" },
                      { value: "WORKER", label: "Worker" },
                      { value: "SYSTEM", label: "System" },
                    ]}
                  />
                </div>

                <div
                  ref={logsContainerRef}
                  className="max-h-[620px] min-h-[220px] overflow-y-auto border-t border-white/[0.07] font-mono text-[12px]"
                >
                  {filteredLogs.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-16 text-center text-[13px] text-white/35">
                      <Terminal className="h-5 w-5" />
                      No logs match
                    </div>
                  ) : (
                    <ul className="divide-y divide-white/[0.05]">
                      {filteredLogs.map((log) => {
                        const isExpanded = expandedLogId === log.id;
                        return (
                          <li
                            key={log.id}
                            onClick={() => log.details && setExpandedLogId(isExpanded ? null : log.id)}
                            className={cn("px-4 py-2.5 transition-colors duration-150 hover:bg-white/[0.035] sm:px-5", log.details && "cursor-pointer")}
                          >
                            <div className="flex flex-wrap items-start gap-x-3 gap-y-1 sm:flex-nowrap">
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
                              <span className="shrink-0 pt-px text-[11px] font-semibold text-white/35">{log.category}</span>
                              <span className="min-w-0 basis-full break-all text-[12px] leading-relaxed text-white/85 sm:flex-1 sm:basis-0">
                                {log.message}
                              </span>
                              {log.details && (
                                <motion.span
                                  animate={{ rotate: isExpanded ? 180 : 0 }}
                                  transition={SPRING}
                                  className="inline-flex shrink-0 text-white/40"
                                  title="Details"
                                >
                                  <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.6} />
                                </motion.span>
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
                                  <pre className="mt-2 overflow-x-auto rounded-xl bg-black/40 p-3 text-[11px] leading-relaxed text-white/70 ring-1 ring-inset ring-white/[0.08]">
                                    {JSON.stringify(log.details, null, 2)}
                                  </pre>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </Card>
            </motion.div>
          )}

          {/* ---------------- SYSTEM ---------------- */}
          {activeTab === "system" && (
            <motion.div key="system" {...tabMotion} className="space-y-4">
              <motion.div variants={gridVariants} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <motion.div variants={itemVariants}>
                  <Card className="h-full overflow-hidden">
                    <CardHeader icon={Server} tone="brand" title="Runtime" />
                    <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
                      <ListRow label="Node" value={nodeVersion} />
                      <ListRow label="Platform" value={systemHealth?.platform || "Node.js"} />
                      <ListRow label="PID" value={nodePid} />
                      <ListRow label="Uptime" value={systemHealth?.uptime || "Active"} valueClass="font-semibold text-[#34d65c]" />
                    </div>
                  </Card>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <Card className="h-full overflow-hidden">
                    <CardHeader icon={Cpu} tone="green" title="CPU" />
                    <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
                      <ListRow label="Cores" value={systemHealth?.cpu?.cores || 4} />
                      <ListRow label="Model" value={systemHealth?.cpu?.model || "Processor"} valueClass="max-w-[160px] text-[12px]" />
                      <ListRow label="Clock" value={`${systemHealth?.cpu?.speedMHz || 2400} MHz`} />
                      <ListRow
                        label="Load avg"
                        value={`${systemHealth?.cpu?.loadAvg1m ?? 0.1}, ${systemHealth?.cpu?.loadAvg5m ?? 0.2}`}
                      />
                    </div>
                  </Card>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <Card className="h-full overflow-hidden">
                    <CardHeader icon={Activity} tone="blue" title="Memory" />
                    <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
                      <ListRow
                        label="Heap"
                        value={`${systemHealth?.memory?.process?.heapUsedMB || 45} / ${systemHealth?.memory?.process?.heapTotalMB || 80} MB`}
                      />
                      <ListRow label="RSS" value={`${systemHealth?.memory?.process?.rssMB || 95} MB`} />
                      <ListRow
                        label="RAM"
                        value={`${Math.round((systemHealth?.memory?.system?.usedMB || 4000) / 1024)} / ${Math.round(
                          (systemHealth?.memory?.system?.totalMB || 16000) / 1024
                        )} GB`}
                      />
                      <ListRow
                        label="Usage"
                        value={`${systemHealth?.memory?.system?.usedPercentage || 35}%`}
                        valueClass="font-semibold text-[#34d65c]"
                      />
                    </div>
                  </Card>
                </motion.div>
              </motion.div>

              <Card className="overflow-hidden">
                <CardHeader
                  icon={Cpu}
                  tone="orange"
                  title="Workers"
                  right={
                    <Pill tone="green">
                      <CheckCircle2 className="h-3 w-3" strokeWidth={2.6} />
                      All active
                    </Pill>
                  }
                />
                <ul className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
                  {workers.map((w) => (
                    <li key={w.name} className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-[13px] font-semibold text-white">{w.name}</div>
                        <div className="truncate text-[12px] text-white/45">{w.desc}</div>
                      </div>
                      <Pill tone={w.tone} className="shrink-0">
                        {w.status}
                      </Pill>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="overflow-hidden">
                <div className="space-y-3 p-4 sm:p-5">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-white">Recent activity</h2>
                    <Pill tone="gray">{activityLogs.length}</Pill>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <SearchField value={activitySearch} onChange={setActivitySearch} placeholder="Search event or user" className="min-w-[200px] flex-1" />
                    <FilterSelect
                      label="Event type"
                      value={activityType}
                      onChange={setActivityType}
                      options={[
                        { value: "ALL", label: "All events" },
                        ...activityTypes.map((t) => ({ value: t, label: t.replace(/_/g, " ") })),
                      ]}
                    />
                    <SortControl
                      value={activitySortKey}
                      dir={activitySortDir}
                      onValue={(k) => {
                        setActivitySortKey(k);
                        setActivitySortDir(k === "createdAt" ? "desc" : "asc");
                      }}
                      onDir={setActivitySortDir}
                      options={[
                        { value: "createdAt", label: "Time" },
                        { value: "eventType", label: "Event" },
                        { value: "userId", label: "User" },
                      ]}
                    />
                    <ResetButton
                      show={activityFiltered}
                      onClick={() => {
                        setActivitySearch("");
                        setActivityType("ALL");
                        setActivitySortKey("createdAt");
                        setActivitySortDir("desc");
                      }}
                    />
                  </div>
                </div>

                <div className="hidden border-t border-white/[0.07] md:block">
                  <table className="w-full table-fixed text-left">
                    <colgroup>
                      <col className="w-[30%]" />
                      <col />
                      <col className="w-[18%]" />
                    </colgroup>
                    <thead>
                      <tr>
                        {H("Event", "eventType", activitySortKey, activitySortDir, onActivitySort)}
                        {H("User", "userId", activitySortKey, activitySortDir, onActivitySort)}
                        {H("Time", "createdAt", activitySortKey, activitySortDir, onActivitySort, true)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {activityLogs.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-[13px] text-white/40">
                            No activity found
                          </td>
                        </tr>
                      ) : (
                        activityLogs.map((log: any) => (
                          <tr key={log.id} className={rowHover}>
                            <td className="truncate px-4 py-3 text-[13px] font-semibold capitalize text-brand sm:px-5">
                              {log.eventType?.replace(/_/g, " ")}
                            </td>
                            <td className="truncate px-4 py-3 font-mono text-[12px] text-white/50 sm:px-5">{log.userId}</td>
                            <td className="px-4 py-3 text-right font-mono text-[12px] tabular-nums text-white/40 sm:px-5">
                              {new Date(log.createdAt).toLocaleTimeString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <ul className="divide-y divide-white/[0.06] border-t border-white/[0.07] md:hidden">
                  {activityLogs.length === 0 ? (
                    <li className="py-8 text-center text-[13px] text-white/40">No activity found</li>
                  ) : (
                    activityLogs.map((log: any) => (
                      <li key={log.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-[14px] font-semibold capitalize text-brand">{log.eventType?.replace(/_/g, " ")}</div>
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

          {/* ---------------- USERS ---------------- */}
          {activeTab === "users" && (
            <motion.div key="users" {...tabMotion} className="space-y-4">
              <Card className="overflow-hidden">
                <div className="space-y-3 p-4 sm:p-5">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-white">Users</h2>
                    <Pill tone="gray">{visibleUsers.length}</Pill>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <SearchField
                      value={userSearch}
                      onChange={setUserSearch}
                      placeholder="Search name or email"
                      className="min-w-[200px] flex-1"
                    />
                    <FilterSelect
                      label="Region"
                      value={userCountry}
                      onChange={setUserCountry}
                      options={[{ value: "ALL", label: "All regions" }, ...userCountries.map((c) => ({ value: c, label: c }))]}
                    />
                    <SortControl
                      value={userSortKey}
                      dir={userSortDir}
                      onValue={(k) => {
                        setUserSortKey(k);
                        setUserSortDir(k === "createdAt" || k === "activity" ? "desc" : "asc");
                      }}
                      onDir={setUserSortDir}
                      options={[
                        { value: "createdAt", label: "Joined" },
                        { value: "name", label: "Name" },
                        { value: "role", label: "Role" },
                        { value: "country", label: "Region" },
                        { value: "activity", label: "Activity" },
                      ]}
                    />
                    <ResetButton
                      show={usersFiltered}
                      onClick={() => {
                        setUserSearch("");
                        setUserRoleFilter("");
                        setUserCountry("ALL");
                        setUserSortKey("createdAt");
                        setUserSortDir("desc");
                      }}
                    />
                  </div>
                  <Segmented
                    id="user-role"
                    value={userRoleFilter}
                    onChange={setUserRoleFilter}
                    fill
                    options={[
                      { value: "", label: "All" },
                      { value: "USER", label: "Users" },
                      { value: "ADMIN", label: "Admins" },
                    ]}
                  />
                </div>

                {/* Desktop */}
                <div className="hidden border-t border-white/[0.07] md:block">
                  <table className="w-full table-fixed text-left">
                    <colgroup>
                      <col className="w-[34%]" />
                      <col className="w-[12%]" />
                      <col className="w-[20%]" />
                      <col className="w-[20%]" />
                      <col />
                    </colgroup>
                    <thead>
                      <tr>
                        {H("User", "name", userSortKey, userSortDir, onUserSort)}
                        {H("Role", "role", userSortKey, userSortDir, onUserSort)}
                        {H("Region", "country", userSortKey, userSortDir, onUserSort)}
                        {H("Activity", "activity", userSortKey, userSortDir, onUserSort)}
                        {H("Joined", "createdAt", userSortKey, userSortDir, onUserSort, true)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {isUsersLoading && usersData.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-[13px] text-white/40">
                            Loading...
                          </td>
                        </tr>
                      ) : visibleUsers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-[13px] text-white/40">
                            No users match
                          </td>
                        </tr>
                      ) : (
                        visibleUsers.map((u) => {
                          const tone = AVATAR_TONES[(String(u.name || "?").charCodeAt(0) || 0) % AVATAR_TONES.length];
                          return (
                            <tr key={u.id} className={rowHover}>
                              <td className="px-4 py-3 sm:px-5">
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
                              <td className="px-4 py-3 sm:px-5">
                                {u.role === "ADMIN" ? <Pill tone="brand">Admin</Pill> : <span className="text-[13px] text-white/50">User</span>}
                              </td>
                              <td className="px-4 py-3 sm:px-5">
                                <div className="truncate text-[13px] text-white/85">{u.country}</div>
                                <div className="truncate text-[12px] text-white/40">
                                  {u.preferences?.languages?.join(", ") || "Global default"}
                                </div>
                              </td>
                              <td className="px-4 py-3 font-mono text-[12px] tabular-nums text-white/65 sm:px-5">
                                {u.stats?.likesCount ?? 0} likes · {u.stats?.historyCount ?? 0} plays
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-[12px] tabular-nums text-white/45 sm:px-5">
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
                <ul className="divide-y divide-white/[0.06] border-t border-white/[0.07] md:hidden">
                  {isUsersLoading && usersData.length === 0 ? (
                    <li className="py-10 text-center text-[13px] text-white/40">Loading...</li>
                  ) : visibleUsers.length === 0 ? (
                    <li className="py-10 text-center text-[13px] text-white/40">No users match</li>
                  ) : (
                    visibleUsers.map((u) => {
                      const tone = AVATAR_TONES[(String(u.name || "?").charCodeAt(0) || 0) % AVATAR_TONES.length];
                      return (
                        <li key={u.id} className="flex items-center gap-3 px-4 py-3">
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
                              {u.role === "ADMIN" && <Pill tone="brand">Admin</Pill>}
                            </div>
                            <div className="truncate font-mono text-[12px] text-white/45">{u.email}</div>
                            <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-white/40">
                              <span className="truncate">
                                {u.country} · {u.stats?.likesCount ?? 0} likes · {u.stats?.historyCount ?? 0} plays
                              </span>
                              <span className="shrink-0 font-mono tabular-nums">{new Date(u.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>

                {userPagination.totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-3 sm:px-5">
                    <span className="text-[13px] tabular-nums text-white/45">
                      {userPagination.page} / {userPagination.totalPages} · {userPagination.total.toLocaleString()}
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

          {/* ---------------- MUSIC ---------------- */}
          {activeTab === "music" && (
            <motion.div key="music" {...tabMotion}>
              <motion.div variants={gridVariants} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <motion.div variants={itemVariants}>
                  <Card className="h-full p-4 sm:p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-white/55">Synced lyrics</span>
                      <IconTile icon={FileText} tone="green" size="sm" />
                    </div>
                    <div className="mt-3 font-mono text-[32px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[#34d65c]">
                      {musicStats?.metadataHealth?.syncedLyricsPercent || 0}%
                    </div>
                    <div className="mt-3">
                      <Meter value={musicStats?.metadataHealth?.syncedLyricsPercent || 0} tone="green" />
                    </div>
                    <div className="mt-2 text-[12px] text-white/45">{musicStats?.metadataHealth?.syncedLyricsCount || 0} tracks</div>
                  </Card>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <Card className="h-full p-4 sm:p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-white/55">Cover artwork</span>
                      <IconTile icon={ImageIcon} tone="brand" size="sm" />
                    </div>
                    <div className="mt-3 font-mono text-[32px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-brand">
                      {musicStats?.metadataHealth?.coverArtPercent || 0}%
                    </div>
                    <div className="mt-3">
                      <Meter value={musicStats?.metadataHealth?.coverArtPercent || 0} tone="brand" />
                    </div>
                    <div className="mt-2 text-[12px] text-white/45">{musicStats?.metadataHealth?.coverArtCount || 0} tracks</div>
                  </Card>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <Card className="h-full p-4 sm:p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-white/55">JioSaavn 320kbps</span>
                      <IconTile icon={Disc3} tone="cyan" size="sm" />
                    </div>
                    <div className="mt-3 font-mono text-[32px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[#64d2ff]">
                      {musicStats?.audioSources?.jiosaavnCdn || 0}
                    </div>
                    <div className="mt-3 h-1.5" />
                    <div className="mt-2 text-[12px] text-white/45">CDN streams</div>
                  </Card>
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {/* ---------------- STORAGE ---------------- */}
          {activeTab === "storage" && (
            <motion.div key="storage" {...tabMotion}>
              <motion.div variants={gridVariants} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <motion.div variants={itemVariants}>
                  <Card className="h-full overflow-hidden">
                    <CardHeader
                      icon={Cloud}
                      tone="orange"
                      title="Cloudflare R2"
                      right={
                        <Pill tone={storageData?.r2?.configured ? "green" : "gray"}>
                          {storageData?.r2?.configured ? "Connected" : "Standby"}
                        </Pill>
                      }
                    />
                    <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
                      <ListRow label="Bucket" value={storageData?.r2?.bucketName || "zenify-audio"} />
                      <ListRow label="Tracks" value={storageData?.r2?.storedTracksCount || 0} />
                      <ListRow
                        label="Volume"
                        value={`${storageData?.r2?.estimatedStorageMB || 0} MB`}
                        valueClass="font-semibold text-[#34d65c]"
                      />
                    </div>
                  </Card>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <Card className="h-full overflow-hidden">
                    <CardHeader icon={ShieldCheck} tone="blue" title="Services" />
                    <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
                      {[
                        { name: "Deepgram", status: "Active" },
                        { name: "Brevo", status: "Configured" },
                        { name: "Upstash Redis", status: "Active" },
                      ].map((p) => (
                        <div key={p.name} className="flex items-center justify-between gap-4 px-4 py-2.5 sm:px-5">
                          <span className="text-[14px] text-white/70">{p.name}</span>
                          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#34d65c]">
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

      {/* ============== Purge sheet ============== */}
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
              className="w-full max-w-[380px] overflow-hidden rounded-[22px] bg-[#2c2c2e]/95 text-center shadow-[0_30px_80px_rgba(0,0,0,0.6)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl"
            >
              <div className="px-6 pb-5 pt-6">
                <div className="mb-4 flex justify-center">
                  <IconTile icon={ShieldAlert} tone="red" size="lg" />
                </div>
                <h2 id="purge-title" className="text-[17px] font-semibold tracking-[-0.02em] text-white">
                  Purge catalog?
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-white/55">
                  Resets tracks, albums, artists, history, likes and queue caches. User accounts and preferences are kept.
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
                  {isResetting && <RefreshCw className="h-4 w-4 animate-spin" />}
                  <span>{isResetting ? "Purging..." : "Purge"}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}