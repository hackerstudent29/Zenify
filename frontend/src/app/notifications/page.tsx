"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, Trash2, Loader2, Music, AlertTriangle, Info, Clock, CheckCircle2 } from "lucide-react";
import { useNotificationStore, NotificationData } from "@/store/notificationStore";
import { formatDistanceToNow } from "date-fns";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

export default function NotificationsPage() {
    const { notifications, markAsRead, markAllAsRead, unreadCount } = useNotificationStore();
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<"all" | "unread">("all");

    const handleMarkAsRead = async (id: string) => {
        try {
            await api.patch(`/notifications/${id}/read`);
            markAsRead(id);
        } catch (error) {
            console.error("Failed to mark as read:", error);
        }
    };

    const handleMarkAllAsRead = async () => {
        if (unreadCount === 0) return;
        setIsLoading(true);
        try {
            await api.patch('/notifications/read-all');
            markAllAsRead();
        } catch (error) {
            console.error("Failed to mark all as read:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'upload_success':
            case 'track_published':
                return <Music className="w-5 h-5 text-emerald-500" />;
            case 'upload_failed':
            case 'content_denied':
                return <AlertTriangle className="w-5 h-5 text-red-500" />;
            case 'system_update':
                return <Info className="w-5 h-5 text-brand" />;
            default:
                return <Bell className="w-5 h-5 text-zinc-400" />;
        }
    };

    const displayNotifications = activeTab === "unread" 
        ? notifications.filter(n => !n.read) 
        : notifications;

    return (
        <div className="w-full h-full p-6 md:p-10 font-sans max-w-4xl mx-auto">
            <div className="flex flex-col gap-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <motion.h1 
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-2"
                        >
                            Notifications
                        </motion.h1>
                        <motion.p 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="text-zinc-400 font-medium"
                        >
                            You have {unreadCount} unread messages
                        </motion.p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="bg-white/5 border border-white/10 p-1 rounded-full flex gap-1 backdrop-blur-md">
                            <button
                                onClick={() => setActiveTab("all")}
                                className={cn(
                                    "px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all",
                                    activeTab === "all" ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
                                )}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setActiveTab("unread")}
                                className={cn(
                                    "px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all",
                                    activeTab === "unread" ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
                                )}
                            >
                                Unread {unreadCount > 0 && `(${unreadCount})`}
                            </button>
                        </div>

                        {unreadCount > 0 && (
                            <button
                                onClick={handleMarkAllAsRead}
                                disabled={isLoading}
                                className="flex items-center gap-2 px-4 py-2 bg-brand/10 hover:bg-brand/20 text-brand border border-brand/20 rounded-full text-xs font-bold tracking-wide transition-all disabled:opacity-50"
                            >
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                <span className="hidden sm:inline">Mark all read</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* List */}
                <div className="space-y-3">
                    <AnimatePresence mode="popLayout">
                        {displayNotifications.length > 0 ? (
                            displayNotifications.map((notif) => (
                                <motion.div
                                    layout
                                    key={notif.id}
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                    className={cn(
                                        "group flex items-start gap-4 p-4 rounded-3xl border transition-all duration-300",
                                        !notif.read 
                                            ? "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20" 
                                            : "bg-white/[0.02] border-transparent opacity-60 hover:opacity-100"
                                    )}
                                >
                                    <div className={cn(
                                        "w-10 h-10 shrink-0 rounded-full flex items-center justify-center border",
                                        !notif.read ? "bg-zinc-900 border-white/10 shadow-lg" : "bg-transparent border-white/5"
                                    )}>
                                        {getIcon(notif.type)}
                                    </div>

                                    <div className="flex-1 min-w-0 flex flex-col pt-1">
                                        <div className="flex items-center justify-between gap-4 mb-1">
                                            <h3 className={cn(
                                                "font-bold truncate",
                                                !notif.read ? "text-white" : "text-white/80"
                                            )}>
                                                {notif.title}
                                            </h3>
                                            <div className="flex items-center gap-1.5 shrink-0 text-xs font-medium text-zinc-500">
                                                <Clock className="w-3 h-3" />
                                                <span>{formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}</span>
                                            </div>
                                        </div>
                                        <p className="text-sm font-medium text-zinc-400 leading-relaxed">
                                            {notif.message}
                                        </p>
                                    </div>

                                    {!notif.read && (
                                        <button
                                            onClick={() => handleMarkAsRead(notif.id)}
                                            className="w-8 h-8 shrink-0 rounded-full bg-brand/10 text-brand border border-brand/20 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-brand hover:text-black transition-all"
                                            title="Mark as read"
                                        >
                                            <Check className="w-4 h-4" />
                                        </button>
                                    )}
                                </motion.div>
                            ))
                        ) : (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex flex-col items-center justify-center py-24 text-center px-6"
                            >
                                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                                    <Bell className="w-8 h-8 text-zinc-600" />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">You're all caught up</h3>
                                <p className="text-zinc-500 font-medium">There are no new notifications at this time.</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
