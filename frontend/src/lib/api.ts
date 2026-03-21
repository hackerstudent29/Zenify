import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://listenzenifybackend.up.railway.app/api';
// Ensure it cleanly ends with /api/
const cleanUrl = rawApiUrl.replace(/\/+$/, '');
const fullApiUrl = cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`;

const api = axios.create({
    baseURL: `${fullApiUrl}/`, // Ensure trailing slash
    withCredentials: true, // Important for cookies
});

// Debug Logger
api.interceptors.request.use((config) => {
    console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
});

api.interceptors.response.use(
    (response) => {
        console.log(`✅ API Response: ${response.status} from ${response.config.url}`);
        return response;
    },
    (error) => {
        console.error(`❌ API Error: ${error.response?.status || 'Network'} from ${error.config?.url}`);
        return Promise.reject(error);
    }
);

// Request interceptor to add access token header
api.interceptors.request.use((config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

let isRefreshing = false;
let refreshTokenPromise: Promise<string | null> | null = null;

// Response interceptor for silent refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Never attempt silent refresh on auth endpoints
        const AUTH_ENDPOINTS = ['/auth/refresh', '/auth/login', '/auth/register', '/auth/google', '/auth/verify-email', '/auth/reset-password', '/auth/request-otp'];
        if (AUTH_ENDPOINTS.some(ep => originalRequest.url?.includes(ep)) || originalRequest._retry) {
            return Promise.reject(error);
        }

        if (error.response?.status === 401) {
            originalRequest._retry = true;

            if (!isRefreshing) {
                isRefreshing = true;
                refreshTokenPromise = new Promise(async (resolve, reject) => {
                    try {
                        const res = await api.post('auth/refresh');
                        const { accessToken, user } = res.data;
                        if (accessToken && user) {
                            useAuthStore.getState().login(user, accessToken);
                            resolve(accessToken);
                        } else {
                            reject(new Error("No token returned"));
                        }
                    } catch (refreshError: any) {
                        const isAuthError = refreshError.response?.status === 401 || refreshError.response?.status === 403;

                        if (isAuthError) {
                            try {
                                await api.post('auth/logout');
                            } catch (e) { }

                            useAuthStore.getState().logout();
                            if (!window.location.pathname.startsWith('/login')) {
                                window.location.href = '/login';
                            }
                        }
                        reject(refreshError);
                    } finally {
                        isRefreshing = false;
                        refreshTokenPromise = null;
                    }
                });
            }

            try {
                const newAccessToken = await refreshTokenPromise;
                if (newAccessToken) {
                    originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                    return api(originalRequest);
                }
            } catch (err) {
                return Promise.reject(err);
            }
        }
        return Promise.reject(error);
    }
);

export const getArtist = (id: string) => api.get(`artists/${id}`);
export const getArtistByName = (name: string) => api.get(`artists/name/${encodeURIComponent(name)}`);

export default api;
