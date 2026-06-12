"use client";

import { useAuthStore } from "@/store/authStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, CheckCircle2, XCircle, AlertTriangle, Music, Info, Clock, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

export default function AdminNotificationsPage() {
 const { user, isAuthenticated } = useAuthStore();
 const router = useRouter();
 const { notifications, markAsRead: storeMarkRead, markAllAsRead: storeMarkAllAsRead } = useNotificationStore();
 const [filter, setFilter] = useState<'all' | 'unread'>('all');
 const [expandedId, setExpandedId] = useState<string | null>(null);

 useEffect(() => {
 if (!isAuthenticated || user?.role !== 'ADMIN') {
 router.replace("/");
 }
 }, [isAuthenticated, user, router]);

 const handleMarkAllAsRead = async () => {
 storeMarkAllAsRead();
 await api.patch('/notifications/read-all');
 };

 const handleToggleRead = async (id: string, currentRead: boolean) => {
 if (!currentRead) {
 storeMarkRead(id);
 await api.patch(`/notifications/${id}/read`);
 }
 };

 const filteredNotifications = notifications.filter(n => filter === 'all' || !n.read);

 const getIconForType = (type: string) => {
 switch (type) {
 case 'upload_success': return <CheckCircle2 size={16} className="text-emerald-500" />;
 case 'upload_failed': return <AlertTriangle size={16} className="text-amber-500" />;
 case 'content_denied': return <XCircle size={16} className="text-rose-500" />;
 case 'system_info': return <Info size={16} className="text-blue-400" />;
 default: return <Bell size={16} className="text-zinc-400" />;
 }
 };

 const getBgColorForType = (type: string, read: boolean) => {
 if (read) return "bg-white/[0.02] border-white/[0.05]";
 switch (type) {
 case 'upload_success': return "bg-emerald-500/5 border-emerald-500/20";
 case 'upload_failed': return "bg-amber-500/5 border-amber-500/20";
 case 'content_denied': return "bg-rose-500/5 border-rose-500/20";
 case 'system_info': return "bg-blue-400/5 border-blue-400/20";
 default: return "bg-white/5 border-white/10";
 }
 };

 const getPriorityColor = (type: string) => {
 switch (type) {
 case 'upload_success': return "text-emerald-500";
 case 'upload_failed': return "text-amber-500";
 case 'content_denied': return "text-rose-500";
 case 'system_info': return "text-blue-400";
 default: return "text-zinc-300";
 }
 }

 if (!user || user.role !== 'ADMIN') return null;

 return (
 <div className="flex-1 w-full max-w-4xl mx-auto py-8 px-4 md:px-8 pb-32">
 <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
 <div>
 <div className="flex items-center gap-3 mb-1">
 <Bell className="w-5 h-5 text-brand" />
 <h1 className="text-2xl font-medium text-white tracking-tight">
 Notifications
 </h1>
 </div>
 <p className="text-sm text-zinc-400 ml-8">
 Stay updated on system events and asset status.
 </p>
 </div>

 <div className="flex items-center gap-3">
 <div className="flex bg-white/5 p-1 rounded-lg border border-white/5">
 <button
 onClick={() => setFilter('all')}
 className={cn(
 "px-4 py-1.5 text-[12px] font-medium rounded-md transition-all",
 filter === 'all' ? "bg-white/10 text-white shadow-sm" : "text-zinc-400 hover:text-white"
 )}
 >
 All
 </button>
 <button
 onClick={() => setFilter('unread')}
 className={cn(
 "px-4 py-1.5 text-[12px] font-medium rounded-md transition-all",
 filter === 'unread' ? "bg-white/10 text-white shadow-sm" : "text-zinc-400 hover:text-white"
 )}
 >
 Unread
 </button>
 </div>
 <button
 onClick={handleMarkAllAsRead}
 disabled={!notifications.some(n => !n.read)}
 className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-[12px] font-medium text-zinc-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
 >
 Mark all as read
 </button>
 </div>
 </div>

 <div className="space-y-3">
 <AnimatePresence mode="popLayout">
 {filteredNotifications.length === 0 ? (
 <motion.div
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, scale: 0.95 }}
 className="py-16 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.02]"
 >
 <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
 <CheckCircle2 size={20} className="text-zinc-500" />
 </div>
 <h3 className="text-base font-medium text-white mb-1">You're all caught up</h3>
 <p className="text-[13px] text-zinc-400">No new notifications to review.</p>
 </motion.div>
 ) : (
 filteredNotifications.map((notif) => {
 const isExpanded = expandedId === notif.id;
 
 return (
 <motion.div
 key={notif.id}
 layout
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, scale: 0.95 }}
 className={cn(
 "rounded-xl border transition-all cursor-pointer overflow-hidden",
 getBgColorForType(notif.type, notif.read),
 )}
 onClick={() => {
 setExpandedId(isExpanded ? null : notif.id);
 if (!notif.read) handleToggleRead(notif.id, notif.read);
 }}
 >
 {/* Accordion Header (One Line) */}
 <div className="px-4 py-3.5 flex items-center gap-4">
 <div className="shrink-0">
 {getIconForType(notif.type)}
 </div>
 
 <div className="flex-1 flex items-center justify-between min-w-0 gap-4">
 <div className="flex items-center gap-3 min-w-0">
 <span className={cn("text-sm font-medium truncate", notif.read ? "text-zinc-400" : "text-white")}>
 {notif.title}
 </span>
 {!notif.read && (
 <span className="w-2 h-2 rounded-full bg-brand shrink-0" />
 )}
 {!isExpanded && (
 <span className="text-[13px] text-zinc-500 truncate hidden sm:block">
 - {notif.message}
 </span>
 )}
 </div>
 
 <div className="flex items-center gap-4 shrink-0">
 <span className="text-[11px] text-zinc-500 tabular-nums">
 {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
 </span>
 <button className="text-zinc-400 hover:text-white transition-colors">
 {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
 </button>
 </div>
 </div>
 </div>

 {/* Expanded Content */}
 <AnimatePresence>
 {isExpanded && (
 <motion.div
 initial={{ height: 0, opacity: 0 }}
 animate={{ height: "auto", opacity: 1 }}
 exit={{ height: 0, opacity: 0 }}
 className="border-t border-white/[0.05]"
 >
 <div className="px-12 py-4">
 <p className={cn("text-[14px] leading-relaxed mb-4", getPriorityColor(notif.type))}>
 {notif.message}
 </p>

 {notif.metadata && Object.keys(notif.metadata).length > 0 && (
 <div className="bg-black/20 rounded-lg p-3 inline-block min-w-[200px] border border-white/5">
 {notif.metadata.trackName && (
 <div className="flex items-center gap-2 mb-1.5">
 <Music size={14} className="text-zinc-400" />
 <span className="text-[13px] font-medium text-zinc-200">{notif.metadata.trackName}</span>
 <span className="text-[12px] text-zinc-500">— {notif.metadata.artistName}</span>
 </div>
 )}
 {notif.metadata.reason && (
 <p className="text-[12px] text-zinc-400 italic">
 {notif.metadata.reason}
 </p>
 )}
 {notif.metadata.url && (
 <button onClick={(e) => {
 e.stopPropagation();
 router.push(notif.metadata!.url!);
 }} className="mt-2.5 flex items-center gap-1.5 text-[12px] font-medium text-brand hover:text-white transition-colors">
 View Action <ExternalLink size={12} />
 </button>
 )}
 </div>
 )}
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </motion.div>
 );
 })
 )}
 </AnimatePresence>
 </div>
 </div>
 );
}
