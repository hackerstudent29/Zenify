"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LibraryPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/liked");
  }, [router]);

  return null;
}
