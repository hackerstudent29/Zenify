import axios from 'axios';
import { useAuthStore } from '@/store/auth';

const api = axios.create({
    baseURL: 'http://localhost:3000/api', // Connects to Railway/Local backend
    withCredentials: true, // Important for cookies
});

api.interceptors.request.use((config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Handle 401 (Unauthorized) - Try refresh token
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                await axios.post('http://localhost:3000/api/auth/refresh', {}, { withCredentials: true });
                // If refresh successful, retry original request (cookie is updated automatically)
                return api(originalRequest);
            } catch (refreshError) {
                useAuthStore.getState().logout();
                window.location.href = '/login';
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);

export default api;
