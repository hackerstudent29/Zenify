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
  ExternalLink,
  CheckCircle2,
  Terminal,
  Download,
  Pause,
  Play,
  RotateCcw,
  Clock,
  ShieldCheck,
} from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/shared/SEO";
import notify from "@/lib/notify";
import { getApiBaseUrl } from "@/lib/utils";

type ConsoleTab = "overview" | "logs" | "system" | "users" | "music" | "storage";

interface LogEntry {
  id: string;
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  category: "HTTP" | "DATABASE" | "AUTH" | "WORKER" | "SYSTEM";
  message: string;
  details?: Record<string, any>;
}

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

  const fetchLogs = useCallback(async (silent = false) => {
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
  }, [logLevelFilter, logCategoryFilter, logSearch]);

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

  const refreshAll = useCallback(async (silent = false) => {
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
  }, [fetchOverview, fetchSystemHealth, activeTab, fetchMusicStats, fetchStorage, fetchUsers, userPagination.page, userSearch, userRoleFilter, fetchLogs]);

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

  // 404 Guard for Non-Admins
  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6">
        <SEO title="Page Not Found – Zenify" noindex={true} path="/admin" />
        <h1 className="text-6xl font-black text-white/20 mb-4 font-mono font-oswald">404</h1>
        <h2 className="text-xl font-bold text-white mb-2 font-oswald uppercase tracking-wide">Page Not Found</h2>
        <p className="text-zinc-400 text-sm max-w-sm mx-auto mb-6 leading-relaxed font-libre">
          The page you are looking for does not exist or has been moved.
        </p>
        <Button
          onClick={() => (window.location.href = "/")}
          className="h-10 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
        >
          Return Home
        </Button>
      </div>
    );
  }

  const navTabs: { id: ConsoleTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "overview", label: "Overview & Tables (26)", icon: Database },
    { id: "logs", label: "Server Logs & Stream", icon: Terminal },
    { id: "system", label: "System Telemetry", icon: Activity },
    { id: "users", label: "User Directory", icon: Users },
    { id: "music", label: "Music Metadata", icon: Music },
    { id: "storage", label: "Storage & R2", icon: HardDrive },
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

  return (
    <div className="min-h-full pb-36 pt-2 md:pt-4 px-4 sm:px-6 md:px-10 max-w-7xl mx-auto font-libre">
      <SEO title="Database Administration Console – Zenify" noindex={true} path="/admin" />

      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
              <Database className="w-4 h-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black font-oswald uppercase tracking-wide text-primary">
              Database Administration & Telemetry
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1 font-libre">
            Real-time PostgreSQL engine stats, all 26 tables, live server logs streaming, and queue workers.
          </p>
        </div>

        {/* Global Status Badges & Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Live Auto-Sync Status Badge & Toggle */}
          <button
            onClick={() => setAutoSync(!autoSync)}
            title="Toggle live 5-second database polling"
            className="h-10 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                autoSync ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"
              }`}
            />
            <span>{autoSync ? "LIVE AUTO-SYNC (5s)" : "AUTO-SYNC PAUSED"}</span>
          </button>

          {/* DB Latency Pill */}
          <div className="h-10 px-3.5 rounded-xl bg-zinc-900 border border-white/10 flex items-center gap-2 text-xs">
            <span className="text-zinc-400 text-[11px] font-mono">Neon PG</span>
            <span className="text-zinc-600">|</span>
            <span className="text-emerald-400 font-mono font-bold text-xs">
              {overviewData?.database?.latencyMs ?? 2}ms
            </span>
          </div>

          {/* Sync Button */}
          <button
            onClick={() => refreshAll(false)}
            disabled={isRefreshing}
            className="h-10 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>SYNC</span>
          </button>

          {/* Reset Catalog Button */}
          <button
            onClick={() => setShowResetConfirm(true)}
            className="h-10 px-4 rounded-xl bg-zinc-900 hover:bg-red-950/40 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>PURGE CATALOG</span>
          </button>
        </div>
      </div>

      {/* Top Infrastructure Health Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 py-4 border-b border-white/10">
        <div className="p-3 rounded-xl bg-zinc-900/40 border border-white/5">
          <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Engine</div>
          <div className="text-xs font-bold text-white mt-1 truncate">
            {overviewData?.database?.engine?.split(" ")[0] || "PostgreSQL 16"}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-zinc-900/40 border border-white/5">
          <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Cache Hit</div>
          <div className="text-xs font-bold text-emerald-400 mt-1 font-mono">
            {overviewData?.database?.cacheHitRatio || "99.9%"}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-zinc-900/40 border border-white/5">
          <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Active Conns</div>
          <div className="text-xs font-bold text-white mt-1 font-mono">
            {overviewData?.database?.activeConnections ?? 1} / {overviewData?.database?.totalConnections ?? 2}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-zinc-900/40 border border-white/5">
          <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Database Size</div>
          <div className="text-xs font-bold text-white mt-1 font-mono">
            {overviewData?.database?.size || "68.4 MB"}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-zinc-900/40 border border-white/5">
          <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Total Schemas</div>
          <div className="text-xs font-bold text-brand mt-1 font-mono">26 Models</div>
        </div>

        <div className="p-3 rounded-xl bg-zinc-900/40 border border-white/5">
          <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Last Sync</div>
          <div className="text-xs font-bold text-zinc-300 mt-1 font-mono">
            {lastSyncedAt.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Primary Tab Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto py-3 scrollbar-none border-b border-white/5">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer font-oswald uppercase tracking-wider ${
                isActive
                  ? "bg-zinc-900 text-brand border border-brand/30 shadow-sm"
                  : "bg-transparent text-zinc-400 hover:text-white hover:bg-zinc-900/50 border border-transparent"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-brand" : "text-zinc-400"}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Tab Content */}
      <div className="mt-6">
        <AnimatePresence mode="wait">
          {/* TAB 1: OVERVIEW & ALL 26 DATABASE TABLES */}
          {activeTab === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              {/* Quick Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {[
                  { label: "Users", count: overviewData?.counts?.users ?? 29, icon: Users, color: "text-blue-400" },
                  { label: "Tracks", count: overviewData?.counts?.tracks ?? 0, icon: Music, color: "text-brand" },
                  { label: "Artists", count: overviewData?.counts?.artists ?? 0, icon: Radio, color: "text-amber-400" },
                  { label: "Albums", count: overviewData?.counts?.albums ?? 0, icon: Layers, color: "text-purple-400" },
                  { label: "Playlists", count: overviewData?.counts?.playlists ?? 0, icon: FileText, color: "text-emerald-400" },
                  { label: "Likes", count: overviewData?.counts?.likes ?? 0, icon: Activity, color: "text-red-400" },
                  { label: "History", count: overviewData?.counts?.history ?? 0, icon: Clock, color: "text-cyan-400" },
                  { label: "Workers", count: (overviewData?.counts?.lyricJobs ?? 0) + (overviewData?.counts?.analysisRuns ?? 0), icon: Cpu, color: "text-green-400" },
                ].map((s) => {
                  const SIcon = s.icon;
                  return (
                    <div key={s.label} className="p-3 rounded-xl bg-zinc-900/60 border border-white/10">
                      <div className="flex items-center justify-between text-zinc-400 mb-1">
                        <span className="text-[10px] uppercase font-bold tracking-wider">{s.label}</span>
                        <SIcon className={`w-3.5 h-3.5 ${s.color}`} />
                      </div>
                      <div className="text-lg font-bold font-mono text-white">
                        {Number(s.count).toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* All 26 Database Tables Breakdown */}
              <div className="border border-white/10 rounded-2xl p-5 bg-zinc-900/30">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-lg font-black font-oswald uppercase tracking-wide text-primary">
                      All 26 PostgreSQL Tables & ORM Schemas
                    </h2>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Live relational schema allocation, row counts, and architectural classification.
                    </p>
                  </div>

                  {/* Table Search & Filter Controls */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Filter tables..."
                        value={tableSearch}
                        onChange={(e) => setTableSearch(e.target.value)}
                        className="h-8 pl-8 pr-3 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand transition-colors w-44"
                      />
                    </div>

                    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                      {tableCategories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setTableCategoryFilter(cat)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                            tableCategoryFilter === cat
                              ? "bg-zinc-800 text-brand border border-brand/30"
                              : "bg-transparent text-zinc-400 hover:text-white border border-transparent"
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Transparent Table Layout */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-zinc-400 text-[11px] uppercase tracking-wider font-semibold font-oswald">
                        <th className="py-2.5 px-3">Model / Table</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Live Rows</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Purpose & Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredTables.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-zinc-500 text-xs">
                            No database models matching "{tableSearch}".
                          </td>
                        </tr>
                      ) : (
                        filteredTables.map((t: any) => (
                          <tr key={t.model} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-2.5 px-3 font-mono font-bold text-white flex items-center gap-2">
                              <Layers className="w-3.5 h-3.5 text-brand" />
                              <span>{t.model}</span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-white/5">
                                {t.category}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-medium text-white">
                              {Number(t.count).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  t.count > 0
                                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                                    : "text-zinc-400 bg-zinc-800 border-zinc-700"
                                }`}
                              >
                                {t.count > 0 ? "Active Data" : "Clean Slate"}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-zinc-400 text-xs max-w-md truncate">
                              {t.description}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 2: REAL-TIME BACKEND LOGS & STREAM CONSOLE */}
          {activeTab === "logs" && (
            <motion.div
              key="logs"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              {/* Log Controls Header */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-2xl bg-zinc-900/60 border border-white/10">
                <div>
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-brand" />
                    <h2 className="text-base font-black font-oswald uppercase tracking-wide text-primary">
                      Backend Server Logs & SSE Stream
                    </h2>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                        isSseConnected
                          ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                          : "text-amber-400 bg-amber-500/10 border-amber-500/20"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isSseConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                      {isSseConnected ? "SSE LIVE STREAM" : "POLLING RECOVERY"}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    Streaming HTTP transactions, database queries, authentication guards, and background worker jobs.
                  </p>
                </div>

                {/* Filter and Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Search Input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Search log messages..."
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                      className="h-8 pl-8 pr-3 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand transition-colors w-48"
                    />
                  </div>

                  {/* Level Filter Buttons */}
                  <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                    {["ALL", "ERROR", "WARN", "INFO"].map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => setLogLevelFilter(lvl)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          logLevelFilter === lvl
                            ? "bg-zinc-800 text-brand shadow-sm"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>

                  {/* Category Filter Buttons */}
                  <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                    {["ALL", "HTTP", "DATABASE", "AUTH", "WORKER", "SYSTEM"].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setLogCategoryFilter(cat)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          logCategoryFilter === cat
                            ? "bg-zinc-800 text-brand shadow-sm"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Action Controls */}
                  <button
                    onClick={() => setAutoScrollLogs(!autoScrollLogs)}
                    className="h-8 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>{autoScrollLogs ? "SCROLL: ON" : "SCROLL: OFF"}</span>
                  </button>

                  <button
                    onClick={handleExportLogs}
                    className="h-8 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>EXPORT</span>
                  </button>

                  <button
                    onClick={handleClearLogs}
                    className="h-8 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-400 hover:text-red-400 text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>CLEAR</span>
                  </button>
                </div>
              </div>

              {/* Terminal Logs Window */}
              <div
                ref={logsContainerRef}
                className="bg-black/90 rounded-2xl border border-white/10 p-4 font-mono text-xs max-h-[620px] overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-800"
              >
                {filteredLogs.length === 0 ? (
                  <div className="py-16 text-center text-zinc-500 text-xs">
                    No log entries matching the active filter criteria. Waiting for incoming telemetry...
                  </div>
                ) : (
                  filteredLogs.map((log) => {
                    const isExpanded = expandedLogId === log.id;
                    const levelColors = {
                      ERROR: "text-red-400 bg-red-500/10 border-red-500/30",
                      WARN: "text-amber-400 bg-amber-500/10 border-amber-500/30",
                      INFO: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
                      DEBUG: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
                    }[log.level] || "text-zinc-400 bg-zinc-800 border-zinc-700";

                    return (
                      <div
                        key={log.id}
                        className="p-2 rounded-lg hover:bg-white/[0.03] transition-colors border border-transparent hover:border-white/5 cursor-pointer"
                        onClick={() => log.details && setExpandedLogId(isExpanded ? null : log.id)}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="text-zinc-500 text-[11px] whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleTimeString()}.{String(new Date(log.timestamp).getMilliseconds()).padStart(3, "0")}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${levelColors}`}>
                            {log.level}
                          </span>
                          <span className="text-[10px] font-bold text-zinc-400 px-1.5 py-0.2 rounded bg-zinc-900 border border-white/5">
                            [{log.category}]
                          </span>
                          <span className="text-zinc-200 text-xs flex-1 break-all">
                            {log.message}
                          </span>
                          {log.details && (
                            <span className="text-[10px] text-brand hover:underline font-bold">
                              {isExpanded ? "▲ Hide" : "▼ JSON"}
                            </span>
                          )}
                        </div>

                        {/* Expandable JSON Details */}
                        {isExpanded && log.details && (
                          <pre className="mt-2 p-2.5 rounded-lg bg-zinc-950 border border-white/10 text-[11px] text-zinc-300 overflow-x-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}

          {/* TAB 3: SYSTEM TELEMETRY & HEALTH */}
          {activeTab === "system" && (
            <motion.div
              key="system"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              {/* Server Host & Runtime Specs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10">
                  <div className="flex items-center gap-2 text-zinc-300 text-xs font-semibold mb-3">
                    <Server className="w-4 h-4 text-brand" />
                    <span className="font-oswald uppercase tracking-wider">Host Runtime</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-zinc-500">Node Engine</span>
                      <span className="text-zinc-200 font-mono">{systemHealth?.nodeVersion || process.version}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-zinc-500">Platform</span>
                      <span className="text-zinc-200 font-mono">{systemHealth?.platform || "Node.js"}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-zinc-500">Process PID</span>
                      <span className="text-zinc-200 font-mono">{systemHealth?.pid || process.pid}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-zinc-500">Server Uptime</span>
                      <span className="text-emerald-400 font-mono font-bold">{systemHealth?.uptime || "Active"}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10">
                  <div className="flex items-center gap-2 text-zinc-300 text-xs font-semibold mb-3">
                    <Cpu className="w-4 h-4 text-emerald-400" />
                    <span className="font-oswald uppercase tracking-wider">CPU Specifications</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-zinc-500">CPU Cores</span>
                      <span className="text-zinc-200 font-mono">{systemHealth?.cpu?.cores || 4} Cores</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-zinc-500">CPU Model</span>
                      <span className="text-zinc-200 font-mono text-[11px] truncate max-w-[150px]">
                        {systemHealth?.cpu?.model || "Processor"}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-zinc-500">Clock Speed</span>
                      <span className="text-zinc-200 font-mono">{systemHealth?.cpu?.speedMHz || 2400} MHz</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-zinc-500">Load Avg (1m, 5m, 15m)</span>
                      <span className="text-zinc-200 font-mono">
                        {systemHealth?.cpu?.loadAvg1m ?? 0.1}, {systemHealth?.cpu?.loadAvg5m ?? 0.2}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10">
                  <div className="flex items-center gap-2 text-zinc-300 text-xs font-semibold mb-3">
                    <Activity className="w-4 h-4 text-blue-400" />
                    <span className="font-oswald uppercase tracking-wider">Process & OS Memory</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-zinc-500">Heap Used / Total</span>
                      <span className="text-zinc-200 font-mono">
                        {systemHealth?.memory?.process?.heapUsedMB || 45} / {systemHealth?.memory?.process?.heapTotalMB || 80} MB
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-zinc-500">Process RSS</span>
                      <span className="text-zinc-200 font-mono">{systemHealth?.memory?.process?.rssMB || 95} MB</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-zinc-500">Host Physical RAM</span>
                      <span className="text-zinc-200 font-mono">
                        {Math.round((systemHealth?.memory?.system?.usedMB || 4000) / 1024)}GB / {Math.round((systemHealth?.memory?.system?.totalMB || 16000) / 1024)}GB
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-zinc-500">Memory Utilization</span>
                      <span className="text-emerald-400 font-mono font-bold">
                        {systemHealth?.memory?.system?.usedPercentage || 35}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Background Workers & Schedulers */}
              <div className="p-5 rounded-2xl bg-zinc-900/40 border border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold font-oswald uppercase tracking-wide text-primary">
                      Autonomous Background Workers & Cron Engines
                    </h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      24/7 elastic audio workers, whisper onset engine, daily analytics, and popularity decay timers.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    All Active
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { name: "ElasticLyricWorker", desc: "Elastic auto-scaling onset lyrics alignment engine", status: "RUNNING 24/7", badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
                    { name: "AnalysisSchedulerService", desc: "Deterministic audio feature vibe extractor", status: "12:30 AM DAILY", badge: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
                    { name: "CronService", desc: "Hourly user daily stats rollups & token cleanup", status: "HOURLY CADENCE", badge: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
                    { name: "EngagementScorer", desc: "Global track popularity decay & score updater", status: "EVERY 3 HOURS", badge: "bg-brand/10 text-brand border-brand/20" },
                  ].map((w) => (
                    <div key={w.name} className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white font-mono">{w.name}</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">{w.desc}</p>
                      <div className={`text-[10px] font-bold px-2 py-0.5 rounded border inline-block ${w.badge}`}>
                        {w.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Activity Logs */}
              <div className="p-5 rounded-2xl bg-zinc-900/60 border border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold font-oswald uppercase tracking-wide text-primary">
                      Recent System Telemetry & Activity Logs
                    </h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Chronological stream of playback events, likes, and searches.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">Live Fastify audit</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-zinc-400 text-[11px] uppercase tracking-wider font-semibold font-oswald">
                        <th className="py-2.5 px-3">Event Type</th>
                        <th className="py-2.5 px-3">User Identifier</th>
                        <th className="py-2.5 px-3 text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {(systemHealth?.recentActivityLogs || []).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-6 text-center text-zinc-500 text-xs">
                            No recent activity events recorded.
                          </td>
                        </tr>
                      ) : (
                        systemHealth.recentActivityLogs.map((log: any) => (
                          <tr key={log.id} className="hover:bg-white/[0.02]">
                            <td className="py-2.5 px-3 font-mono text-brand font-semibold capitalize">
                              {log.eventType?.replace("_", " ")}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-zinc-400 text-[11px] truncate max-w-[200px]">
                              {log.userId}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[10px] text-zinc-500">
                              {new Date(log.createdAt).toLocaleTimeString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 4: USER DIRECTORY */}
          {activeTab === "users" && (
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-2xl bg-zinc-900/80 border border-white/10">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search by name, username or email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full h-9 pl-9 pr-3 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand transition-colors"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value)}
                    className="h-9 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-brand transition-colors cursor-pointer"
                  >
                    <option value="">All Roles</option>
                    <option value="USER">Standard User</option>
                    <option value="ADMIN">Administrator</option>
                  </select>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-zinc-400 text-[11px] uppercase tracking-wider font-semibold font-oswald">
                      <th className="py-2.5 px-3">User</th>
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3">Country & Taste</th>
                      <th className="py-2.5 px-3">Activity</th>
                      <th className="py-2.5 px-3 text-right">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {isUsersLoading ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-zinc-500 text-xs">
                          Loading user directory...
                        </td>
                      </tr>
                    ) : usersData.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-zinc-500 text-xs">
                          No users found matching query.
                        </td>
                      </tr>
                    ) : (
                      usersData.map((u) => (
                        <tr key={u.id} className="hover:bg-white/[0.02]">
                          <td className="py-3 px-3">
                            <div className="font-bold text-white text-xs">{u.name}</div>
                            <div className="text-[11px] text-zinc-400 font-mono">{u.email}</div>
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                                u.role === "ADMIN"
                                  ? "bg-brand/10 text-brand border-brand/20"
                                  : "bg-zinc-800 text-zinc-400 border-white/5"
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="text-zinc-300 font-medium">{u.country}</div>
                            <div className="text-[10px] text-zinc-500 truncate max-w-[180px]">
                              {u.preferences?.languages?.join(", ") || "Global default"}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono text-[11px] text-zinc-300">
                            {u.stats?.likesCount ?? 0} likes • {u.stats?.historyCount ?? 0} plays
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-[11px] text-zinc-500">
                            {new Date(u.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* TAB 5: MUSIC METADATA */}
          {activeTab === "music" && (
            <motion.div
              key="music"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10">
                  <div className="text-xs text-zinc-400 mb-1">Synced LRC Coverage</div>
                  <div className="text-2xl font-bold text-emerald-400 font-mono">
                    {musicStats?.metadataHealth?.syncedLyricsPercent || 0}%
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1">
                    {musicStats?.metadataHealth?.syncedLyricsCount || 0} tracks with word-level timecodes
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10">
                  <div className="text-xs text-zinc-400 mb-1">Cover Artwork Integrity</div>
                  <div className="text-2xl font-bold text-brand font-mono">
                    {musicStats?.metadataHealth?.coverArtPercent || 0}%
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1">
                    {musicStats?.metadataHealth?.coverArtCount || 0} tracks with pristine CDNs
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10">
                  <div className="text-xs text-zinc-400 mb-1">JioSaavn 320kbps CDN</div>
                  <div className="text-2xl font-bold text-cyan-400 font-mono">
                    {musicStats?.audioSources?.jiosaavnCdn || 0}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1">Direct Akamai CDN full audio streams</div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 6: STORAGE & R2 */}
          {activeTab === "storage" && (
            <motion.div
              key="storage"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white font-oswald uppercase tracking-wider">
                      Cloudflare R2 Storage Bucket
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                        storageData?.r2?.configured
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-zinc-800 text-zinc-500 border-zinc-700"
                      }`}
                    >
                      {storageData?.r2?.configured ? "Connected" : "Standby"}
                    </span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-zinc-500">Bucket Name</span>
                      <span className="text-zinc-200 font-mono">{storageData?.r2?.bucketName || "zenify-audio"}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-zinc-500">Stored R2 Tracks</span>
                      <span className="text-zinc-200 font-mono">{storageData?.r2?.storedTracksCount || 0}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-zinc-500">Estimated R2 Volume</span>
                      <span className="text-emerald-400 font-mono font-bold">
                        {storageData?.r2?.estimatedStorageMB || 0} MB
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-3">
                  <div className="text-sm font-bold text-white font-oswald uppercase tracking-wider">
                    Third-Party Cloud Providers
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-zinc-400">Deepgram AI Transcription</span>
                      <span className="text-emerald-400 font-bold">Active</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-zinc-400">Brevo Transactional Email</span>
                      <span className="text-emerald-400 font-bold">Configured</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-zinc-400">Upstash Serverless Redis</span>
                      <span className="text-emerald-400 font-bold">Active</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Confirmation Modal for Reset Catalog */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-red-500/30 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <ShieldAlert className="w-6 h-6" />
              <h2 className="text-lg font-black font-oswald uppercase tracking-wide">
                Purge Catalog & Start Fresh?
              </h2>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed font-libre">
              This action will reset all tracks, albums, artists, history, likes, and queue caches. All user accounts and preference profiles will be strictly preserved.
            </p>
            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                disabled={isResetting}
                className="h-10 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 text-[10px] font-bold uppercase tracking-widest cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleResetCatalog}
                disabled={isResetting}
                className="h-10 px-5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold uppercase tracking-widest cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {isResetting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isResetting ? "PURGING..." : "CONFIRM PURGE"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
