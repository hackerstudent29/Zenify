"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
    BarChart3,
    TrendingUp,
    Play,
    Download,
    Star,
    Users,
    Globe,
    Calendar,
    Music2,
    ArrowUpRight,
    MessageCircle
} from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

interface AnalyticsData {
    overview: {
        totalReleases: number;
        totalPlays: number;
        totalDownloads: number;
        averageRating: number;
    };
    topTracks: Array<{
        id: string;
        title: string;
        coverUrl: string;
        plays: number;
        downloads: number;
        engagementRatio: string;
        rating: string;
    }>;
    trends: number[];
    feedback: Array<{
        id: string;
        value: number;
        comment: string;
        createdAt: string;
        user: { name: string; username: string; avatarUrl: string | null };
        track: { title: string };
    }>;
    demographics: {
        topCountries: string[];
        ageBrackets: Record<string, number>;
        topGenres: string[];
    };
}

export const AnalyticsSection = () => {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                const res = await api.get("/analytics");
                setData(res.data);
            } catch (err) {
                console.error("Failed to fetch analytics", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchAnalytics();
    }, []);

    if (isLoading) {
        return (
            <div className="space-y-8 animate-pulse">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-28 bg-white/5 rounded-2xl border border-white/10" />
                    ))}
                </div>
                <div className="h-64 bg-white/5 rounded-2xl border border-white/10" />
            </div>
        );
    }

    if (!data) return <div className="text-zinc-500">Failed to load analytics data.</div>;

    const maxTrend = Math.max(...data.trends, 1);

    return (
        <div className="space-y-12 pb-10">
            {/* 1. Core Performance Metrics - Structured Row */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-y border-white/10 py-8 gap-8">
                {[
                    { label: "Total Releases", value: data.overview.totalReleases, icon: Music2, color: "text-blue-400" },
                    { label: "Total Plays", value: data.overview.totalPlays, icon: Play, color: "text-purple-400" },
                    { label: "Total Downloads", value: data.overview.totalDownloads, icon: Download, color: "text-emerald-400" },
                    { label: "Average Rating", value: data.overview.averageRating.toFixed(1), icon: Star, color: "text-amber-400" },
                ].map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex flex-col gap-2 w-full md:w-auto"
                    >
                        <div className="flex items-center gap-2 text-zinc-400">
                            <stat.icon size={16} className={stat.color} />
                            <span className="text-sm font-medium uppercase tracking-wider">{stat.label}</span>
                        </div>
                        <h3 className="text-4xl font-light text-white tracking-tight">{stat.value}</h3>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                {/* Main Content Area */}
                <div className="lg:col-span-2 space-y-12">
                    {/* Activity Trends */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between pb-4 border-b border-white/10">
                            <div>
                                <h2 className="text-xl font-medium text-white">Engagement Activity</h2>
                                <p className="text-sm text-zinc-500">Visualizing plays over the last 30 days</p>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded text-xs text-zinc-400 font-medium">
                                <TrendingUp size={14} className="text-purple-500" />
                                Live
                            </div>
                        </div>

                        <div className="h-48 flex items-end justify-between gap-1 w-full pt-4">
                            {data.trends.map((val, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ height: 0 }}
                                    animate={{ height: `${(val / maxTrend) * 100}%` }}
                                    transition={{ delay: i * 0.02, duration: 0.5 }}
                                    className="flex-1 w-full relative group bg-white/5 hover:bg-white/20 transition-colors rounded-t-sm"
                                >
                                    <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-xs font-medium px-2 py-1 rounded shadow-lg pointer-events-none transition-opacity whitespace-nowrap z-20">
                                        {val} plays
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* Top Performing Tracks */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between pb-4 border-b border-white/10">
                            <h2 className="text-xl font-medium text-white">Top Performing Tracks</h2>
                        </div>

                        <div className="space-y-0 divide-y divide-white/5">
                            {data.topTracks.length > 0 ? data.topTracks.map((track, i) => (
                                <motion.div
                                    key={track.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="flex items-center gap-4 py-4 group"
                                >
                                    <div className="text-zinc-600 text-sm font-mono w-4">{i + 1}</div>
                                    <div className="w-10 h-10 rounded bg-zinc-900 flex-shrink-0">
                                        <img src={track.coverUrl || "/placeholder.jpg"} alt="" className="w-full h-full object-cover rounded opacity-80 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-base font-medium text-white truncate">{track.title}</h4>
                                        <div className="flex items-center gap-4 mt-1">
                                            <span className="text-xs text-zinc-500 flex items-center gap-1.5">
                                                <Play size={12} className="text-zinc-400" /> {track.plays}
                                            </span>
                                            <span className="text-xs text-zinc-500 flex items-center gap-1.5">
                                                <Download size={12} className="text-zinc-400" /> {track.downloads}
                                            </span>
                                            <span className="text-xs text-zinc-500 flex items-center gap-1.5">
                                                <Star size={12} className="text-zinc-400" /> {track.rating}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-mono text-zinc-300">{track.engagementRatio}</div>
                                        <div className="text-[10px] text-zinc-600 uppercase">Ratio</div>
                                    </div>
                                </motion.div>
                            )) : (
                                <div className="py-8 text-center text-zinc-500 text-sm">
                                    No track data available yet.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar Area */}
                <div className="space-y-12">
                    {/* Demographics */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between pb-4 border-b border-white/10">
                            <h2 className="text-xl font-medium text-white">Demographics</h2>
                        </div>

                        <div className="space-y-6 text-sm">
                            <div>
                                <h3 className="text-zinc-500 mb-3 flex items-center gap-2 font-medium">
                                    <Globe size={14} /> Regions
                                </h3>
                                <div className="flex flex-wrap gap-2 text-zinc-300">
                                    {data.demographics.topCountries.length > 0 ? data.demographics.topCountries.map((c, idx) => (
                                        <span key={c} className="flex items-center">
                                            {c}{idx < data.demographics.topCountries.length - 1 && <span className="text-zinc-700 mx-2">/</span>}
                                        </span>
                                    )) : <span className="text-zinc-600 italic">No data</span>}
                                </div>
                            </div>

                            <div>
                                <h3 className="text-zinc-500 mb-3 flex items-center gap-2 font-medium">
                                    <Calendar size={14} /> Age Groups
                                </h3>
                                <div className="space-y-2">
                                    {Object.entries(data.demographics.ageBrackets).filter(([k]) => k !== 'Unknown').map(([k, v]) => (
                                        <div key={k} className="flex items-center justify-between border-b border-white/5 pb-2">
                                            <span className="text-zinc-300">{k}</span>
                                            <span className="text-zinc-500">{v} listeners</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <h3 className="text-zinc-500 mb-3 flex items-center gap-2 font-medium">
                                    <Users size={14} /> Genre Affinity
                                </h3>
                                <div className="flex flex-wrap gap-2 text-zinc-300">
                                    {data.demographics.topGenres.length > 0 ? data.demographics.topGenres.map((g, idx) => (
                                        <span key={g} className="flex items-center">
                                            {g}{idx < data.demographics.topGenres.length - 1 && <span className="text-zinc-700 mx-2">&bull;</span>}
                                        </span>
                                    )) : <span className="text-zinc-600 italic">No data</span>}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Feedback */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between pb-4 border-b border-white/10">
                            <h2 className="text-xl font-medium text-white">Feedback</h2>
                            <MessageCircle size={16} className="text-zinc-500" />
                        </div>

                        <div className="space-y-4">
                            {data.feedback.length > 0 ? data.feedback.map((f, i) => (
                                <motion.div
                                    key={f.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="pt-2 pb-4 border-b border-white/5 last:border-0"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-5 h-5 rounded-full bg-zinc-800 overflow-hidden">
                                                {f.user.avatarUrl ? <img src={f.user.avatarUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-400">{(f.user.name || f.user.username || '?')[0]}</div>}
                                            </div>
                                            <span className="text-sm font-medium text-zinc-300">{f.user.name || f.user.username}</span>
                                        </div>
                                        <div className="flex items-center gap-0.5">
                                            {[...Array(5)].map((_, i) => (
                                                <Star key={i} size={10} className={cn(i < f.value ? "text-amber-500 fill-amber-500" : "text-zinc-800")} />
                                            ))}
                                        </div>
                                    </div>
                                    <p className="text-sm text-zinc-400 italic">"{f.comment}"</p>
                                    <p className="text-xs text-zinc-600 mt-2">
                                        On <span className="text-zinc-500">{f.track.title}</span> &bull; {new Date(f.createdAt).toLocaleDateString()}
                                    </p>
                                </motion.div>
                            )) : (
                                <div className="py-4 text-zinc-500 text-sm">
                                    No recent feedback.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="pt-8 border-t border-white/10 text-center">
                <span className="text-xs text-zinc-600 uppercase tracking-widest font-medium">
                    Analytics Dashboard &bull; Live Updates
                </span>
            </div>
        </div>
    );
};
