"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SEO } from "@/components/shared/SEO";

export default function LibraryPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/liked");
  }, [router]);

  return <SEO title="Your Library – Zenify" path="/library" noindex={true} />;
}
