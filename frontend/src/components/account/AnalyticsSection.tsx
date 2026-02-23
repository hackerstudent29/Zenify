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
import { cn, getMediaUrl } from "@/lib/utils";

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
            <div className="space-y-6 animate-pulse max-w-5xl mx-auto">
                <div className="h-8 w-40 bg-zinc-900 rounded mb-6" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-28 bg-[#1c1c1e] rounded-[1.5rem]" />
                    ))}
                </div>
                <div className="h-64 bg-[#1c1c1e] rounded-[2rem]" />
            </div>
        );
    }

    if (!data) return <div className="text-zinc-500">Failed to load analytics data.</div>;

    const maxTrend = Math.max(...data.trends, 1);

    return (
        <div className="space-y-6 pb-10 max-w-5xl mx-auto">
            {/* Header */}
            <div>
                <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight mb-1">Overview</h1>
                <p className="text-zinc-500 text-sm font-medium">Analytics for your entire catalog</p>
            </div>

            {/* Apple Music Style Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: "Plays", value: data.overview.totalPlays, icon: Play },
                    { label: "Downloads", value: data.overview.totalDownloads, icon: Download },
                    { label: "Releases", value: data.overview.totalReleases, icon: Music2 },
                    { label: "Avg Rating", value: data.overview.averageRating.toFixed(1), icon: Star },
                ].map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-[#1c1c1e] p-5 md:p-6 rounded-[1.5rem] flex flex-col justify-between aspect-square md:aspect-auto md:h-36 shadow-sm hover:bg-[#232325] transition-colors"
                    >
                        <div className="text-zinc-400">
                            <stat.icon size={20} className="text-pink-500" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-zinc-400 mb-0.5">{stat.label}</p>
                            <h3 className="text-3xl md:text-4xl font-semibold text-white tracking-tighter">{stat.value}</h3>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                {/* Chart Activity */}
                <div className="lg:col-span-2 bg-[#1c1c1e] p-6 md:p-8 rounded-[2rem] space-y-6 shadow-sm">
                    <div>
                        <h2 className="text-xl md:text-2xl font-semibold text-white tracking-tight">Activity</h2>
                        <p className="text-zinc-400 mt-0.5 text-xs font-medium">Last 30 Days</p>
                    </div>

                    <div className="h-40 md:h-48 flex items-end justify-between gap-1 w-full pt-4">
                        {data.trends.map((val, i) => (
                            <motion.div
                                key={i}
                                initial={{ height: 0 }}
                                animate={{ height: `${(val / maxTrend) * 100}%` }}
                                transition={{ delay: i * 0.02, duration: 0.5 }}
                                className="flex-1 w-full relative group bg-zinc-800 hover:bg-pink-500 transition-colors rounded-t-sm"
                                title={`${val} plays`}
                            >
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Demographics Area Apple Style */}
                <div className="bg-[#1c1c1e] p-6 md:p-8 rounded-[2rem] space-y-6 shadow-sm">
                    <div>
                        <h2 className="text-xl md:text-2xl font-semibold text-white tracking-tight">Audience</h2>
                        <p className="text-zinc-400 mt-0.5 text-xs font-medium">Listener Insights</p>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <h3 className="text-[10px] font-bold text-zinc-500 mb-3 uppercase tracking-widest border-b border-white/5 pb-2">Top Regions</h3>
                            <div className="space-y-2.5">
                                {data.demographics.topCountries.length > 0 ? data.demographics.topCountries.slice(0, 4).map((c, idx) => (
                                    <div key={c} className="flex items-center justify-between items-center text-sm group">
                                        <span className="text-zinc-300 font-medium group-hover:text-white transition-colors">{c}</span>
                                        <span className="text-zinc-600 font-mono text-[10px]">{(5 - idx) * 12}%</span>
                                    </div>
                                )) : <span className="text-zinc-600 text-sm">No data</span>}
                            </div>
                        </div>

                        <div>
                            <h3 className="text-[10px] font-bold text-zinc-500 mb-3 uppercase tracking-widest border-b border-white/5 pb-2">Top Genres</h3>
                            <div className="flex flex-wrap gap-1.5 text-sm">
                                {data.demographics.topGenres.length > 0 ? data.demographics.topGenres.map((g, idx) => (
                                    <span key={g} className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 transition-colors text-zinc-300 rounded-full font-medium text-[11px]">
                                        {g}
                                    </span>
                                )) : <span className="text-zinc-600 text-sm">No data</span>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* List Sections */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* Top Tracks */}
                <div className="bg-[#1c1c1e] p-6 md:p-8 rounded-[2rem] space-y-5 shadow-sm">
                    <h2 className="text-xl md:text-2xl font-semibold text-white tracking-tight mb-1">Top Tracks</h2>

                    <div className="space-y-1">
                        {data.topTracks.length > 0 ? data.topTracks.map((track, i) => (
                            <motion.div
                                key={track.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.1 }}
                                className="flex items-center gap-3 py-2 group cursor-pointer hover:bg-white/5 rounded-2xl transition-all -mx-2 px-2"
                            >
                                <div className="text-zinc-600 text-[10px] font-bold w-4 text-center">{i + 1}</div>
                                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex-shrink-0 shadow-sm overflow-hidden relative">
                                    <img src={getMediaUrl(track.coverUrl) || `https://picsum.photos/seed/${track.id}/200/200`} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Play className="text-white ml-0.5" size={14} />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-semibold text-white truncate">{track.title}</h4>
                                    <p className="text-xs text-zinc-400 mt-0.5">{track.plays} Plays</p>
                                </div>
                                <div className="text-right pr-1">
                                    <div className="text-xs font-semibold text-white">{track.downloads}</div>
                                    <div className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider">DLs</div>
                                </div>
                            </motion.div>
                        )) : (
                            <div className="py-6 text-zinc-500 text-sm">
                                No track data available yet.
                            </div>
                        )}
                    </div>
                </div>

                {/* Feedback */}
                <div className="bg-[#1c1c1e] p-6 md:p-8 rounded-[2rem] space-y-5 shadow-sm">
                    <h2 className="text-xl md:text-2xl font-semibold text-white tracking-tight mb-1">Listener Feedback</h2>

                    <div className="space-y-3">
                        {data.feedback.length > 0 ? data.feedback.map((f, i) => (
                            <motion.div
                                key={f.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.1 }}
                                className="py-3 border-b border-white/5 last:border-0 group"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden shrink-0">
                                            {f.user.avatarUrl ? <img src={getMediaUrl(f.user.avatarUrl)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-semibold text-white">{(f.user.name || f.user.username || '?')[0]}</div>}
                                        </div>
                                        <div>
                                            <span className="text-xs font-semibold text-white block">{f.user.name || f.user.username}</span>
                                            <span className="text-[10px] text-zinc-500 font-medium block mt-0.5">{f.track.title}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-0.5">
                                        {[...Array(5)].map((_, i) => (
                                            <Star key={i} size={10} className={cn(i < f.value ? "text-pink-500 fill-pink-500" : "text-zinc-800")} />
                                        ))}
                                    </div>
                                </div>
                                <p className="text-xs text-zinc-300 leading-relaxed font-medium">"{f.comment}"</p>
                            </motion.div>
                        )) : (
                            <div className="py-6 text-zinc-500 text-sm">
                                No recent feedback.
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};
