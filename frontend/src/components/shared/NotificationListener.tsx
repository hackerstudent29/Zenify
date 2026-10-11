"use client";

import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import api from '@/lib/api';
import { getApiBaseUrl } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell } from 'lucide-react';
import { useState } from 'react';

export function NotificationListener() {
 const { user, isAuthenticated, accessToken } = useAuthStore();
 const { setNotifications, addNotification } = useNotificationStore();
 const router = useRouter();
 const [toast, setToast] = useState<{ id: string, title: string, message: string } | null>(null);

 useEffect(() => {
 if (!isAuthenticated || user?.role !== 'ADMIN' || !accessToken) return;

 let eventSource: EventSource | null = null;
    let isSubscribed = true;

 // Fetch initial history
 api.get('/notifications').then(res => {
 setNotifications(res.data);
 }).catch(err => console.error("Failed to fetch notifications", err));

 // Connect to SSE Stream
 const connectSSE = () => {
 const baseUrl = getApiBaseUrl().replace(/\/$/, '');
 const sseUrl = `${baseUrl}/notifications/stream?token=${encodeURIComponent(accessToken)}`;
 eventSource = new EventSource(sseUrl, {
 withCredentials: true
 });

 eventSource.onmessage = (event) => {
 try {
 const data = JSON.parse(event.data);
 if (data.type === 'connected') {
 console.log("Connected to notification stream");
 return;
 }
 
 // New notification arrived
 addNotification(data);
 
 // Show toast
 setToast({
 id: data.id,
 title: data.title,
 message: data.message
 });

 // Hide toast after 4s
 setTimeout(() => {
 setToast(prev => prev?.id === data.id ? null : prev);
 }, 4000);

 } catch (e) {
 console.error("Error parsing notification SSE", e);
 }
 };

 let isSubscribed = true;

 eventSource.onerror = (error) => {
 console.warn("SSE stream disconnected:", error);
 eventSource?.close();
 // Attempt reconnect after 10 seconds if still mounted and authenticated
 if (isSubscribed) {
 setTimeout(() => {
 if (isSubscribed) connectSSE();
 }, 10000);
 }
 };
 };

 connectSSE();

 return () => {
 isSubscribed = false;
 if (eventSource) {
 eventSource.close();
 }
 };
 }, [isAuthenticated, user, accessToken]);

 return (
 <AnimatePresence>
 {toast && (
 <motion.div
 initial={{ opacity: 0, x: 50, scale: 0.95 }}
 animate={{ opacity: 1, x: 0, scale: 1 }}
 exit={{ opacity: 0, x: 20, scale: 0.95 }}
 onClick={() => {
 router.push('/admin/notifications');
 setToast(null);
 }}
 className="fixed top-24 right-6 flex items-start gap-3 p-4 rounded-xl border border-white/10 bg-[#18181B]/95 backdrop-blur-xl shadow-2xl z-[9999] cursor-pointer hover:bg-[#18181B] transition-colors max-w-[300px]"
 >
 <div className="p-2 rounded-lg bg-brand/10 text-brand shrink-0 mt-0.5">
 <Bell size={16} className="animate-pulse" />
 </div>
 <div className="flex flex-col gap-1 min-w-0">
 <span className="text-[13px] font-bold text-white truncate">New Notification</span>
 <span className="text-[12px] text-zinc-400 line-clamp-2 leading-tight">{toast.title}</span>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 );
}
