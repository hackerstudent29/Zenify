import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

const SYNCED_TIMEZONE_KEY = "zenify_synced_timezone";

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Synchronize the browser's IANA timezone to the user profile
 */
export async function syncUserTimezone(): Promise<void> {
  if (typeof window === "undefined") return;

  const user = useAuthStore.getState().user;
  const isAuthenticated = useAuthStore.getState().isAuthenticated;
  if (!user || !isAuthenticated) return;

  const currentTz = getBrowserTimezone();
  const lastSynced = localStorage.getItem(SYNCED_TIMEZONE_KEY);

  // If already synced and user's profile matches, skip network request
  if (lastSynced === currentTz && (user as any).timezone === currentTz) {
    return;
  }

  try {
    await api.patch("/auth/profile", { timezone: currentTz });
    localStorage.setItem(SYNCED_TIMEZONE_KEY, currentTz);
    useAuthStore.getState().updateUser({ ...(user as any), timezone: currentTz });
  } catch (err: any) {
    console.warn("[TimezoneSync] Failed to sync timezone:", err?.message);
  }
}
