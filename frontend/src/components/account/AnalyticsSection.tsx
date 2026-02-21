"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
    Play,
    Download,
    Star,
    Music2
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
            <div className="space-y-6 animate-pulse">
                <div className="h-10 w-48 bg-zinc-900 rounded-md mb-8" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-32 bg-[#1c1c1e] rounded-[2rem]" />
                    ))}
                </div>
                <div className="h-80 bg-[#1c1c1e] rounded-[2.5rem]" />
            </div>
        );
    }

    if (!data) return <div className="text-zinc-500">Failed to load analytics data.</div>;

    const maxTrend = Math.max(...data.trends, 1);

    return (
        <div className="space-y-8 pb-10 max-w-[1400px] mx-auto">
            {/* Header */}
            <div>
                <h1 className="text-3xl md:text-5xl font-semibold text-white tracking-tight mb-2">Overview</h1>
                <p className="text-zinc-500 text-sm font-medium">Analytics for your entire catalog</p>
            </div>

            {/* Apple Music Style Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                {[
                    { label: "Plays", value: data.overview.totalPlays, icon: Play },
                    { label: "Downloads", value: data.overview.totalDownloads, icon: Download },
                    { label: "Releases", value: data.overview.totalReleases, icon: Music2 },
                    { label: "Avg Rating", value: data.overview.averageRating.toFixed(1), icon: Star },
                ].map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-[#1c1c1e] p-6 md:p-8 rounded-[2rem] flex flex-col justify-between aspect-square md:aspect-auto md:h-48 shadow-sm hover:bg-[#232325] transition-colors"
                    >
                        <div className="text-zinc-400">
                            <stat.icon size={24} className="text-pink-500" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-zinc-400 mb-1">{stat.label}</p>
                            <h3 className="text-4xl md:text-5xl font-semibold text-white tracking-tighter">{stat.value}</h3>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Chart Activity */}
                <div className="lg:col-span-2 bg-[#1c1c1e] p-6 md:p-10 rounded-[2.5rem] space-y-8 shadow-sm">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">Activity</h2>
                        <p className="text-zinc-400 mt-1 text-sm font-medium">Last 30 Days</p>
                    </div>

                    <div className="h-56 md:h-64 flex items-end justify-between gap-1 w-full pt-4">
                        {data.trends.map((val, i) => (
                            <motion.div
                                key={i}
                                initial={{ height: 0 }}
                                animate={{ height: `${(val / maxTrend) * 100}%` }}
                                transition={{ delay: i * 0.02, duration: 0.5 }}
                                className="flex-1 w-full relative group bg-zinc-800 hover:bg-pink-500 transition-colors rounded-t-sm md:rounded-t-md"
                                title={`${val} plays`}
                            >
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Demographics Area Apple Style */}
                <div className="bg-[#1c1c1e] p-6 md:p-10 rounded-[2.5rem] space-y-8 shadow-sm">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">Audience</h2>
                        <p className="text-zinc-400 mt-1 text-sm font-medium">Listener Insights</p>
                    </div>

                    <div className="space-y-8">
                        <div>
                            <h3 className="text-xs font-bold text-zinc-500 mb-4 uppercase tracking-widest border-b border-white/5 pb-2">Top Regions</h3>
                            <div className="space-y-3">
                                {data.demographics.topCountries.length > 0 ? data.demographics.topCountries.slice(0, 4).map((c, idx) => (
                                    <div key={c} className="flex items-center justify-between items-center text-sm group">
                                        <span className="text-zinc-300 font-medium group-hover:text-white transition-colors">{c}</span>
                                        <span className="text-zinc-600 font-mono text-xs">{(5 - idx) * 12}%</span>
                                    </div>
                                )) : <span className="text-zinc-600 text-sm">No data</span>}
                            </div>
                        </div>

                        <div>
                            <h3 className="text-xs font-bold text-zinc-500 mb-4 uppercase tracking-widest border-b border-white/5 pb-2">Top Genres</h3>
                            <div className="flex flex-wrap gap-2 text-sm">
                                {data.demographics.topGenres.length > 0 ? data.demographics.topGenres.map((g, idx) => (
                                    <span key={g} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 transition-colors text-zinc-300 rounded-full font-medium text-xs">
                                        {g}
                                    </span>
                                )) : <span className="text-zinc-600 text-sm">No data</span>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* List Sections */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Top Tracks */}
                <div className="bg-[#1c1c1e] p-6 md:p-10 rounded-[2.5rem] space-y-6 shadow-sm">
                    <h2 className="text-2xl md:text-3xl font-semibold text-white tracking-tight mb-2">Top Tracks</h2>

                    <div className="space-y-2">
                        {data.topTracks.length > 0 ? data.topTracks.map((track, i) => (
                            <motion.div
                                key={track.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.1 }}
                                className="flex items-center gap-4 py-3 group cursor-pointer hover:bg-white/5 rounded-2xl transition-all -mx-3 px-3"
                            >
                                <div className="text-zinc-600 text-xs font-bold w-4 text-center">{i + 1}</div>
                                <div className="w-12 h-12 rounded-xl bg-zinc-800 flex-shrink-0 shadow-sm overflow-hidden relative">
                                    <img src={track.coverUrl || "/placeholder.jpg"} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Play className="text-white ml-0.5" size={16} />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-base font-semibold text-white truncate">{track.title}</h4>
                                    <p className="text-sm text-zinc-400 mt-0.5">{track.plays} Plays</p>
                                </div>
                                <div className="text-right pr-2">
                                    <div className="text-sm font-semibold text-white">{track.downloads}</div>
                                    <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">DLs</div>
                                </div>
                            </motion.div>
                        )) : (
                            <div className="py-8 text-zinc-500 text-sm">
                                No track data available yet.
                            </div>
                        )}
                    </div>
                </div>

                {/* Feedback */}
                <div className="bg-[#1c1c1e] p-6 md:p-10 rounded-[2.5rem] space-y-6 shadow-sm">
                    <h2 className="text-2xl md:text-3xl font-semibold text-white tracking-tight mb-2">Listener Feedback</h2>

                    <div className="space-y-4">
                        {data.feedback.length > 0 ? data.feedback.map((f, i) => (
                            <motion.div
                                key={f.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.1 }}
                                className="py-4 border-b border-white/5 last:border-0 group"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-zinc-800 overflow-hidden shrink-0">
                                            {f.user.avatarUrl ? <img src={f.user.avatarUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-white">{(f.user.name || f.user.username || '?')[0]}</div>}
                                        </div>
                                        <div>
                                            <span className="text-sm font-semibold text-white block">{f.user.name || f.user.username}</span>
                                            <span className="text-xs text-zinc-500 font-medium block mt-0.5">{f.track.title}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-0.5">
                                        {[...Array(5)].map((_, i) => (
                                            <Star key={i} size={12} className={cn(i < f.value ? "text-pink-500 fill-pink-500" : "text-zinc-800")} />
                                        ))}
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-300 leading-relaxed font-medium">"{f.comment}"</p>
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
    );
};
