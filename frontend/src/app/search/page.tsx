"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function SearchPageRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const q = searchParams.toString();
    router.replace(q ? `/discover?${q}` : "/discover");
  }, [router, searchParams]);

  return (
    <div className="flex items-center justify-center min-h-[50vh] text-zinc-500 text-xs font-semibold uppercase tracking-wider">
      Redirecting to Discover...
    </div>
  );
}
