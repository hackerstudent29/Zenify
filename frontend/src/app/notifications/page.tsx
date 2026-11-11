"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/store/ui";
import { SEO } from "@/components/shared/SEO";

export default function NotificationsPage() {
  const router = useRouter();

  useEffect(() => {
    useUIStore.getState().setIsNotificationsOpen(true);
    router.replace("/");
  }, [router]);

  return <SEO title="Notifications – Zenify" path="/notifications" noindex={true} />;
}
