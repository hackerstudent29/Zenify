"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SEO } from "@/components/shared/SEO";

export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login?mode=signup");
  }, [router]);

  return (
    <>
      <SEO title="Sign Up – Zenify" noindex={true} path="/register" />
    </>
  );
}
