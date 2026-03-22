"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
    Play,
    Download,
    Star,
    Music2,
    Clock,
    User,
    Heart,
    Brain,
    Sparkles,
    Zap,
    Wind,
    Target
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { cn, getMediaUrl } from "@/lib/utils";

interface AnalyticsData {
    overview: {
        totalReleases: number;
        totalStreams: number;
        totalDownloads: number;
        averageRating: number;
        type: 'ARTIST' | 'LISTENER';
    };
    topTracks: Array<{
        id: string;
        title: string;
        coverUrl: string;
        streams: number;
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
    const { data, isLoading } = useQuery({
        queryKey: ['user-analytics'],
        queryFn: async () => {
            const res = await api.get("analytics");
            return res.data as AnalyticsData;
        },
        staleTime: 1000 * 60 * 15, // Cache for 15 minutes
        gcTime: 1000 * 60 * 30,    // Keep in memory for 30 minutes
    });

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

    const { user } = useAuthStore();
    const isListener = data.overview.type === 'LISTENER';

    const metrics = isListener ? [
        { label: "Total Streams", value: data.overview.totalStreams, icon: Play },
        { label: "Hours Listened", value: data.overview.totalDownloads, icon: Clock },
        { label: "Favorite Artists", value: data.overview.totalReleases, icon: User },
        { label: "Total Saves", value: data.overview.averageRating, icon: Heart },
    ] : [
        { label: "Streams", value: data.overview.totalStreams, icon: Play },
        { label: "Downloads", value: data.overview.totalDownloads, icon: Download },
        { label: "Releases", value: data.overview.totalReleases, icon: Music2 },
        { label: "Avg Rating", value: data.overview.averageRating.toFixed(1), icon: Star },
    ];

    return (
        <div className="space-y-6 pb-10 max-w-5xl mx-auto">
            {/* Header */}
            <div>
                <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight mb-1">
                    {isListener ? "Listening Journey" : "Overview"}
                </h1>
                <p className="text-zinc-500 text-sm font-medium">
                    {isListener ? "Insights into your musical taste" : "Analytics for your entire catalog"}
                </p>
            </div>

            {/* Apple Music Style Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {metrics.map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-[#1c1c1e] p-5 md:p-6 rounded-[1.5rem] flex flex-col justify-between aspect-square md:aspect-auto md:h-36 shadow-sm hover:bg-[#232325] transition-colors group cursor-default"
                    >
                        <div className="text-zinc-400 group-hover:scale-110 transition-transform duration-300">
                            <stat.icon size={20} className={cn(isListener ? "text-accent" : "text-pink-500")} />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-zinc-500 mb-1 uppercase tracking-wider">{stat.label}</p>
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
                        <h2 className="text-xl md:text-2xl font-semibold text-white tracking-tight">
                            {isListener ? "Minutes Listened" : "Activity"}
                        </h2>
                        <p className="text-zinc-400 mt-0.5 text-xs font-medium">Last 30 Days</p>
                    </div>

                    <div className="h-40 md:h-48 flex items-end justify-between gap-1 w-full pt-4">
                        {data.trends.map((val, i) => (
                            <motion.div
                                key={i}
                                initial={{ height: 0 }}
                                animate={{ height: `${(val / maxTrend) * 100}%` }}
                                transition={{ delay: i * 0.02, duration: 0.5 }}
                                className={cn(
                                    "flex-1 w-full relative group transition-colors rounded-t-sm",
                                    isListener ? "bg-accent/20 hover:bg-accent" : "bg-zinc-800 hover:bg-pink-500"
                                )}
                                title={isListener ? `${val} minutes` : `${val} streams`}
                            >
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Demographics Area Apple Style */}
                <div className="bg-[#1c1c1e] p-6 md:p-8 rounded-[2rem] space-y-6 shadow-sm">
                    <div>
                        <h2 className="text-xl md:text-2xl font-semibold text-white tracking-tight">
                            {isListener ? "Trends" : "Audience"}
                        </h2>
                        <p className="text-zinc-400 mt-0.5 text-xs font-medium">
                            {isListener ? "Your Sound DNA" : "Listener Insights"}
                        </p>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <h3 className="text-[10px] font-bold text-zinc-500 mb-3 uppercase tracking-widest border-b border-white/5 pb-2">
                                {isListener ? "Top Artists" : "Top Regions"}
                            </h3>
                            <div className="space-y-2.5">
                                {data.demographics.topCountries.length > 0 ? data.demographics.topCountries.slice(0, 4).map((c, idx) => (
                                    <div key={c} className="flex items-center justify-between items-center text-sm group">
                                        <span className={cn("font-medium transition-colors", isListener ? "text-accent/80 group-hover:text-accent" : "text-zinc-300 group-hover:text-white")}>{c}</span>
                                        {!isListener && <span className="text-zinc-600 font-mono text-[10px]">{(5 - idx) * 12}%</span>}
                                    </div>
                                )) : <span className="text-zinc-600 text-sm">No data</span>}
                            </div>
                        </div>

                        <div>
                            <h3 className="text-[10px] font-bold text-zinc-500 mb-3 uppercase tracking-widest border-b border-white/5 pb-2">Top Genres</h3>
                            <div className="flex flex-wrap gap-1.5 text-sm">
                                {data.demographics.topGenres.length > 0 ? data.demographics.topGenres.map((g, idx) => (
                                    <span key={g} className={cn("px-2.5 py-1 transition-colors rounded-full font-medium text-[11px]", isListener ? "bg-accent/10 hover:bg-accent/20 text-accent" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300")}>
                                        {g}
                                    </span>
                                )) : <span className="text-zinc-600 text-sm">No data</span>}
                            </div>
                        </div>

                        {isListener && (
                            <div className="pt-2">
                                <h3 className="text-[10px] font-bold text-zinc-500 mb-3 uppercase tracking-widest border-b border-white/5 pb-2">Vibe Analysis</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.entries(data.demographics.ageBrackets).map(([key, val]) => (
                                        <div key={key} className="bg-white/5 p-2 rounded-xl">
                                            <p className="text-[9px] text-zinc-500 font-bold uppercase">{key}</p>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                                    <div className="h-full bg-accent" style={{ width: `${val}%` }} />
                                                </div>
                                                <span className="text-[9px] font-mono text-zinc-400">{val}%</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* List Sections */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* Top Tracks */}
                <div className="bg-[#1c1c1e] p-6 md:p-8 rounded-[2rem] space-y-5 shadow-sm">
                    <h2 className="text-xl md:text-2xl font-semibold text-white tracking-tight mb-1">
                        {isListener ? "Most Played Songs" : "Top Tracks"}
                    </h2>

                    <div className="space-y-1">
                        {data.topTracks.length > 0 ? data.topTracks.map((track: any, i) => (
                            <motion.div
                                key={track.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.1 }}
                                className="flex items-center gap-3 py-2 group cursor-pointer hover:bg-white/5 rounded-2xl transition-all -mx-2 px-2"
                            >
                                <div className="text-zinc-600 text-[10px] font-bold w-4 text-center">{i + 1}</div>
                                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex-shrink-0 shadow-sm overflow-hidden relative">
                                    <img src={getMediaUrl(track.coverUrl) || "/logo.png"} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Play className="text-white ml-0.5" size={14} />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-semibold text-white truncate">{track.title}</h4>
                                    <span className="text-[10px] text-white/40 font-bold uppercase tracking-tight">
                                        {isListener ? track.artistName : `${track.streams.toLocaleString()} STREAMS`}
                                    </span>
                                </div>
                                <div className="text-right pr-1">
                                    <div className="text-xs font-semibold text-white">
                                        {isListener ? Math.round(track.downloads / 60) : track.downloads}
                                    </div>
                                    <div className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider">
                                        {isListener ? "MINS" : "DLs"}
                                    </div>
                                </div>
                            </motion.div>
                        )) : (
                            <div className="py-6 text-zinc-500 text-sm italic">
                                No listening history yet.
                            </div>
                        )}
                    </div>
                </div>

                {/* AI Persona Analysis */}
                <div className="bg-[#1c1c1e] p-6 md:p-8 rounded-[2rem] space-y-6 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Brain size={120} className="text-accent" />
                    </div>
                    
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-1">
                            <Sparkles size={16} className="text-accent" />
                            <h2 className="text-xl md:text-2xl font-semibold text-white tracking-tight">AI Listener Persona</h2>
                        </div>
                        <p className="text-zinc-400 text-xs font-medium">Musical Soul Analysis</p>
                    </div>

                    <div className="relative z-10 space-y-6">
                        <div className="p-4 rounded-2xl bg-accent/5 border border-accent/10">
                            <h3 className="text-accent text-sm font-bold mb-2 flex items-center gap-2">
                                <Zap size={14} />
                                The "{data.demographics.topGenres[0] || (isListener ? "Newcomer" : "Emerging")}" {isListener ? "Enthusiast" : "Professional"}
                            </h3>
                            <p className="text-xs text-zinc-300 leading-relaxed italic">
                                {isListener ? (
                                    `Based on your recent 30-day activity of ${data.overview.totalStreams} streams, you've displayed a highly specialized pattern. Your core frequency resonates with ${data.demographics.topGenres[0] || 'various'} rhythms, suggesting a personality that seeks ${data.demographics.ageBrackets['Energy'] > 70 ? 'high-energy stimulation' : 'melodic tranquility'}.`
                                ) : (
                                    `With a catalog reach of ${data.overview.totalStreams.toLocaleString()} streams, your artistic fingerprint is expanding. Your listeners are primarily drawn to your ${data.demographics.topGenres[0] || 'unique'} compositions, showing a focus on professional-grade production and authentic resonance.`
                                )}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                                    <Wind size={10} /> {isListener ? "Dominant Mood" : "Audience Growth"}
                                </p>
                                <p className="text-sm font-bold text-white capitalize">
                                    {isListener 
                                        ? (data.demographics.ageBrackets['Energy'] > 50 ? 'Electric' : 'Reflective') 
                                        : (data.overview.totalStreams > 1000 ? 'Exponential' : 'Rising')
                                    }
                                </p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                                    <Target size={10} /> {isListener ? "Focus Level" : "Catalog Impact"}
                                </p>
                                <p className="text-sm font-bold text-white">
                                    {isListener 
                                        ? (data.demographics.ageBrackets['Focus'] > 80 ? 'Deep' : 'Hybrid') 
                                        : (data.topTracks.length > 5 ? 'High' : 'Moderate')
                                    }
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
