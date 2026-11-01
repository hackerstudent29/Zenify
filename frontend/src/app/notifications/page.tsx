"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/store/ui";

export default function NotificationsPage() {
  const router = useRouter();

  useEffect(() => {
    useUIStore.getState().setIsNotificationsOpen(true);
    router.replace("/");
  }, [router]);

  return null;
}
