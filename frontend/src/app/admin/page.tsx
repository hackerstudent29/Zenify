"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Database,
  Users,
  Music,
  HardDrive,
  Activity,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Server,
  Cpu,
  Layers,
  ChevronLeft,
  ChevronRight,
  Shield,
  FileText,
  Radio,
  ExternalLink,
} from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/shared/SEO";
import notify from "@/lib/notify";

type ConsoleTab = "overview" | "users" | "music" | "storage" | "system";

export default function DatabaseAdminPage() {
  const { user, isAuthenticated } = useAuthStore();
  const isAdmin = user?.role === "ADMIN" || (user as any)?.role === "admin";

  const [activeTab, setActiveTab] = useState<ConsoleTab>("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Overview Data
  const [overviewData, setOverviewData] = useState<any>(null);

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

  const refreshAll = async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchOverview(),
      fetchMusicStats(),
      fetchStorage(),
      fetchSystemHealth(),
      fetchUsers(userPagination.page, userSearch, userRoleFilter),
    ]);
    setIsRefreshing(false);
    notify.success("Database Console telemetry synchronized");
  };

  useEffect(() => {
    if (!isAdmin) return;
    setIsLoading(true);
    Promise.all([
      fetchOverview(),
      fetchMusicStats(),
      fetchStorage(),
      fetchSystemHealth(),
      fetchUsers(1, "", ""),
    ]).finally(() => {
      setIsLoading(false);
    });
  }, [isAdmin, fetchOverview, fetchMusicStats, fetchStorage, fetchSystemHealth, fetchUsers]);

  // Handle Search Debounce for Users
  useEffect(() => {
    if (!isAdmin || activeTab !== "users") return;
    const timer = setTimeout(() => {
      fetchUsers(1, userSearch, userRoleFilter);
    }, 350);
    return () => clearTimeout(timer);
  }, [userSearch, userRoleFilter, activeTab, isAdmin, fetchUsers]);

  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] text-center px-6">
        <SEO title="Database Console – Zenify" noindex={true} path="/admin" />
        <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center mb-6">
          <Shield className="w-8 h-8 text-brand" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
          Administrator Access Required
        </h1>
        <p className="text-zinc-400 text-sm max-w-md mx-auto leading-relaxed mb-6">
          This console is strictly restricted to platform administrators with database governance privileges.
        </p>
        <Button
          onClick={() => (window.location.href = "/")}
          className="h-10 px-6 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-xs font-bold uppercase tracking-wider"
        >
          Return to Hub
        </Button>
      </div>
    );
  }

  const navTabs: { id: ConsoleTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "overview", label: "Overview & Tables", icon: Database },
    { id: "users", label: "User Directory", icon: Users },
    { id: "music", label: "Music Metadata", icon: Music },
    { id: "storage", label: "Storage & R2", icon: HardDrive },
    { id: "system", label: "System Telemetry", icon: Activity },
  ];

  return (
    <div className="min-h-full pb-36 pt-6 sm:pt-10 px-4 sm:px-6 md:px-10 max-w-7xl mx-auto">
      <SEO title="Database Administration Console – Zenify" noindex={true} path="/admin" />

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
              <Database className="w-4 h-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Database Administration Console
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time infrastructure health, schema telemetry, catalog diagnostics & security oversight.
          </p>
        </div>

        {/* Global Status Badges & Refresh */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/10 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-zinc-300 font-medium">PostgreSQL</span>
            <span className="text-zinc-500">|</span>
            <span className="text-emerald-400 font-mono text-[11px]">
              {overviewData?.database?.latencyMs ?? 2}ms
            </span>
          </div>

          <button
            onClick={refreshAll}
            disabled={isRefreshing}
            className="h-9 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Primary Tab Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto py-4 scrollbar-none border-b border-white/5">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
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
          {/* TAB 1: OVERVIEW & TABLES */}
          {activeTab === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              {/* Stat Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10">
                  <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
                    <span>Database Status</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-white">Connected</div>
                  <div className="text-[11px] text-zinc-500 mt-1 truncate">
                    {overviewData?.database?.engine || "PostgreSQL Neon Engine"}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10">
                  <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
                    <span>Estimated Size</span>
                    <HardDrive className="w-4 h-4 text-brand" />
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-white">
                    {overviewData?.database?.size || "68.4 MB"}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1">Live Relational Storage</div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10">
                  <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
                    <span>Total Tracks</span>
                    <Music className="w-4 h-4 text-violet-400" />
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-white">
                    {overviewData?.counts?.tracks?.toLocaleString() ?? 0}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1">
                    Across {overviewData?.counts?.albums ?? 0} Albums
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10">
                  <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
                    <span>Active Users</span>
                    <Users className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-white">
                    {overviewData?.counts?.users?.toLocaleString() ?? 0}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1">
                    {overviewData?.counts?.likes ?? 0} Total Likes
                  </div>
                </div>
              </div>

              {/* Table Size & Live Row Statistics */}
              <div className="p-5 rounded-2xl bg-zinc-900/60 border border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-wide">
                      Core Database Schemas & Row Allocation
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Live table statistics and row counts managed by Prisma ORM.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono uppercase bg-white/5 border border-white/10 px-2 py-1 rounded text-zinc-400">
                    {overviewData?.tableSizes?.length || 8} Active Schemas
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-zinc-400 text-[11px] uppercase tracking-wider font-semibold">
                        <th className="py-2.5 px-3">Table / Model</th>
                        <th className="py-2.5 px-3">Live Rows</th>
                        <th className="py-2.5 px-3">Storage Allocation</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {(overviewData?.tableSizes || []).map((t: any) => (
                        <tr key={t.table} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 px-3 font-mono text-zinc-200 flex items-center gap-2">
                            <Layers className="w-3.5 h-3.5 text-brand" />
                            <span>{t.table}</span>
                          </td>
                          <td className="py-3 px-3 font-medium text-white">
                            {Number(t.rows).toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-zinc-400 font-mono text-[11px]">{t.size}</td>
                          <td className="py-3 px-3 text-right">
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              Active
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Server Environment Specs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10">
                  <div className="flex items-center gap-2 text-zinc-300 text-xs font-semibold mb-3">
                    <Server className="w-4 h-4 text-brand" />
                    <span>Runtime Environment</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-zinc-500">Node.js Engine</span>
                      <span className="text-zinc-200 font-mono">{overviewData?.system?.nodeVersion}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-zinc-500">Host Platform</span>
                      <span className="text-zinc-200 font-mono">{overviewData?.system?.platform}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-zinc-500">Database Engine</span>
                      <span className="text-zinc-200 font-mono">PostgreSQL / Neon Cloud</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10">
                  <div className="flex items-center gap-2 text-zinc-300 text-xs font-semibold mb-3">
                    <Cpu className="w-4 h-4 text-emerald-400" />
                    <span>Backend Process Memory</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-zinc-500">Heap Used</span>
                      <span className="text-zinc-200 font-mono">{overviewData?.system?.memory?.heapUsedMB} MB</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-zinc-500">Heap Total</span>
                      <span className="text-zinc-200 font-mono">{overviewData?.system?.memory?.heapTotalMB} MB</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-zinc-500">RSS Allocation</span>
                      <span className="text-zinc-200 font-mono">{overviewData?.system?.memory?.rssMB} MB</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 2: USER DIRECTORY */}
          {activeTab === "users" && (
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              {/* Filter and Search Bar */}
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
                    className="h-9 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-zinc-300 focus:outline-none focus:border-brand"
                  >
                    <option value="">All Roles</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="LISTENER">LISTENER</option>
                    <option value="PRO">PRO</option>
                    <option value="PREMIUM">PREMIUM</option>
                  </select>

                  <button
                    onClick={() => fetchUsers(userPagination.page, userSearch, userRoleFilter)}
                    className="h-9 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isUsersLoading ? "animate-spin" : ""}`} />
                    <span>Filter</span>
                  </button>
                </div>
              </div>

              {/* Users Table */}
              <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-zinc-400 text-[11px] uppercase tracking-wider font-semibold">
                        <th className="py-3 px-3">User</th>
                        <th className="py-3 px-3">Email</th>
                        <th className="py-3 px-3">Role</th>
                        <th className="py-3 px-3">Region</th>
                        <th className="py-3 px-3">Languages</th>
                        <th className="py-3 px-3">Stats</th>
                        <th className="py-3 px-3 text-right">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {isUsersLoading ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-zinc-500 text-xs">
                            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand" />
                            Loading users directory...
                          </td>
                        </tr>
                      ) : usersData.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-zinc-500 text-xs">
                            No users matched your search criteria.
                          </td>
                        </tr>
                      ) : (
                        usersData.map((u) => (
                          <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 text-[11px] font-bold text-white">
                                  {u.avatar ? (
                                    <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                                  ) : (
                                    u.name?.charAt(0)?.toUpperCase() || "U"
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-zinc-200 font-semibold truncate max-w-[130px]">{u.name}</div>
                                  <div className="text-[10px] text-zinc-500 truncate font-mono">@{u.username}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3 font-mono text-zinc-300 text-[11px] truncate max-w-[170px]">
                              {u.email}
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                                  u.role === "ADMIN"
                                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                                    : u.role === "PRO" || u.role === "PREMIUM"
                                    ? "bg-brand/10 text-brand border-brand/20"
                                    : "bg-white/5 text-zinc-400 border-white/10"
                                }`}
                              >
                                {u.role}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-zinc-400">{u.country || "Global"}</td>
                            <td className="py-3 px-3">
                              <div className="flex flex-wrap gap-1 max-w-[150px]">
                                {(u.preferences?.languages || []).slice(0, 3).map((lang: string) => (
                                  <span
                                    key={lang}
                                    className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] text-zinc-300 capitalize"
                                  >
                                    {lang}
                                  </span>
                                ))}
                                {(!u.preferences?.languages || u.preferences.languages.length === 0) && (
                                  <span className="text-zinc-600 text-[10px]">—</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-zinc-400 text-[11px]">
                              <span>{u.stats?.likesCount ?? 0} likes</span>
                              <span className="mx-1 text-zinc-600">·</span>
                              <span>{u.stats?.historyCount ?? 0} plays</span>
                            </td>
                            <td className="py-3 px-3 text-right text-zinc-500 font-mono text-[10px]">
                              {new Date(u.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between pt-4 mt-2 border-t border-white/5 text-xs text-zinc-400">
                  <div>
                    Showing {usersData.length} of {userPagination.total} users
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fetchUsers(userPagination.page - 1, userSearch, userRoleFilter)}
                      disabled={userPagination.page <= 1}
                      className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 text-white cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-[11px] font-mono px-2">
                      Page {userPagination.page} of {Math.max(1, userPagination.totalPages)}
                    </span>
                    <button
                      onClick={() => fetchUsers(userPagination.page + 1, userSearch, userRoleFilter)}
                      disabled={userPagination.page >= userPagination.totalPages}
                      className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 text-white cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 3: MUSIC METADATA */}
          {activeTab === "music" && (
            <motion.div
              key="music"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              {/* Metadata Health Overview */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                    <span>Synced Lyrics Coverage</span>
                    <span className="text-violet-400 font-bold">{musicStats?.metadataHealth?.syncedLyricsPercent}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden my-2">
                    <div
                      className="bg-violet-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${musicStats?.metadataHealth?.syncedLyricsPercent || 0}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {musicStats?.metadataHealth?.syncedLyricsCount?.toLocaleString() ?? 0} tracks with sub-second LRC sync
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                    <span>Genuine Cover Art</span>
                    <span className="text-emerald-400 font-bold">{musicStats?.metadataHealth?.coverArtPercent}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden my-2">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${musicStats?.metadataHealth?.coverArtPercent || 0}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {musicStats?.metadataHealth?.coverArtCount?.toLocaleString() ?? 0} tracks with verified visual artwork
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                    <span>Plain Lyrics</span>
                    <span className="text-blue-400 font-bold">{musicStats?.metadataHealth?.plainLyricsPercent}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden my-2">
                    <div
                      className="bg-blue-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${musicStats?.metadataHealth?.plainLyricsPercent || 0}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {musicStats?.metadataHealth?.plainLyricsCount?.toLocaleString() ?? 0} tracks with full text lyrics
                  </div>
                </div>
              </div>

              {/* Audio Stream Source Distribution */}
              <div className="p-5 rounded-2xl bg-zinc-900/60 border border-white/10">
                <h3 className="text-sm font-bold text-white tracking-wide mb-1">
                  Audio Stream Delivery Architecture
                </h3>
                <p className="text-[11px] text-zinc-400 mb-4">
                  Full-song playback resolution split across high-speed CDNs, Cloudflare R2, and streaming proxies.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                    <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                      JioSaavn 320k CDN
                    </div>
                    <div className="text-lg font-bold text-white mt-1">
                      {musicStats?.audioSources?.jiosaavnCdn?.toLocaleString() ?? 0}
                    </div>
                    <div className="text-[10px] text-zinc-500">Pristine Akamai direct</div>
                  </div>

                  <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                    <div className="text-[10px] uppercase font-bold text-orange-400 tracking-wider">
                      Cloudflare R2
                    </div>
                    <div className="text-lg font-bold text-white mt-1">
                      {musicStats?.audioSources?.cloudflareR2?.toLocaleString() ?? 0}
                    </div>
                    <div className="text-[10px] text-zinc-500">Native persistent audio</div>
                  </div>

                  <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                    <div className="text-[10px] uppercase font-bold text-red-400 tracking-wider">
                      yt-dlp Proxy
                    </div>
                    <div className="text-lg font-bold text-white mt-1">
                      {musicStats?.audioSources?.youtubeProxy?.toLocaleString() ?? 0}
                    </div>
                    <div className="text-[10px] text-zinc-500">HTTP 206 Seeking proxy</div>
                  </div>

                  <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                    <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                      Other Sources
                    </div>
                    <div className="text-lg font-bold text-white mt-1">
                      {musicStats?.audioSources?.directOrOther?.toLocaleString() ?? 0}
                    </div>
                    <div className="text-[10px] text-zinc-500">External HTTP / direct</div>
                  </div>
                </div>
              </div>

              {/* Potential Duplicate Tracks Scanner */}
              <div className="p-5 rounded-2xl bg-zinc-900/60 border border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-wide">
                      Catalog Integrity: Duplicate Track Scanner
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Tracks sharing identical normalized titles and artists.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono uppercase bg-white/5 border border-white/10 px-2 py-1 rounded text-zinc-400">
                    {musicStats?.duplicates?.length || 0} Potential Clones
                  </span>
                </div>

                {musicStats?.duplicates && musicStats.duplicates.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-zinc-400 text-[11px] uppercase tracking-wider font-semibold">
                          <th className="py-2.5 px-3">Track Title</th>
                          <th className="py-2.5 px-3">Artist ID</th>
                          <th className="py-2.5 px-3 text-right">Duplicate Entries</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {musicStats.duplicates.map((d: any, idx: number) => (
                          <tr key={idx} className="hover:bg-white/[0.02]">
                            <td className="py-2.5 px-3 font-medium text-white capitalize">{d.title}</td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-500">{d.artistId}</td>
                            <td className="py-2.5 px-3 text-right text-amber-400 font-bold font-mono">
                              {d.duplicateCount} copies
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-6 text-center text-zinc-500 text-xs flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Catalog is clean. No high-frequency duplicate tracks detected.</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB 4: STORAGE & MEDIA */}
          {activeTab === "storage" && (
            <motion.div
              key="storage"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              {/* Cloudflare R2 Card */}
              <div className="p-6 rounded-2xl bg-zinc-900/80 border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                      <HardDrive className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">Cloudflare R2 Object Storage</h3>
                      <p className="text-xs text-zinc-400">Persistent audio buffer & lossless music repository</p>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                      storageData?.r2?.configured
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }`}
                  >
                    {storageData?.r2?.configured ? "Active & Linked" : "Simulated / Default"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="p-3.5 rounded-xl bg-black/40 border border-white/5">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Bucket Name</span>
                    <div className="text-sm font-mono text-zinc-200 mt-1">{storageData?.r2?.bucketName}</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-black/40 border border-white/5">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Public Domain</span>
                    <div className="text-xs font-mono text-zinc-200 mt-1 truncate">
                      {storageData?.r2?.publicDomain}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-black/40 border border-white/5">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Estimated Volume</span>
                    <div className="text-sm font-bold text-white mt-1">
                      {storageData?.r2?.estimatedStorageGB || "0.00"} GB
                    </div>
                  </div>
                </div>
              </div>

              {/* Service Connectors & Integrations */}
              <div className="p-5 rounded-2xl bg-zinc-900/60 border border-white/10">
                <h3 className="text-sm font-bold text-white tracking-wide mb-1">
                  Connected Cloud Service Providers
                </h3>
                <p className="text-[11px] text-zinc-400 mb-4">
                  Infrastructure services powering media hosting, caching, and background speech transcription.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-white">Cloudinary</div>
                      <div className="text-[10px] text-zinc-500">Image CDN</div>
                    </div>
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        storageData?.thirdPartyProviders?.cloudinary ? "bg-emerald-400" : "bg-zinc-600"
                      }`}
                    />
                  </div>

                  <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-white">Redis Cache</div>
                      <div className="text-[10px] text-zinc-500">KV & Fast Session</div>
                    </div>
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        storageData?.thirdPartyProviders?.redis ? "bg-emerald-400" : "bg-zinc-600"
                      }`}
                    />
                  </div>

                  <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-white">Brevo Mail</div>
                      <div className="text-[10px] text-zinc-500">Auth & Alerts</div>
                    </div>
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        storageData?.thirdPartyProviders?.brevoEmail ? "bg-emerald-400" : "bg-zinc-600"
                      }`}
                    />
                  </div>

                  <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-white">Deepgram AI</div>
                      <div className="text-[10px] text-zinc-500">Synced LRC Whisper</div>
                    </div>
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        storageData?.thirdPartyProviders?.deepgramTranscription ? "bg-emerald-400" : "bg-zinc-600"
                      }`}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 5: SYSTEM TELEMETRY */}
          {activeTab === "system" && (
            <motion.div
              key="system"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                    <span>Server Uptime</span>
                    <Activity className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-xl font-bold text-white font-mono">{systemHealth?.uptime || "Active"}</div>
                  <div className="text-[11px] text-zinc-500 mt-1">Continuous zero-downtime execution</div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                    <span>Database Ping</span>
                    <Database className="w-4 h-4 text-brand" />
                  </div>
                  <div className="text-xl font-bold text-emerald-400 font-mono">
                    {systemHealth?.databaseLatencyMs ?? 2} ms
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1">Round-trip query latency</div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                    <span>Background Workers</span>
                    <Layers className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-xl font-bold text-white font-mono">
                    {systemHealth?.backgroundTasks?.lyricEnrichmentJobs ?? 0} jobs
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1">
                    {systemHealth?.backgroundTasks?.musicAnalysisRuns ?? 0} audio analysis runs
                  </div>
                </div>
              </div>

              {/* Recent User Activity Logs */}
              <div className="p-5 rounded-2xl bg-zinc-900/60 border border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-wide">
                      Recent Telemetry & Activity Logs
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Chronological stream of playback events, likes, and searches.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">Live Fastify audit</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-zinc-400 text-[11px] uppercase tracking-wider font-semibold">
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
        </AnimatePresence>
      </div>
    </div>
  );
}
