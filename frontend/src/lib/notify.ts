import { useUIStore, NotificationType } from "@/store/ui";

export function notify(
  msg: string,
  type: NotificationType = "success",
  options?: { title?: string; duration?: number }
) {
  useUIStore.getState().showNotification(msg, type, options);
}

notify.success = (msg: string, options?: { title?: string; duration?: number }) =>
  notify(msg, "success", options);

notify.error = (msg: string, options?: { title?: string; duration?: number }) =>
  notify(msg, "error", options);

notify.warning = (msg: string, options?: { title?: string; duration?: number }) =>
  notify(msg, "warning", options);

notify.info = (msg: string, options?: { title?: string; duration?: number }) =>
  notify(msg, "info", options);

export default notify;

