import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

const api = axios.create({
    baseURL: 'http://localhost:3000/api', // Update with env var in prod
    withCredentials: true, // Important for cookies
});

// Request interceptor to add access token header (optional if relying on cookies, but good for non-browser clients or extra security)
api.interceptors.request.use((config) => {
    // We using cookies for main auth, but let's see. 
    // If backend expects Authorization header, we add it. 
    // Our backend JWT plugin might look for header OR cookie. 
    // Fastify-jwt looks for Authorization header by default. 
    // We should configure backend to look at cookie too, or send header here.
    // The plan said: "frontend ... sends tokens via HTTP-only cookies".
    // AND "Backend sets HTTP-only cookies".
    // If backend sets cookies, browser sends them automatically.
    // However, fastify-jwt might need `cookie` option config.
    // Let's assume cookies are sufficient if configured correctly on backend.
    // But sending header is safer standard.
    // Let's get token from store.
    const token = useAuthStore.getState().accessToken;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor for silent refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Prevent infinite loops
        if (originalRequest.url?.includes('/auth/refresh') || originalRequest._retry) {
            return Promise.reject(error);
        }

        if (error.response?.status === 401) {
            originalRequest._retry = true;
            try {
                // Call refresh endpoint - cached refresh token in cookie will be sent
                const res = await api.post('/auth/refresh');
                const { accessToken, user } = res.data;
                if (accessToken && user) {
                    useAuthStore.getState().setAuth(user, accessToken);
                    // Update the header on the original request
                    originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                    return api(originalRequest);
                }
            } catch (refreshError) {
                // Refresh failed - attempt to clear cookies on backend
                try {
                    await api.post('/auth/logout');
                } catch (e) {
                    // Ignore logout error
                }

                // Clear client state
                useAuthStore.getState().logout();
                // Redirect only if not already on login
                if (!window.location.pathname.startsWith('/login')) {
                    window.location.href = '/login';
                }
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }
);

export default api;
