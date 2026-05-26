import { create } from 'zustand';

export interface NotificationData {
    id: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    read: boolean;
    metadata?: any;
    createdAt: string;
}

interface NotificationState {
    notifications: NotificationData[];
    unreadCount: number;
    setNotifications: (notifications: NotificationData[]) => void;
    addNotification: (notification: NotificationData) => void;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
    notifications: [],
    unreadCount: 0,
    
    setNotifications: (notifications) => set({
        notifications,
        unreadCount: notifications.filter(n => !n.read).length
    }),

    addNotification: (notification) => set((state) => {
        const exists = state.notifications.some(n => n.id === notification.id);
        if (exists) return state;
        
        const newNotifications = [notification, ...state.notifications];
        return {
            notifications: newNotifications,
            unreadCount: newNotifications.filter(n => !n.read).length
        };
    }),

    markAsRead: (id) => set((state) => {
        const newNotifications = state.notifications.map(n => 
            n.id === id ? { ...n, read: true } : n
        );
        return {
            notifications: newNotifications,
            unreadCount: newNotifications.filter(n => !n.read).length
        };
    }),

    markAllAsRead: () => set((state) => {
        const newNotifications = state.notifications.map(n => ({ ...n, read: true }));
        return {
            notifications: newNotifications,
            unreadCount: 0
        };
    })
}));
